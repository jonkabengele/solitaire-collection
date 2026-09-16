import type { GameState, Move } from './types.js';
import { getVariant } from '../variants/index.js';

/**
 * Single entry point for every state transition (spec §4.2).
 * Dispatches to the variant named by `state.variant`. Pure: never mutates
 * `state`; illegal moves return the input unchanged.
 *
 * This is the function a future multiplayer server calls to validate moves —
 * clients replay the same move log through it.
 */
export function applyMove(state: GameState, move: Move): GameState {
  return getVariant(state.variant).applyMove(state, move);
}
