import { describe, expect, it } from 'vitest';
import { tripeaks } from './tripeaks.js';
import { card, deepFreeze, pile, tripeaksState } from '../testkit.js';
import type { Card, TriPeaksState } from '../engine/types.js';

const asTP = (s: ReturnType<typeof tripeaks.initialState>) => s as TriPeaksState;

/** Build a tableau with cards only at the given positions. */
function tableauWith(entries: [number, Card][]): (Card | null)[] {
  const t: (Card | null)[] = Array.from({ length: 28 }, () => null);
  for (const [i, c] of entries) t[i] = c;
  return t;
}

describe('tripeaks initial state', () => {
  const s = asTP(tripeaks.initialState('tp-seed'));

  it('exposes only the bottom row', () => {
    expect(tripeaks.legalMoves(s).every((m) => m.type === 'draw' || m.from.index >= 18)).toBe(true);
    expect(s.waste).toHaveLength(1);
  });
});

describe('tripeaks chain rules', () => {
  it('plays exposed cards one rank from the waste top', () => {
    const s = tripeaksState({
      waste: pile('h7'),
      tableau: tableauWith([[27, card('s8')], [26, card('h9')]])
    });
    const next = tripeaks.applyMove(s, {
      type: 'move',
      from: { area: 'tableau', index: 27 },
      to: { area: 'waste', index: 0 },
      cardId: 's8'
    });
    expect(next.tableau[27]).toBeNull();
    expect(next.waste.map((c) => c.id)).toEqual(['h7', 's8']);
  });

  it('rejects non-adjacent ranks', () => {
    const s = tripeaksState({ waste: pile('h7'), tableau: tableauWith([[27, card('s9')]]) });
    const next = tripeaks.applyMove(s, {
      type: 'move',
      from: { area: 'tableau', index: 27 },
      to: { area: 'waste', index: 0 },
      cardId: 's9'
    });
    expect(next).toBe(s);
  });

  it('wraps king ↔ ace', () => {
    const s = tripeaksState({ waste: pile('s13'), tableau: tableauWith([[27, card('h1')]]) });
    const next = tripeaks.applyMove(s, {
      type: 'move',
      from: { area: 'tableau', index: 27 },
      to: { area: 'waste', index: 0 },
      cardId: 'h1'
    });
    expect(next.waste.map((c) => c.id)).toEqual(['s13', 'h1']);
  });

  it('rejects covered cards', () => {
    // Position 0 (peak apex) is covered by 3 and 4.
    const s = tripeaksState({
      waste: pile('h7'),
      tableau: tableauWith([
        [0, card('s8')],
        [3, card('d2')],
        [4, card('c3')]
      ])
    });
    const next = tripeaks.applyMove(s, {
      type: 'move',
      from: { area: 'tableau', index: 0 },
      to: { area: 'waste', index: 0 },
      cardId: 's8'
    });
    expect(next).toBe(s);
  });

  it('flips newly exposed cards face-up', () => {
    const s = tripeaksState({
      waste: pile('h7'),
      tableau: tableauWith([
        [0, card('s9', false)],
        [3, card('d8')],
        [4, card('c9')]
      ])
    });
    // Remove 3 (d8 onto h7) and 4 (c9 onto d8) → apex 0 becomes exposed and flips.
    let next = tripeaks.applyMove(s, {
      type: 'move',
      from: { area: 'tableau', index: 3 },
      to: { area: 'waste', index: 0 },
      cardId: 'd8'
    });
    next = tripeaks.applyMove(next, {
      type: 'move',
      from: { area: 'tableau', index: 4 },
      to: { area: 'waste', index: 0 },
      cardId: 'c9'
    });
    expect(next.tableau[0]?.faceUp).toBe(true);
  });

  it('draws from stock onto waste', () => {
    const s = tripeaksState({ stock: pile('s5', 'h9'), waste: pile('h7') });
    const next = tripeaks.applyMove(s, { type: 'draw' });
    expect(next.stock.map((c) => c.id)).toEqual(['s5']);
    expect(next.waste.map((c) => c.id)).toEqual(['h7', 'h9']);
  });
});

describe('tripeaks status & purity', () => {
  it('detects the win (tableau cleared)', () => {
    const s = tripeaksState({ waste: pile('h7'), tableau: tableauWith([[27, card('s8')]]) });
    const next = tripeaks.applyMove(s, {
      type: 'move',
      from: { area: 'tableau', index: 27 },
      to: { area: 'waste', index: 0 },
      cardId: 's8'
    });
    expect(next.status).toBe('won');
  });

  it('marks a dead position lost (empty stock, no adjacent card)', () => {
    const s = tripeaksState({
      stock: pile('h9'),
      waste: pile('h5'),
      tableau: tableauWith([[27, card('c7')]])
    });
    // Draw the last stock card; h9 is not adjacent to c7 → dead.
    const next = tripeaks.applyMove(s, { type: 'draw' });
    expect(next.stock).toHaveLength(0);
    expect(next.status).toBe('lost');
  });

  it('never mutates the input state', () => {
    const s = deepFreeze(
      tripeaksState({ stock: pile('s5'), waste: pile('h7'), tableau: tableauWith([[27, card('s8')]]) })
    );
    const next = tripeaks.applyMove(s, { type: 'draw' });
    expect(next).not.toBe(s);
    expect(s.stock).toHaveLength(1);
  });
});
