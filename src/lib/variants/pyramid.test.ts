import { describe, expect, it } from 'vitest';
import { pyramid } from './pyramid.js';
import type { Card, Move, PyramidState, Rank, Suit } from '../engine/types.js';
import { deepFreeze } from '../testkit.js';

let serial = 0;
const mk = (suit: Suit, rank: number): Card => ({
  id: `${suit[0]}${rank}#t${serial++}`,
  suit,
  rank: rank as Rank,
  faceUp: true
});

const base = (over: Partial<PyramidState> = {}): PyramidState => ({
  seed: 'test',
  variant: 'pyramid',
  tableau: Array.from({ length: 28 }, () => null),
  stock: [],
  waste: [],
  moves: [],
  status: 'playing',
  startedAt: 0,
  elapsedMs: 0,
  ...over
});

/** Bottom row = positions 21..27 — always exposed while present. */
const pair = (a: number, b: number): Extract<Move, { type: 'move' }> => ({
  type: 'move',
  from: { area: 'tableau', index: a },
  to: { area: 'tableau', index: b },
  cardId: ''
});

describe('pyramid deal', () => {
  it('deals 28 cards into the triangle + 24 stock, all face-up', () => {
    const s = pyramid.initialState('deal:1');
    expect(s.tableau).toHaveLength(28);
    expect(s.stock).toHaveLength(24);
    expect(s.waste).toHaveLength(0);
    for (const c of s.tableau) expect(c?.faceUp).toBe(true);
    expect(new Set([...s.tableau, ...s.stock].map((c) => (c as Card).id)).size).toBe(52);
  });

  it('is deterministic per seed', () => {
    const a = pyramid.initialState('same');
    const b = pyramid.initialState('same');
    expect(a.tableau.map((c) => c?.id)).toEqual(b.tableau.map((c) => c?.id));
  });
});

describe('pyramid pairing', () => {
  it('removes exposed pairs summing to 13', () => {
    const s = base({
      tableau: Array.from({ length: 28 }, (_, i) =>
        i === 21 ? mk('hearts', 5) : i === 22 ? mk('spades', 8) : mk('clubs', 4)
      )
    });
    const five = s.tableau[21] as Card;
    const next = pyramid.applyMove(s, { ...pair(21, 22), cardId: five.id });
    expect(next.tableau[21]).toBeNull();
    expect(next.tableau[22]).toBeNull();
    expect(next.moves).toHaveLength(1);
  });

  it('rejects pairs that do not sum to 13', () => {
    const s = base({
      tableau: Array.from({ length: 28 }, (_, i) =>
        i === 21 ? mk('hearts', 5) : i === 22 ? mk('spades', 9) : mk('clubs', 4)
      )
    });
    const next = pyramid.applyMove(s, { ...pair(21, 22), cardId: (s.tableau[21] as Card).id });
    expect(next).toBe(s);
  });

  it('removes a lone King via the foundation target', () => {
    const s = base({
      tableau: Array.from({ length: 28 }, (_, i) => (i === 21 ? mk('hearts', 13) : mk('clubs', 4)))
    });
    const k = s.tableau[21] as Card;
    const next = pyramid.applyMove(s, {
      type: 'move',
      from: { area: 'tableau', index: 21 },
      to: { area: 'foundation', index: 0 },
      cardId: k.id
    });
    expect(next.tableau[21]).toBeNull();
  });

  it('rejects non-King solo removal', () => {
    const s = base({
      tableau: Array.from({ length: 28 }, (_, i) => (i === 21 ? mk('hearts', 12) : mk('clubs', 4)))
    });
    const next = pyramid.applyMove(s, {
      type: 'move',
      from: { area: 'tableau', index: 21 },
      to: { area: 'foundation', index: 0 },
      cardId: (s.tableau[21] as Card).id
    });
    expect(next).toBe(s);
  });

  it('pairs the waste top with an exposed card', () => {
    const w = mk('diamonds', 6);
    const s = base({
      tableau: Array.from({ length: 28 }, (_, i) => (i === 21 ? mk('hearts', 7) : mk('clubs', 4))),
      waste: [mk('clubs', 2), w]
    });
    const next = pyramid.applyMove(s, {
      type: 'move',
      from: { area: 'waste', index: 0 },
      to: { area: 'tableau', index: 21 },
      cardId: w.id
    });
    expect(next.tableau[21]).toBeNull();
    expect(next.waste).toHaveLength(1); // consumed the top only
  });

  it('blocks covered cards until their coverers clear', () => {
    // Position 19 (row 5) is covered by 25 and 26.
    const s = base({
      tableau: Array.from({ length: 28 }, (_, i) =>
        i === 19 ? mk('hearts', 5) : i === 25 ? mk('spades', 2) : i === 26 ? mk('diamonds', 3) : mk('clubs', 4)
      )
    });
    const covered = s.tableau[19] as Card;
    // 5♥ + a hypothetical 8 would pair — but 19 is covered: no move for it.
    expect(
      pyramid.legalMoves(s).filter((m) => m.type === 'move' && m.cardId === covered.id)
    ).toHaveLength(0);
    const attempt = pyramid.applyMove(s, { ...pair(19, 21), cardId: covered.id });
    expect(attempt).toBe(s);

    // Same position with its coverers gone: now it pairs freely.
    const open = base({
      tableau: Array.from({ length: 28 }, (_, i) =>
        i === 19 ? mk('hearts', 5) : i === 21 ? mk('spades', 8) : i === 25 || i === 26 ? null : mk('clubs', 4)
      )
    });
    const free = pyramid.applyMove(open, { ...pair(19, 21), cardId: (open.tableau[19] as Card).id });
    expect(free.tableau[19]).toBeNull();
    expect(free.tableau[21]).toBeNull();
  });

  it('draw moves stock top onto the waste', () => {
    const s = base({ stock: [mk('clubs', 9), mk('diamonds', 11)] });
    const next = pyramid.applyMove(s, { type: 'draw' });
    expect(next.stock).toHaveLength(1);
    expect(next.waste).toHaveLength(1);
    expect(next.waste[0].rank).toBe(11);
  });
});

describe('pyramid outcome', () => {
  it('marks the game won on the final removal and lost when dead', () => {
    const s = base({
      tableau: Array.from({ length: 28 }, (_, i) => (i === 27 ? mk('hearts', 13) : null))
    });
    const next = pyramid.applyMove(s, {
      type: 'move',
      from: { area: 'tableau', index: 27 },
      to: { area: 'foundation', index: 0 },
      cardId: (s.tableau[27] as Card).id
    });
    expect(next.status).toBe('won');

    const dead = base({
      tableau: Array.from({ length: 28 }, (_, i) => (i === 27 ? mk('hearts', 4) : null))
    });
    expect(pyramid.legalMoves(dead)).toHaveLength(0);
  });
});

describe('pyramid purity', () => {
  it('never mutates the input state', () => {
    const s = base({
      tableau: Array.from({ length: 28 }, (_, i) =>
        i === 21 ? mk('hearts', 5) : i === 22 ? mk('spades', 8) : mk('clubs', 4)
      ),
      stock: [mk('diamonds', 2)]
    });
    const frozen = deepFreeze(s);
    expect(() => pyramid.legalMoves(frozen)).not.toThrow();
    expect(() =>
      pyramid.applyMove(frozen, { ...pair(21, 22), cardId: (s.tableau[21] as Card).id })
    ).not.toThrow();
  });
});
