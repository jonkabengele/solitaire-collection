/**
 * Unified mouse/touch drag handling for card sprites (spec §5.1:
 * "identical on desktop and mobile"). Knows nothing about rules — it
 * asks the host scene for the dragged run and the pile under the drop
 * point, then hands a `Move` to the host for dispatch.
 */
import Phaser from 'phaser';
import type { Move, PileRef } from '../../engine/types.js';
import { CardSprite } from './CardSprite.js';

/** What a scene must provide for DragController to work. */
export interface DragHost {
  /** Sprites that move together when `pileIndex` of `ref` is grabbed (the run above it). */
  runSprites(ref: PileRef, pileIndex: number): CardSprite[];
  /** Pile under a board point, if any. */
  pileAt(x: number, y: number): PileRef | undefined;
  /** Dispatch a move; the host resyncs sprites either way (snap-back on reject). */
  tryMove(move: Move): void;
  /** Attempt a legal move sending `sprite`'s card to a foundation (double-tap). */
  tryAutoFoundation(sprite: CardSprite): void;
  /** Reposition every sprite to canonical state. */
  resync(): void;
  /** Mark card ids mid-drag so state syncs skip them. */
  setDragging(ids: string[], on: boolean): void;
}

const TAP_MAX_DIST = 12;
const TAP_MAX_MS = 400;
const DBL_TAP_MS = 400;

export class DragController {
  private group: CardSprite[] = [];
  private offsets: { x: number; y: number }[] = [];
  private lastTap = { id: '', at: 0 };

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly host: DragHost
  ) {
    const ev = Phaser.Input.Events;
    scene.input.on(ev.DRAG_START, this.onDragStart, this);
    scene.input.on(ev.DRAG, this.onDrag, this);
    scene.input.on(ev.DRAG_END, this.onDragEnd, this);
    scene.input.on(ev.GAMEOBJECT_POINTER_UP, this.onPointerUp, this);
  }

  /** Detach all listeners (scene shutdown). */
  destroy(): void {
    const ev = Phaser.Input.Events;
    this.scene.input.off(ev.DRAG_START, this.onDragStart, this);
    this.scene.input.off(ev.DRAG, this.onDrag, this);
    this.scene.input.off(ev.DRAG_END, this.onDragEnd, this);
    this.scene.input.off(ev.GAMEOBJECT_POINTER_UP, this.onPointerUp, this);
  }

  private onDragStart(
    _pointer: Phaser.Input.Pointer,
    go: Phaser.GameObjects.GameObject
  ): void {
    if (!(go instanceof CardSprite)) return;
    this.group = this.host.runSprites(go.ref, go.pileIndex);
    if (!this.group.includes(go)) this.group = [go];
    this.offsets = this.group.map((s) => ({ x: s.x - go.x, y: s.y - go.y }));
    this.host.setDragging(
      this.group.map((s) => s.cardId),
      true
    );
    this.group.forEach((s, i) => s.setDepth(1000 + i));
  }

  private onDrag(
    _pointer: Phaser.Input.Pointer,
    go: Phaser.GameObjects.GameObject,
    dragX: number,
    dragY: number
  ): void {
    if (!(go instanceof CardSprite) || this.group.length === 0) return;
    this.group.forEach((s, i) =>
      s.setPosition(dragX + this.offsets[i].x, dragY + this.offsets[i].y)
    );
  }

  private onDragEnd(
    pointer: Phaser.Input.Pointer,
    go: Phaser.GameObjects.GameObject
  ): void {
    if (!(go instanceof CardSprite) || this.group.length === 0) return;
    const ids = this.group.map((s) => s.cardId);
    const from = go.ref;
    // The drop target is where the pointer was released — go.x/go.y lags by
    // a frame since cards track dragX/dragY inside the DRAG event.
    const target = this.host.pileAt(pointer.x, pointer.y);
    this.host.setDragging(ids, false);
    this.group = [];
    if (target && (target.area !== from.area || target.index !== from.index)) {
      this.host.tryMove({ type: 'move', from, to: target, cardId: go.cardId });
    } else {
      this.host.resync();
    }
  }

  /** Tap detection → double-tap sends a card to a foundation when legal. */
  private onPointerUp(pointer: Phaser.Input.Pointer, go: Phaser.GameObjects.GameObject): void {
    if (!(go instanceof CardSprite)) return;
    if (pointer.getDistance() > TAP_MAX_DIST) return;
    if (pointer.upTime - pointer.downTime > TAP_MAX_MS) return;
    const now = this.scene.time.now;
    if (this.lastTap.id === go.cardId && now - this.lastTap.at < DBL_TAP_MS) {
      this.lastTap = { id: '', at: 0 };
      this.host.tryAutoFoundation(go);
    } else {
      this.lastTap = { id: go.cardId, at: now };
    }
  }
}
