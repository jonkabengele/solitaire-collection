/**
 * Responsive board geometry for FreeCell. Eight uniform columns: the top
 * row holds 4 free cells (left) and 4 foundations (right); cascades run
 * below. Pure math — the scene positions sprites and drop zones from this.
 */
import Phaser from 'phaser';
import type { PileRef } from '../engine/types.js';
import type { DropZone, Point } from './layout.js';

export type { DropZone, Point };

/** Everything FreeCellScene needs to place cards and hit-test drops. */
export type FreeCellLayout = {
  cardW: number;
  cardH: number;
  /** Top-row centers: cells[0..3] then foundations[0..3]. */
  cells: Point[];
  foundations: Point[];
  /** Center x of each of the 8 cascade columns. */
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

const COLS = 8;

/**
 * Compute the FreeCell layout for a canvas of `width`×`height`.
 * Cards keep a 5:7 aspect; the board centers horizontally when capped.
 */
export function computeFreeCellLayout(width: number, height: number): FreeCellLayout {
  const margin = Math.max(6, Math.min(20, width * 0.018));
  const gutter = Math.max(3, Math.min(12, width * 0.012));
  const cardW = Math.min((width - 2 * margin - (COLS - 1) * gutter) / COLS, height * 0.15, 110);
  const cardH = cardW * 1.4;
  const boardW = COLS * cardW + (COLS - 1) * gutter;
  const startX = (width - boardW) / 2;
  const top = Math.max(8, height * 0.015);
  const colX = (i: number): number => startX + i * (cardW + gutter) + cardW / 2;
  const topY = top + cardH / 2;
  const rowGap = Math.max(8, height * 0.018);
  const tableauTop = top + cardH + rowGap;
  const inflate = cardW * 0.1;

  const pileRect = (p: Point): Phaser.Geom.Rectangle =>
    new Phaser.Geom.Rectangle(
      p.x - cardW / 2 - inflate,
      p.y - cardH / 2 - inflate,
      cardW + inflate * 2,
      cardH + inflate * 2
    );

  const zones: DropZone[] = [];
  const cells = [0, 1, 2, 3].map((i) => ({ x: colX(i), y: topY }));
  const foundations = [4, 5, 6, 7].map((i) => ({ x: colX(i), y: topY }));

  cells.forEach((p, i) =>
    zones.push({ ref: { area: 'cell', index: i }, rect: pileRect(p), anchor: p })
  );
  foundations.forEach((p, i) =>
    zones.push({ ref: { area: 'foundation', index: i }, rect: pileRect(p), anchor: p })
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
    cells,
    foundations,
    tableauX: Array.from({ length: COLS }, (_, i) => colX(i)),
    tableauTop,
    upGap: cardH * 0.3,
    bottomPad: Math.max(8, height * 0.015),
    zones
  };
}
