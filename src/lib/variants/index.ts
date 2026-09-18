import type { Variant, VariantId } from '../engine/types.js';
import { klondike } from './klondike.js';
import { freecell } from './freecell.js';
import { tripeaks } from './tripeaks.js';
import { spider } from './spider.js';
import { pyramid } from './pyramid.js';

/** All implemented variants. */
export const VARIANTS: readonly Variant[] = [klondike, freecell, tripeaks, spider, pyramid];

/**
 * Look up a variant implementation by id.
 * @throws if `id` is not a known variant
 */
export function getVariant(id: VariantId): Variant {
  const v = VARIANTS.find((x) => x.id === id);
  if (!v) throw new Error(`unknown variant: ${id}`);
  return v;
}
