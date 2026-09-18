/**
 * Pyramid board scene. Tap-driven like TriPeaks: tapping an exposed card
 * (or the waste top) either completes a pending selection, plays its only
 * partner move, clears a lone King, or selects it and pulses its pairing
 * candidates so a second tap finishes the pair. No drag — pairing is a
 * two-tap gesture, matching the variant's feel.
 */
import Phaser from 'phaser';
import type { Card, GameState, Move, PileRef, PyramidState } from '../../engine/types.js';
import { gameStore } from '../../stores/gameStore.svelte.js';
import { computePyramidLayout, type PyramidLayout } from '../pyramidLayout.js';
import { CardSprite } from '../objects/CardSprite.js';
import { Pile } from '../objects/Pile.js';
import { syncSprites, shakeCard, type Target } from '../objects/spriteSync.js';
import { SwipeController } from '../objects/SwipeController.js';
import { hintFx, type HintRect } from '../objects/hintFx.js';
import { winFx } from '../objects/winFx.js';
import { bindSfx, playSfx } from '../sfx.js';
import { haptic } from '../haptics.js';

const SELECTED_TINT = 0xffb84d;
const PARTNER_TINT = 0xffe28a;

const sameRef = (a: PileRef, b: PileRef): boolean => a.area === b.area && a.index === b.index;

export class PyramidScene extends Phaser.Scene {
  private sprites = new Map<string, CardSprite>();
  private piles: Pile[] = [];
  private layout!: PyramidLayout;
  private current?: PyramidState;
  private stockZone?: Phaser.GameObjects.Zone;
  private swipeCtl?: SwipeController;
  private unsub?: () => void;
  private unsubHint?: () => void;
  private dealtSeed?: string;
  private flourishing = false;
  private winCancel?: () => void;
  /** Card awaiting a partner pick (tinted). */
  private sel?: CardSprite;
  private selPartners: CardSprite[] = [];

  constructor() {
    super('pyramid');
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
    if (gameStore.state.variant !== 'pyramid') gameStore.newGame('pyramid');
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.dispose());
  }

  // ---- internals ----

  private onState(s: GameState): void {
    if (s.variant !== 'pyramid') return;
    this.current = s;
    if (this.flourishing && s.status !== 'won') {
      this.winCancel?.();
      return; // the flourish's onDone resyncs with the latest state
    }
    this.syncState(s);
    if (s.status === 'won' && !this.flourishing && !gameStore.replaying) {
      playSfx('win');
      haptic('win');
      this.flourishing = true;
      this.winCancel = winFx(this, [...this.sprites.values()], () => {
        this.flourishing = false;
        this.winCancel = undefined;
        if (this.sys.isActive() && this.current) this.syncState(this.current);
      });
    }
  }

  /** Recompute geometry + bottom-row slot outlines after canvas resize. */
  private rebuildLayout(): void {
    this.layout = computePyramidLayout(this.scale.width, this.scale.height);
    for (const p of this.piles) p.dispose();
    this.piles = [];
    const { cardW, cardH, stock, waste, removed } = this.layout;
    const mkRect = (p: { x: number; y: number }): Phaser.Geom.Rectangle =>
      new Phaser.Geom.Rectangle(p.x - cardW / 2, p.y - cardH / 2, cardW, cardH);
    this.piles.push(new Pile(this, { area: 'stock', index: 0 }, mkRect(stock), stock, cardW, cardH));
    this.piles.push(new Pile(this, { area: 'foundation', index: 0 }, mkRect(removed), removed, cardW, cardH));
    this.piles.push(new Pile(this, { area: 'waste', index: 0 }, mkRect(waste), waste, cardW, cardH));
    if (this.stockZone) this.stockZone.destroy();
    this.stockZone = this.add
      .zone(stock.x, stock.y, cardW, cardH)
      .setInteractive({ cursor: 'pointer' })
      .on('pointerdown', () => this.tryDraw());
    if (this.current) this.syncState(this.current);
  }

  private lastDrawAt = 0;

  private tryDraw(): void {
    const s = this.current;
    if (!s || s.stock.length === 0 || this.flourishing) return;
    // Dedup touch + emulated-mouse double pointerdown — one tap, one draw.
    const now = this.time.now;
    if (now - this.lastDrawAt < 350) return;
    this.lastDrawAt = now;
    this.clearSel();
    const ok = gameStore.dispatchMove({ type: 'draw' });
    playSfx(ok ? 'draw' : 'invalid');
    haptic(ok ? 'draw' : 'invalid');
  }

  /** Locate the canonical card behind a sprite (tableau or waste). */
  private cardFor(spr: CardSprite): Card | null {
    const s = this.current;
    if (!s) return null;
    if (spr.ref.area === 'waste') return s.waste[s.waste.length - 1] ?? null;
    if (spr.ref.area === 'tableau') return s.tableau[spr.ref.index] ?? null;
    return null;
  }

  /** The legal pair move between two endpoints, in either direction. */
  private findPairMove(a: CardSprite, b: CardSprite): Move | undefined {
    return gameStore.legalMoves().find(
      (m) =>
        m.type === 'move' &&
        m.to.area !== 'foundation' &&
        ((sameRef(m.from, a.ref) && sameRef(m.to, b.ref)) ||
          (sameRef(m.from, b.ref) && sameRef(m.to, a.ref)))
    );
  }

  /** Every partner endpoint `spr` can pair with, deduped by pile ref. */
  private partnersFor(spr: CardSprite): { move: Move; partner: PileRef }[] {
    const out: { move: Move; partner: PileRef }[] = [];
    const seen = new Set<string>();
    for (const m of gameStore.legalMoves()) {
      if (m.type !== 'move' || m.to.area === 'foundation') continue;
      let partner: PileRef | null = null;
      if (sameRef(m.from, spr.ref)) partner = m.to;
      else if (sameRef(m.to, spr.ref)) partner = m.from;
      if (!partner) continue;
      const key = `${partner.area}:${partner.index}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ move: m, partner });
    }
    return out;
  }

  private dispatch(m: Move): void {
    const ok = gameStore.dispatchMove(m);
    playSfx(ok ? 'place' : 'invalid');
    haptic(ok ? 'place' : 'invalid');
  }

  private clearSel(): void {
    this.sel?.clearTint();
    for (const p of this.selPartners) p.clearTint();
    this.sel = undefined;
    this.selPartners = [];
  }

  /**
   * Tap an exposed card: complete a pending pair, auto-play the only
   * option, drop a lone King, or select + pulse its pairing candidates.
   */
  private tryTap(spr: CardSprite): void {
    const s = this.current;
    if (!s || this.flourishing) return;
    const card = this.cardFor(spr);
    if (!card || card.id !== spr.cardId) return;

    // Second tap completes a pending selection when it pairs.
    if (this.sel && this.sel !== spr) {
      const pairMove = this.findPairMove(this.sel, spr);
      this.clearSel();
      if (pairMove) {
        this.dispatch(pairMove);
        return;
      }
      // Didn't pair — fall through and treat as a fresh selection.
    }
    if (this.sel === spr) {
      this.clearSel();
      return; // tap the selected card again = deselect
    }

    if (card.rank === 13) {
      this.dispatch({
        type: 'move',
        from: spr.ref,
        to: { area: 'foundation', index: 0 },
        cardId: spr.cardId
      });
      return;
    }

    const partners = this.partnersFor(spr);
    if (partners.length === 1) {
      this.dispatch(partners[0].move);
      return;
    }
    if (partners.length === 0) {
      shakeCard(this, spr);
      playSfx('invalid');
      haptic('invalid');
      const rects: HintRect[] = [];
      for (const id of gameStore.movableCardIds()) {
        const other = this.sprites.get(id);
        if (other) rects.push({ x: other.x, y: other.y, w: this.layout.cardW, h: this.layout.cardH });
      }
      if (rects.length > 0) hintFx(this, rects);
      return;
    }

    // Multiple partners: select and tint the candidates — second tap picks.
    this.clearSel();
    this.sel = spr;
    spr.setTint(SELECTED_TINT);
    const rects: HintRect[] = [];
    for (const p of partners) {
      const pspr = this.spriteAt(p.partner);
      if (!pspr) continue;
      pspr.setTint(PARTNER_TINT);
      this.selPartners.push(pspr);
      rects.push({ x: pspr.x, y: pspr.y, w: this.layout.cardW, h: this.layout.cardH });
    }
    if (rects.length > 0) hintFx(this, rects);
  }

  /** Sprite currently sitting at a pile ref (waste = top card only). */
  private spriteAt(ref: PileRef): CardSprite | undefined {
    const s = this.current;
    if (!s) return undefined;
    if (ref.area === 'waste') return this.sprites.get(s.waste[s.waste.length - 1]?.id ?? '');
    if (ref.area === 'tableau') return this.sprites.get(s.tableau[ref.index]?.id ?? '');
    return undefined;
  }

  /** Flatten state into per-card render targets. */
  private computeTargets(s: PyramidState): Target[] {
    const L = this.layout;
    const out: Target[] = [];

    s.tableau.forEach((c, i) => {
      if (!c) return;
      const p = L.pos[i];
      out.push({
        card: c,
        ref: { area: 'tableau', index: i },
        pileIndex: i,
        x: p.x,
        y: p.y,
        depth: i,
        interactive: 'tap',
        dealOrder: i
      });
    });
    s.stock.forEach((c, i) =>
      out.push({
        card: c,
        ref: { area: 'stock', index: 0 },
        pileIndex: i,
        x: L.stock.x - Math.min(i, 4),
        y: L.stock.y - Math.min(i, 4) * 0.6,
        depth: 200 + i,
        interactive: 'none'
      })
    );
    // Waste stack: only the top card is playable — fan slightly so the
    // pile reads as a stack, top card tappable.
    s.waste.forEach((c, i) => {
      const isTop = i === s.waste.length - 1;
      out.push({
        card: c,
        ref: { area: 'waste', index: 0 },
        pileIndex: i,
        x: L.waste.x - (s.waste.length - 1 - i) * L.cardW * 0.08,
        y: L.waste.y,
        depth: 300 + i,
        interactive: isTop ? 'tap' : 'none',
        dealOrder: 29 + i
      });
    });
    return out;
  }

  /** Highlight the hinted move's endpoints, or the stock for a draw. */
  private showHint(m: Move | null): void {
    if (!m || !this.current) return;
    const rects: HintRect[] = [];
    const { cardW, cardH } = this.layout;
    if (m.type === 'draw') {
      rects.push({ x: this.layout.stock.x, y: this.layout.stock.y, w: cardW, h: cardH });
    } else {
      const src = this.spriteAt(m.from) ?? this.sprites.get(m.cardId);
      const dst = this.spriteAt(m.to);
      for (const spr of [src, dst]) {
        if (spr) rects.push({ x: spr.x, y: spr.y, w: cardW, h: cardH });
      }
      if (m.to.area === 'foundation' && !dst) {
        rects.push({ x: this.layout.removed.x, y: this.layout.removed.y, w: cardW, h: cardH });
      }
    }
    hintFx(this, rects);
  }

  private syncState(s: PyramidState): void {
    this.clearSel();
    const targets = this.computeTargets(s);
    const deal =
      s.seed !== this.dealtSeed ? { x: this.layout.stock.x, y: this.layout.stock.y } : null;
    this.dealtSeed = s.seed;
    if (deal) playSfx('shuffle');
    syncSprites(this, this.sprites, targets, new Set(), deal);
    for (const t of targets) {
      const spr = this.sprites.get(t.card.id);
      if (!spr) continue;
      spr.setDisplaySize(this.layout.cardW, this.layout.cardH);
      if (t.interactive === 'tap') spr.onTap = (sp) => this.tryTap(sp);
      else spr.onTap = undefined;
    }
  }

  private dispose(): void {
    this.winCancel?.();
    this.unsub?.();
    this.unsubHint?.();
    this.swipeCtl?.destroy();
    this.scale.off(Phaser.Scale.Events.RESIZE, this.rebuildLayout, this);
  }
}
