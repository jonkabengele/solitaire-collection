/**
 * SFX playback (Phase 4). WAVs are generated procedurally by
 * `scripts/generate-sfx.mjs`, loaded in BootScene, and Workbox-precached.
 * Volume comes from settingsStore. No-ops safely before audio unlock.
 */
import Phaser from 'phaser';
import { settingsStore } from '../stores/settings.svelte.js';

/** Sound effect names used across scenes. */
export type SfxName = 'place' | 'flip' | 'shuffle' | 'win' | 'invalid' | 'draw';

/** The scene whose sound manager currently owns playback. */
let active: Phaser.Scene | null = null;

/** Called by each board/menu scene on create — routes `playSfx` to its sound manager. */
export function bindSfx(scene: Phaser.Scene): void {
  active = scene;
}

/**
 * Play a named effect at the user's volume. Silently no-ops when the audio
 * context is locked or the sample is missing.
 */
export function playSfx(name: SfxName): void {
  const sm = active?.sound;
  if (!sm) return;
  try {
    sm.play(name, { volume: settingsStore.volume });
  } catch {
    /* audio not decoded yet — fine to skip */
  }
}
