import { describe, expect, it } from 'vitest';
import { freecell } from './freecell.js';
import { card, deepFreeze, freecellState, pile } from '../testkit.js';
import type { FreeCellState } from '../engine/types.js';

const asFC = (s: ReturnType<typeof freecell.initialState>) => s as FreeCellState;

describe('freecell initial state', () => {
  const s = asFC(freecell.initialState('fc-seed'));

  it('deals 8 face-up columns and empty cells', () => {
    expect(s.tableau).toHaveLength(8);
    expect(s.tableau.flat()).toHaveLength(52);
    expect(s.cells).toHaveLength(4);
    expect(freecell.legalMoves(s).length).toBeGreaterThan(0);
  });
});

describe('freecell moves', () => {
  it('parks a card in a cell and plays it to a foundation', () => {
    let s = freecellState({ tableau: [pile('h1'), [], [], [], [], [], [], []] });
    s = freecell.applyMove(s, {
      type: 'move',
      from: { area: 'tableau', index: 0 },
      to: { area: 'cell', index: 0 },
      cardId: 'h1'
    }) as FreeCellState;
    expect(s.cells[0]?.id).toBe('h1');
    expect(s.tableau[0]).toHaveLength(0);

    s = freecell.applyMove(s, {
      type: 'move',
      from: { area: 'cell', index: 0 },
      to: { area: 'foundation', index: 0 },
      cardId: 'h1'
    }) as FreeCellState;
    expect(s.cells[0]).toBeNull();
    expect(s.foundations[0].map((c) => c.id)).toEqual(['h1']);
  });

  it('rejects a second card in an occupied cell', () => {
    const s = freecellState({
      cells: [card('s5'), null, null, null],
      tableau: [pile('h9'), [], [], [], [], [], [], []]
    });
    const next = freecell.applyMove(s, {
      type: 'move',
      from: { area: 'tableau', index: 0 },
      to: { area: 'cell', index: 0 },
      cardId: 'h9'
    });
    expect(next).toBe(s);
  });

  it('moves a valid sequence within capacity', () => {
    const s = freecellState({
      cells: [card('s1'), card('h2'), null, null],
      tableau: [
        pile('d7', 's6', 'h5'), // run [s6, h5] sits on d7
        pile('h7'),
        [], [], [], [], [], []
      ]
    });
    // s6 (black) onto h7 (red 7) — legal drop, 2-card run well within capacity
    const next = freecell.applyMove(s, {
      type: 'move',
      from: { area: 'tableau', index: 0 },
      to: { area: 'tableau', index: 1 },
      cardId: 's6'
    });
    expect(next.tableau[1].map((c) => c.id)).toEqual(['h7', 's6', 'h5']);
    expect(next.tableau[0].map((c) => c.id)).toEqual(['d7']);
  });

  it('rejects sequences beyond capacity', () => {
    // All cells full, no empty columns → max 1 card movable.
    const s = freecellState({
      cells: [card('s2'), card('h3'), card('d4'), card('c5')],
      tableau: [
        pile('s9', 'h8', 's7'),
        pile('c9'),
        pile('d8'),
        pile('c10'),
        pile('d11'),
        pile('s12'),
        pile('h13'),
        pile('d2')
      ]
    });
    // [h8, s7] onto c9 is color-legal but a 2-card run → rejected
    const rejected = freecell.applyMove(s, {
      type: 'move',
      from: { area: 'tableau', index: 0 },
      to: { area: 'tableau', index: 1 },
      cardId: 'h8'
    });
    expect(rejected).toBe(s);
    // …while the single top card still moves freely
    const single = freecell.applyMove(s, {
      type: 'move',
      from: { area: 'tableau', index: 0 },
      to: { area: 'tableau', index: 2 },
      cardId: 's7'
    });
    expect(single.tableau[2].map((c) => c.id)).toEqual(['d8', 's7']);
  });

  it('uses empty columns as multipliers for sequence moves', () => {
    // Cells full; exactly 2 empty cols (dests non-empty) → (1+0)*2^2 = 4 max.
    const s = freecellState({
      cells: [card('s2'), card('h3'), card('d4'), card('c5')],
      tableau: [
        pile('d9', 's8', 'h7', 's6', 'h5'),
        pile('h9'),
        pile('c10'),
        [], [],
        pile('s4'),
        pile('d3'),
        pile('h11')
      ]
    });
    // 4-card run [s8..h5] onto h9 (red 9 ← black 8) → at capacity, allowed
    const four = freecell.applyMove(s, {
      type: 'move',
      from: { area: 'tableau', index: 0 },
      to: { area: 'tableau', index: 1 },
      cardId: 's8'
    });
    expect(four.tableau[1].map((c) => c.id)).toEqual(['h9', 's8', 'h7', 's6', 'h5']);
    // 5-card run [d9..h5] onto c10 (color-legal but len 5 > 4) → rejected
    const five = freecell.applyMove(s, {
      type: 'move',
      from: { area: 'tableau', index: 0 },
      to: { area: 'tableau', index: 2 },
      cardId: 'd9'
    });
    expect(five).toBe(s);
  });

  it('rejects invalid (non-alternating) sequence moves', () => {
    const s = freecellState({
      tableau: [pile('s9', 'd8'), pile('c10'), [], [], [], [], [], []]
    });
    // s9 (black) onto c10 (black) — same color, rejected
    const next = freecell.applyMove(s, {
      type: 'move',
      from: { area: 'tableau', index: 0 },
      to: { area: 'tableau', index: 1 },
      cardId: 's9'
    });
    expect(next).toBe(s);
  });
});

describe('freecell status & purity', () => {
  it('detects the win', () => {
    const s = freecellState({
      foundations: [
        pile('s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9', 's10', 's11', 's12'),
        pile('h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'h7', 'h8', 'h9', 'h10', 'h11', 'h12', 'h13'),
        pile('d1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7', 'd8', 'd9', 'd10', 'd11', 'd12', 'd13'),
        pile('c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9', 'c10', 'c11', 'c12', 'c13')
      ],
      tableau: [pile('s13'), [], [], [], [], [], [], []]
    });
    const next = freecell.applyMove(s, {
      type: 'move',
      from: { area: 'tableau', index: 0 },
      to: { area: 'foundation', index: 0 },
      cardId: 's13'
    });
    expect(next.status).toBe('won');
  });

  it('marks a locked position lost', () => {
    // Filling the last cell leaves: all tops red, all cells red → zero moves.
    const s = freecellState({
      cells: [card('h3'), card('d5'), card('h7'), null],
      tableau: [
        pile('h2', 'd9'), // d9 (red) on top; h2 beneath
        pile('h4'),
        pile('h6'),
        pile('h8'),
        pile('h10'),
        pile('h12'),
        pile('d3'),
        pile('d7')
      ]
    });
    const next = freecell.applyMove(s, {
      type: 'move',
      from: { area: 'tableau', index: 0 },
      to: { area: 'cell', index: 3 },
      cardId: 'd9'
    });
    expect(next.status).toBe('lost');
  });

  it('never mutates the input state', () => {
    const s = deepFreeze(freecellState({ tableau: [pile('h1'), pile('s2'), [], [], [], [], [], []] }));
    const next = freecell.applyMove(s, {
      type: 'move',
      from: { area: 'tableau', index: 0 },
      to: { area: 'cell', index: 0 },
      cardId: 'h1'
    });
    expect(next).not.toBe(s);
    expect(s.tableau[0]).toHaveLength(1);
  });
});
