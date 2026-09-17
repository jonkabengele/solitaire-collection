/**
 * TriPeaks board scene. Tap-to-play: tapping an exposed tableau card sends
 * it to the waste when it chains by rank (engine validates); tapping stock
 * draws. Cards that currently chain are tinted gold ("chain highlighting").
 * No drag — the variant is tap-driven per spec.
 */
import Phaser from 'phaser';
import type { GameState, Move, TriPeaksState } from '../../engine/types.js';
import { gameStore } from '../../stores/gameStore.svelte.js';
import {
  computeTriPeaksLayout,
  tripeaksRef,
  tripeaksRow,
  type TriPeaksLayout
} from '../tripeaksLayout.js';
import { CardSprite } from '../objects/CardSprite.js';
import { Pile } from '../objects/Pile.js';
import { syncSprites, shakeCard, type Target } from '../objects/spriteSync.js';
import { SwipeController } from '../objects/SwipeController.js';
import { hintFx, type HintRect } from '../objects/hintFx.js';
import { bindSfx, playSfx } from '../sfx.js';
import { haptic } from '../haptics.js';

const PLAYABLE_TINT = 0xffe28a;

export class TriPeaksScene extends Phaser.Scene {
  private sprites = new Map<string, CardSprite>();
  private piles: Pile[] = [];
  private layout!: TriPeaksLayout;
  private current?: TriPeaksState;
  private stockZone?: Phaser.GameObjects.Zone;
  private swipeCtl?: SwipeController;
  private unsub?: () => void;
  private unsubHint?: () => void;
  private dealtSeed?: string;

  constructor() {
    super('tripeaks');
  }

  create(): void {
    for (const s of this.sprites.values()) s.destroy();
    this.sprites.clear();
    this.current = undefined;
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
    if (gameStore.state.variant !== 'tripeaks') gameStore.newGame('tripeaks');
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.dispose());
  }

  // ---- internals ----

  private onState(s: GameState): void {
    if (s.variant !== 'tripeaks') return;
    this.current = s;
    this.syncState(s);
    if (s.status === 'won') {
      playSfx('win');
      haptic('win');
    }
  }

  /** Recompute geometry + stock/waste slot outlines after canvas resize. */
  private rebuildLayout(): void {
    this.layout = computeTriPeaksLayout(this.scale.width, this.scale.height);
    for (const p of this.piles) p.dispose();
    this.piles = [];
    const { cardW, cardH, stock, waste } = this.layout;
    const mkRect = (p: { x: number; y: number }): Phaser.Geom.Rectangle =>
      new Phaser.Geom.Rectangle(p.x - cardW / 2, p.y - cardH / 2, cardW, cardH);
    this.piles.push(new Pile(this, { area: 'stock', index: 0 }, mkRect(stock), stock, cardW, cardH));
    this.piles.push(new Pile(this, { area: 'waste', index: 0 }, mkRect(waste), waste, cardW, cardH));
    if (this.stockZone) this.stockZone.destroy();
    this.stockZone = this.add
      .zone(stock.x, stock.y, cardW, cardH)
      .setInteractive({ cursor: 'pointer' })
      .on('pointerdown', () => this.tryDraw());
    if (this.current) this.syncState(this.current);
  }

  private tryDraw(): void {
    const s = this.current;
    if (!s || s.stock.length === 0) return;
    const ok = gameStore.dispatchMove({ type: 'draw' });
    playSfx(ok ? 'draw' : 'invalid');
    haptic(ok ? 'draw' : 'invalid');
  }

  /** Tap an exposed tableau card: engine validates the rank chain. */
  private tryTableauTap(spr: CardSprite): void {
    const s = this.current;
    if (!s) return;
    const i = s.tableau.findIndex((c) => c !== null && c.id === spr.cardId);
    if (i < 0) return;
    const ok = gameStore.dispatchMove({
      type: 'move',
      from: tripeaksRef(i),
      to: { area: 'waste', index: 0 },
      cardId: spr.cardId
    });
    playSfx(ok ? 'place' : 'invalid');
    haptic(ok ? 'place' : 'invalid');
    if (!ok) shakeCard(this, spr);
  }

  /** Flatten state into per-card render targets. */
  private computeTargets(s: TriPeaksState): Target[] {
    const L = this.layout;
    const out: Target[] = [];

    s.tableau.forEach((c, i) => {
      if (!c) return;
      const p = L.positions[i];
      out.push({
        card: c,
        ref: tripeaksRef(i),
        pileIndex: i,
        x: p.x,
        y: p.y,
        depth: tripeaksRow(i) * 20,
        interactive: c.faceUp ? 'tap' : 'none', // face-up ⇒ exposed ⇒ tappable
        dealOrder: i
      });
    });
    s.stock.forEach((c, i) =>
      out.push({
        card: c,
        ref: { area: 'stock', index: 0 },
        pileIndex: i,
        x: L.stock.x,
        y: L.stock.y,
        depth: 200 + i,
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
        depth: 300 + i,
        interactive: 'none',
        dealOrder: 29 + i
      })
    );
    return out;
  }

  /** Highlight the hinted move's card, or the stock for a draw hint. */
  private showHint(m: Move | null): void {
    if (!m || !this.current) return;
    const rects: HintRect[] = [];
    const { cardW, cardH } = this.layout;
    if (m.type === 'draw') {
      rects.push({ x: this.layout.stock.x, y: this.layout.stock.y, w: cardW, h: cardH });
    } else {
      const spr = this.sprites.get(m.cardId);
      if (spr) rects.push({ x: spr.x, y: spr.y, w: cardW, h: cardH });
    }
    hintFx(this, rects);
  }

  private syncState(s: TriPeaksState): void {
    const targets = this.computeTargets(s);
    const deal =
      s.seed !== this.dealtSeed ? { x: this.layout.stock.x, y: this.layout.stock.y } : null;
    this.dealtSeed = s.seed;
    if (deal) playSfx('shuffle');
    syncSprites(this, this.sprites, targets, new Set(), deal);
    const playable = new Set(
      gameStore
        .legalMoves()
        .filter((m) => m.type === 'move')
        .map((m) => (m.type === 'move' ? m.cardId : ''))
    );
    for (const t of targets) {
      const spr = this.sprites.get(t.card.id);
      if (!spr) continue;
      spr.setDisplaySize(this.layout.cardW, this.layout.cardH);
      spr.onTap = (sp) => this.tryTableauTap(sp);
      if (playable.has(t.card.id)) spr.setTint(PLAYABLE_TINT);
      else spr.clearTint();
    }
  }

  private dispose(): void {
    this.unsub?.();
    this.unsubHint?.();
    this.swipeCtl?.destroy();
    this.scale.off(Phaser.Scale.Events.RESIZE, this.rebuildLayout, this);
  }
}
