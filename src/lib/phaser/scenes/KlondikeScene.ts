/**
 * Klondike board scene. Renders canonical `KlondikeState` from gameStore
 * and dispatches `Move`s on interaction — it never mutates state itself.
 * Every committed change arrives via `gameStore.subscribe` and is applied
 * as a position/texture diff with a 150ms ease-out place tween.
 */
import Phaser from 'phaser';
import type { Card, GameState, KlondikeState, Move, PileRef } from '../../engine/types.js';
import { gameStore } from '../../stores/gameStore.svelte.js';
import { computeLayout, type BoardLayout } from '../layout.js';
import { CardSprite } from '../objects/CardSprite.js';
import { Pile } from '../objects/Pile.js';
import { DragController, type DragHost } from '../objects/DragController.js';
import { playSfx } from '../sfx.js';

/** Where one card should end up after a sync. */
type Target = {
  card: Card;
  ref: PileRef;
  pileIndex: number;
  x: number;
  y: number;
  depth: number;
};

const PLACE_MS = 150;

export class KlondikeScene extends Phaser.Scene implements DragHost {
  private sprites = new Map<string, CardSprite>();
  private piles: Pile[] = [];
  private layout!: BoardLayout;
  private current?: KlondikeState;
  private dragIds = new Set<string>();
  private dragCtl?: DragController;
  private stockZone?: Phaser.GameObjects.Zone;
  private unsub?: () => void;

  constructor() {
    super('klondike');
  }

  create(): void {
    this.input.dragDistanceThreshold = 6;
    this.dragCtl = new DragController(this, this);
    this.rebuildLayout();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.rebuildLayout, this);
    this.unsub = gameStore.subscribe((s) => this.onState(s));
    this.onState(gameStore.state);
    if (gameStore.state.variant !== 'klondike') gameStore.newGame('klondike');
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.dispose());
  }

  // ---- DragHost ----

  /** The grabbed card plus every card on top of it (a tableau run). */
  runSprites(ref: PileRef, pileIndex: number): CardSprite[] {
    const pile = this.pileCards(ref);
    if (!pile) return [];
    return pile
      .slice(pileIndex)
      .map((c) => this.sprites.get(c.id))
      .filter((s): s is CardSprite => !!s);
  }

  pileAt(x: number, y: number): PileRef | undefined {
    return this.layout.zones.find((z) => z.rect.contains(x, y))?.ref;
  }

  tryMove(move: Move): void {
    const ok = gameStore.dispatchMove(move);
    playSfx(ok ? 'place' : 'invalid');
    this.resync();
  }

  tryAutoFoundation(sprite: CardSprite): void {
    const move = gameStore
      .legalMoves()
      .find(
        (m) => m.type === 'move' && m.cardId === sprite.cardId && m.to.area === 'foundation'
      );
    if (move) this.tryMove(move);
  }

  resync(): void {
    if (this.current) this.syncState(this.current);
  }

  setDragging(ids: string[], on: boolean): void {
    for (const id of ids) {
      if (on) this.dragIds.add(id);
      else this.dragIds.delete(id);
    }
  }

  // ---- internals ----

  private onState(s: GameState): void {
    if (s.variant !== 'klondike') return;
    this.current = s;
    this.syncState(s);
    if (s.status === 'won') playSfx('win');
  }

  private pileCards(ref: PileRef): Card[] | undefined {
    const s = this.current;
    if (!s) return undefined;
    switch (ref.area) {
      case 'stock':
        return s.stock;
      case 'waste':
        return s.waste;
      case 'foundation':
        return s.foundations[ref.index];
      case 'tableau':
        return s.tableau[ref.index];
      default:
        return undefined;
    }
  }

  /** Recompute geometry + slot outlines after canvas resize. */
  private rebuildLayout(): void {
    this.layout = computeLayout(this.scale.width, this.scale.height);
    for (const p of this.piles) p.dispose();
    this.piles = this.layout.zones.map(
      (z) => new Pile(this, z.ref, z.rect, z.anchor, this.layout.cardW, this.layout.cardH)
    );
    if (this.stockZone) this.stockZone.destroy();
    const stockRect = this.layout.zones[0].rect;
    this.stockZone = this.add
      .zone(stockRect.centerX, stockRect.centerY, stockRect.width, stockRect.height)
      .setInteractive({ cursor: 'pointer' })
      .on('pointerdown', () => {
        playSfx('draw');
        this.tryMove({ type: 'draw' });
      });
    if (this.current) this.syncState(this.current);
  }

  /** Flatten state into per-card render targets (position + depth). */
  private computeTargets(s: KlondikeState): Target[] {
    const L = this.layout;
    const out: Target[] = [];
    const emit = (card: Card, ref: PileRef, pileIndex: number, x: number, y: number, depth: number): void => {
      out.push({ card, ref, pileIndex, x, y, depth });
    };

    s.stock.forEach((c, i) => emit(c, { area: 'stock', index: 0 }, i, L.stock.x, L.stock.y, i));
    s.waste.forEach((c, i) => emit(c, { area: 'waste', index: 0 }, i, L.waste.x, L.waste.y, 100 + i));
    s.foundations.forEach((f, fi) =>
      f.forEach((c, i) =>
        emit(c, { area: 'foundation', index: fi }, i, L.foundations[fi].x, L.foundations[fi].y, 200 + fi * 20 + i)
      )
    );
    s.tableau.forEach((col, ci) => {
      let need = L.cardH;
      for (let i = 1; i < col.length; i++) need += col[i - 1].faceUp ? L.upGap : L.downGap;
      const avail = this.scale.height - L.tableauTop - L.cardH - L.bottomPad;
      const k = need > L.cardH ? Math.max(0.15, Math.min(1, (avail - L.cardH) / (need - L.cardH))) : 1;
      let y = L.tableauTop + L.cardH / 2;
      col.forEach((c, i) => {
        if (i > 0) y += (col[i - 1].faceUp ? L.upGap : L.downGap) * k;
        emit(c, { area: 'tableau', index: ci }, i, L.tableauX[ci], y, 300 + ci * 40 + i);
      });
    });
    return out;
  }

  /** Which cards the player may grab in this position. */
  private isDraggable(t: Target, s: KlondikeState): boolean {
    switch (t.ref.area) {
      case 'tableau':
        return t.card.faceUp;
      case 'waste':
        return t.pileIndex === s.waste.length - 1;
      case 'foundation':
        return t.pileIndex === s.foundations[t.ref.index].length - 1;
      default:
        return false;
    }
  }

  /** Diff canonical state onto sprites: create, rebind, tween to targets. */
  private syncState(s: KlondikeState): void {
    for (const t of this.computeTargets(s)) {
      let spr = this.sprites.get(t.card.id);
      if (!spr) {
        spr = new CardSprite(this);
        this.sprites.set(t.card.id, spr);
      }
      spr.bind(t.card, t.ref, t.pileIndex);
      spr.setDisplaySize(this.layout.cardW, this.layout.cardH);
      if (!this.dragIds.has(t.card.id)) {
        if (!spr.placed) {
          spr.setPosition(t.x, t.y);
          spr.placed = true;
        } else if (Math.abs(spr.x - t.x) > 0.5 || Math.abs(spr.y - t.y) > 0.5) {
          this.tweens.killTweensOf(spr);
          this.tweens.add({ targets: spr, x: t.x, y: t.y, duration: PLACE_MS, ease: 'Cubic.easeOut' });
        }
        spr.setDepth(t.depth);
      }
      spr.setDraggable(this.isDraggable(t, s));
    }
  }

  private dispose(): void {
    this.unsub?.();
    this.dragCtl?.destroy();
    this.scale.off(Phaser.Scale.Events.RESIZE, this.rebuildLayout, this);
  }
}
