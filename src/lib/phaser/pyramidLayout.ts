/**
 * Responsive board geometry for Pyramid. The 28-card triangle fills the
 * top of the board; stock, waste, and the "cleared" slot line the bottom.
 * Rows pitch vertically at ~55% card height so covered cards peek out
 * under their coverers, like a real pyramid deal.
 */
import Phaser from 'phaser';
import type { PileRef } from '../engine/types.js';
import type { DropZone, Point } from './layout.js';

export type { DropZone, Point };

/** Everything PyramidScene needs to place cards and hit-test drops. */
export type PyramidLayout = {
  cardW: number;
  cardH: number;
  /** Draw pile (bottom-left). */
  stock: Point;
  /** Waste top (bottom-right). */
  waste: Point;
  /** Cleared-cards slot (bottom-center) — the King drag target. */
  removed: Point;
  /** Center point of each of the 28 pyramid positions (row-major). */
  pos: Point[];
  /** Drop targets — bottom-row positions first (they overlap on top). */
  zones: DropZone[];
};

const ROWS = 7;
const POSITIONS = 28;

/** Compute the Pyramid layout for a canvas of `width`×`height`. */
export function computePyramidLayout(width: number, height: number): PyramidLayout {
  const margin = Math.max(6, Math.min(18, width * 0.014));
  const gutter = Math.max(3, Math.min(9, width * 0.008));
  const cardW = Math.min(
    (width - 2 * margin - (ROWS - 1) * gutter) / ROWS,
    height * 0.135,
    104
  );
  const cardH = cardW * 1.4;
  const pitch = cardH * 0.55; // vertical distance between row tops
  const top = Math.max(10, height * 0.018);
  const pyramidH = cardH + (ROWS - 1) * pitch;
  const bottomY = top + pyramidH + Math.max(10, height * 0.02) + cardH / 2;

  // Row r: (r+1) cards centered, first card top-left of the next row's span.
  const pos: Point[] = [];
  for (let r = 0; r < ROWS; r++) {
    const rowW = (r + 1) * cardW + r * gutter;
    const x0 = (width - rowW) / 2 + cardW / 2;
    const y = top + r * pitch + cardH / 2;
    for (let p = 0; p <= r; p++) pos.push({ x: x0 + p * (cardW + gutter), y });
  }

  const inflate = cardW * 0.12;
  const cardRect = (p: Point): Phaser.Geom.Rectangle =>
    new Phaser.Geom.Rectangle(
      p.x - cardW / 2 - inflate,
      p.y - cardH / 2 - inflate,
      cardW + inflate * 2,
      cardH + inflate * 2
    );

  const stock = { x: margin + cardW / 2, y: bottomY };
  const waste = { x: width - margin - cardW / 2, y: bottomY };
  const removed = { x: width / 2, y: bottomY };

  const zones: DropZone[] = [
    { ref: { area: 'stock', index: 0 }, rect: cardRect(stock), anchor: stock },
    { ref: { area: 'waste', index: 0 }, rect: cardRect(waste), anchor: waste },
    { ref: { area: 'foundation', index: 0 }, rect: cardRect(removed), anchor: removed }
  ];
  // Tableau zones reversed so visually-on-top (lower) rows hit-test first.
  for (let i = POSITIONS - 1; i >= 0; i--) {
    zones.push({
      ref: { area: 'tableau', index: i },
      rect: cardRect(pos[i]),
      anchor: pos[i]
    });
  }

  return { cardW, cardH, stock, waste, removed, pos, zones };
}
