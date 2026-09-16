import { describe, expect, it } from 'vitest';
import { klondike } from './klondike.js';
import { card, deepFreeze, klondikeState, pile } from '../testkit.js';

describe('klondike initial state', () => {
  const s = klondike.initialState('init-seed');

  it('deals the standard layout', () => {
    expect(s.variant).toBe('klondike');
    expect(s.tableau.map((t) => t.length)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('always offers at least the draw move', () => {
    const moves = klondike.legalMoves(s);
    expect(moves.some((m) => m.type === 'draw')).toBe(true);
  });
});

describe('klondike draw & recycle', () => {
  it('draws stock top onto waste, face-up', () => {
    const s = klondikeState({ stock: pile('s5', 'h9') });
    const next = klondike.applyMove(s, { type: 'draw' });
    expect(next.stock.map((c) => c.id)).toEqual(['s5']);
    expect(next.waste.map((c) => c.id)).toEqual(['h9']);
    expect(next.waste[0].faceUp).toBe(true);
  });

  it('recycles waste back into stock preserving draw order', () => {
    // Waste [s2, h4, d6] (d6 on top) flips over → new stock draws s2 first.
    const s = klondikeState({ stock: [], waste: pile('s2', 'h4', 'd6') });
    const next = klondike.applyMove(s, { type: 'draw' });
    expect(next.waste).toHaveLength(0);
    expect(next.stock).toHaveLength(3);
    expect(next.stock.every((c) => !c.faceUp)).toBe(true);
    const after = klondike.applyMove(next, { type: 'draw' });
    expect(after.waste.map((c) => c.id)).toEqual(['s2']);
  });
});

describe('klondike card moves', () => {
  it('plays waste ace to an empty foundation', () => {
    const s = klondikeState({ waste: pile('h1') });
    const next = klondike.applyMove(s, {
      type: 'move',
      from: { area: 'waste', index: 0 },
      to: { area: 'foundation', index: 0 },
      cardId: 'h1'
    });
    expect(next.foundations[0].map((c) => c.id)).toEqual(['h1']);
    expect(next.waste).toHaveLength(0);
    expect(next.moves).toHaveLength(1);
  });

  it('builds tableau down in alternating colors and flips exposed cards', () => {
    const s = klondikeState({
      tableau: [
        [card('s10', false), card('h9'), card('s8')],
        pile('c10'),
        [], [], [], [], []
      ]
    });
    // run [h9, s8] onto c10: black 10 ← red 9 ← black 8, alternating ✓
    const next = klondike.applyMove(s, {
      type: 'move',
      from: { area: 'tableau', index: 0 },
      to: { area: 'tableau', index: 1 },
      cardId: 'h9'
    });
    expect(next.tableau[1].map((c) => c.id)).toEqual(['c10', 'h9', 's8']);
    expect(next.tableau[0]).toHaveLength(1);
    expect(next.tableau[0][0].faceUp).toBe(true); // s10 flipped
  });

  it('rejects same-color tableau builds', () => {
    const s = klondikeState({ tableau: [pile('h9'), pile('d8'), [], [], [], [], []] });
    const before = s;
    const next = klondike.applyMove(s, {
      type: 'move',
      from: { area: 'tableau', index: 1 },
      to: { area: 'tableau', index: 0 },
      cardId: 'd8'
    });
    expect(next).toBe(before); // illegal → same reference
  });

  it('only allows kings onto empty columns', () => {
    const s = klondikeState({ tableau: [pile('s13'), pile('h7'), [], [], [], [], []] });
    const king = klondike.applyMove(s, {
      type: 'move',
      from: { area: 'tableau', index: 0 },
      to: { area: 'tableau', index: 2 },
      cardId: 's13'
    });
    expect(king.tableau[2].map((c) => c.id)).toEqual(['s13']);

    const notKing = klondike.applyMove(s, {
      type: 'move',
      from: { area: 'tableau', index: 1 },
      to: { area: 'tableau', index: 2 },
      cardId: 'h7'
    });
    expect(notKing).toBe(s);
  });

  it('moves foundation tops back to tableau when legal', () => {
    const s = klondikeState({
      foundations: [pile('h1', 'h2'), [], [], []],
      tableau: [pile('s3'), [], [], [], [], [], []]
    });
    const next = klondike.applyMove(s, {
      type: 'move',
      from: { area: 'foundation', index: 0 },
      to: { area: 'tableau', index: 0 },
      cardId: 'h2'
    });
    expect(next.tableau[0].map((c) => c.id)).toEqual(['s3', 'h2']);
    expect(next.foundations[0].map((c) => c.id)).toEqual(['h1']);
  });

  it('rejects moves from under a pile top', () => {
    const s = klondikeState({ waste: pile('s3', 'h4') });
    const next = klondike.applyMove(s, {
      type: 'move',
      from: { area: 'waste', index: 0 },
      to: { area: 'foundation', index: 0 },
      cardId: 's3'
    });
    expect(next).toBe(s);
  });

  it('rejects face-down tableau cards', () => {
    const s = klondikeState({
      tableau: [[card('s9', false), card('h8')], pile('d10'), [], [], [], [], []]
    });
    const next = klondike.applyMove(s, {
      type: 'move',
      from: { area: 'tableau', index: 0 },
      to: { area: 'tableau', index: 1 },
      cardId: 's9'
    });
    expect(next).toBe(s);
  });
});

describe('klondike status & purity', () => {
  it('detects the win', () => {
    const s = klondikeState({
      foundations: [
        pile('s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9', 's10', 's11', 's12'),
        pile('h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'h7', 'h8', 'h9', 'h10', 'h11', 'h12', 'h13'),
        pile('d1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7', 'd8', 'd9', 'd10', 'd11', 'd12', 'd13'),
        pile('c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9', 'c10', 'c11', 'c12', 'c13')
      ],
      waste: pile('s13')
    });
    const next = klondike.applyMove(s, {
      type: 'move',
      from: { area: 'waste', index: 0 },
      to: { area: 'foundation', index: 0 },
      cardId: 's13'
    });
    expect(next.status).toBe('won');
    expect(klondike.isWon(next)).toBe(true);
  });

  it('marks a dead position lost (only a no-op column shuffle remains)', () => {
    const s = klondikeState({
      stock: [],
      waste: pile('s2'),
      foundations: [pile('s1'), [], [], []],
      tableau: [pile('c13'), [], [], [], [], [], []]
    });
    const next = klondike.applyMove(s, {
      type: 'move',
      from: { area: 'waste', index: 0 },
      to: { area: 'foundation', index: 0 },
      cardId: 's2'
    });
    expect(next.status).toBe('lost');
  });

  it('never mutates the input state (spec §9)', () => {
    const s = deepFreeze(
      klondikeState({ stock: pile('s5', 'h9'), waste: pile('h1') })
    );
    const next = klondike.applyMove(s, {
      type: 'move',
      from: { area: 'waste', index: 0 },
      to: { area: 'foundation', index: 0 },
      cardId: 'h1'
    });
    expect(next).not.toBe(s);
    expect(s.waste).toHaveLength(1);
    expect(s.foundations[0]).toHaveLength(0);
  });

  it('replays identically: same seed + same moves → same state (spec §8)', () => {
    let a = klondike.initialState('replay');
    let b = klondike.initialState('replay');
    for (let i = 0; i < 15; i++) {
      const m = klondike.legalMoves(a)[0];
      if (!m) break;
      a = klondike.applyMove(a, m);
      b = klondike.applyMove(b, m);
    }
    expect(a).toEqual(b);
    expect(a.moves.length).toBeGreaterThan(0);
  });
});
