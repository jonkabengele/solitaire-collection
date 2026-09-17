/**
 * A board slot: the faint outline marking an empty pile position plus the
 * hit-test rect used for drops. Presentational only.
 */
import Phaser from 'phaser';
import type { PileRef } from '../../engine/types.js';
import type { Point } from '../layout.js';

export class Pile {
  readonly slot: Phaser.GameObjects.Rectangle;
  private mark?: Phaser.GameObjects.Text;

  constructor(
    scene: Phaser.Scene,
    readonly ref: PileRef,
    readonly rect: Phaser.Geom.Rectangle,
    anchor: Point,
    cardW: number,
    cardH: number
  ) {
    this.slot = scene.add
      .rectangle(anchor.x, anchor.y, cardW, cardH)
      .setStrokeStyle(2, 0xffffff, 0.16)
      .setFillStyle(0x000000, 0.1)
      .setDepth(-1);
    // Foundations get a faint 'A' watermark like physical solitaire felts.
    if (ref.area === 'foundation') {
      this.mark = scene.add
        .text(anchor.x, anchor.y, 'A', {
          fontSize: `${Math.round(cardH * 0.45)}px`,
          color: '#ffffff'
        })
        .setOrigin(0.5)
        .setAlpha(0.14)
        .setDepth(-1);
    }
  }

  /** Remove the slot graphic (layout rebuild on resize). */
  dispose(): void {
    this.slot.destroy();
    this.mark?.destroy();
  }
}
