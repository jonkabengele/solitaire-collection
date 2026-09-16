/**
 * Shared state→sprite diff used by every board scene. Each scene computes
 * a flat `Target[]` (position, depth, interactivity) from canonical state;
 * `syncSprites` creates/rebinds `CardSprite`s and tweens moved cards.
 */
import Phaser from 'phaser';
import type { Card, PileRef } from '../../engine/types.js';
import { CardSprite } from './CardSprite.js';

/** How the pointer may interact with a card. */
export type Interactivity = 'drag' | 'tap' | 'none';

/** Where one card should end up after a sync. */
export type Target = {
  card: Card;
  ref: PileRef;
  pileIndex: number;
  x: number;
  y: number;
  depth: number;
  interactive: Interactivity;
};

export const PLACE_MS = 150;

/**
 * Diff `targets` onto the sprite map: new cards are placed instantly on
 * first bind, moved cards tween to position, mid-drag cards are skipped.
 * Interactivity follows the target each sync.
 */
export function syncSprites(
  scene: Phaser.Scene,
  sprites: Map<string, CardSprite>,
  targets: Target[],
  dragIds: Set<string>
): void {
  for (const t of targets) {
    let spr = sprites.get(t.card.id);
    if (!spr) {
      spr = new CardSprite(scene);
      sprites.set(t.card.id, spr);
    }
    spr.bind(t.card, t.ref, t.pileIndex);
    if (!dragIds.has(t.card.id)) {
      if (!spr.placed) {
        spr.setPosition(t.x, t.y);
        spr.placed = true;
      } else if (Math.abs(spr.x - t.x) > 0.5 || Math.abs(spr.y - t.y) > 0.5) {
        scene.tweens.killTweensOf(spr);
        scene.tweens.add({ targets: spr, x: t.x, y: t.y, duration: PLACE_MS, ease: 'Cubic.easeOut' });
      }
      spr.setDepth(t.depth);
    }
    if (t.interactive === 'drag') spr.setDraggable(true);
    else if (t.interactive === 'tap') spr.setTappable(true);
    else spr.setDraggable(false); // disables input entirely when present
  }
}
