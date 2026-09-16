/**
 * Edge-swipe gestures (Phase 4): swipe inward from the left edge → undo,
 * from the right edge → redo. A swipe that starts on any interactive
 * object (card, stock zone) is ignored so it can't conflict with card
 * drags or taps.
 */
import Phaser from 'phaser';

const EDGE = 28; // px from screen edge that counts as an edge start
const SWIPE = 60; // px of inward travel required
const TIME = 600; // ms budget for the gesture
const MAX_DRIFT = 80; // vertical slop tolerance

export type SwipeHooks = {
  onUndo(): void;
  onRedo(): void;
};

export class SwipeController {
  private down: { x: number; y: number; t: number; blocked: boolean } | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly hooks: SwipeHooks
  ) {
    scene.input.on(Phaser.Input.Events.POINTER_DOWN, this.onDown, this);
    scene.input.on(Phaser.Input.Events.POINTER_UP, this.onUp, this);
  }

  destroy(): void {
    this.scene.input.off(Phaser.Input.Events.POINTER_DOWN, this.onDown, this);
    this.scene.input.off(Phaser.Input.Events.POINTER_UP, this.onUp, this);
  }

  private onDown(p: Phaser.Input.Pointer): void {
    const w = this.scene.scale.width;
    if (p.x >= EDGE && p.x <= w - EDGE) {
      this.down = null;
      return;
    }
    this.down = {
      x: p.x,
      y: p.y,
      t: p.downTime,
      blocked: this.scene.input.hitTestPointer(p).length > 0
    };
  }

  private onUp(p: Phaser.Input.Pointer): void {
    const d = this.down;
    this.down = null;
    if (!d || d.blocked) return;
    if (p.upTime - d.t > TIME || Math.abs(p.y - d.y) > MAX_DRIFT) return;
    const dx = p.x - d.x;
    if (d.x < EDGE && dx > SWIPE) this.hooks.onUndo();
    else if (d.x > this.scene.scale.width - EDGE && dx < -SWIPE) this.hooks.onRedo();
  }
}
