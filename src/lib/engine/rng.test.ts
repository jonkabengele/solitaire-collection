import { describe, expect, it } from 'vitest';
import { hashSeed, mulberry32, shuffle } from './rng.js';

describe('mulberry32', () => {
  it('is deterministic for the same seed', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 20; i++) expect(a()).toBe(b());
  });

  it('differs across seeds', () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    const seqA = Array.from({ length: 10 }, () => a());
    const seqB = Array.from({ length: 10 }, () => b());
    expect(seqA).not.toEqual(seqB);
  });

  it('produces values in [0, 1)', () => {
    const r = mulberry32(7);
    for (let i = 0; i < 1000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('hashSeed', () => {
  it('is deterministic and seed-sensitive', () => {
    expect(hashSeed('abc')).toBe(hashSeed('abc'));
    expect(hashSeed('abc')).not.toBe(hashSeed('abd'));
  });
});

describe('shuffle', () => {
  const items = Array.from({ length: 52 }, (_, i) => i);

  it('produces the same order for the same seed', () => {
    expect(shuffle('deal-1', items)).toEqual(shuffle('deal-1', items));
  });

  it('produces a permutation of the input', () => {
    const out = shuffle('x', items);
    expect(out.slice().sort((a, b) => a - b)).toEqual(items);
  });

  it('differs across seeds', () => {
    expect(shuffle('a', items)).not.toEqual(shuffle('b', items));
  });

  it('does not mutate the input', () => {
    const copy = items.slice();
    shuffle('z', items);
    expect(items).toEqual(copy);
  });
});
