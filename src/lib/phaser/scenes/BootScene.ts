/**
 * Loads generated card SVGs (rasterized at 2× for HiDPI) with a minimal
 * progress bar, then starts the Klondike scene. Audio stubs are silent
 * in Phase 2 (real CC0 samples land in Phase 4).
 */
import Phaser from 'phaser';
import { createDeck } from '../../engine/deck.js';

const TEX_W = 280;
const TEX_H = 392;

export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  preload(): void {
    const cx = this.scale.width / 2;
    const cy = this.scale.height / 2;
    this.add.rectangle(cx, cy, 224, 26).setStrokeStyle(1, 0xffffff, 0.4);
    const bar = this.add.rectangle(cx - 108, cy, 0, 18, 0xffffff).setOrigin(0, 0.5);
    this.load.on('progress', (v: number) => {
      bar.width = 216 * v;
    });

    for (const card of createDeck()) {
      this.load.svg(`card-${card.id}`, `assets/cards/${card.id}.svg`, {
        width: TEX_W,
        height: TEX_H
      });
    }
    this.load.svg('card-back', 'assets/cards/back.svg', { width: TEX_W, height: TEX_H });
  }

  create(): void {
    this.scene.start('menu');
  }
}
