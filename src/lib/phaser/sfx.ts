/**
 * Silent SFX stubs (Phase 2 decision: keep scene code complete, real CC0
 * samples wire in during Phase 4 — Freesound sourcing). Calls are already
 * placed at the right interaction points; the bodies are no-ops for now.
 */

/** Sound effect names used across scenes. */
export type SfxName = 'place' | 'flip' | 'shuffle' | 'win' | 'invalid' | 'draw';

/**
 * Play a named effect. Silent in Phase 2.
 * @param _name effect identifier
 */
export function playSfx(_name: SfxName): void {}
