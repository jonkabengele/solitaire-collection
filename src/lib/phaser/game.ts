/**
 * Phaser game factory. Canvas resizes to fill its parent element
 * (Scale.RESIZE); the parent is safe-area-padded by CSS. Loaded lazily —
 * the variant menu is pure DOM, so this chunk only ships to the main
 * thread once the player picks a game.
 */
import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene.js';
import { KlondikeScene } from './scenes/KlondikeScene.js';
import { FreeCellScene } from './scenes/FreeCellScene.js';
import { TriPeaksScene } from './scenes/TriPeaksScene.js';
import { SpiderScene } from './scenes/SpiderScene.js';

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
    scene: [BootScene, KlondikeScene, FreeCellScene, TriPeaksScene, SpiderScene],
    banner: false
  });
  // Dev/E2E-only handle for tests and console debugging — absent from
  // normal production builds (VITE_E2E is only set for e2e builds).
  if (import.meta.env.DEV || import.meta.env.VITE_E2E === 'true') {
    (window as unknown as Record<string, unknown>).__phaserGame = game;
  }
  return game;
}
