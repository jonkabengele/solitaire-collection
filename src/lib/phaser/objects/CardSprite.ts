/**
 * Phaser view object for one card. Purely presentational: it mirrors a
 * `Card` from canonical state (face texture, pile membership, depth) and
 * never owns game logic. Drop validity is decided by the engine.
 */
import Phaser from 'phaser';
import type { Card, PileRef } from '../../engine/types.js';
import { playSfx } from '../sfx.js';

export class CardSprite extends Phaser.GameObjects.Image {
  /** Engine card id, e.g. `'s1'`. */
  cardId = '';
  /** Pile this card currently belongs to (canonical, not visual). */
  ref: PileRef = { area: 'stock', index: 0 };
  /** Position within `ref`'s pile (0 = bottom). */
  pileIndex = 0;
  faceUp = false;
  /** False until first positioned — first placement is instant (no deal tween in Phase 2). */
  placed = false;
  /** Optional tap callback (tap-driven variants like TriPeaks). Fires on pointerdown. */
  onTap?: (spr: CardSprite) => void;

  constructor(scene: Phaser.Scene) {
    super(scene, 0, 0, 'card-back');
    scene.add.existing(this);
    this.on('pointerdown', () => this.onTap?.(this));
  }

  /**
   * Mirror a canonical card: swap texture on face change, record pile ref.
   */
  bind(card: Card, ref: PileRef, pileIndex: number): void {
    if (card.faceUp !== this.faceUp) {
      this.faceUp = card.faceUp;
      this.setTexture(card.faceUp ? `card-${card.id}` : 'card-back');
      if (this.placed) playSfx('flip');
    }
    this.cardId = card.id;
    this.ref = ref;
    this.pileIndex = pileIndex;
  }

  /** Enable/disable pointer dragging for this card. */
  setDraggable(on: boolean): void {
    if (on) {
      // Always re-call setInteractive: disableInteractive() leaves a disabled
      // InteractiveObject behind, and only this re-enables it.
      this.setInteractive({ cursor: 'grab' });
      this.scene.input.setDraggable(this, true);
    } else if (this.input) {
      this.scene.input.setDraggable(this, false);
      this.disableInteractive();
    }
  }

  /** Enable/disable tap interactivity (no drag). */
  setTappable(on: boolean): void {
    if (on) this.setInteractive({ cursor: 'pointer' });
    else if (this.input) this.disableInteractive();
  }
}
