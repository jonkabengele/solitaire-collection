/**
 * FreeCell board scene. All 52 cards face-up: 4 free cells and 4
 * foundations on the top row (compact slots), 7 fat cascades below.
 * A tableau card is
 * grabbable only when the run from it downward is a valid descending
 * alternating sequence; capacity is the engine's call on drop.
 */
import Phaser from 'phaser';
import type { Card, FreeCellState, GameState, Move, PileRef } from '../../engine/types.js';
import { gameStore } from '../../stores/gameStore.svelte.js';
import { computeFreeCellLayout, type FreeCellLayout } from '../freecellLayout.js';
import { CardSprite } from '../objects/CardSprite.js';
import { Pile } from '../objects/Pile.js';
import { DragController, type DragHost } from '../objects/DragController.js';
import { syncSprites, shakeCard, type Target } from '../objects/spriteSync.js';
import { SwipeController } from '../objects/SwipeController.js';
import { hintFx, type HintRect } from '../objects/hintFx.js';
import { bindSfx, playSfx } from '../sfx.js';
import { haptic } from '../haptics.js';

const isRed = (c: Card): boolean => c.suit === 'hearts' || c.suit === 'diamonds';

/** Whether `col` from `pileIndex` down forms a movable run (display concern). */
function isValidRun(col: readonly Card[], pileIndex: number): boolean {
  for (let i = pileIndex + 1; i < col.length; i++) {
    const prev = col[i - 1];
    const c = col[i];
    if (prev.rank !== c.rank + 1 || isRed(prev) === isRed(c)) return false;
  }
  return true;
}

export class FreeCellScene extends Phaser.Scene implements DragHost {
  private sprites = new Map<string, CardSprite>();
  private piles: Pile[] = [];
  private layout!: FreeCellLayout;
  private current?: FreeCellState;
  private dragIds = new Set<string>();
  private dragCtl?: DragController;
  private swipeCtl?: SwipeController;
  private unsub?: () => void;
  private unsubHint?: () => void;
  private dealtSeed?: string;

  constructor() {
    super('freecell');
  }

  create(): void {
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
    if (gameStore.state.variant !== 'freecell') gameStore.newGame('freecell');
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.dispose());
  }

  // ---- DragHost ----

  /** The grabbed card plus every card on top of it (a cascade run). */
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
    if (s.variant !== 'freecell') return;
    this.current = s;
    this.syncState(s);
    if (s.status === 'won') {
      playSfx('win');
      haptic('win');
    }
  }

  private pileCards(ref: PileRef): readonly Card[] | undefined {
    const s = this.current;
    if (!s) return undefined;
    switch (ref.area) {
      case 'cell': {
        const c = s.cells[ref.index];
        return c ? [c] : [];
      }
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
    this.layout = computeFreeCellLayout(this.scale.width, this.scale.height);
    for (const p of this.piles) p.dispose();
    this.piles = this.layout.zones.map((z) => {
      const isSlot = z.ref.area === 'cell' || z.ref.area === 'foundation';
      const w = isSlot ? this.layout.slotW : this.layout.cardW;
      const h = isSlot ? this.layout.slotH : this.layout.cardH;
      return new Pile(this, z.ref, z.rect, z.anchor, w, h);
    });
    if (this.current) this.syncState(this.current);
  }

  /** Flatten state into per-card render targets (position + depth). */
  private computeTargets(s: FreeCellState): Target[] {
    const L = this.layout;
    const out: Target[] = [];

    s.cells.forEach((c, ci) => {
      if (!c) return;
      out.push({
        card: c,
        ref: { area: 'cell', index: ci },
        pileIndex: 0,
        x: L.cells[ci].x,
        y: L.cells[ci].y,
        depth: 100 + ci,
        interactive: 'drag' as const
      });
    });
    s.foundations.forEach((f, fi) =>
      f.forEach((c, i) =>
        out.push({
          card: c,
          ref: { area: 'foundation', index: fi },
          pileIndex: i,
          x: L.foundations[fi].x,
          y: L.foundations[fi].y,
          depth: 200 + fi * 20 + i,
          interactive: 'none' as const // foundations are one-way in FreeCell
        })
      )
    );
    s.tableau.forEach((col, ci) => {
      const need = L.cardH + (col.length - 1) * L.upGap;
      const avail = this.scale.height - L.tableauTop - L.cardH - L.bottomPad;
      const k = col.length > 1 ? Math.max(0.2, Math.min(1, (avail - L.cardH) / (need - L.cardH))) : 1;
      col.forEach((c, i) => {
        out.push({
          card: c,
          ref: { area: 'tableau', index: ci },
          pileIndex: i,
          x: L.tableauX[ci],
          y: L.tableauTop + L.cardH / 2 + i * L.upGap * k,
          depth: 300 + ci * 40 + i,
          interactive: isValidRun(col, i) ? ('drag' as const) : ('none' as const),
          dealOrder: i * 7 + ci
        });
      });
    });
    return out;
  }

  /** Highlight the hinted move's source card and target zone for ~2s. */
  private showHint(m: Move | null): void {
    if (!m || m.type !== 'move' || !this.current) return;
    const rects: HintRect[] = [];
    const { cardW, cardH } = this.layout;
    const spr = this.sprites.get(m.cardId);
    if (spr) rects.push({ x: spr.x, y: spr.y, w: cardW, h: cardH });
    const zone = this.layout.zones.find(
      (z) => z.ref.area === m.to.area && z.ref.index === m.to.index
    );
    if (zone) rects.push({ x: zone.anchor.x, y: zone.anchor.y, w: cardW, h: cardH });
    hintFx(this, rects);
  }

  private syncState(s: FreeCellState): void {
    // FreeCell has no stock — dealt cards rain in from above the board.
    const deal =
      s.seed !== this.dealtSeed
        ? { x: this.scale.width / 2, y: -this.layout.cardH }
        : null;
    this.dealtSeed = s.seed;
    if (deal) playSfx('shuffle');
    syncSprites(this, this.sprites, this.computeTargets(s), this.dragIds, deal);
    for (const spr of this.sprites.values()) {
      const isSlot = spr.ref.area === 'cell' || spr.ref.area === 'foundation';
      spr.setDisplaySize(
        isSlot ? this.layout.slotW : this.layout.cardW,
        isSlot ? this.layout.slotH : this.layout.cardH
      );
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
