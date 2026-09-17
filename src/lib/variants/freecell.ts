import type { Card, FreeCellState, GameState, Move, PileRef, Variant } from '../engine/types.js';
import { shuffledDeck } from '../engine/deck.js';
import { legalMovesCache } from '../engine/legalMovesCache.js';

const isRed = (c: Card): boolean => c.suit === 'hearts' || c.suit === 'diamonds';
const top = (p: readonly Card[]): Card | undefined => p[p.length - 1];
const ref = (area: PileRef['area'], index = 0): PileRef => ({ area, index });

const CELL_COUNT = 4;
/**
 * Mobile-first layout: 7 cascade columns (sizes 8,8,8,7,7,7,7) so cards
 * stay readable on phones. Canonical FreeCell uses 8×(7,7,7,7,6,6,6,6);
 * every deal is still solver-verified, so the solvability promise holds.
 */
const COL_COUNT = 7;
const COL_SIZES = [8, 8, 8, 7, 7, 7, 7];

function asFreeCell(s: GameState): FreeCellState {
  if (s.variant !== 'freecell') throw new Error(`expected freecell state, got ${s.variant}`);
  return s;
}

/**
 * Initial deal: all 52 cards face-up across `COL_COUNT` columns
 * per `COL_SIZES`. Deterministic per `seed`.
 */
function initialState(seed: string): FreeCellState {
  const deck = shuffledDeck(seed);
  const tableau: Card[][] = [];
  let i = 0;
  for (let col = 0; col < COL_COUNT; col++) {
    const size = COL_SIZES[col];
    tableau.push(deck.slice(i, i + size).map((c) => ({ ...c, faceUp: true })));
    i += size;
  }
  return {
    seed,
    variant: 'freecell',
    cells: [null, null, null, null],
    foundations: [[], [], [], []],
    tableau,
    moves: [],
    status: 'playing',
    startedAt: 0,
    elapsedMs: 0
  };
}

/** Cards `run` (bottom→top) form a valid movable sequence: descending, alternating colors. */
function isValidRun(run: readonly Card[]): boolean {
  for (let i = 1; i < run.length; i++) {
    const prev = run[i - 1];
    const c = run[i];
    if (prev.rank !== c.rank + 1 || isRed(prev) === isRed(c)) return false;
  }
  return true;
}

/**
 * Maximum sequence length movable onto column `destIdx`, given current free
 * cells and empty columns: (1 + freeCells) × 2^emptyBufferColumns.
 * An empty destination column cannot itself serve as a buffer.
 */
function maxMovable(s: FreeCellState, destIdx: number): number {
  const freeCells = s.cells.filter((c) => c === null).length;
  let emptyCols = 0;
  s.tableau.forEach((t, i) => {
    if (t.length === 0 && i !== destIdx) emptyCols++;
  });
  return (1 + freeCells) * 2 ** emptyCols;
}

function canDropOnTableau(card: Card, col: readonly Card[]): boolean {
  const t = top(col);
  if (!t) return true; // any card/sequence may fill an empty column
  return isRed(t) !== isRed(card) && t.rank === card.rank + 1;
}

function canDropOnFoundation(card: Card, f: readonly Card[]): boolean {
  const t = top(f);
  if (!t) return card.rank === 1;
  return t.suit === card.suit && t.rank === card.rank - 1;
}

function pileAt(s: FreeCellState, r: PileRef): readonly (Card | null)[] | null {
  switch (r.area) {
    case 'cell':
      return r.index >= 0 && r.index < CELL_COUNT ? s.cells[r.index] === null ? [] : [s.cells[r.index] as Card] : null;
    case 'foundation':
      return r.index >= 0 && r.index < 4 ? s.foundations[r.index] : null;
    case 'tableau':
      return r.index >= 0 && r.index < s.tableau.length ? s.tableau[r.index] : null;
    default:
      return null;
  }
}

/** Whether `m` is legal in `s` — direct validation, not via `legalMoves`. */
function isLegal(s: FreeCellState, m: Move): boolean {
  if (m.type !== 'move') return false;
  if (m.from.area === 'foundation') return false; // cards never leave foundations

  const src = pileAt(s, m.from);
  if (!src) return false;
  const idx = src.findIndex((c) => c !== null && c.id === m.cardId);
  if (idx < 0) return false;

  if (m.from.area === 'cell' && idx !== 0) return false;

  if (m.from.area === 'tableau') {
    const run = src.slice(idx) as Card[];
    if (!isValidRun(run)) return false;
    if (m.to.area === 'tableau' && run.length > maxMovable(s, m.to.index)) return false;
    if (m.to.area !== 'tableau' && run.length > 1) return false;
  }

  if (m.to.area === 'foundation') {
    if (idx !== src.length - 1) return false;
    const f = s.foundations[m.to.index];
    return m.to.index >= 0 && m.to.index < 4 && canDropOnFoundation(src[idx] as Card, f);
  }
  if (m.to.area === 'cell') {
    return idx === src.length - 1 && m.to.index >= 0 && m.to.index < CELL_COUNT && s.cells[m.to.index] === null;
  }
  if (m.to.area === 'tableau') {
    const dest = s.tableau[m.to.index];
    if (m.to.index < 0 || m.to.index >= COL_COUNT) return false;
    if (m.from.area === 'tableau' && m.to.index === m.from.index) return false;
    return canDropOnTableau(src[idx] as Card, dest);
  }
  return false;
}

function applyCardMove(s: FreeCellState, m: Extract<Move, { type: 'move' }>): FreeCellState {
  const srcPile = (pileAt(s, m.from) ?? []).slice();
  const idx = srcPile.findIndex((c) => c !== null && c.id === m.cardId);
  const moving = srcPile.splice(idx) as Card[];

  let cells = s.cells;
  let foundations = s.foundations;
  let tableau = s.tableau;

  if (m.from.area === 'cell') {
    cells = s.cells.slice();
    cells[m.from.index] = null;
  } else {
    tableau = s.tableau.map((t, i) => (i === m.from.index ? srcPile as Card[] : t));
  }

  if (m.to.area === 'cell') {
    cells = (cells === s.cells ? s.cells.slice() : cells);
    cells[m.to.index] = moving[0];
  } else if (m.to.area === 'foundation') {
    foundations = s.foundations.map((f, i) => (i === m.to.index ? [...f, ...moving] : f));
  } else {
    tableau = (tableau === s.tableau ? s.tableau : tableau).map((t, i) =>
      i === m.to.index ? [...t, ...moving] : t
    );
  }

  return { ...s, cells, foundations, tableau };
}

function applyMove(s: FreeCellState, m: Move): FreeCellState {
  if (s.status !== 'playing' || !isLegal(s, m)) return s;
  if (m.type !== 'move') return s; // narrows the union for applyCardMove
  const moved = applyCardMove(s, m);
  const won = isWon(moved);
  const ms = won ? [] : legalMoves(moved);
  const next: FreeCellState = {
    ...moved,
    moves: [...moved.moves, m],
    status: won ? 'won' : ms.length === 0 ? 'lost' : 'playing'
  };
  legalMovesCache.set(next, ms); // solver reuse — see legalMovesCache.ts
  return next;
}

function isWon(s: FreeCellState): boolean {
  return s.foundations.every((f) => f.length === 13);
}

/**
 * Canonicalized legal moves: only the first empty cell and the first empty
 * tableau column are offered per card, and whole-column moves to an empty
 * column (positional no-ops) are omitted.
 */
function legalMoves(s: FreeCellState): Move[] {
  const moves: Move[] = [];
  if (s.status !== 'playing') return moves;

  const firstEmptyCell = s.cells.findIndex((c) => c === null);
  const firstEmptyCol = s.tableau.findIndex((t) => t.length === 0);

  // Free-cell cards: to foundation or tableau.
  s.cells.forEach((cell, ci) => {
    if (!cell) return;
    const from = ref('cell', ci);
    s.foundations.forEach((f, fi) => {
      if (canDropOnFoundation(cell, f)) {
        moves.push({ type: 'move', from, to: ref('foundation', fi), cardId: cell.id });
      }
    });
    s.tableau.forEach((col, ti) => {
      if (col.length === 0) {
        if (ti === firstEmptyCol) moves.push({ type: 'move', from, to: ref('tableau', ti), cardId: cell.id });
      } else if (canDropOnTableau(cell, col)) {
        moves.push({ type: 'move', from, to: ref('tableau', ti), cardId: cell.id });
      }
    });
  });

  // Tableau: tops to foundation/cell, valid runs to other columns.
  s.tableau.forEach((col, ci) => {
    const from = ref('tableau', ci);
    col.forEach((card, pi) => {
      const isTop = pi === col.length - 1;
      if (isTop) {
        s.foundations.forEach((f, fi) => {
          if (canDropOnFoundation(card, f)) {
            moves.push({ type: 'move', from, to: ref('foundation', fi), cardId: card.id });
          }
        });
        if (firstEmptyCell >= 0) {
          moves.push({ type: 'move', from, to: ref('cell', firstEmptyCell), cardId: card.id });
        }
      }
      const run = col.slice(pi);
      if (run.length === 0 || !isValidRun(run)) return;
      s.tableau.forEach((dest, ti) => {
        if (ti === ci || run.length > maxMovable(s, ti)) return;
        if (dest.length === 0) {
          // Skip positional no-ops (moving a whole column to an empty column)
          // and duplicate empty targets.
          if (ti === firstEmptyCol && pi !== 0) {
            moves.push({ type: 'move', from, to: ref('tableau', ti), cardId: card.id });
          }
        } else if (canDropOnTableau(card, dest)) {
          moves.push({ type: 'move', from, to: ref('tableau', ti), cardId: card.id });
        }
      });
    });
  });

  return moves;
}

/**
 * Progress score: foundations dominate; open cells and empty columns count
 * as working space — a tiebreak signal for "cleaner" positions.
 */
function score(s: FreeCellState): number {
  const foundationCards = s.foundations.reduce((n, f) => n + f.length, 0);
  const freeCells = s.cells.filter((c) => c === null).length;
  const emptyCols = s.tableau.filter((t) => t.length === 0).length;
  return foundationCards * 10 + freeCells + emptyCols;
}

/** FreeCell-typed Variant: same contract, concrete state types for callers. */
export interface FreeCellVariant extends Variant {
  initialState(seed: string): FreeCellState;
  applyMove(state: GameState, move: Move): FreeCellState;
}

/** The FreeCell variant implementation. */
export const freecell: FreeCellVariant = {
  id: 'freecell',
  initialState: (seed) => initialState(seed),
  applyMove: (state, move) => applyMove(asFreeCell(state), move),
  isWon: (state) => isWon(asFreeCell(state)),
  legalMoves: (state) => legalMoves(asFreeCell(state)),
  score: (state) => score(asFreeCell(state))
};
