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
import { syncSprites, shakeCard, type Target } from '../objects/spriteSync.js';
import { SwipeController } from '../objects/SwipeController.js';
import { hintFx, type HintRect } from '../objects/hintFx.js';
import { bindSfx, playSfx } from '../sfx.js';
import { haptic } from '../haptics.js';

export class KlondikeScene extends Phaser.Scene implements DragHost {
  private sprites = new Map<string, CardSprite>();
  private piles: Pile[] = [];
  private layout!: BoardLayout;
  private current?: KlondikeState;
  private dragIds = new Set<string>();
  private dragCtl?: DragController;
  private swipeCtl?: SwipeController;
  private stockZone?: Phaser.GameObjects.Zone;
  private unsub?: () => void;
  private unsubHint?: () => void;
  private dealtSeed?: string;

  constructor() {
    super('klondike');
  }

  create(): void {
    // Restart-safe: scene instances persist across scene.start().
    for (const s of this.sprites.values()) s.destroy();
    this.sprites.clear();
    this.dragIds.clear();
    this.current = undefined;
    this.input.dragDistanceThreshold = 6;
    this.dragCtl = new DragController(this, this);
    this.swipeCtl = new SwipeController(this, {
      onUndo: () => gameStore.undo(),
      onRedo: () => gameStore.redo()
    });
    bindSfx(this);
    this.rebuildLayout();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.rebuildLayout, this);
    this.unsub = gameStore.subscribe((s) => this.onState(s));
    this.unsubHint = gameStore.onHint((m) => this.showHint(m));
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
    haptic(ok ? 'place' : 'invalid');
    this.resync();
  }

  tryAutoFoundation(sprite: CardSprite): void {
    const move = gameStore
      .legalMoves()
      .find(
        (m) => m.type === 'move' && m.cardId === sprite.cardId && m.to.area === 'foundation'
      );
    if (move) this.tryMove(move);
    else shakeCard(this, sprite);
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
    if (s.status === 'won') {
      playSfx('win');
      haptic('win');
    }
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
        haptic('draw');
        this.tryMove({ type: 'draw' });
      });
    if (this.current) this.syncState(this.current);
  }

  /** Flatten state into per-card render targets (position + depth). */
  private computeTargets(s: KlondikeState): Target[] {
    const L = this.layout;
    const out: Target[] = [];

    s.stock.forEach((c, i) =>
      out.push({
        card: c,
        ref: { area: 'stock', index: 0 },
        pileIndex: i,
        x: L.stock.x,
        y: L.stock.y,
        depth: i,
        interactive: 'none'
      })
    );
    s.waste.forEach((c, i) =>
      out.push({
        card: c,
        ref: { area: 'waste', index: 0 },
        pileIndex: i,
        x: L.waste.x,
        y: L.waste.y,
        depth: 100 + i,
        interactive: i === s.waste.length - 1 ? 'drag' : 'none'
      })
    );
    s.foundations.forEach((f, fi) =>
      f.forEach((c, i) =>
        out.push({
          card: c,
          ref: { area: 'foundation', index: fi },
          pileIndex: i,
          x: L.foundations[fi].x,
          y: L.foundations[fi].y,
          depth: 200 + fi * 20 + i,
          interactive: i === f.length - 1 ? 'drag' : 'none' // take-backs allowed in Klondike
        })
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
        out.push({
          card: c,
          ref: { area: 'tableau', index: ci },
          pileIndex: i,
          x: L.tableauX[ci],
          y,
          depth: 300 + ci * 40 + i,
          interactive: c.faceUp ? 'drag' : 'none',
          dealOrder: i * 7 + ci // row-major, like a real deal
        });
      });
    });
    return out;
  }

  /** Highlight the hinted move's source card and target zone for ~2s. */
  private showHint(m: Move | null): void {
    if (!m || !this.current) return;
    const rects: HintRect[] = [];
    const { cardW, cardH } = this.layout;
    if (m.type === 'draw') {
      rects.push({ x: this.layout.stock.x, y: this.layout.stock.y, w: cardW, h: cardH });
    } else {
      const spr = this.sprites.get(m.cardId);
      if (spr) rects.push({ x: spr.x, y: spr.y, w: cardW, h: cardH });
      const zone = this.layout.zones.find(
        (z) => z.ref.area === m.to.area && z.ref.index === m.to.index
      );
      if (zone) {
        rects.push({ x: zone.anchor.x, y: zone.anchor.y, w: cardW, h: cardH });
      }
    }
    hintFx(this, rects);
  }

  private syncState(s: KlondikeState): void {
    const deal = s.seed !== this.dealtSeed ? { x: this.layout.stock.x, y: this.layout.stock.y } : null;
    this.dealtSeed = s.seed;
    if (deal) playSfx('shuffle');
    syncSprites(this, this.sprites, this.computeTargets(s), this.dragIds, deal);
    for (const spr of this.sprites.values()) {
      spr.setDisplaySize(this.layout.cardW, this.layout.cardH);
    }
  }

  private dispose(): void {
    this.unsub?.();
    this.unsubHint?.();
    this.dragCtl?.destroy();
    this.swipeCtl?.destroy();
    this.scale.off(Phaser.Scale.Events.RESIZE, this.rebuildLayout, this);
  }
}
