/**
 * Responsive board geometry for TriPeaks. The 28 tableau positions sit in
 * four overlapping rows (3-6-9-10); row centers derive from the covering
 * map — each card is centered between the two cards it covers:
 *
 *   row 0 (peaks): x = slot(3p + 1.5)        p  = 0..2
 *   row 1:         x = slot(3p + i + 1)      pos 3+2p+i
 *   row 2:         x = slot(j + 0.5)         pos 9+j
 *   row 3 (base):  x = slot(k)               pos 18+k
 *
 * Stock and waste sit in a row below the peaks. Tap-only variant — this
 * layout produces card positions, not drop zones.
 */
import type { PileRef } from '../engine/types.js';
import type { Point } from './layout.js';

export type { Point };

/** Everything TriPeaksScene needs to place the 28 positions + stock/waste. */
export type TriPeaksLayout = {
  cardW: number;
  cardH: number;
  /** Center point per tableau position index (0..27). */
  positions: Point[];
  stock: Point;
  waste: Point;
};

/** Row each tableau position belongs to — used for depth (base row frontmost). */
export function tripeaksRow(i: number): number {
  if (i < 3) return 0;
  if (i < 9) return 1;
  if (i < 18) return 2;
  return 3;
}

/**
 * Compute the TriPeaks layout for a canvas of `width`×`height`.
 * Ten slots span the base row; upper rows hang in the gaps.
 */
export function computeTriPeaksLayout(width: number, height: number): TriPeaksLayout {
  const margin = Math.max(6, Math.min(20, width * 0.018));
  const slotGap = Math.max(2, Math.min(8, width * 0.008));
  // 10 slots across; slot pitch = cardW + slotGap.
  const cardW = Math.min(
    (width - 2 * margin - 9 * slotGap) / 10,
    (height * 0.62) / (1 + 3 * 0.5) / 1.4,
    96
  );
  const cardH = cardW * 1.4;
  const pitch = cardW + slotGap;
  const boardW = 10 * cardW + 9 * slotGap;
  const slotX = (k: number): number => (width - boardW) / 2 + k * pitch + cardW / 2;

  const overlap = cardH * 0.5;
  // Vertically center the whole board: peaks block + gap + stock/waste row.
  const rowGap = Math.max(10, height * 0.03);
  const total = 3 * overlap + cardH + rowGap + cardH;
  const top = Math.max(8, (height - total) / 2);
  const rowY = (r: number): number => top + r * overlap + cardH / 2;

  const positions: Point[] = new Array<Point>(28);
  for (let p = 0; p < 3; p++) positions[p] = { x: slotX(3 * p + 1.5), y: rowY(0) };
  for (let p = 0; p < 3; p++)
    for (let i = 0; i < 2; i++) positions[3 + 2 * p + i] = { x: slotX(3 * p + i + 1), y: rowY(1) };
  for (let j = 0; j < 9; j++) positions[9 + j] = { x: slotX(j + 0.5), y: rowY(2) };
  for (let k = 0; k < 10; k++) positions[18 + k] = { x: slotX(k), y: rowY(3) };

  const peaksBottom = top + 3 * overlap + cardH;
  const rowY4 = peaksBottom + rowGap + cardH / 2;
  const stock = { x: width / 2 - (cardW + Math.max(10, width * 0.04)) / 2, y: rowY4 };
  const waste = { x: width / 2 + (cardW + Math.max(10, width * 0.04)) / 2, y: rowY4 };

  return { cardW, cardH, positions, stock, waste };
}

/** Stable pile ref for a tableau position — used for `Move.from`. */
export function tripeaksRef(i: number): PileRef {
  return { area: 'tableau', index: i };
}
