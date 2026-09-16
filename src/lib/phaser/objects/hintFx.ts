/**
 * Hint highlight: pulsing gold outlines around the suggested move's
 * source card and target pile (spec: "highlight top move for 2s with
 * pulsing outline"). Self-disposes.
 */
import Phaser from 'phaser';

export type HintRect = { x: number; y: number; w: number; h: number };

/** Show pulsing outlines at `rects` for ~2s, then remove them. */
export function hintFx(scene: Phaser.Scene, rects: HintRect[]): void {
  const gos: Phaser.GameObjects.Rectangle[] = [];
  for (const r of rects) {
    const rect = scene.add
      .rectangle(r.x, r.y, r.w + 10, r.h + 10)
      .setStrokeStyle(3, 0xffd166, 0.95)
      .setDepth(2000)
      .setAlpha(0);
    gos.push(rect);
  }
  scene.tweens.add({
    targets: gos,
    alpha: { from: 0.15, to: 0.95 },
    duration: 320,
    yoyo: true,
    repeat: 2,
    onComplete: () => gos.forEach((g) => g.destroy())
  });
  scene.time.delayedCall(2100, () => gos.forEach((g) => g.destroy()));
}
