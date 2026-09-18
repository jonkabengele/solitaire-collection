/**
 * Solvable-seed cache (spec §Phase 5): up to 100 solver-verified seeds per
 * variant in localStorage under `solitaire.seeds.{variant}`. `newGame`
 * pops one instantly; a Web Worker refills in the background when the
 * cache drops below the low-water mark. On a cold start with an empty
 * cache the store falls back to a bounded synchronous solve.
 */
import type { VariantId } from '../engine/types.js';
import { getVariant } from '../variants/index.js';
import { findSolvableSeed } from '../engine/solver.js';

const KEY = (v: VariantId): string => `solitaire.seeds.${v}`;
const MAX = 100;
const LOW_WATER = 8;
const REFILL = 12;

function read(v: VariantId): string[] {
  try {
    const raw = localStorage.getItem(KEY(v));
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown;
    return Array.isArray(arr) ? arr.filter((s): s is string => typeof s === 'string') : [];
  } catch {
    return [];
  }
}

function write(v: VariantId, seeds: string[]): void {
  try {
    localStorage.setItem(KEY(v), JSON.stringify(seeds.slice(0, MAX)));
  } catch {
    /* storage full / private mode — non-fatal */
  }
}

// ---- worker refill ----

let worker: Worker | null = null;
const busy = new Set<VariantId>();
const queued = new Set<VariantId>();

function ensureWorker(): Worker | null {
  if (worker) return worker;
  try {
    worker = new Worker(new URL('../workers/solverWorker.ts', import.meta.url), {
      type: 'module'
    });
    worker.onmessage = (e: MessageEvent<{ variant: VariantId; seeds: string[] }>) => {
      const { variant, seeds } = e.data;
      const existing = read(variant);
      const merged = [...existing];
      for (const s of seeds) if (!merged.includes(s)) merged.push(s);
      write(variant, merged);
      busy.delete(variant);
      if (queued.delete(variant)) requestSeeds(variant);
    };
    worker.onerror = () => {
      busy.clear();
      queued.clear();
    };
    return worker;
  } catch {
    return null; // Workers unavailable — cache just stays empty, sync path covers it
  }
}

/** Ask the worker to top up `v`'s cache (deduped, capped at MAX). */
export function requestSeeds(v: VariantId): void {
  if (busy.has(v)) {
    queued.add(v);
    return;
  }
  const w = ensureWorker();
  if (!w) return;
  busy.add(v);
  w.postMessage({
    variant: v,
    count: REFILL,
    base: `auto-${Date.now().toString(36)}-${crypto.getRandomValues(new Uint32Array(1))[0].toString(36)}`
  });
}

/**
 * A solver-verified seed for `v`. Fast path: pop the cache. Cold start:
 * bounded synchronous solve (≤8 attempts × 350ms), falling back to the
 * last tried seed if all attempts time out — a possibly-unsolvable deal
 * beats an unbounded stall.
 */
export function solvableSeed(v: VariantId): string {
  // Spider: solver verification doesn't scale to 104-card deals — 1-suit
  // deals are near-always winnable anyway, so raw random seeds are used.
  if (v === 'spider') {
    return `s-${Date.now().toString(36)}-${crypto.getRandomValues(new Uint32Array(1))[0].toString(36)}`;
  }
  const arr = read(v);
  const cached = arr.shift();
  if (cached !== undefined) {
    write(v, arr);
    if (arr.length < LOW_WATER) requestSeeds(v);
    return cached;
  }
  requestSeeds(v);
  const r = findSolvableSeed(getVariant(v), undefined, { budgetMs: 350, maxAttempts: 8 });
  return r.seed;
}
