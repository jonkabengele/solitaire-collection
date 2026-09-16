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

/** Listener invoked with the new state after every committed change. */
export type StateListener = (state: GameState) => void;

/** Navigation targets the router understands: a variant board or the menu. */
export type NavTarget = 'menu' | VariantId;

type NavListener = (target: NavTarget) => void;

/** A suspended (non-active) in-progress game plus its frozen elapsed time. */
type Slot = { state: GameState; elapsedMs: number };

function newSeed(): string {
  return `${Date.now().toString(36)}-${crypto.getRandomValues(new Uint32Array(1))[0].toString(36)}`;
}

class GameStore {
  #state = $state<GameState>({
    ...getVariant('klondike').initialState(newSeed()),
    startedAt: Date.now()
  });
  #pendingSwitch = $state<VariantId | null>(null);
  readonly #slots: Partial<Record<VariantId, Slot>> = {};
  readonly #listeners = new Set<StateListener>();
  readonly #navListeners = new Set<NavListener>();

  /** The canonical game state. Never mutated in place. */
  get state(): GameState {
    return this.#state;
  }

  /** Variant id awaiting a "Save and switch?" decision, or null. */
  get pendingSwitch(): VariantId | null {
    return this.#pendingSwitch;
  }

  /** The variant driving the current state. */
  get variant(): Variant {
    return getVariant(this.#state.variant);
  }

  /** `true` when the move log is non-empty (undo is meaningful). */
  get canUndo(): boolean {
    return this.#state.moves.length > 0;
  }

  /** Number of committed moves. */
  get moveCount(): number {
    return this.#state.moves.length;
  }

  /** `true` when the live game has progress worth saving on switch. */
  get inProgress(): boolean {
    return this.#state.status === 'playing' && this.#state.moves.length > 0;
  }

  /** `true` when a suspended game exists for `id` (menu "continue" chip). */
  hasSaved(id: VariantId): boolean {
    return this.#slots[id] !== undefined;
  }

  /**
   * Deal a new game. `seed` defaults to a fresh random seed; passing one
   * replays a known deal (multiplayer-ready: same seed → same deck).
   * A fresh deal for `variantId` discards that variant's suspended game.
   */
  newGame(variantId: VariantId = this.#state.variant, seed = newSeed()): void {
    this.#slots[variantId] = undefined;
    const s = getVariant(variantId).initialState(seed);
    this.#commit({ ...s, startedAt: Date.now() });
  }

  /**
   * HUD path: switch to `id`, prompting "Save and switch?" first when the
   * live game has progress. Otherwise switches immediately (current game
   * is saved implicitly — there is nothing worth losing).
   */
  requestSwitch(id: VariantId): void {
    if (id === this.#state.variant) return;
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

  /** Ask the router to show the menu. The live game stays in `#state`. */
  openMenu(): void {
    this.#emitNav('menu');
  }

  /**
   * Route a move through the single `applyMove` pathway. Returns `false`
   * when the engine rejected it (illegal move → same object back).
   */
  dispatchMove(move: Move): boolean {
    const next = applyMove(this.#state, move);
    if (next === this.#state) return false;
    this.#commit(this.#stamp(next));
    return true;
  }

  /**
   * Undo the last move by replaying the log minus its tail through
   * `initialState` + `applyMove`. Pure and deterministic by construction.
   */
  undo(): void {
    const s = this.#state;
    if (s.moves.length === 0) return;
    let rebuilt = this.variant.initialState(s.seed);
    for (const m of s.moves.slice(0, -1)) rebuilt = applyMove(rebuilt, m);
    this.#commit({ ...rebuilt, startedAt: s.startedAt, elapsedMs: s.elapsedMs });
  }

  /** All legal moves in the current position (used for double-tap autofinish, later for hints). */
  legalMoves(): Move[] {
    return this.variant.legalMoves(this.#state);
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
   * Subscribe to navigation requests (menu / variant boards). The Phaser
   * router translates these into scene transitions. Returns unsubscribe.
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
    if (cur.variant === id) {
      this.#emitNav(id);
      return;
    }
    this.#slots[cur.variant] =
      saveCurrent && cur.status === 'playing' && cur.moves.length > 0
        ? { state: cur, elapsedMs: Date.now() - cur.startedAt }
        : undefined;
    const saved = this.#slots[id];
    this.#slots[id] = undefined;
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
    if (s.status !== 'playing' && this.#state.status === 'playing') {
      return { ...s, elapsedMs: Date.now() - s.startedAt };
    }
    return s;
  }

  #commit(s: GameState): void {
    this.#state = s;
    for (const fn of this.#listeners) fn(s);
  }

  #emitNav(t: NavTarget): void {
    for (const fn of this.#navListeners) fn(t);
  }
}

/** The singleton store — one canonical game at a time. */
export const gameStore = new GameStore();

// Dev-only handle for E2E tests and console debugging — tree-shaken out of prod builds.
if (import.meta.env.DEV) {
  const w = window as unknown as Record<string, unknown>;
  w.__solitaire = gameStore;
  w.__solver = { solve, isSolvable, getVariant };
}
