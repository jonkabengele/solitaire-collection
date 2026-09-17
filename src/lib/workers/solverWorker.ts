/**
 * Solver worker: generates batches of solver-verified seeds off the main
 * thread so deal-finding never janks the UI (spec §Phase 5 note).
 * Protocol: in {variant, count, base} → out {variant, seeds: string[]}.
 */
import { getVariant } from '../variants/index.js';
import { findSolvableSeed } from '../engine/solver.js';
import type { VariantId } from '../engine/types.js';

type Req = { variant: VariantId; count: number; base: string };
type Res = { variant: VariantId; seeds: string[] };

const post = (m: Res): void =>
  (self as unknown as { postMessage(m: Res): void }).postMessage(m);

(self as unknown as { onmessage: (e: MessageEvent<Req>) => void }).onmessage = (e) => {
  const { variant, count, base } = e.data;
  const v = getVariant(variant);
  const seeds: string[] = [];
  for (let i = 0; i < count; i++) {
    const r = findSolvableSeed(v, `${base}:${i}`, { budgetMs: 350, maxAttempts: 8 });
    if (r.solved) seeds.push(r.seed);
  }
  post({ variant, seeds });
};
