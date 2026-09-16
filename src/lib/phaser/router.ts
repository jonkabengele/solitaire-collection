/**
 * Scene router: translates `gameStore` navigation requests into Phaser
 * scene transitions. Exactly one board/menu scene is active at a time;
 * navigating to the already-active scene is a no-op (avoids restart
 * flicker on same-variant new games).
 */
import Phaser from 'phaser';
import { gameStore, type NavTarget } from '../stores/gameStore.svelte.js';

/**
 * Wire the store's nav emitter to the running game. Call once after
 * `new Phaser.Game(...)`; `BootScene` performs the initial transition.
 */
export function attachRouter(game: Phaser.Game): () => void {
  return gameStore.onNavigate((target: NavTarget) => {
    const active = game.scene.getScenes(true).find((s) => s.scene.key !== 'boot');
    if (!active || active.scene.key === target) return;
    active.scene.start(target);
  });
}
