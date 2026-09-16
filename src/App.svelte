<script lang="ts">
  import { onMount } from 'svelte';
  import HUD from './lib/ui/HUD.svelte';
  import { createGame } from './lib/phaser/game.js';

  let gameEl!: HTMLDivElement;

  onMount(() => {
    const game = createGame(gameEl);
    return () => game.destroy(true);
  });
</script>

<main class="shell">
  <HUD />
  <div class="game" bind:this={gameEl}></div>
</main>

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
