/**
 * Shared state→sprite diff used by every board scene. Each scene computes
 * a flat `Target[]` (position, depth, interactivity) from canonical state;
 * `syncSprites` creates/rebinds `CardSprite`s and tweens moved cards.
 *
 * Motion spec (§Phase 4): Place = 150ms ease-out with slight overshoot
 * (Back, s≈0.5); Deal = cards fly from `dealFrom` staggered 40ms each.
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
  /** Position in the deal sequence (stagger = dealOrder × 40ms). */
  dealOrder?: number;
};

export const PLACE_MS = 150;
const DEAL_MS = 320;
const DEAL_STAGGER = 40;

/** Small horizontal jitter — feedback for a rejected tap/move. */
export function shakeCard(scene: Phaser.Scene, spr: CardSprite): void {
  const x = spr.x;
  scene.tweens.add({
    targets: spr,
    x: x + 5,
    duration: 45,
    yoyo: true,
    repeat: 3,
    onComplete: () => spr.setX(x)
  });
}

/** Deal animation origin — when set, unplaced cards fly in from here. */
export type DealOrigin = { x: number; y: number } | null;

/**
 * Diff `targets` onto the sprite map. Moved cards tween to position;
 * mid-drag cards are skipped; interactivity follows the target each sync.
 */
export function syncSprites(
  scene: Phaser.Scene,
  sprites: Map<string, CardSprite>,
  targets: Target[],
  dragIds: Set<string>,
  dealFrom: DealOrigin = null
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
        spr.placed = true;
        const staticAtOrigin =
          dealFrom && Math.abs(dealFrom.x - t.x) < 1 && Math.abs(dealFrom.y - t.y) < 1;
        if (dealFrom && !staticAtOrigin) {
          spr.setPosition(dealFrom.x, dealFrom.y);
          spr.setDepth(900 + (t.dealOrder ?? 0)); // dealt cards fly over the board
          spr.moveTween = scene.tweens.add({
            targets: spr,
            x: t.x,
            y: t.y,
            duration: DEAL_MS,
            delay: (t.dealOrder ?? 0) * DEAL_STAGGER,
            ease: 'Cubic.easeOut',
            onComplete: () => {
              spr.moveTween = undefined;
              spr.setDepth(t.depth);
            }
          });
        } else {
          spr.setPosition(t.x, t.y);
          spr.setDepth(t.depth);
        }
      } else if (Math.abs(spr.x - t.x) > 0.5 || Math.abs(spr.y - t.y) > 0.5) {
        spr.moveTween?.stop();
        spr.moveTween = scene.tweens.add({
          targets: spr,
          x: t.x,
          y: t.y,
          duration: PLACE_MS,
          ease: 'Back.easeOut',
          easeParams: [0.5], // ~5% overshoot
          onComplete: () => (spr.moveTween = undefined)
        });
        spr.setDepth(t.depth);
      } else {
        spr.setDepth(t.depth);
      }
    }
    if (t.interactive === 'drag') spr.setDraggable(true);
    else if (t.interactive === 'tap') spr.setTappable(true);
    else spr.setDraggable(false); // disables input entirely when present
  }
}
