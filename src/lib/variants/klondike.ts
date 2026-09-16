import type { Card, GameState, KlondikeState, Move, PileRef, Variant } from '../engine/types.js';
import { shuffledDeck } from '../engine/deck.js';
import { legalMovesCache } from '../engine/legalMovesCache.js';

/** Red suits vs black suits — tableau builds alternate colors. */
const isRed = (c: Card): boolean => c.suit === 'hearts' || c.suit === 'diamonds';

const top = (p: readonly Card[]): Card | undefined => p[p.length - 1];

const ref = (area: PileRef['area'], index = 0): PileRef => ({ area, index });

function asKlondike(s: GameState): KlondikeState {
  if (s.variant !== 'klondike') throw new Error(`expected klondike state, got ${s.variant}`);
  return s;
}

/**
 * Initial draw-1 Klondike deal: 7 columns of 1..7 cards, each top card face-up;
 * remaining 24 cards form the face-down stock. Deterministic per `seed`.
 */
function initialState(seed: string): KlondikeState {
  const deck = shuffledDeck(seed);
  const tableau: Card[][] = [];
  let i = 0;
  for (let col = 0; col < 7; col++) {
    const pile = deck.slice(i, i + col + 1);
    pile[pile.length - 1] = { ...pile[pile.length - 1], faceUp: true };
    tableau.push(pile);
    i += col + 1;
  }
  return {
    seed,
    variant: 'klondike',
    stock: deck.slice(i),
    waste: [],
    foundations: [[], [], [], []],
    tableau,
    moves: [],
    status: 'playing',
    startedAt: 0,
    elapsedMs: 0
  };
}

/** Cards `run` (bottom→top) form a valid tableau sequence: descending, alternating colors, all face-up. */
function isValidRun(run: readonly Card[]): boolean {
  for (let i = 0; i < run.length; i++) {
    const c = run[i];
    if (!c.faceUp) return false;
    if (i > 0) {
      const prev = run[i - 1];
      if (prev.rank !== c.rank + 1 || isRed(prev) === isRed(c)) return false;
    }
  }
  return true;
}

/** `card` may land on tableau column `col` (empty → kings only, else down-and-alternate). */
function canDropOnTableau(card: Card, col: readonly Card[]): boolean {
  const t = top(col);
  if (!t) return card.rank === 13;
  return t.faceUp && isRed(t) !== isRed(card) && t.rank === card.rank + 1;
}

/** `card` may land on foundation pile `f` (empty → aces, else same suit ascending). */
function canDropOnFoundation(card: Card, f: readonly Card[]): boolean {
  const t = top(f);
  if (!t) return card.rank === 1;
  return t.suit === card.suit && t.rank === card.rank - 1;
}

/** Resolve a pile reference to the state's pile array, or null if invalid for Klondike. */
function pileAt(s: KlondikeState, r: PileRef): Card[] | null {
  switch (r.area) {
    case 'stock':
      return r.index === 0 ? s.stock : null;
    case 'waste':
      return r.index === 0 ? s.waste : null;
    case 'foundation':
      return r.index >= 0 && r.index < 4 ? s.foundations[r.index] : null;
    case 'tableau':
      return r.index >= 0 && r.index < 7 ? s.tableau[r.index] : null;
    default:
      return null;
  }
}

/**
 * Whether `m` is legal in `s` — direct validation (not via `legalMoves`,
 * so non-canonical-but-legal moves like king → second empty column still pass).
 */
function isLegal(s: KlondikeState, m: Move): boolean {
  if (m.type === 'draw') return s.stock.length > 0 || s.waste.length > 0;

  const src = pileAt(s, m.from);
  if (!src) return false;
  const idx = src.findIndex((c) => c.id === m.cardId);
  if (idx < 0) return false;
  const card = src[idx];
  if (!card.faceUp) return false;

  if (m.from.area === 'tableau') {
    // Any face-up card may head a moving run; the run above it must be valid.
    if (!isValidRun(src.slice(idx))) return false;
  } else if (idx !== src.length - 1) {
    return false; // waste/foundation expose only their top card
  }

  const dest = pileAt(s, m.to);
  if (!dest || dest === src) return false;
  if (m.to.area === 'foundation') {
    if (idx !== src.length - 1) return false; // single cards only
    return canDropOnFoundation(card, dest);
  }
  if (m.to.area === 'tableau') return canDropOnTableau(card, dest);
  return false; // stock/waste/cell are never valid drop targets
}

/** Copy `pile` into `s` at `r`, returning a new state. */
function setPile(s: KlondikeState, r: PileRef, pile: Card[]): KlondikeState {
  switch (r.area) {
    case 'stock':
      return { ...s, stock: pile };
    case 'waste':
      return { ...s, waste: pile };
    case 'foundation':
      return { ...s, foundations: s.foundations.map((f, i) => (i === r.index ? pile : f)) };
    default:
      return { ...s, tableau: s.tableau.map((t, i) => (i === r.index ? pile : t)) };
  }
}

/** Flip the top card of tableau column `colIdx` face-up if it is face-down. */
function flipExposed(s: KlondikeState, colIdx: number): KlondikeState {
  const col = s.tableau[colIdx];
  const t = top(col);
  if (!t || t.faceUp) return s;
  const flipped = col.slice();
  flipped[flipped.length - 1] = { ...t, faceUp: true };
  return setPile(s, { area: 'tableau', index: colIdx }, flipped);
}

function applyDraw(s: KlondikeState): KlondikeState {
  if (s.stock.length > 0) {
    const stock = s.stock.slice();
    const drawn = { ...stock.pop() as Card, faceUp: true };
    return { ...s, stock, waste: [...s.waste, drawn] };
  }
  // Recycle: turn the waste pile over as a unit — top becomes the new stock bottom.
  const stock = s.waste.map((c) => ({ ...c, faceUp: false })).reverse();
  return { ...s, stock, waste: [] };
}

function applyCardMove(s: KlondikeState, m: Extract<Move, { type: 'move' }>): KlondikeState {
  const src = pileAt(s, m.from)?.slice() ?? [];
  const idx = src.findIndex((c) => c.id === m.cardId);
  const moving = src.splice(idx);
  const dest = (pileAt(s, m.to) ?? []).slice();
  dest.push(...moving);

  let next = setPile(s, m.from, src);
  next = setPile(next, m.to, dest);
  if (m.from.area === 'tableau') next = flipExposed(next, m.from.index);
  return next;
}

function applyMove(s: KlondikeState, m: Move): KlondikeState {
  if (s.status !== 'playing' || !isLegal(s, m)) return s;
  const moved = m.type === 'draw' ? applyDraw(s) : applyCardMove(s, m);
  const won = isWon(moved);
  const ms = won ? [] : legalMoves(moved);
  const next: KlondikeState = {
    ...moved,
    moves: [...moved.moves, m],
    status: won ? 'won' : ms.length === 0 ? 'lost' : 'playing'
  };
  legalMovesCache.set(next, ms); // solver reuse — see legalMovesCache.ts
  return next;
}

function isWon(s: KlondikeState): boolean {
  return s.foundations.every((f) => f.length === 13);
}

/**
 * Canonicalized legal-move list: one representative per distinct effect —
 * only the first empty tableau column is offered per movable card, and
 * whole-column king moves to empty columns (positional no-ops) are omitted.
 */
function legalMoves(s: KlondikeState): Move[] {
  const moves: Move[] = [];
  if (s.status !== 'playing') return moves;
  if (s.stock.length > 0 || s.waste.length > 0) moves.push({ type: 'draw' });

  const firstEmpty = s.tableau.findIndex((t) => t.length === 0);
  const toTableau = (card: Card, from: PileRef, isColumnBottom: boolean) => {
    s.tableau.forEach((col, ti) => {
      if (from.area === 'tableau' && ti === from.index) return;
      if (col.length === 0) {
        if (ti === firstEmpty && card.rank === 13 && !isColumnBottom) {
          moves.push({ type: 'move', from, to: ref('tableau', ti), cardId: card.id });
        }
      } else if (canDropOnTableau(card, col)) {
        moves.push({ type: 'move', from, to: ref('tableau', ti), cardId: card.id });
      }
    });
  };

  const w = top(s.waste);
  if (w) {
    s.foundations.forEach((f, fi) => {
      if (canDropOnFoundation(w, f)) {
        moves.push({ type: 'move', from: ref('waste'), to: ref('foundation', fi), cardId: w.id });
      }
    });
    toTableau(w, ref('waste'), false);
  }

  s.tableau.forEach((col, ci) => {
    col.forEach((card, pi) => {
      if (!card.faceUp) return;
      const from = ref('tableau', ci);
      if (pi === col.length - 1) {
        s.foundations.forEach((f, fi) => {
          if (canDropOnFoundation(card, f)) {
            moves.push({ type: 'move', from, to: ref('foundation', fi), cardId: card.id });
          }
        });
      }
      if (isValidRun(col.slice(pi))) toTableau(card, from, pi === 0);
    });
  });

  s.foundations.forEach((f, fi) => {
    const c = top(f);
    if (c) toTableau(c, ref('foundation', fi), false);
  });

  return moves;
}

/**
 * Progress score for future race-mode tiebreaks:
 * foundation cards dominate; face-up tableau cards count as partial progress.
 */
function score(s: KlondikeState): number {
  const foundationCards = s.foundations.reduce((n, f) => n + f.length, 0);
  const faceUp = s.tableau.reduce((n, t) => n + t.filter((c) => c.faceUp).length, 0);
  return foundationCards * 10 + faceUp;
}

/** Klondike-typed Variant: same contract, concrete state types for callers. */
export interface KlondikeVariant extends Variant {
  initialState(seed: string): KlondikeState;
  applyMove(state: GameState, move: Move): KlondikeState;
}

/** The Klondike (draw-1) variant implementation. */
export const klondike: KlondikeVariant = {
  id: 'klondike',
  initialState: (seed) => initialState(seed),
  applyMove: (state, move) => applyMove(asKlondike(state), move),
  isWon: (state) => isWon(asKlondike(state)),
  legalMoves: (state) => legalMoves(asKlondike(state)),
  score: (state) => score(asKlondike(state))
};
