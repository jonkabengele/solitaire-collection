/**
 * Canonical game-state store (spec §4.3 bridge decision: Svelte 5 runes +
 * lightweight event emitter). Owns the authoritative `GameState`; Phaser
 * scenes only read it and dispatch `Move`s back through `dispatchMove`.
 *
 * Svelte components read `gameStore.state` reactively (rune). Phaser scenes
 * call `subscribe(fn)` — the emitter fires on every committed state change.
 *
 * Phase 3 adds per-variant suspension slots: switching variants preserves an
 * in-progress game and restores it (timer paused) when the player returns.
 */
import type { GameState, Move, Variant, VariantId } from '../engine/types.js';
import { applyMove } from '../engine/applyMove.js';
import { getVariant } from '../variants/index.js';
import { isSolvable, solve } from '../engine/solver.js';
import { solvableSeed } from '../services/seedCache.js';
import { statsStore } from './stats.svelte.js';

/** Listener invoked with the new state after every committed change. */
export type StateListener = (state: GameState) => void;

/** Navigation targets: a variant board scene or the DOM menu overlay. */
export type NavTarget = 'menu' | VariantId;

type NavListener = (target: NavTarget) => void;

/** Hint channel: scenes highlight the suggested move's source + target. */
type HintListener = (move: Move | null) => void;

/** A suspended (non-active) in-progress game plus its frozen elapsed time. */
type Slot = { state: GameState; elapsedMs: number };

class GameStore {
  // No game exists until the player picks a variant from the menu — the
  // DOM menu boots with zero engine work (no synchronous solve on load).
  // Every deal remains solver-verified: the first `selectVariant` deals
  // via `solvableSeed` while the Phaser bundle + card assets load.
  #state = $state<GameState | null>(null);
  #pendingSwitch = $state<VariantId | null>(null);
  #redoLog: Move[] = [];
  #playedSeeds = new Set<string>();
  #wonSeeds = new Set<string>();
  #autoTimer: ReturnType<typeof setInterval> | null = null;
  readonly #slots = $state<Partial<Record<VariantId, Slot>>>({});
  readonly #listeners = new Set<StateListener>();
  readonly #navListeners = new Set<NavListener>();
  readonly #hintListeners = new Set<HintListener>();

  /**
   * The canonical game state. Never mutated in place. Only readable once
   * a game exists — i.e. after the first `selectVariant`/`newGame` — so
   * the pre-game menu never pays for a solver run.
   */
  get state(): GameState {
    if (this.#state === null) throw new Error('no game started yet');
    return this.#state;
  }

  /** `true` once any variant has been started. */
  get started(): boolean {
    return this.#state !== null;
  }

  /** Variant id awaiting a "Save and switch?" decision, or null. */
  get pendingSwitch(): VariantId | null {
    return this.#pendingSwitch;
  }

  /** The variant driving the current state. */
  get variant(): Variant {
    return getVariant(this.state.variant);
  }

  /** `true` when the move log is non-empty (undo is meaningful). */
  get canUndo(): boolean {
    return this.state.moves.length > 0;
  }

  /** `true` when an undone move can be re-applied. */
  get canRedo(): boolean {
    return this.#redoLog.length > 0;
  }

  /**
   * `true` when greedily playing only foundation moves wins — the
   * "remaining moves are trivial" condition for the Finish button.
   * (A strict "all legalMoves are foundation moves" check never fires in
   * Klondike, where foundation→tableau take-backs stay legal forever.)
   */
  get canAutoComplete(): boolean {
    const s = this.state;
    if (s.status !== 'playing' || s.variant === 'tripeaks') return false;
    const v = this.variant;
    let cur: GameState = s;
    for (let i = 0; i < 60; i++) {
      const fm = v
        .legalMoves(cur)
        .find((m) => m.type === 'move' && m.to.area === 'foundation');
      if (!fm) return v.isWon(cur);
      cur = v.applyMove(cur, fm);
    }
    return false;
  }

  /** Number of committed moves. */
  get moveCount(): number {
    return this.state.moves.length;
  }

  /** `true` when the live game has progress worth saving on switch. */
  get inProgress(): boolean {
    return this.state.status === 'playing' && this.state.moves.length > 0;
  }

  /** `true` when a suspended game exists for `id` (menu "continue" chip). */
  hasSaved(id: VariantId): boolean {
    return this.#slots[id] !== undefined;
  }

  /**
   * `true` when `id` has an in-progress game — suspended, or the live one.
   * Safe to call before any game exists (never touches `state`).
   */
  hasInProgress(id: VariantId): boolean {
    const s = this.#state;
    return (
      (s !== null && s.variant === id && s.status === 'playing' && s.moves.length > 0) ||
      this.#slots[id] !== undefined
    );
  }

  /**
   * Deal a new game. `seed` defaults to a fresh random seed; passing one
   * replays a known deal (multiplayer-ready: same seed → same deck).
   * A fresh deal for `variantId` discards that variant's suspended game.
   */
  newGame(variantId: VariantId = this.#state?.variant ?? 'klondike', seed?: string): void {
    // Abandoning an in-progress game via New counts as a loss for streaks.
    if (
      this.#state !== null &&
      variantId === this.#state.variant &&
      this.#state.status === 'playing' &&
      this.#state.moves.length > 0
    ) {
      statsStore.recordLoss(this.#state.variant);
    }
    this.#slots[variantId] = undefined;
    this.#redoLog = [];
    this.#stopAuto();
    const s = getVariant(variantId).initialState(seed ?? solvableSeed(variantId));
    this.#commit({ ...s, startedAt: Date.now() });
  }

  /**
   * HUD path: switch to `id`, prompting "Save and switch?" first when the
   * live game has progress. Otherwise switches immediately (current game
   * is saved implicitly — there is nothing worth losing).
   */
  requestSwitch(id: VariantId): void {
    if (this.#state === null || id === this.#state.variant) return;
    if (this.inProgress) this.#pendingSwitch = id;
    else this.switchVariant(id, true);
  }

  /** Resolve the pending switch prompt: keep or discard the live game. */
  confirmSwitch(save: boolean): void {
    const id = this.#pendingSwitch;
    this.#pendingSwitch = null;
    if (id) this.switchVariant(id, save);
  }

  /** Abort the pending switch prompt. */
  cancelSwitch(): void {
    this.#pendingSwitch = null;
  }

  /**
   * Menu path: always preserve the live game, then switch to `id` —
   * restoring its suspended game if one exists, else dealing fresh.
   */
  selectVariant(id: VariantId): void {
    this.switchVariant(id, true);
  }

  /** Ask the UI to show the menu overlay. The live game stays in `#state`. */
  openMenu(): void {
    this.#emitNav('menu');
  }

  /**
   * Route a move through the single `applyMove` pathway. Returns `false`
   * when the engine rejected it (illegal move → same object back).
   */
  dispatchMove(move: Move): boolean {
    const next = applyMove(this.state, move);
    if (next === this.state) return false;
    this.#redoLog = [];
    this.#commit(this.#stamp(next));
    return true;
  }

  /**
   * Undo the last move by replaying the log minus its tail through
   * `initialState` + `applyMove`. Pure and deterministic by construction.
   */
  undo(): void {
    const s = this.state;
    if (s.moves.length === 0) return;
    let rebuilt = this.variant.initialState(s.seed);
    for (const m of s.moves.slice(0, -1)) rebuilt = applyMove(rebuilt, m);
    this.#redoLog = [...this.#redoLog, s.moves[s.moves.length - 1]];
    this.#commit({ ...rebuilt, startedAt: s.startedAt, elapsedMs: s.elapsedMs });
  }

  /** Re-apply the most recently undone move (deterministic replay). */
  redo(): void {
    const m = this.#redoLog[this.#redoLog.length - 1];
    if (!m) return;
    const next = applyMove(this.state, m);
    if (next === this.state) return;
    this.#redoLog = this.#redoLog.slice(0, -1);
    this.#commit(this.#stamp(next));
  }

  /**
   * Suggest a move: foundations first (safest progress), then moves that
   * build on non-empty tableau columns, then anything else; draws last.
   * Emitted on the hint channel for the active scene to highlight.
   */
  requestHint(): void {
    if (this.state.status !== 'playing') {
      this.#emitHint(null);
      return;
    }
    const ms = this.legalMoves();
    const rank = (m: Move): number => {
      if (m.type === 'draw') return 4;
      if (m.to.area === 'foundation') return 0;
      if (m.from.area === 'tableau' && m.to.area === 'tableau') return 1;
      if (m.to.area === 'cell') return 2;
      return 3;
    };
    this.#emitHint(ms.slice().sort((a, b) => rank(a) - rank(b))[0] ?? null);
  }

  /** Subscribe to hint suggestions. Returns unsubscribe. */
  onHint(fn: HintListener): () => void {
    this.#hintListeners.add(fn);
    return () => this.#hintListeners.delete(fn);
  }

  /**
   * Auto-finish: when `canAutoComplete`, dispatch one foundation move every
   * 140ms so cards visibly fly home. Stops when no foundation move remains.
   */
  autoComplete(): void {
    if (!this.canAutoComplete || this.#autoTimer) return;
    this.#autoTimer = setInterval(() => {
      const m = this.legalMoves().find(
        (x) => x.type === 'move' && x.to.area === 'foundation'
      );
      if (!m || this.dispatchMove(m) === false) this.#stopAuto();
    }, 140);
  }

  #stopAuto(): void {
    if (this.#autoTimer) {
      clearInterval(this.#autoTimer);
      this.#autoTimer = null;
    }
  }

  /** All legal moves in the current position (used for double-tap autofinish, later for hints). */
  legalMoves(): Move[] {
    return this.variant.legalMoves(this.state);
  }

  /**
   * Subscribe to committed state changes (Phaser scenes use this; Svelte
   * components should just read `gameStore.state`). Returns unsubscribe.
   */
  subscribe(fn: StateListener): () => void {
    this.#listeners.add(fn);
    return () => this.#listeners.delete(fn);
  }

  /**
   * Subscribe to navigation requests (menu / variant boards). `App.svelte`
   * translates these into scene transitions + the menu overlay. Returns
   * unsubscribe.
   */
  onNavigate(fn: NavListener): () => void {
    this.#navListeners.add(fn);
    return () => this.#navListeners.delete(fn);
  }

  /**
   * Switch the live variant. `saveCurrent` suspends the current game into
   * its slot when it has progress; the target restores its suspended game
   * (with the timer continuing from where it paused) or deals fresh.
   */
  private switchVariant(id: VariantId, saveCurrent: boolean): void {
    const cur = this.#state;
    if (cur !== null && cur.variant === id) {
      this.#emitNav(id);
      return;
    }
    if (cur !== null) {
      this.#slots[cur.variant] =
        saveCurrent && cur.status === 'playing' && cur.moves.length > 0
          ? { state: cur, elapsedMs: Date.now() - cur.startedAt }
          : undefined;
    }
    const saved = this.#slots[id];
    this.#slots[id] = undefined;
    this.#redoLog = [];
    this.#stopAuto();
    if (saved) {
      const restored =
        saved.state.status === 'playing'
          ? { ...saved.state, startedAt: Date.now() - saved.elapsedMs }
          : saved.state;
      this.#commit(restored);
    } else {
      this.newGame(id);
    }
    this.#emitNav(id);
  }

  /** Stamp wall-clock fields the engine deliberately leaves alone. */
  #stamp(s: GameState): GameState {
    if (s.status !== 'playing' && this.#state?.status === 'playing') {
      return { ...s, elapsedMs: Date.now() - s.startedAt };
    }
    return s;
  }

  #commit(s: GameState): void {
    const prev = this.#state;
    this.#state = s;
    const key = `${s.variant}:${s.seed}`;
    if (s.moves.length === 1 && !this.#playedSeeds.has(key)) {
      this.#playedSeeds.add(key);
      statsStore.recordPlayed(s.variant);
    }
    if (prev?.status === 'playing' && s.status === 'won' && !this.#wonSeeds.has(key)) {
      this.#wonSeeds.add(key);
      statsStore.recordWin(s.variant, s.elapsedMs);
    }
    if (prev?.status === 'playing' && s.status === 'lost') {
      statsStore.recordLoss(s.variant);
    }
    for (const fn of this.#listeners) fn(s);
  }

  #emitNav(t: NavTarget): void {
    for (const fn of this.#navListeners) fn(t);
  }

  #emitHint(m: Move | null): void {
    for (const fn of this.#hintListeners) fn(m);
  }
}

/** The singleton store — one canonical game at a time. */
export const gameStore = new GameStore();

// Dev/E2E-only handle for tests and console debugging — absent from
// normal production builds (VITE_E2E is only set for e2e builds).
if (import.meta.env.DEV || import.meta.env.VITE_E2E === 'true') {
  const w = window as unknown as Record<string, unknown>;
  w.__solitaire = gameStore;
  w.__solver = { solve, isSolvable, getVariant };
  import('./ui.svelte.js').then(({ uiStore }) => (w.__ui = uiStore));
  import('./install.svelte.js').then(({ installStore }) => (w.__install = installStore));
}
