import type { Card, FreeCellState, KlondikeState, TriPeaksState } from './engine/types.js';
import { cardFromId } from './engine/deck.js';

/** Build a card from its id for handcrafted positions — `card('h13')`, `card('s1', false)`. */
export function card(id: string, faceUp = true): Card {
  return cardFromId(id, faceUp);
}

/** Build a column from id strings: `pile('h13','s12')`. */
export function pile(...ids: string[]): Card[] {
  return ids.map((id) => card(id));
}

/** Recursively freeze an object — any mutation by `applyMove` throws. */
export function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object') {
    for (const v of Object.values(o)) deepFreeze(v);
    Object.freeze(o);
  }
  return o;
}

/** Minimal Klondike state with overrides — for handcrafted test positions. */
export function klondikeState(p: Partial<KlondikeState>): KlondikeState {
  return {
    seed: 'test',
    variant: 'klondike',
    stock: [],
    waste: [],
    foundations: [[], [], [], []],
    tableau: [[], [], [], [], [], [], []],
    moves: [],
    status: 'playing',
    startedAt: 0,
    elapsedMs: 0,
    ...p
  };
}

/** Minimal FreeCell state with overrides. */
export function freecellState(p: Partial<FreeCellState>): FreeCellState {
  return {
    seed: 'test',
    variant: 'freecell',
    cells: [null, null, null, null],
    foundations: [[], [], [], []],
    tableau: [[], [], [], [], [], [], [], []],
    moves: [],
    status: 'playing',
    startedAt: 0,
    elapsedMs: 0,
    ...p
  };
}

/** Minimal TriPeaks state with overrides. */
export function tripeaksState(p: Partial<TriPeaksState>): TriPeaksState {
  return {
    seed: 'test',
    variant: 'tripeaks',
    tableau: Array.from({ length: 28 }, () => null),
    stock: [],
    waste: [],
    moves: [],
    status: 'playing',
    startedAt: 0,
    elapsedMs: 0,
    ...p
  };
}
