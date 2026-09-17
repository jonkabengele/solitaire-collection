<script lang="ts">
  import { onMount } from 'svelte';
  import type Phaser from 'phaser';
  import HUD from './lib/ui/HUD.svelte';
  import Menu from './lib/ui/Menu.svelte';
  import Stats from './lib/ui/Stats.svelte';
  import About from './lib/ui/About.svelte';
  import Race from './lib/ui/Race.svelte';
  import Social from './lib/ui/Social.svelte';
  import Replay from './lib/ui/Replay.svelte';
  import InstallBanner from './lib/ui/InstallBanner.svelte';
  import { uiStore } from './lib/stores/ui.svelte.js';
  import { gameStore, type NavTarget } from './lib/stores/gameStore.svelte.js';
  import { installStore } from './lib/stores/install.svelte.js';
  import { raceStore } from './lib/stores/raceStore.svelte.js';
  import { RACE_AVAILABLE } from './lib/net/nakama.js';

  let gameEl!: HTMLDivElement;
  let game: Phaser.Game | null = null;
  let booting: Promise<Phaser.Game> | null = null;

  // Install prompt: suggest once, right after the player's first win.
  $effect(() => {
    if (gameStore.started && gameStore.state.status === 'won') installStore.suggestAfterWin();
  });

  /**
   * Phaser loads lazily on the first variant pick — the menu is pure DOM,
   * so boot stays fast and the 1.4MB engine chunk stays off the critical
   * path. The promise is memoized so rapid nav events share one game.
   */
  function ensureGame(): Promise<Phaser.Game> {
    if (game) return Promise.resolve(game);
    booting ??= import('./lib/phaser/game.js').then(({ createGame }) => {
      game = createGame(gameEl);
      return game;
    });
    return booting;
  }

  /** Currently-running board scene, if any (boot excluded). */
  function boardScene(g: Phaser.Game): Phaser.Scene | undefined {
    return g.scene.getScenes(true).find((s) => s.scene.key !== 'boot');
  }

  /**
   * Navigation: 'menu' stops the board scene under the overlay; a variant
   * starts (or restarts) its scene. If boot is still preloading, BootScene
   * reads `gameStore.state.variant` and lands on the right board itself.
   */
  async function onNav(t: NavTarget): Promise<void> {
    if (t === 'menu') {
      uiStore.menuOpen = true;
      if (game) {
        const s = boardScene(game);
        if (s) game.scene.stop(s.scene.key);
      }
      return;
    }
    uiStore.menuOpen = false;
    const g = await ensureGame();
    const scenes = g.scene.getScenes(true);
    if (scenes.some((s) => s.scene.key === 'boot')) return; // boot handles it
    const board = boardScene(g);
    if (!board) g.scene.start(t);
    else if (board.scene.key !== t) board.scene.start(t);
  }

  onMount(() => {
    const offNav = gameStore.onNavigate((t) => void onNav(t));
    // Invite deep link: `?race=<matchId>` opens the lobby and joins.
    const race = new URLSearchParams(location.search).get('race');
    if (race && RACE_AVAILABLE) {
      uiStore.raceOpen = true;
      void raceStore.joinPrivate(race);
      history.replaceState(null, '', location.pathname);
    }
    return () => {
      offNav();
      game?.destroy(true);
      game = null;
      booting = null;
    };
  });
</script>

<main class="shell">
  {#if !uiStore.menuOpen}
    <HUD />
  {/if}
  <div class="game" bind:this={gameEl}></div>
</main>

{#if uiStore.menuOpen}
  <Menu />
{/if}

{#if uiStore.statsOpen}
  <Stats />
{/if}

{#if uiStore.aboutOpen}
  <About />
{/if}

<Race />

{#if uiStore.socialOpen}
  <Social />
{/if}

<Replay />

<InstallBanner />

<style>
  .shell {
    height: 100dvh;
    display: flex;
    flex-direction: column;
    padding-top: var(--sat);
    padding-bottom: var(--sab);
    padding-left: var(--sal);
    padding-right: var(--sar);
  }

  .game {
    flex: 1;
    min-height: 0;
    position: relative;
    touch-action: none;
  }

  .game :global(canvas) {
    display: block;
  }
</style>
