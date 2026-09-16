/**
 * Variant picker. Three large tap-target cards (≥48px) with a mini card
 * motif, variant name, and stats line (wired to real stats in Phase 5).
 * Tapping a card preserves any in-progress game and switches variant.
 */
import Phaser from 'phaser';
import type { VariantId } from '../../engine/types.js';
import { gameStore } from '../../stores/gameStore.svelte.js';

type VariantCard = {
  id: VariantId;
  name: string;
  blurb: string;
  /** Face-card ids used as the decorative mini-preview. */
  preview: [string, string];
};

const VARIANTS: VariantCard[] = [
  { id: 'klondike', name: 'Klondike', blurb: 'The classic', preview: ['s1', 'h13'] },
  { id: 'freecell', name: 'FreeCell', blurb: 'All open, pure skill', preview: ['s12', 'd11'] },
  { id: 'tripeaks', name: 'TriPeaks', blurb: 'Clear the peaks', preview: ['h10', 'c9'] }
];

const MIN_TAP = 48;

export class MenuScene extends Phaser.Scene {
  constructor() {
    super('menu');
  }

  create(): void {
    this.build();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.build, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.build, this);
    });
  }

  /** Full rebuild — cheap (a few dozen objects) and resize-correct. */
  private build(): void {
    this.children.removeAll();

    const w = this.scale.width;
    const h = this.scale.height;
    const portrait = h > w * 1.05;
    const titleSize = Math.min(44, Math.max(30, w * 0.07));

    this.add
      .text(w / 2, portrait ? h * 0.1 : h * 0.14, 'SOLITAIRE', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: `${titleSize}px`,
        fontStyle: '700',
        color: '#f5f7f5',
        letterSpacing: 4
      })
      .setOrigin(0.5);
    this.add
      .text(w / 2, (portrait ? h * 0.1 : h * 0.14) + titleSize * 0.9, 'COLLECTION', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: `${Math.round(titleSize * 0.4)}px`,
        color: 'rgba(255,255,255,0.6)',
        letterSpacing: 8
      })
      .setOrigin(0.5);

    if (portrait) this.buildRows(w, h);
    else this.buildColumns(w, h);
  }

  /** Portrait: three full-width rows stacked. */
  private buildRows(w: number, h: number): void {
    const rowH = Math.max(MIN_TAP, Math.min(120, h * 0.16));
    const gap = Math.max(10, h * 0.02);
    const top = h * 0.24;
    const cardW = Math.min(w - 32, 520);
    VARIANTS.forEach((v, i) => {
      const cy = top + i * (rowH + gap) + rowH / 2;
      this.card(v, w / 2, cy, cardW, rowH, true);
    });
  }

  /** Landscape: three columns. */
  private buildColumns(w: number, h: number): void {
    const gap = Math.max(12, w * 0.03);
    const cardW = Math.min(240, (w - 64 - 2 * gap) / 3);
    const cardH = Math.min(cardW * 1.35, h * 0.55);
    const cy = h * 0.55;
    const total = 3 * cardW + 2 * gap;
    VARIANTS.forEach((v, i) => {
      const cx = w / 2 - total / 2 + cardW / 2 + i * (cardW + gap);
      this.card(v, cx, cy, cardW, cardH, false);
    });
  }

  /** One variant card: panel, mini-preview, name, blurb, stats line. */
  private card(v: VariantCard, cx: number, cy: number, cw: number, ch: number, row: boolean): void {
    const panel = this.add
      .rectangle(cx, cy, cw, ch, 0xffffff, 0.07)
      .setStrokeStyle(1.5, 0xffffff, 0.18)
      .setInteractive({ cursor: 'pointer' });
    // Round corners aren't on Rectangle; the stroke+fill reads as a card.

    const mini = Math.min(row ? ch * 0.52 : cw * 0.3, 90);
    const fanY = row ? cy : cy - ch * 0.22;
    const fanX = row ? cx - cw / 2 + mini * 0.9 : cx;
    const back = this.add.image(fanX - mini * 0.16, fanY, 'card-back');
    const face = this.add.image(fanX + mini * 0.16, fanY, `card-${v.preview[0]}`);
    back.setDisplaySize(mini, mini * 1.4).setAngle(-7);
    face.setDisplaySize(mini, mini * 1.4).setAngle(7);

    const nameSize = Math.min(24, Math.max(17, mini * 0.34));
    const nameX = row ? fanX + mini * 0.8 : cx;
    const nameY = row ? cy - ch * 0.18 : cy + ch * 0.08;
    this.add
      .text(nameX, nameY, v.name, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: `${nameSize}px`,
        fontStyle: '700',
        color: '#f5f7f5'
      })
      .setOrigin(row ? 0 : 0.5, 0.5);
    this.add
      .text(nameX, nameY + nameSize * 1.15, v.blurb, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: `${Math.max(11, nameSize * 0.6)}px`,
        color: 'rgba(255,255,255,0.55)'
      })
      .setOrigin(row ? 0 : 0.5, 0.5);

    // Stats line — real values land in Phase 5; placeholders until then.
    this.add
      .text(nameX, nameY + nameSize * 2.15, 'Best — · Win rate —', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: `${Math.max(10, nameSize * 0.55)}px`,
        color: 'rgba(255,255,255,0.4)'
      })
      .setOrigin(row ? 0 : 0.5, 0.5);

    // In-progress indicator: suspended slot or the live game itself.
    const live = gameStore.state;
    const inProgress =
      (live.variant === v.id && live.status === 'playing' && live.moves.length > 0) ||
      gameStore.hasSaved(v.id);
    if (inProgress) {
      this.add
        .text(cx + cw / 2 - 12, cy - ch / 2 + 14, 'CONTINUE', {
          fontFamily: 'system-ui, sans-serif',
          fontSize: '10px',
          fontStyle: '700',
          color: '#0b3d2e',
          backgroundColor: '#ffd166',
          padding: { x: 6, y: 3 }
        })
        .setOrigin(1, 0);
    }

    panel.on('pointerdown', () => {
      panel.setFillStyle(0xffffff, 0.14);
      this.time.delayedCall(90, () => gameStore.selectVariant(v.id));
    });
  }
}
