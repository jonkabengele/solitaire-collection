import type { Card, GameState, Move, PileRef, PyramidState, Variant } from '../engine/types.js';
import { shuffledDeck } from '../engine/deck.js';
import { legalMovesCache } from '../engine/legalMovesCache.js';

const top = (p: readonly Card[]): Card | undefined => p[p.length - 1];
const ref = (area: PileRef['area'], index = 0): PileRef => ({ area, index });

const POSITIONS = 28;

/**
 * Covering map for the 28-position pyramid (rows 1-2-3-4-5-6-7).
 * `COVERED_BY[i]` lists the two positions resting on position `i`;
 * a card is exposed once both are cleared.
 *
 *        0
 *       1 2
 *      3 4 5
 *     6 7 8 9
 *   … row 6: 21 … 27 (always exposed while present)
 */
const COVERED_BY: readonly (readonly number[])[] = (() => {
  const cover: number[][] = Array.from({ length: POSITIONS }, () => []);
  let g = 0;
  for (let r = 0; r < 6; r++) {
    for (let p = 0; p <= r; p++) {
      const i = g + p;
      cover[i] = [i + r + 1, i + r + 2];
    }
    g += r + 1;
  }
  return cover;
})();

/** Ranks that clear as a pair: they sum to 13. Kings clear alone. */
const PAIR_SUM = 13;
const KING = 13;

function asPyramid(s: GameState): PyramidState {
  if (s.variant !== 'pyramid') throw new Error(`expected pyramid state, got ${s.variant}`);
  return s;
}

/**
 * Initial Pyramid deal: 28 cards face-up into the triangle, 24-card stock,
 * empty waste. Deterministic per `seed`.
 */
function initialState(seed: string): PyramidState {
  const deck = shuffledDeck(seed);
  return {
    seed,
    variant: 'pyramid',
    tableau: deck.slice(0, POSITIONS).map((c) => ({ ...c, faceUp: true })),
    stock: deck.slice(POSITIONS),
    waste: [],
    moves: [],
    status: 'playing',
    startedAt: 0,
    elapsedMs: 0
  };
}

/** Position `i` is playable: card present and nothing still resting on it. */
function isExposed(s: PyramidState, i: number): boolean {
  return s.tableau[i] !== null && COVERED_BY[i].every((j) => s.tableau[j] === null);
}

/**
 * Move encoding (variant-local, like TriPeaks' "move → waste clears"):
 *   tableau i → tableau j   remove the pair at i and j (ranks sum 13)
 *   waste     → tableau j   remove waste top + card at j
 *   tableau i → waste       remove card at i + waste top
 *   X         → foundation  remove a lone King (X = tableau i or waste)
 *   draw                    stock top → waste
 */
function isLegal(s: PyramidState, m: Move): boolean {
  if (m.type === 'draw') return s.stock.length > 0;
  const src = sourceCard(s, m.from);
  if (!src || src.id !== m.cardId) return false;

  if (m.to.area === 'foundation') {
    return src.rank === KING;
  }
  const dst =
    m.to.area === 'waste'
      ? top(s.waste)
      : m.to.area === 'tableau'
        ? m.to.index >= 0 && m.to.index < POSITIONS && isExposed(s, m.to.index)
          ? s.tableau[m.to.index]
          : null
        : null;
  if (!dst || dst.id === src.id) return false;
  return src.rank + dst.rank === PAIR_SUM;
}

/** The card a `from` ref points at, honouring exposure rules. */
function sourceCard(s: PyramidState, from: PileRef): Card | null {
  if (from.area === 'waste') return top(s.waste) ?? null;
  if (from.area !== 'tableau') return null;
  const i = from.index;
  return i >= 0 && i < POSITIONS && isExposed(s, i) ? s.tableau[i] : null;
}

function applyMove(s: PyramidState, m: Move): PyramidState {
  if (s.status !== 'playing' || !isLegal(s, m)) return s;

  let tableau = s.tableau.slice();
  let waste = s.waste.slice();
  let stock = s.stock;

  if (m.type === 'draw') {
    stock = s.stock.slice();
    waste.push({ ...(stock.pop() as Card), faceUp: true });
  } else if (m.to.area === 'foundation') {
    // Lone King: just remove its source.
    if (m.from.area === 'waste') waste.pop();
    else tableau[m.from.index] = null;
  } else {
    // Pair removal: clear the source, then the destination.
    if (m.from.area === 'waste') waste.pop();
    else tableau[m.from.index] = null;
    if (m.to.area === 'waste') waste.pop();
    else tableau[m.to.index] = null;
  }

  let next: PyramidState = { ...s, tableau, waste, stock };
  const won = isWon(next);
  const ms = won ? [] : legalMoves(next);
  next = { ...next, moves: [...next.moves, m], status: won ? 'won' : ms.length === 0 ? 'lost' : 'playing' };
  legalMovesCache.set(next, ms);
  return next;
}

function isWon(s: PyramidState): boolean {
  return s.tableau.every((c) => c === null);
}

/** Legal moves: every exposed pair summing to 13, lone Kings, plus `draw`. */
function legalMoves(s: PyramidState): Move[] {
  const moves: Move[] = [];
  if (s.status !== 'playing') return moves;

  const w = top(s.waste);
  const exposed: { i: number; c: Card }[] = [];
  s.tableau.forEach((c, i) => {
    if (c && isExposed(s, i)) exposed.push({ i, c });
  });

  for (const { i, c } of exposed) {
    if (c.rank === KING) {
      moves.push({ type: 'move', from: ref('tableau', i), to: ref('foundation'), cardId: c.id });
    }
  }
  if (w && w.rank === KING) {
    moves.push({ type: 'move', from: ref('waste'), to: ref('foundation'), cardId: w.id });
  }

  for (let a = 0; a < exposed.length; a++) {
    for (let b = a + 1; b < exposed.length; b++) {
      const { i, c } = exposed[a];
      const { i: j, c: d } = exposed[b];
      if (c.rank + d.rank === PAIR_SUM) {
        moves.push({ type: 'move', from: ref('tableau', i), to: ref('tableau', j), cardId: c.id });
      }
    }
  }
  if (w) {
    for (const { i, c } of exposed) {
      if (w.rank + c.rank === PAIR_SUM) {
        moves.push({ type: 'move', from: ref('waste'), to: ref('tableau', i), cardId: w.id });
      }
    }
  }
  if (s.stock.length > 0) moves.push({ type: 'draw' });
  return moves;
}

/** Progress score: cleared positions dominate; spare stock is a small bonus. */
function score(s: PyramidState): number {
  return s.tableau.filter((c) => c === null).length * 10 + s.stock.length;
}

/** Pyramid-typed Variant: same contract, concrete state types for callers. */
export interface PyramidVariant extends Variant {
  initialState(seed: string): PyramidState;
  applyMove(state: GameState, move: Move): PyramidState;
}

/** The Pyramid variant implementation. */
export const pyramid: PyramidVariant = {
  id: 'pyramid',
  initialState: (seed) => initialState(seed),
  applyMove: (state, move) => applyMove(asPyramid(state), move),
  isWon: (state) => isWon(asPyramid(state)),
  legalMoves: (state) => legalMoves(asPyramid(state)),
  score: (state) => score(asPyramid(state))
};
