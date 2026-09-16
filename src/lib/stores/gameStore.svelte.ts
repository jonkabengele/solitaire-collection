/**
 * Canonical game-state store (spec §4.3 bridge decision: Svelte 5 runes +
 * lightweight event emitter). Owns the authoritative `GameState`; Phaser
 * scenes only read it and dispatch `Move`s back through `dispatchMove`.
 *
 * Svelte components read `gameStore.state` reactively (rune). Phaser scenes
 * call `subscribe(fn)` — the emitter fires on every committed state change.
 */
import type { GameState, Move, Variant, VariantId } from '../engine/types.js';
import { applyMove } from '../engine/applyMove.js';
import { getVariant } from '../variants/index.js';
import { isSolvable, solve } from '../engine/solver.js';

/** Listener invoked with the new state after every committed change. */
export type StateListener = (state: GameState) => void;

function newSeed(): string {
  return `${Date.now().toString(36)}-${crypto.getRandomValues(new Uint32Array(1))[0].toString(36)}`;
}

class GameStore {
  #state = $state<GameState>({
    ...getVariant('klondike').initialState(newSeed()),
    startedAt: Date.now()
  });
  readonly #listeners = new Set<StateListener>();

  /** The canonical game state. Never mutated in place. */
  get state(): GameState {
    return this.#state;
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

  /**
   * Deal a new game. `seed` defaults to a fresh random seed; passing one
   * replays a known deal (multiplayer-ready: same seed → same deck).
   */
  newGame(variantId: VariantId = this.#state.variant, seed = newSeed()): void {
    const s = getVariant(variantId).initialState(seed);
    this.#commit({ ...s, startedAt: Date.now() });
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
}

/** The singleton store — one canonical game at a time. */
export const gameStore = new GameStore();

// Dev-only handle for E2E tests and console debugging — tree-shaken out of prod builds.
if (import.meta.env.DEV) {
  const w = window as unknown as Record<string, unknown>;
  w.__solitaire = gameStore;
  w.__solver = { solve, isSolvable, getVariant };
}
