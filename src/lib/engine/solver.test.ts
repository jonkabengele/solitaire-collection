import { describe, expect, it } from 'vitest';
import { applyMove } from './applyMove.js';
import { findSolvableSeed, isSolvable } from './solver.js';
import { getVariant } from '../variants/index.js';
import { card, klondikeState, pile, tripeaksState } from '../testkit.js';

const klondike = getVariant('klondike');
const freecell = getVariant('freecell');
const tripeaks = getVariant('tripeaks');

describe('isSolvable', () => {
  it('confirms solvable Klondike deals', () => {
    // Seeds verified solvable by the solver itself (scripts/find-seeds.ts).
    for (const seed of ['verify:0', 'verify:1']) {
      expect(isSolvable(klondike, klondike.initialState(seed), { budgetMs: 2000 }), seed).toBe(true);
    }
  });

  it('confirms solvable FreeCell deals', () => {
    expect(isSolvable(freecell, freecell.initialState('verify:6'), { budgetMs: 3000 })).toBe(true);
  });

  it('confirms solvable TriPeaks deals', () => {
    for (const seed of ['verify:1', 'verify:5']) {
      expect(isSolvable(tripeaks, tripeaks.initialState(seed), { budgetMs: 2000 }), seed).toBe(true);
    }
  });

  it('returns false for a dead Klondike position', () => {
    const dead = klondikeState({
      stock: [],
      waste: [],
      foundations: [pile('s1', 's2'), [], [], []],
      tableau: [pile('c13'), [], [], [], [], [], []]
    });
    expect(isSolvable(klondike, dead, { budgetMs: 1000 })).toBe(false);
  });

  it('returns false for a dead TriPeaks position', () => {
    const tableau: (ReturnType<typeof card> | null)[] = Array.from({ length: 28 }, () => null);
    tableau[27] = card('c7');
    const dead = tripeaksState({ stock: [], waste: pile('h9'), tableau });
    expect(isSolvable(tripeaks, dead, { budgetMs: 1000 })).toBe(false);
  });

  it('returns true for an already-won state', () => {
    const won = klondikeState({
      foundations: [
        pile('s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9', 's10', 's11', 's12', 's13'),
        pile('h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'h7', 'h8', 'h9', 'h10', 'h11', 'h12', 'h13'),
        pile('d1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7', 'd8', 'd9', 'd10', 'd11', 'd12', 'd13'),
        pile('c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9', 'c10', 'c11', 'c12', 'c13')
      ]
    });
    expect(isSolvable(klondike, won)).toBe(true);
  });
});

describe('findSolvableSeed (spec §4.4)', () => {
  it('finds a solvable Klondike seed', () => {
    const r = findSolvableSeed(klondike, 'k-search', { budgetMs: 1000, maxAttempts: 10 });
    expect(r.solved).toBe(true);
    expect(isSolvable(klondike, klondike.initialState(r.seed), { budgetMs: 2000 })).toBe(true);
  }, 30_000);

  it('finds a solvable FreeCell seed quickly', () => {
    const r = findSolvableSeed(freecell, 'f-search', { budgetMs: 1000, maxAttempts: 10 });
    expect(r.solved).toBe(true);
  }, 30_000);
});

describe('applyMove dispatcher', () => {
  it('routes by state.variant and preserves the move log', () => {
    const s = klondike.initialState('dispatch');
    const next = applyMove(s, { type: 'draw' });
    expect(next.variant).toBe('klondike');
    expect(next.moves).toEqual([{ type: 'draw' }]);
    expect(next).not.toBe(s);
  });

  it('determinism: same seed + same move log → identical state', () => {
    const moves = [{ type: 'draw' } as const, { type: 'draw' } as const, { type: 'draw' } as const];
    const replay = () => moves.reduce(applyMove, klondike.initialState('det')) ;
    expect(replay()).toEqual(replay());
  });
});
