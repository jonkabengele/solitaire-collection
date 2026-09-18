/**
 * Win flourish: the whole board whirls around the table centre while
 * confetti rains. Runs ~3.8s; any tap after a short grace period skips it
 * and hands control back via `onDone` (the scene then resyncs sprites).
 */
import Phaser from 'phaser';
import type { CardSprite } from './CardSprite.js';

const DURATION_MS = 3800;
const SKIP_GRACE_MS = 700;

/** Returns a cancel function — safe to call if the game resets mid-flourish. */
export function winFx(scene: Phaser.Scene, sprites: CardSprite[], onDone: () => void): () => void {
  if (sprites.length === 0) {
    onDone();
    return () => {};
  }

  // Confetti needs a texture — a tiny white square, tinted per particle.
  if (!scene.textures.exists('confetti-px')) {
    const g = scene.make.graphics({ x: 0, y: 0 });
    g.fillStyle(0xffffff).fillRect(0, 0, 8, 8);
    g.generateTexture('confetti-px', 8, 8);
    g.destroy();
  }
  const emitter = scene.add.particles(0, 0, 'confetti-px', {
    x: { min: 0, max: scene.scale.width },
    y: -16,
    speedY: { min: 160, max: 380 },
    speedX: { min: -90, max: 90 },
    rotate: { min: 0, max: 360 },
    gravityY: 140,
    lifespan: { min: 1400, max: 2800 },
    quantity: 4,
    frequency: 45,
    scale: { min: 0.5, max: 1.1 },
    tint: [0xffd166, 0xffffff, 0xc02a33, 0x4cc9f0, 0x7bd88f]
  });
  emitter.setDepth(1500);

  // Orbit: every sprite keeps its own radius/phase around the board
  // centre; one counter tween drives the whole wheel two revolutions.
  const cx = scene.scale.width / 2;
  const cy = scene.scale.height * 0.45;
  const orbit = sprites.map((s) => ({
    s,
    r: Math.max(30, Math.hypot(s.x - cx, s.y - cy)),
    a: Math.atan2(s.y - cy, s.x - cx)
  }));
  const proxy = { t: 0 };
  const turns = Math.PI * 4;
  let finished = false;

  const finish = (): void => {
    if (finished) return;
    finished = true;
    tween.stop();
    emitter.destroy();
    onDone();
  };

  const tween = scene.tweens.add({
    targets: proxy,
    t: 1,
    duration: DURATION_MS,
    ease: 'Sine.easeInOut',
    onUpdate: () => {
      for (const o of orbit) {
        const ang = o.a + proxy.t * turns;
        const r = o.r * (1 + 0.12 * Math.sin(proxy.t * Math.PI * 6));
        o.s.setPosition(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r);
      }
    },
    onComplete: finish
  });

  scene.time.delayedCall(SKIP_GRACE_MS, () => {
    scene.input.once(Phaser.Input.Events.POINTER_DOWN, finish);
  });

  return finish;
}
