import type { Card, GameState, Move, PileRef, Rank, SpiderState, Suit, Variant } from '../engine/types.js';
import { shuffle } from '../engine/rng.js';
import { legalMovesCache } from '../engine/legalMovesCache.js';

const top = (p: readonly Card[]): Card | undefined => p[p.length - 1];
const ref = (area: PileRef['area'], index = 0): PileRef => ({ area, index });

const COL_COUNT = 10;
/** Deal: 6 cards in the first four columns, 5 in the rest (54 total). */
const COL_SIZES = [6, 6, 6, 6, 5, 5, 5, 5, 5, 5];
const STOCK_ROUNDS = 5; // 104 - 54 = 50, dealt in rows of 10
const RUN = 13;

const SUIT_LETTER: Record<Suit, string> = { spades: 's', hearts: 'h', diamonds: 'd', clubs: 'c' };
const SUITS_FOR: Record<1 | 2 | 4, Suit[]> = {
  1: ['spades'],
  2: ['spades', 'hearts'],
  4: ['spades', 'hearts', 'diamonds', 'clubs']
};

function asSpider(s: GameState): SpiderState {
  if (s.variant !== 'spider') throw new Error(`expected spider state, got ${s.variant}`);
  return s;
}

/**
 * 104-card deck for `suitCount`. Duplicate ranks share a suit, so ids get
 * a `#n` serial suffix (`s5#3`) — the face texture key strips it.
 */
function createSpiderDeck(suitCount: 1 | 2 | 4): Card[] {
  const deck: Card[] = [];
  let serial = 0;
  for (const suit of SUITS_FOR[suitCount]) {
    for (let copy = 0; copy < 8 / suitCount; copy++) {
      for (let rank = 1; rank <= 13; rank++) {
        deck.push({
          id: `${SUIT_LETTER[suit]}${rank}#${serial++}`,
          suit,
          rank: rank as Rank,
          faceUp: false
        });
      }
    }
  }
  return deck;
}

/**
 * Initial deal: 54 cards across `COL_SIZES` columns — only each column's
 * top card face-up — with 50 cards left in the stock (five draw rounds).
 */
function initialState(seed: string, suitCount: 1 | 2 | 4 = 1): SpiderState {
  const deck = shuffle(seed, createSpiderDeck(suitCount));
  const tableau: Card[][] = [];
  let i = 0;
  for (let col = 0; col < COL_COUNT; col++) {
    const size = COL_SIZES[col];
    tableau.push(
      deck.slice(i, i + size).map((c, j) => ({ ...c, faceUp: j === size - 1 }))
    );
    i += size;
  }
  return {
    seed,
    variant: 'spider',
    suitCount,
    stock: deck.slice(i).map((c) => ({ ...c, faceUp: false })),
    tableau,
    foundations: [],
    moves: [],
    status: 'playing',
    startedAt: 0,
    elapsedMs: 0
  };
}

/** Cards `col[idx..]` form a movable unit: face-up, descending, one suit. */
function isOrderedRun(col: readonly Card[], idx: number): boolean {
  for (let i = idx; i < col.length; i++) {
    const c = col[i];
    if (!c.faceUp) return false;
    if (i > idx && (c.suit !== col[i - 1].suit || c.rank !== col[i - 1].rank - 1)) return false;
  }
  return true;
}

/** Drop rule: any card builds on a column top one rank higher — any suit. */
function canDropOnTableau(card: Card, col: readonly Card[]): boolean {
  const t = top(col);
  return !t || t.rank === card.rank + 1;
}

function pileAt(s: SpiderState, r: PileRef): Card[] | null {
  switch (r.area) {
    case 'stock':
      return r.index === 0 ? s.stock : null;
    case 'tableau':
      return r.index >= 0 && r.index < s.tableau.length ? s.tableau[r.index] : null;
    case 'foundation':
      return r.index >= 0 && r.index < s.foundations.length ? s.foundations[r.index] : null;
    default:
      return null;
  }
}

function isLegalDraw(s: SpiderState): boolean {
  return s.stock.length >= COL_COUNT && s.tableau.every((c) => c.length > 0);
}

function isLegalMove(s: SpiderState, m: Extract<Move, { type: 'move' }>): boolean {
  if (m.from.area !== 'tableau' || m.to.area !== 'tableau') return false;
  if (m.from.index === m.to.index) return false;
  const src = pileAt(s, m.from);
  const dest = pileAt(s, m.to);
  if (!src || !dest) return false;
  const idx = src.findIndex((c) => c.id === m.cardId);
  if (idx < 0 || !isOrderedRun(src, idx)) return false;
  return canDropOnTableau(src[idx], dest);
}

/** Remove completed K..A same-suit runs from column tops (repeat-clears). */
function clearRuns(s: SpiderState): SpiderState {
  let tableau = s.tableau;
  let foundations = s.foundations;
  let changed = true;
  while (changed) {
    changed = false;
    for (let ci = 0; ci < tableau.length; ci++) {
      const col = tableau[ci];
      if (col.length < RUN) continue;
      const runTop = col.slice(col.length - RUN);
      const suit = runTop[0].suit;
      let ok = runTop[0].faceUp && runTop[0].rank === 13;
      for (let i = 1; ok && i < RUN; i++) {
        ok = runTop[i].faceUp && runTop[i].suit === suit && runTop[i].rank === 13 - i;
      }
      if (!ok) continue;
      if (tableau === s.tableau) tableau = s.tableau.slice();
      if (foundations === s.foundations) foundations = s.foundations.slice();
      tableau[ci] = col.slice(0, col.length - RUN);
      foundations.push(runTop);
      changed = true;
    }
  }
  return tableau === s.tableau && foundations === s.foundations ? s : { ...s, tableau, foundations };
}

function applyMove(s: SpiderState, m: Move): SpiderState {
  if (s.status !== 'playing') return s;
  let next: SpiderState;
  if (m.type === 'draw') {
    if (!isLegalDraw(s)) return s;
    const stock = s.stock.slice(0, s.stock.length - COL_COUNT);
    const dealt = s.stock.slice(s.stock.length - COL_COUNT);
    const tableau = s.tableau.map((col, i) => [...col, { ...dealt[i], faceUp: true }]);
    next = clearRuns({ ...s, stock, tableau });
  } else {
    if (!isLegalMove(s, m)) return s;
    const src = s.tableau[m.from.index].slice();
    const idx = src.findIndex((c) => c.id === m.cardId);
    const moving = src.splice(idx);
    const tableau = s.tableau.map((col, i) =>
      i === m.from.index ? src : i === m.to.index ? [...col, ...moving] : col
    );
    next = clearRuns({ ...s, tableau });
  }
  const won = isWon(next);
  const ms = won ? [] : legalMoves(next);
  const out: SpiderState = {
    ...next,
    moves: [...s.moves, m],
    status: won ? 'won' : ms.length === 0 ? 'lost' : 'playing'
  };
  legalMovesCache.set(out, ms);
  return out;
}

function isWon(s: SpiderState): boolean {
  return s.foundations.length === 8;
}

/**
 * Legal moves: every movable same-suit run to every valid column, plus
 * the stock draw when all columns are occupied. Empty columns are
 * canonicalized to the first, and whole-column→empty no-ops are omitted.
 */
function legalMoves(s: SpiderState): Move[] {
  const moves: Move[] = [];
  if (s.status !== 'playing') return moves;
  const firstEmpty = s.tableau.findIndex((t) => t.length === 0);

  s.tableau.forEach((col, ci) => {
    const from = ref('tableau', ci);
    for (let pi = 0; pi < col.length; pi++) {
      if (!isOrderedRun(col, pi)) continue;
      s.tableau.forEach((dest, ti) => {
        if (ti === ci) return;
        if (dest.length === 0) {
          if (ti === firstEmpty && pi !== 0) {
            moves.push({ type: 'move', from, to: ref('tableau', ti), cardId: col[pi].id });
          }
        } else if (canDropOnTableau(col[pi], dest)) {
          moves.push({ type: 'move', from, to: ref('tableau', ti), cardId: col[pi].id });
        }
      });
    }
  });

  if (isLegalDraw(s)) moves.push({ type: 'draw' });
  return moves;
}

/** Progress: cleared runs dominate; face-up coverage is the tiebreak signal. */
function score(s: SpiderState): number {
  const faceUp = s.tableau.reduce((n, col) => n + col.filter((c) => c.faceUp).length, 0);
  return s.foundations.length * 100 + faceUp;
}

/** Spider-typed Variant: same contract, concrete state types for callers. */
export interface SpiderVariant extends Variant {
  initialState(seed: string, suitCount?: 1 | 2 | 4): SpiderState;
  applyMove(state: GameState, move: Move): SpiderState;
}

/** The Spider variant implementation (default: one suit — the mobile-friendly deal). */
export const spider: SpiderVariant = {
  id: 'spider',
  initialState: (seed, suitCount = 1) => initialState(seed, suitCount),
  applyMove: (state, move) => applyMove(asSpider(state), move),
  isWon: (state) => isWon(asSpider(state)),
  legalMoves: (state) => legalMoves(asSpider(state)),
  score: (state) => score(asSpider(state))
};
