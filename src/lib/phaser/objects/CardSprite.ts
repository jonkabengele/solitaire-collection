/**
 * Phaser view object for one card. Purely presentational: it mirrors a
 * `Card` from canonical state (face texture, pile membership, depth) and
 * never owns game logic. Drop validity is decided by the engine.
 *
 * Face changes animate as a 200ms squash/swap/expand on scaleX (spec §4:
 * "Flip: 200ms, subtle scale + rotateY" — scaleX is the 2D stand-in).
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
  /** False until first positioned — first placement is instant or a deal tween. */
  placed = false;
  /** Optional tap callback (tap-driven variants like TriPeaks). Fires on pointerdown. */
  onTap?: (spr: CardSprite) => void;
  /** Active position tween — kept separate so a flip never cancels it. */
  moveTween?: Phaser.Tweens.Tween;
  private shownTex = 'card-back';
  private flipTween?: Phaser.Tweens.Tween;

  constructor(scene: Phaser.Scene) {
    super(scene, 0, 0, 'card-back');
    scene.add.existing(this);
    this.on('pointerdown', () => this.onTap?.(this));
  }

  /**
   * Mirror a canonical card: swap texture on face change (animated once
   * the card is on the board), record pile ref.
   */
  bind(card: Card, ref: PileRef, pileIndex: number): void {
    this.cardId = card.id;
    this.ref = ref;
    this.pileIndex = pileIndex;
    this.faceUp = card.faceUp;
    // Spider duplicate ids carry a `#n` serial suffix; the face texture
    // is shared per suit+rank, so the key strips it (`s5#3` → `card-s5`).
    const tex = card.faceUp ? `card-${card.id.split('#')[0]}` : 'card-back';
    if (tex === this.shownTex) return;
    if (!this.placed) {
      this.setTexture(tex);
      this.shownTex = tex;
      return;
    }
    this.flipTween?.stop();
    const sx = this.scaleX;
    this.flipTween = this.scene.tweens.add({
      targets: this,
      scaleX: 0,
      duration: 100,
      ease: 'Quad.easeIn',
      onComplete: () => {
        this.setTexture(tex);
        this.shownTex = tex;
        playSfx('flip');
        this.flipTween = this.scene.tweens.add({
          targets: this,
          scaleX: sx,
          duration: 100,
          ease: 'Quad.easeOut'
        });
      }
    });
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
