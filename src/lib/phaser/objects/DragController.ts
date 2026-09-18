/**
 * Unified mouse/touch drag handling for card sprites (spec §5.1:
 * "identical on desktop and mobile"). Knows nothing about rules — it
 * asks the host scene for the dragged run and the pile under the drop
 * point, then hands a `Move` to the host for dispatch.
 */
import Phaser from 'phaser';
import type { Move, PileRef } from '../../engine/types.js';
import { CardSprite } from './CardSprite.js';
import { haptic } from '../haptics.js';

/** What a scene must provide for DragController to work. */
export interface DragHost {
  /** Sprites that move together when `pileIndex` of `ref` is grabbed (the run above it). */
  runSprites(ref: PileRef, pileIndex: number): CardSprite[];
  /** Pile under a board point, if any. */
  pileAt(x: number, y: number): PileRef | undefined;
  /** Dispatch a move; the host resyncs sprites either way (snap-back on reject). */
  tryMove(move: Move): void;
  /** Attempt the best safe auto-move for `sprite`'s card on a quick tap. */
  tryAutoMove(sprite: CardSprite): void;
  /** Reposition every sprite to canonical state. */
  resync(): void;
  /** Mark card ids mid-drag so state syncs skip them. */
  setDragging(ids: string[], on: boolean): void;
}

const TAP_MAX_DIST = 12;
const TAP_MAX_MS = 400;
/**
 * Ignore a second "tap" arriving this soon after the last one on the same
 * card — mobile browsers can surface a single touch as both a touch and
 * an emulated-mouse pointer event, which would fire the tap twice.
 */
const TAP_DEDUP_MS = 350;

export class DragController {
  private group: CardSprite[] = [];
  private offsets: { x: number; y: number }[] = [];
  private lastTapAt = 0;
  private lastTapGo: CardSprite | null = null;

  /**
   * Phaser listens on `window` (windowEvents), so pointer events that land
   * on DOM overlays (modals, HUD) reach the scene too. Only events whose
   * DOM target is the canvas itself count as board input — everything
   * else belongs to the overlay and must be ignored here.
   */
  private onCanvas(pointer: Phaser.Input.Pointer): boolean {
    const target = pointer.event?.target;
    const canvas = this.scene.game.canvas;
    return !target || target === canvas;
  }

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly host: DragHost
  ) {
    const ev = Phaser.Input.Events;
    scene.input.on(ev.DRAG_START, this.onDragStart, this);
    scene.input.on(ev.DRAG, this.onDrag, this);
    scene.input.on(ev.DRAG_END, this.onDragEnd, this);
    // Phaser 4: the gameobject-level pointer-up event is GAMEOBJECT_UP
    // ('gameobjectup'); the v3 name GAMEOBJECT_POINTER_UP doesn't exist.
    scene.input.on(ev.GAMEOBJECT_UP, this.onPointerUp, this);
  }

  /** Detach all listeners (scene shutdown). */
  destroy(): void {
    const ev = Phaser.Input.Events;
    this.scene.input.off(ev.DRAG_START, this.onDragStart, this);
    this.scene.input.off(ev.DRAG, this.onDrag, this);
    this.scene.input.off(ev.DRAG_END, this.onDragEnd, this);
    this.scene.input.off(ev.GAMEOBJECT_UP, this.onPointerUp, this);
  }

  private onDragStart(
    pointer: Phaser.Input.Pointer,
    go: Phaser.GameObjects.GameObject
  ): void {
    if (!(go instanceof CardSprite)) return;
    if (!this.onCanvas(pointer)) return;
    // A card still tweening to its pile isn't grabbable — it can look like
    // it's under the pointer (e.g. a freshly drawn card hasn't left the
    // stock yet) but its position is transitional, not real.
    if (go.moveTween) return;
    haptic('pickup');
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

  /** Tap detection → a quick tap auto-plays the card's best safe move. */
  private onPointerUp(pointer: Phaser.Input.Pointer, go: Phaser.GameObjects.GameObject): void {
    if (!(go instanceof CardSprite)) return;
    if (!this.onCanvas(pointer)) return;
    // A covered card is never playable — taps on it must do nothing, so a
    // stock/facedown hit can never read as an auto-play.
    if (!go.faceUp) return;
    if (pointer.getDistance() > TAP_MAX_DIST) return;
    if (pointer.upTime - pointer.downTime > TAP_MAX_MS) return;
    // Emulated-mouse duplicates: same card, near-same moment → ignore.
    const now = this.scene.time.now;
    if (go === this.lastTapGo && now - this.lastTapAt < TAP_DEDUP_MS) return;
    this.lastTapAt = now;
    this.lastTapGo = go;
    this.host.tryAutoMove(go);
  }
}
