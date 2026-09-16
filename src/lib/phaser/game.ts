/**
 * Phaser game factory. Canvas resizes to fill its parent element
 * (Scale.RESIZE); the parent is safe-area-padded by CSS.
 */
import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene.js';
import { KlondikeScene } from './scenes/KlondikeScene.js';

/**
 * Create and mount the Phaser game inside `parent`.
 * @returns the running game — call `game.destroy(true)` on unmount.
 */
export function createGame(parent: HTMLElement): Phaser.Game {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    backgroundColor: '#0b3d2e',
    scale: {
      mode: Phaser.Scale.RESIZE,
      width: '100%',
      height: '100%'
    },
    scene: [BootScene, KlondikeScene],
    banner: false
  });
  // Dev-only handle for E2E tests and console debugging.
  if (import.meta.env.DEV) {
    (window as unknown as Record<string, unknown>).__phaserGame = game;
  }
  return game;
}
