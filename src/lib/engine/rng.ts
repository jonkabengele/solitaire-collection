/**
 * Deterministic seeded randomness (spec §4.3).
 * This is the ONLY file that produces pseudo-random values; nothing in
 * `engine/` or `variants/` may call `Math.random()`.
 */

/**
 * mulberry32 — tiny, fast, statistically solid 32-bit PRNG.
 * @param seed uint32 seed
 * @returns function producing floats in [0, 1)
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Hash a string seed into a uint32 (FNV-1a).
 * @param seed arbitrary string seed
 */
export function hashSeed(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Deterministic Fisher–Yates shuffle. Same seed → same order, always.
 * Input array is not mutated.
 * @param seed string seed
 * @param items items to shuffle
 * @returns a new shuffled array
 */
export function shuffle<T>(seed: string, items: readonly T[]): T[] {
  const rand = mulberry32(hashSeed(seed));
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}
