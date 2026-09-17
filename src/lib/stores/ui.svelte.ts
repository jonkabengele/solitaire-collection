/**
 * Cross-cutting UI flags: Svelte overlays that both the HUD and Phaser
 * scenes need to open (Phaser can't own Svelte state, so this tiny store
 * is the bridge). Kept separate from gameStore — it's chrome, not game.
 */
class UiStore {
  statsOpen = $state(false);
  aboutOpen = $state(false);
}

export const uiStore = new UiStore();
