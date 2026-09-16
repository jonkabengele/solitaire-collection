import type { Card, GameState, Move, PileRef, TriPeaksState, Variant } from '../engine/types.js';
import { shuffledDeck } from '../engine/deck.js';
import { legalMovesCache } from '../engine/legalMovesCache.js';

const top = (p: readonly Card[]): Card | undefined => p[p.length - 1];
const ref = (area: PileRef['area'], index = 0): PileRef => ({ area, index });

const POSITIONS = 28;

/**
 * Covering map for the 28-position TriPeaks layout (rows 3-6-9-10).
 * `COVERED_BY[i]` lists the positions that sit on top of position `i`;
 * a card is exposed once every covering position has been cleared.
 *
 *   row 0 (peaks):   0  1  2
 *   row 1:          3 4 5 6 7 8
 *   row 2:         9 … 17
 *   row 3:        18 … 27  (always exposed while present)
 */
const COVERED_BY: readonly (readonly number[])[] = (() => {
  const cover: number[][] = Array.from({ length: POSITIONS }, () => []);
  for (let p = 0; p < 3; p++) {
    cover[p] = [3 + 2 * p, 3 + 2 * p + 1];
    for (let i = 0; i < 2; i++) cover[3 + 2 * p + i] = [9 + 3 * p + i, 9 + 3 * p + i + 1];
    for (let i = 0; i < 3; i++) cover[9 + 3 * p + i] = [18 + 3 * p + i, 18 + 3 * p + i + 1];
  }
  return cover;
})();

function asTriPeaks(s: GameState): TriPeaksState {
  if (s.variant !== 'tripeaks') throw new Error(`expected tripeaks state, got ${s.variant}`);
  return s;
}

/**
 * Initial TriPeaks deal: 28 cards into the peaks (bottom row face-up, rest
 * face-down), one face-up waste card to start the chain, 23-card stock.
 * Deterministic per `seed`.
 */
function initialState(seed: string): TriPeaksState {
  const deck = shuffledDeck(seed);
  const tableau: (Card | null)[] = deck.slice(0, POSITIONS).map((c, i) => ({
    ...c,
    faceUp: i >= 18 // bottom row starts exposed
  }));
  const waste = [{ ...deck[POSITIONS], faceUp: true }];
  return {
    seed,
    variant: 'tripeaks',
    tableau,
    stock: deck.slice(POSITIONS + 1),
    waste,
    moves: [],
    status: 'playing',
    startedAt: 0,
    elapsedMs: 0
  };
}

/** Position `i` is playable: card present and nothing still covering it. */
function isExposed(s: TriPeaksState, i: number): boolean {
  return s.tableau[i] !== null && COVERED_BY[i].every((j) => s.tableau[j] === null);
}

/** Ranks chain adjacently on a cycle: A↔2 … Q↔K and K↔A wrap. */
function isAdjacent(a: Card, b: Card): boolean {
  const d = Math.abs(a.rank - b.rank);
  return d === 1 || d === 12;
}

/** Whether `m` is legal in `s` — direct validation. */
function isLegal(s: TriPeaksState, m: Move): boolean {
  if (m.type === 'draw') return s.stock.length > 0;
  if (m.from.area !== 'tableau' || m.to.area !== 'waste') return false;
  const i = m.from.index;
  const card = i >= 0 && i < POSITIONS ? s.tableau[i] : null;
  if (!card || card.id !== m.cardId || !isExposed(s, i)) return false;
  const w = top(s.waste);
  return !!w && isAdjacent(card, w);
}

/** Flip any position that just became exposed (all its coverers cleared). */
function flipNewlyExposed(s: TriPeaksState, tableau: (Card | null)[]): (Card | null)[] {
  const probe: TriPeaksState = { ...s, tableau };
  return tableau.map((c, i) =>
    c !== null && !c.faceUp && isExposed(probe, i) ? { ...c, faceUp: true } : c
  );
}

function applyMove(s: TriPeaksState, m: Move): TriPeaksState {
  if (s.status !== 'playing' || !isLegal(s, m)) return s;

  let next: TriPeaksState;
  if (m.type === 'draw') {
    const stock = s.stock.slice();
    const drawn = { ...stock.pop() as Card, faceUp: true };
    next = { ...s, stock, waste: [...s.waste, drawn] };
  } else {
    const tableau = s.tableau.slice();
    const card = tableau[m.from.index] as Card;
    tableau[m.from.index] = null;
    next = { ...s, tableau: flipNewlyExposed(s, tableau), waste: [...s.waste, { ...card, faceUp: true }] };
  }

  const won = isWon(next);
  const ms = won ? [] : legalMoves(next);
  next = { ...next, moves: [...next.moves, m], status: won ? 'won' : ms.length === 0 ? 'lost' : 'playing' };
  legalMovesCache.set(next, ms); // solver reuse — see legalMovesCache.ts
  return next;
}

function isWon(s: TriPeaksState): boolean {
  return s.tableau.every((c) => c === null);
}

/** Legal moves: every exposed card adjacent to the waste top, plus `draw` while stock remains. */
function legalMoves(s: TriPeaksState): Move[] {
  const moves: Move[] = [];
  if (s.status !== 'playing') return moves;
  const w = top(s.waste);
  if (w) {
    s.tableau.forEach((card, i) => {
      if (card && isExposed(s, i) && isAdjacent(card, w)) {
        moves.push({ type: 'move', from: ref('tableau', i), to: ref('waste'), cardId: card.id });
      }
    });
  }
  if (s.stock.length > 0) moves.push({ type: 'draw' });
  return moves;
}

/**
 * Progress score: cleared positions dominate; remaining stock is a small
 * tiebreak bonus for finishing with draws to spare.
 */
function score(s: TriPeaksState): number {
  const cleared = s.tableau.filter((c) => c === null).length;
  return cleared * 10 + s.stock.length;
}

/** TriPeaks-typed Variant: same contract, concrete state types for callers. */
export interface TriPeaksVariant extends Variant {
  initialState(seed: string): TriPeaksState;
  applyMove(state: GameState, move: Move): TriPeaksState;
}

/** The TriPeaks variant implementation. */
export const tripeaks: TriPeaksVariant = {
  id: 'tripeaks',
  initialState: (seed) => initialState(seed),
  applyMove: (state, move) => applyMove(asTriPeaks(state), move),
  isWon: (state) => isWon(asTriPeaks(state)),
  legalMoves: (state) => legalMoves(asTriPeaks(state)),
  score: (state) => score(asTriPeaks(state))
};
