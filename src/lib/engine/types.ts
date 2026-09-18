/**
 * Core serializable types for the Solitaire engine (spec §4.1).
 * Everything here is JSON-safe: no Phaser objects, no Svelte stores, no DOM.
 */

/** Card suits. */
export type Suit = 'spades' | 'hearts' | 'diamonds' | 'clubs';

/** Card ranks: Ace = 1, Jack = 11, Queen = 12, King = 13. */
export type Rank = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13;

/** A single playing card. Face-up state lives on the card so piles stay plain arrays. */
export type Card = {
  /** Stable unique id, e.g. `'s1'` (ace of spades), `'h13'` (king of hearts). Referenced by `Move.cardId`. */
  id: string;
  suit: Suit;
  rank: Rank;
  faceUp: boolean;
};

/** Board areas that can hold piles, across all variants. */
export type Area = 'stock' | 'waste' | 'foundation' | 'tableau' | 'cell';

/** Reference to one pile. `index` is always 0 for `stock`/`waste`. */
export type PileRef = { area: Area; index: number };

/**
 * A serializable state transition (spec §4.2). The full game history is the
 * append-only `moves` log — replaying it through `applyMove` reproduces state.
 * - `draw`: move stock top → waste (Klondike/TriPeaks), or recycle waste → stock.
 * - `move`: relocate `cardId` — and every card on top of it — between piles.
 */
export type Move =
  | { type: 'draw' }
  | { type: 'move'; from: PileRef; to: PileRef; cardId: string };

export type GameStatus = 'playing' | 'won' | 'lost';

export type VariantId = 'klondike' | 'freecell' | 'tripeaks' | 'spider' | 'pyramid';

/** Fields shared by every variant's game state. */
export type BaseState = {
  /** Seed that produced this deal. Same seed → same deck, always. */
  seed: string;
  variant: VariantId;
  /** Append-only move log. The multiplayer replay source of truth. */
  moves: Move[];
  status: GameStatus;
  /**
   * Wall-clock bookkeeping for the UI. The engine never writes these fields —
   * stamping them is the caller's job, which keeps `applyMove` deterministic.
   */
  startedAt: number;
  elapsedMs: number;
};

/** Klondike (draw-1): 7 tableau columns, 24-card stock, 4 suit foundations. */
export type KlondikeState = BaseState & {
  variant: 'klondike';
  /** Bottom → top; last element is the next card drawn. */
  stock: Card[];
  waste: Card[];
  foundations: Card[][];
  tableau: Card[][];
};

/** FreeCell: 8 face-up tableau columns, 4 free cells, 4 suit foundations. */
export type FreeCellState = BaseState & {
  variant: 'freecell';
  cells: (Card | null)[];
  foundations: Card[][];
  tableau: Card[][];
};

/**
 * TriPeaks: 28 fixed tableau positions in 4 rows (3-6-9-10), 23-card stock.
 * Removed cards become `null`; position/covering topology is a layout constant.
 */
export type TriPeaksState = BaseState & {
  variant: 'tripeaks';
  tableau: (Card | null)[];
  stock: Card[];
  waste: Card[];
};

/**
 * Spider: two decks (104 cards), 10 tableau columns. Columns build down
 * regardless of suit, but only same-suit descending runs move as a unit;
 * a completed K..A run clears to a foundation. Stock deals in rows of 10.
 */
export type SpiderState = BaseState & {
  variant: 'spider';
  /** Deck composition: 1, 2, or 4 suits (difficulty). */
  suitCount: 1 | 2 | 4;
  /** Undealt cards; each draw places one face-up card on every column. */
  stock: Card[];
  tableau: Card[][];
  /** Completed K..A same-suit runs (8 = win). */
  foundations: Card[][];
};

/**
 * Pyramid: 28 fixed positions in 7 rows (1-2-3-4-5-6-7). Removed pairs
 * become `null`; a card is exposed once both positions covering it are
 * cleared. All pyramid cards stay face-up — exposure is positional.
 */
export type PyramidState = BaseState & {
  variant: 'pyramid';
  tableau: (Card | null)[];
  stock: Card[];
  waste: Card[];
};

/** Discriminated union of all variant states — the canonical `GameState`. */
export type GameState =
  | KlondikeState
  | FreeCellState
  | TriPeaksState
  | SpiderState
  | PyramidState;

/**
 * The per-variant contract (spec Phase 1). All functions are pure:
 * `applyMove` never mutates `state` and always returns a new object.
 * Illegal moves return the input state unchanged (detectable by identity).
 */
export interface Variant {
  readonly id: VariantId;
  /** Build the dealt position for `seed`. Deterministic. */
  initialState(seed: string): GameState;
  /** Apply one move; returns a new state, or `state` unchanged if illegal. */
  applyMove(state: GameState, move: Move): GameState;
  isWon(state: GameState): boolean;
  /**
   * All currently legal moves. Symmetric equivalents are canonicalized
   * (e.g. only the first empty tableau column / free cell is offered).
   */
  legalMoves(state: GameState): Move[];
  /** Progress metric for future race-mode tiebreaks. Higher = further along. */
  score(state: GameState): number;
}
