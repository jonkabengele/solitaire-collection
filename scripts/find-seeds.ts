import { getVariant } from '../src/lib/variants/index.js';
import { isSolvable } from '../src/lib/engine/solver.js';
import type { VariantId } from '../src/lib/engine/types.js';

for (const v of ['klondike', 'freecell', 'tripeaks'] as VariantId[]) {
  const variant = getVariant(v);
  const good: string[] = [];
  for (let i = 0; i < 10 && good.length < 3; i++) {
    const seed = `verify:${i}`;
    const t0 = Date.now();
    const ok = isSolvable(variant, variant.initialState(seed), { budgetMs: 1500 });
    console.log(v, seed, ok, `${Date.now() - t0}ms`);
    if (ok) good.push(seed);
  }
  console.log(v, 'VERIFIED:', JSON.stringify(good));
}
