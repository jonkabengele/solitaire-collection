import type { Card, GameState, KlondikeState, Move, Variant } from './types.js';
import { legalMovesCache } from './legalMovesCache.js';

/** Tunables for `isSolvable`. */
export interface SolveOptions {
  /** Wall-clock cap per attempt (spec §4.4 suggests 500ms). Default 500. */
  budgetMs?: number;
  /** Hard node-expansion cap, independent of clock. Default 200 000. */
  maxNodes?: number;
}

/**
 * Canonical position key for transposition detection — the pile layout only.
 * `moves`, `status`, and clock fields are excluded: a position is the same
 * position no matter how it was reached. Compact id-encoding (not JSON) —
 * this runs once per explored node, so it must be cheap.
 */
export function stateKey(state: GameState): string {
  const pile = (cs: readonly (Card | null)[]) => cs.map((c) => (c ? c.id : '.')).join('');
  const face = (cs: readonly Card[]) => cs.map((c) => (c.faceUp ? c.id : c.id + 'd')).join('');
  switch (state.variant) {
    case 'klondike':
      // Tableau columns are interchangeable positions — sorting makes the key
      // permutation-canonical, collapsing equivalent branches in the search.
      return [
        face(state.stock),
        face(state.waste),
        state.foundations.map(pile).sort().join(','),
        state.tableau.map(face).sort().join(',')
      ].join('|');
    case 'freecell':
      return [
        pile(state.cells),
        state.foundations.map(pile).sort().join(','),
        state.tableau.map(pile).sort().join(',')
      ].join('|');
    case 'tripeaks':
      return [pile(state.tableau), face(state.stock), pile(state.waste)].join('|');
  }
}

const isRed = (c: Card): boolean => c.suit === 'hearts' || c.suit === 'diamonds';

/**
 * "Safe foundation" heuristic (Klondike + FreeCell): a card may go up without
 * risk once every opposite-colour foundation already holds rank ≥ card.rank−1.
 * Used for move ORDERING only — never prunes, so search stays complete.
 */
function isSafeFoundationMove(foundations: readonly Card[][], card: Card): boolean {
  if (card.rank <= 2) return true;
  const heights: Record<Card['suit'], number> = { spades: 0, hearts: 0, diamonds: 0, clubs: 0 };
  for (const f of foundations) {
    const t = f[f.length - 1];
    if (t) heights[t.suit] = t.rank;
  }
  const opposite: readonly Card['suit'][] = isRed(card) ? ['spades', 'clubs'] : ['hearts', 'diamonds'];
  return opposite.every((suit) => heights[suit] >= card.rank - 1);
}

/** Locate the moving card in `s` given a `move` (used only for ordering). */
function movedCard(s: GameState, m: Extract<Move, { type: 'move' }>): Card | undefined {
  let pile: readonly (Card | null)[] | undefined;
  switch (m.from.area) {
    case 'waste':
      pile = 'waste' in s ? s.waste : undefined;
      break;
    case 'foundation':
      pile = 'foundations' in s ? s.foundations[m.from.index] : undefined;
      break;
    case 'cell': {
      pile = s.variant === 'freecell' ? [s.cells[m.from.index]] : undefined;
      break;
    }
    case 'tableau':
      pile = s.variant === 'tripeaks' ? [s.tableau[m.from.index]] : s.tableau[m.from.index];
      break;
  }
  return pile?.find((c) => c?.id === m.cardId) ?? undefined;
}

/** Move-ordering priority: higher is tried first. Complete list, just sorted. */
function priority(variant: Variant, s: GameState, m: Move): number {
  if (m.type === 'draw') return 20;
  if (s.variant === 'klondike') {
    const k = s as KlondikeState;
    const reveals =
      m.from.area === 'tableau' &&
      (() => {
        const col = k.tableau[m.from.index];
        const idx = col.findIndex((c) => c.id === m.cardId);
        return idx > 0 && !col[idx - 1].faceUp;
      })();
    if (reveals) return 100;
    if (m.to.area === 'foundation') {
      const card = movedCard(k, m);
      return card && isSafeFoundationMove(k.foundations, card) ? 80 : 40;
    }
    if (m.from.area === 'foundation') return -10;
    const dest = k.tableau[m.to.index];
    return dest.length === 0 ? 10 : 50;
  }
  if (s.variant === 'freecell') {
    // Safe foundation moves are near-always correct — try first.
    if (m.to.area === 'foundation') {
      const card = movedCard(s, m);
      return card && isSafeFoundationMove(s.foundations, card) ? 100 : 10;
    }
    // Parking in a cell spends working space — last resort.
    if (m.to.area === 'cell') return 15;
    // Prefer builds onto non-empty columns; longer runs moved rank higher.
    const runLen =
      m.from.area === 'tableau'
        ? s.tableau[m.from.index].length -
          s.tableau[m.from.index].findIndex((c) => c.id === m.cardId)
        : 1;
    const dest = s.tableau[m.to.index];
    if (dest.length === 0) return 30 + Math.min(runLen, 8);
    return (m.from.area === 'cell' ? 45 : 50) + Math.min(runLen, 8);
  }
  // tripeaks: play matches before drawing
  return 50;
}

function orderedMoves(variant: Variant, s: GameState): Move[] {
  const all = legalMovesCache.get(s) ?? variant.legalMoves(s);

  // Forced-move pruning: a safe foundation move can never make a solvable
  // position unsolvable (the card could only hold lower opposite-colour cards,
  // all of which are already up). When one exists, expand only safe moves —
  // this collapses long forced chains and massively cuts branching.
  if (s.variant === 'klondike' || s.variant === 'freecell') {
    const safe = all.filter(
      (m) =>
        m.type === 'move' &&
        m.to.area === 'foundation' &&
        (() => {
          const c = movedCard(s, m);
          return c !== undefined && isSafeFoundationMove(s.foundations, c);
        })()
    );
    if (safe.length > 0) return safe;
  }

  const sorted = all
    .map((m) => ({ m, p: priority(variant, s, m) }))
    .sort((a, b) => b.p - a.p);

  // Equivalent-destination dedup: dropping a card onto either of two columns
  // whose tops share rank+colour is strategically symmetric — keep the first
  // (highest-priority) one. For FreeCell, also keep only the longest run per
  // source column when the target is an empty column.
  const seenDest = new Set<string>();
  const out: Move[] = [];
  for (const { m } of sorted) {
    if (m.type !== 'move' || m.to.area !== 'tableau' || s.variant === 'tripeaks') {
      out.push(m);
      continue;
    }
    const col = s.tableau[m.to.index] as Card[];
    const t = col[col.length - 1];
    // Non-empty dest: dedupe per (card, dest-top rank+colour). Empty dest:
    // dedupe per source pile — sorted order keeps the longest run.
    const key = t
      ? `${m.cardId}|${t.rank}${isRed(t) ? 'r' : 'b'}`
      : `${m.from.area}:${m.from.index}|empty`;
    if (seenDest.has(key)) continue;
    seenDest.add(key);
    out.push(m);
  }
  return out;
}

/**
 * Depth-first solvability check with a transposition table and heuristic move
 * ordering (spec §4.4). Deterministic in structure; the wall-clock budget is
 * the only nondeterminism — on timeout it reports `false`, and callers should
 * simply reshuffle as the spec prescribes.
 *
 * @returns `true` if a winning line was found within the budget.
 */
export function isSolvable(variant: Variant, initial: GameState, opts: SolveOptions = {}): boolean {
  const budgetMs = opts.budgetMs ?? 500;
  const maxNodes = opts.maxNodes ?? 200_000;
  const deadline = Date.now() + budgetMs;

  if (variant.isWon(initial)) return true;

  const seen = new Set<string>([stateKey(initial)]);
  const stack: { s: GameState; ms: Move[]; i: number }[] = [
    { s: initial, ms: orderedMoves(variant, initial), i: 0 }
  ];

  let nodes = 0;
  while (stack.length > 0) {
    nodes++;
    if ((nodes & 0x3ff) === 0 && (Date.now() > deadline || nodes > maxNodes)) return false;

    const frame = stack[stack.length - 1];
    if (frame.i >= frame.ms.length) {
      stack.pop();
      continue;
    }
    const next = variant.applyMove(frame.s, frame.ms[frame.i++]);
    if (variant.isWon(next)) return true;
    const key = stateKey(next);
    if (!seen.has(key)) {
      seen.add(key);
      stack.push({ s: next, ms: orderedMoves(variant, next), i: 0 });
    }
  }
  return false;
}

/** Result of `findSolvableSeed`. */
export interface SeedSearchResult {
  seed: string;
  attempts: number;
  /** `false` means the attempt cap was hit — caller may still use the seed. */
  solved: boolean;
}

/**
 * Find a deal seed that produces a solvable game: try `${base}:${n}` for
 * increasing n until the solver confirms a deal (spec §4.4 reshuffle loop).
 *
 * @param variant variant implementation
 * @param baseSeed base for candidate seeds; defaults to a clock-derived string
 * @param opts solver budget plus `maxAttempts` (default 50)
 */
export function findSolvableSeed(
  variant: Variant,
  baseSeed?: string,
  opts: SolveOptions & { maxAttempts?: number } = {}
): SeedSearchResult {
  const base = baseSeed ?? `deal-${Date.now().toString(36)}`;
  const maxAttempts = opts.maxAttempts ?? 50;
  for (let n = 0; n < maxAttempts; n++) {
    const seed = `${base}:${n}`;
    if (isSolvable(variant, variant.initialState(seed), opts)) {
      return { seed, attempts: n + 1, solved: true };
    }
  }
  return { seed: `${base}:${maxAttempts - 1}`, attempts: maxAttempts, solved: false };
}
