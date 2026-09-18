/**
 * Responsive board geometry for Spider. Ten columns is the tightest
 * layout in the collection — margins and gutters shrink harder so cards
 * stay as wide as a phone allows; the top row (stock + 8 cleared-run
 * slots) shares the column grid like Klondike.
 */
import Phaser from 'phaser';
import type { PileRef } from '../engine/types.js';
import type { DropZone, Point } from './layout.js';

export type { DropZone, Point };

/** Everything SpiderScene needs to place cards and hit-test drops. */
export type SpiderLayout = {
  cardW: number;
  cardH: number;
  /** Stock draw pile (top-left). */
  stock: Point;
  /** Eight cleared-run slots along the top row (columns 2..9). */
  foundations: Point[];
  /** Center x of each of the 10 tableau columns. */
  tableauX: number[];
  /** Top edge y of the tableau row (first card's top). */
  tableauTop: number;
  /** Vertical gap contributed by a face-down card. */
  downGap: number;
  /** Strip shown of the face-up card under the column top — index readable. */
  indexGap: number;
  /** Strip shown of a buried face-up card — rank peeks through. */
  buriedGap: number;
  /** Reserved space below the tallest column. */
  bottomPad: number;
  /** Drop targets, stock first (top row wins over tableau bands). */
  zones: DropZone[];
};

const COLS = 10;

/** Compute the Spider layout for a canvas of `width`×`height`. */
export function computeSpiderLayout(width: number, height: number): SpiderLayout {
  const margin = Math.max(4, Math.min(14, width * 0.008));
  const gutter = Math.max(2, Math.min(8, width * 0.006));
  const cardW = Math.min(
    (width - 2 * margin - (COLS - 1) * gutter) / COLS,
    height * 0.15,
    96
  );
  const cardH = cardW * 1.4;
  const boardW = COLS * cardW + (COLS - 1) * gutter;
  const startX = (width - boardW) / 2;
  const top = Math.max(8, height * 0.015);
  const colX = (i: number): number => startX + i * (cardW + gutter) + cardW / 2;
  const topY = top + cardH / 2;
  const rowGap = Math.max(8, height * 0.018);
  const tableauTop = top + cardH + rowGap;
  const inflate = cardW * 0.12;

  const pileRect = (p: Point): Phaser.Geom.Rectangle =>
    new Phaser.Geom.Rectangle(
      p.x - cardW / 2 - inflate,
      p.y - cardH / 2 - inflate,
      cardW + inflate * 2,
      cardH + inflate * 2
    );

  const zones: DropZone[] = [];
  const stock = { x: colX(0), y: topY };
  const foundations = Array.from({ length: 8 }, (_, i) => ({ x: colX(2 + i), y: topY }));

  zones.push({ ref: { area: 'stock', index: 0 }, rect: pileRect(stock), anchor: stock });
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
    stock,
    foundations,
    tableauX: Array.from({ length: COLS }, (_, i) => colX(i)),
    tableauTop,
    downGap: cardH * 0.16,
    indexGap: cardH * 0.22,
    buriedGap: cardH * 0.17,
    bottomPad: Math.max(8, height * 0.015),
    zones
  };
}
