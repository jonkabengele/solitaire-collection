/**
 * Responsive board geometry for Klondike. Pure math over canvas size —
 * the scene positions sprites and drop zones from this single source.
 */
import Phaser from 'phaser';
import type { PileRef } from '../engine/types.js';

/** Canvas point (center of a pile/card). */
export type Point = { x: number; y: number };

/** A drop/tap target rectangle bound to a pile. `anchor` is where the slot
 * outline is drawn — for tableau columns it differs from the rect center. */
export type DropZone = { ref: PileRef; rect: Phaser.Geom.Rectangle; anchor: Point };

/** Everything KlondikeScene needs to place cards and hit-test drops. */
export type BoardLayout = {
  cardW: number;
  cardH: number;
  stock: Point;
  waste: Point;
  foundations: Point[];
  /** Center x of each of the 7 tableau columns. */
  tableauX: number[];
  /** Top edge y of the tableau row (first card's top). */
  tableauTop: number;
  /** Vertical gap contributed by a face-down card. */
  downGap: number;
  /** Vertical gap contributed by a face-up card. */
  upGap: number;
  /** Reserved space below the tallest tableau column. */
  bottomPad: number;
  /** Drop targets, foundations first (top row wins over tableau bands). */
  zones: DropZone[];
};

const COLS = 7;

/**
 * Compute the Klondike layout for a canvas of `width`×`height`.
 * Cards keep a 5:7 aspect; the board centers horizontally when capped.
 */
export function computeLayout(width: number, height: number): BoardLayout {
  const margin = Math.max(6, Math.min(20, width * 0.018));
  const gutter = Math.max(3, Math.min(12, width * 0.012));
  const cardW = Math.min(
    (width - 2 * margin - (COLS - 1) * gutter) / COLS,
    height * 0.17,
    124
  );
  const cardH = cardW * 1.4;
  const boardW = COLS * cardW + (COLS - 1) * gutter;
  const startX = (width - boardW) / 2;
  const top = Math.max(8, height * 0.015);
  const colX = (i: number): number => startX + i * (cardW + gutter) + cardW / 2;
  const topY = top + cardH / 2;
  const rowGap = Math.max(10, height * 0.02);
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
  const waste = { x: colX(1), y: topY };
  const foundations = [3, 4, 5, 6].map((i) => ({ x: colX(i), y: topY }));

  zones.push({ ref: { area: 'stock', index: 0 }, rect: pileRect(stock), anchor: stock });
  zones.push({ ref: { area: 'waste', index: 0 }, rect: pileRect(waste), anchor: waste });
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
    waste,
    foundations,
    tableauX: Array.from({ length: COLS }, (_, i) => colX(i)),
    tableauTop,
    downGap: cardH * 0.16,
    upGap: cardH * 0.32,
    bottomPad: Math.max(8, height * 0.015),
    zones
  };
}
