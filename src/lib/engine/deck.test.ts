import { describe, expect, it } from 'vitest';
import { cardFromId, createDeck, deal, shuffledDeck } from './deck.js';
import { getVariant } from '../variants/index.js';
import type { FreeCellState, KlondikeState, TriPeaksState } from './types.js';

describe('createDeck', () => {
  it('builds 52 unique face-down cards', () => {
    const deck = createDeck();
    expect(deck).toHaveLength(52);
    expect(new Set(deck.map((c) => c.id)).size).toBe(52);
    expect(deck.every((c) => !c.faceUp)).toBe(true);
  });
});

describe('cardFromId', () => {
  it('round-trips card ids', () => {
    for (const c of createDeck()) {
      const back = cardFromId(c.id);
      expect(back.suit).toBe(c.suit);
      expect(back.rank).toBe(c.rank);
    }
  });

  it('rejects bad ids', () => {
    expect(() => cardFromId('x9')).toThrow();
    expect(() => cardFromId('s14')).toThrow();
  });
});

describe('shuffledDeck', () => {
  it('same seed → same order (spec §4.3)', () => {
    expect(shuffledDeck('seed-1').map((c) => c.id)).toEqual(
      shuffledDeck('seed-1').map((c) => c.id)
    );
  });

  it('different seeds → different orders', () => {
    expect(shuffledDeck('a').map((c) => c.id)).not.toEqual(shuffledDeck('b').map((c) => c.id));
  });
});

describe('deal layouts', () => {
  it('klondike: 7 columns of 1..7, tops face-up, 24-card stock', () => {
    const s = deal('k-seed', getVariant('klondike')) as KlondikeState;
    expect(s.tableau.map((t) => t.length)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    for (const col of s.tableau) {
      expect(col[col.length - 1].faceUp).toBe(true);
      expect(col.slice(0, -1).every((c) => !c.faceUp)).toBe(true);
    }
    expect(s.stock).toHaveLength(24);
    expect(s.waste).toHaveLength(0);
    expect(s.foundations.flat()).toHaveLength(0);
    expect(s.status).toBe('playing');
  });

  it('freecell: 8 face-up columns of 7,7,7,7,6,6,6,6', () => {
    const s = deal('f-seed', getVariant('freecell')) as FreeCellState;
    expect(s.tableau.map((t) => t.length)).toEqual([7, 7, 7, 7, 6, 6, 6, 6]);
    expect(s.tableau.flat().every((c) => c.faceUp)).toBe(true);
    expect(s.cells.every((c) => c === null)).toBe(true);
  });

  it('tripeaks: 28 positions (bottom row face-up), waste 1, stock 23', () => {
    const s = deal('t-seed', getVariant('tripeaks')) as TriPeaksState;
    expect(s.tableau).toHaveLength(28);
    expect(s.tableau.slice(0, 18).every((c) => c !== null && !c.faceUp)).toBe(true);
    expect(s.tableau.slice(18).every((c) => c !== null && c.faceUp)).toBe(true);
    expect(s.waste).toHaveLength(1);
    expect(s.stock).toHaveLength(23);
  });

  it('same seed → identical state (spec §8 determinism)', () => {
    expect(deal('fixed', getVariant('klondike'))).toEqual(deal('fixed', getVariant('klondike')));
    expect(deal('fixed', getVariant('tripeaks'))).toEqual(deal('fixed', getVariant('tripeaks')));
  });
});
