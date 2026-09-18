/**
 * Responsive board geometry for FreeCell. Seven fat cascade columns so
 * cards stay readable on phones; the top row (4 free cells + 4
 * foundations) is laid out independently at a slightly smaller slot size —
 * eight slots can't share the columns' width and keep cards big.
 */
import Phaser from 'phaser';
import type { PileRef } from '../engine/types.js';
import type { DropZone, Point } from './layout.js';

export type { DropZone, Point };

/** Everything FreeCellScene needs to place cards and hit-test drops. */
export type FreeCellLayout = {
  cardW: number;
  cardH: number;
  /** Top-row slot width/height (smaller than tableau cards). */
  slotW: number;
  slotH: number;
  /** Top-row centers: cells[0..3] then foundations[0..3]. */
  cells: Point[];
  foundations: Point[];
  /** Center x of each of the 7 cascade columns. */
  tableauX: number[];
  /** Top edge y of the cascade row (first card's top). */
  tableauTop: number;
  /** Vertical gap per face-up cascade card. */
  upGap: number;
  /** Reserved space below the tallest cascade. */
  bottomPad: number;
  /** Drop targets: cells, foundations, then tableau bands. */
  zones: DropZone[];
};

const COLS = 7;
/** Top row: 4 cells, a visual gap, then 4 foundations. */
const TOP_SLOTS = 8;

/**
 * Compute the FreeCell layout for a canvas of `width`×`height`.
 * Cards keep a 5:7 aspect; the board centers horizontally when capped.
 */
export function computeFreeCellLayout(width: number, height: number): FreeCellLayout {
  const margin = Math.max(6, Math.min(20, width * 0.010));
  const gutter = Math.max(3, Math.min(12, width * 0.008));
  const cardW = Math.min((width - 2 * margin - (COLS - 1) * gutter) / COLS, height * 0.17, 118);
  const cardH = cardW * 1.4;
  const boardW = COLS * cardW + (COLS - 1) * gutter;
  const startX = (width - boardW) / 2;
  const top = Math.max(8, height * 0.015);
  const colX = (i: number): number => startX + i * (cardW + gutter) + cardW / 2;

  // Top row is its own grid: 8 slots sized to fit the same board width,
  // grouped cells-left / foundations-right around a center gap.
  const centerGap = cardW * 0.4;
  const slotW = Math.min(cardW * 0.88, (boardW - 7 * gutter - centerGap) / TOP_SLOTS);
  const slotH = slotW * 1.4;
  const topY = top + slotH / 2;
  const slotStep = slotW + gutter;
  const leftEdge = startX;
  const rightEdge = startX + boardW;
  const cells = [0, 1, 2, 3].map((i) => ({ x: leftEdge + slotW / 2 + i * slotStep, y: topY }));
  const foundations = [0, 1, 2, 3].map((i) => ({ x: rightEdge - slotW / 2 - (3 - i) * slotStep, y: topY }));

  const rowGap = Math.max(8, height * 0.018);
  const tableauTop = top + slotH + rowGap;
  const inflate = cardW * 0.1;
  const slotInflate = slotW * 0.1;

  const pileRect = (p: Point, w: number, h: number, pad: number): Phaser.Geom.Rectangle =>
    new Phaser.Geom.Rectangle(p.x - w / 2 - pad, p.y - h / 2 - pad, w + pad * 2, h + pad * 2);

  const zones: DropZone[] = [];

  cells.forEach((p, i) =>
    zones.push({ ref: { area: 'cell', index: i }, rect: pileRect(p, slotW, slotH, slotInflate), anchor: p })
  );
  foundations.forEach((p, i) =>
    zones.push({ ref: { area: 'foundation', index: i }, rect: pileRect(p, slotW, slotH, slotInflate), anchor: p })
  );
  for (let i = 0; i < COLS; i++) {
    zones.push({
      ref: { area: 'tableau', index: i },
      rect: new Phaser.Geom.Rectangle(
        colX(i) - (cardW + gutter) / 2,
        tableauTop - cardH * 0.2,
        cardW + gutter,
        height
      ),
      anchor: { x: colX(i), y: tableauTop + cardH / 2 }
    });
  }

  return {
    cardW,
    cardH,
    slotW,
    slotH,
    cells,
    foundations,
    tableauX: Array.from({ length: COLS }, (_, i) => colX(i)),
    tableauTop,
    upGap: cardH * 0.35,
    bottomPad: Math.max(8, height * 0.015),
    zones
  };
}
