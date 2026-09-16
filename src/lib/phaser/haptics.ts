/**
 * Haptics via `navigator.vibrate` (Phase 4). Guarded so iOS Safari —
 * which lacks the API — no-ops silently; Phase 8 swaps the body for
 * Capacitor Haptics without touching call sites.
 */

export type HapticKind = 'pickup' | 'place' | 'invalid' | 'win' | 'draw';

const PATTERNS: Record<HapticKind, number | number[]> = {
  pickup: 10,
  place: [15, 10, 15],
  invalid: 30,
  win: [50, 30, 50, 30, 100],
  draw: 10
};

const supported = typeof navigator !== 'undefined' && 'vibrate' in navigator;

/** Fire a haptic pattern; silent no-op on unsupported platforms. */
export function haptic(kind: HapticKind): void {
  if (!supported) return;
  try {
    navigator.vibrate(PATTERNS[kind]);
  } catch {
    /* no-op */
  }
}
