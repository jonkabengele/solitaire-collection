/**
 * Cross-cutting UI flags: Svelte overlays that both the HUD and Phaser
 * scenes need to open (Phaser can't own Svelte state, so this tiny store
 * is the bridge). Kept separate from gameStore — it's chrome, not game.
 */
class UiStore {
  /** Menu is the boot screen — open until a variant is picked. */
  menuOpen = $state(true);
  statsOpen = $state(false);
  aboutOpen = $state(false);
  /** Race lobby overlay (matchmaking / result). In-race HUD lives in Race.svelte. */
  raceOpen = $state(false);
}

export const uiStore = new UiStore();
