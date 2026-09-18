import { describe, expect, it } from 'vitest';
import { spider } from './spider.js';
import type { Card, Rank, SpiderState, Suit } from '../engine/types.js';

let serial = 0;
const mk = (suit: Suit, rank: number, faceUp = true): Card => ({
  id: `${suit[0]}${rank}#t${serial++}`,
  suit,
  rank: rank as Rank,
  faceUp
});

const base = (over: Partial<SpiderState> = {}): SpiderState => ({
  seed: 'test',
  variant: 'spider',
  suitCount: 1,
  stock: [],
  tableau: Array.from({ length: 10 }, () => []),
  foundations: [],
  moves: [],
  status: 'playing',
  startedAt: 0,
  elapsedMs: 0,
  ...over
});

describe('spider deal', () => {
  it('deals 54 cards across 10 columns (6,6,6,6,5×6) + 50 stock, tops face-up', () => {
    const s = spider.initialState('deal:1');
    expect(s.tableau.map((c) => c.length)).toEqual([6, 6, 6, 6, 5, 5, 5, 5, 5, 5]);
    expect(s.stock).toHaveLength(50);
    for (const col of s.tableau) {
      expect(col[col.length - 1].faceUp).toBe(true);
      expect(col.slice(0, -1).every((c) => !c.faceUp)).toBe(true);
    }
    expect(new Set(s.tableau.flat().concat(s.stock).map((c) => c.id)).size).toBe(104);
  });

  it('is deterministic per seed', () => {
    const a = spider.initialState('same');
    const b = spider.initialState('same');
    expect(a.tableau.flat().map((c) => c.id)).toEqual(b.tableau.flat().map((c) => c.id));
  });
});

describe('spider moves', () => {
  it('builds on any suit at rank-1 but only moves same-suit runs', () => {
    const s = base({
      tableau: [
        [mk('diamonds', 7)],
        [mk('hearts', 8), mk('spades', 6)],
        ...Array.from({ length: 8 }, () => [mk('clubs', 13)])
      ]
    });
    // 8♥+6♠ is NOT a movable unit (mixed suits), but 6♠ alone can drop on 7♦.
    const h8 = s.tableau[1][0];
    const mixedRun = {
      type: 'move' as const,
      from: { area: 'tableau' as const, index: 1 },
      to: { area: 'tableau' as const, index: 0 },
      cardId: h8.id
    };
    expect(spider.applyMove(s, mixedRun)).toBe(s); // rejected

    const s6 = s.tableau[1][1];
    const single = { ...mixedRun, cardId: s6.id };
    const next = spider.applyMove(s, single);
    expect(next).not.toBe(s);
    expect(next.tableau[1]).toHaveLength(1);
    expect(next.tableau[0].map((c) => c.rank)).toEqual([7, 6]);
  });

  it('moves a same-suit descending run as one unit', () => {
    const s = base({
      tableau: [
        [mk('spades', 9)],
        [mk('clubs', 5), mk('spades', 8), mk('spades', 7), mk('spades', 6)],
        ...Array.from({ length: 8 }, () => [mk('clubs', 13)])
      ]
    });
    const runBase = s.tableau[1][1]; // 8♠
    const next = spider.applyMove(s, {
      type: 'move',
      from: { area: 'tableau', index: 1 },
      to: { area: 'tableau', index: 0 },
      cardId: runBase.id
    });
    expect(next).not.toBe(s);
    expect(next.tableau[0].map((c) => c.rank)).toEqual([9, 8, 7, 6]);
    expect(next.tableau[1]).toHaveLength(1);
  });

  it('clears a completed K..A same-suit run to foundations', () => {
    const run = Array.from({ length: 13 }, (_, i) => mk('spades', 13 - i));
    // A complete run clears when the next legal move lands — move a spare
    // card to an empty column to trigger the sweep.
    const s = base({
      tableau: [
        [mk('hearts', 5), ...run],
        [mk('clubs', 7), mk('spades', 6)],
        ...Array.from({ length: 8 }, () => [])
      ]
    });
    const six = s.tableau[1][1];
    const next = spider.applyMove(s, {
      type: 'move',
      from: { area: 'tableau', index: 1 },
      to: { area: 'tableau', index: 2 },
      cardId: six.id
    });
    expect(next.foundations).toHaveLength(1);
    expect(next.foundations[0]).toHaveLength(13);
    expect(next.tableau[0].map((c) => c.rank)).toEqual([5]);
  });
});

describe('spider stock', () => {
  it('refuses to draw while any column is empty', () => {
    const s = base({ stock: Array.from({ length: 10 }, () => mk('spades', 3, false)) });
    const next = spider.applyMove(s, { type: 'draw' });
    expect(next).toBe(s);
  });

  it('draws one face-up card onto every column', () => {
    const s = base({
      stock: Array.from({ length: 10 }, (_, i) => mk('spades', 3, false)),
      tableau: Array.from({ length: 10 }, () => [mk('clubs', 13)])
    });
    const next = spider.applyMove(s, { type: 'draw' });
    expect(next).not.toBe(s);
    expect(next.stock).toHaveLength(0);
    for (const col of next.tableau) {
      expect(col).toHaveLength(2);
      expect(col[1].faceUp).toBe(true);
    }
  });
});

describe('spider status', () => {
  it('wins when 8 runs have cleared', () => {
    const runs = Array.from({ length: 7 }, () =>
      Array.from({ length: 13 }, (_, i) => mk('spades', 13 - i))
    );
    const last = Array.from({ length: 13 }, (_, i) => mk('spades', 13 - i));
    const s = base({
      foundations: runs,
      tableau: [
        [mk('hearts', 5), ...last],
        [mk('clubs', 7), mk('spades', 6)],
        ...Array.from({ length: 8 }, () => [])
      ]
    });
    const six = s.tableau[1][1];
    const next = spider.applyMove(s, {
      type: 'move',
      from: { area: 'tableau', index: 1 },
      to: { area: 'tableau', index: 2 },
      cardId: six.id
    });
    expect(next.foundations).toHaveLength(8);
    expect(next.status).toBe('won');
  });
});
