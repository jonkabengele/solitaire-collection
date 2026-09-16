import type { GameState, Move } from './types.js';

/**
 * Per-state legal-move memoization shared between `applyMove` and the solver.
 * `applyMove` computes `legalMoves(next)` for the lost-check and stores it
 * here; `solver.orderedMoves` reuses it instead of recomputing — halves the
 * move-generation cost per search node. Pure bookkeeping: never changes
 * semantics, keyed by state object identity (states are immutable).
 */
export const legalMovesCache = new WeakMap<GameState, Move[]>();
