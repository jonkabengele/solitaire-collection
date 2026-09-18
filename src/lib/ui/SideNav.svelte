<script lang="ts">
  /**
   * Side navigation drawer. Replaces the in-HUD variant switcher: games
   * are nav items, with a practice-race entry and the utility links.
   * Docked on wide screens (App.svelte pads the shell), slide-over with a
   * scrim on phones. Picking a game goes through requestSwitch so the
   * save-and-switch confirmation still applies mid-game.
   */
  import type { VariantId } from '../engine/types.js';
  import { gameStore } from '../stores/gameStore.svelte.js';
  import { uiStore } from '../stores/ui.svelte.js';
  import { practiceStore } from '../stores/practice.svelte.js';
  import { RACE_AVAILABLE } from '../net/nakama.js';

  const GAMES: { id: VariantId; icon: string; name: string; blurb: string }[] = [
    { id: 'klondike', icon: '♛', name: 'Klondike', blurb: 'The classic' },
    { id: 'freecell', icon: '♞', name: 'FreeCell', blurb: 'Pure skill' },
    { id: 'tripeaks', icon: '⛰', name: 'TriPeaks', blurb: 'Clear the peaks' },
    { id: 'pyramid', icon: '🔺', name: 'Pyramid', blurb: 'Pairs to thirteen' },
    { id: 'spider', icon: '🕷', name: 'Spider', blurb: 'Two decks, ten columns' }
  ];

  /** Phones overlay the drawer; desktop keeps it docked. */
  function narrow(): boolean {
    return window.matchMedia('(max-width: 899px)').matches;
  }

  function closeOnMobile(): void {
    if (narrow()) uiStore.navOpen = false;
  }

  function pick(v: VariantId): void {
    if (v !== gameStore.state.variant) gameStore.requestSwitch(v);
    closeOnMobile();
  }

  function practice(): void {
    const v = gameStore.state.variant;
    gameStore.newGame(v);
    practiceStore.start();
    closeOnMobile();
  }

  const cur = $derived(gameStore.state.variant);
</script>

{#if uiStore.navOpen}
  <button class="scrim" aria-label="Close menu" onclick={() => (uiStore.navOpen = false)}></button>
{/if}

<nav class="sidenav" class:open={uiStore.navOpen} aria-label="Games">
  <div class="head">
    <span class="brand">SOLITAIRE</span>
    <button class="x" aria-label="Close menu" onclick={() => (uiStore.navOpen = false)}>✕</button>
  </div>

  <p class="section">GAMES</p>
  {#each GAMES as g (g.id)}
    <button class="item" class:active={cur === g.id} onclick={() => pick(g.id)}>
      <span class="icon" aria-hidden="true">{g.icon}</span>
      <span class="label">
        <span class="name">{g.name}</span>
        <span class="blurb">{g.blurb}</span>
      </span>
      {#if cur !== g.id && gameStore.hasInProgress(g.id)}
        <span class="chip">RESUME</span>
      {/if}
    </button>
  {/each}

  <p class="section">MODES</p>
  <button class="item" onclick={practice}>
    <span class="icon" aria-hidden="true">⏱</span>
    <span class="label">
      <span class="name">Practice Race</span>
      <span class="blurb">Solo · beat the 5:00 clock</span>
    </span>
  </button>
  {#if RACE_AVAILABLE}
    <button class="item" onclick={() => { uiStore.raceOpen = true; closeOnMobile(); }}>
      <span class="icon" aria-hidden="true">⚔</span>
      <span class="label">
        <span class="name">Race Online</span>
        <span class="blurb">Same deal, fastest finish wins</span>
      </span>
    </button>
    <button class="item" onclick={() => { uiStore.socialOpen = true; closeOnMobile(); }}>
      <span class="icon" aria-hidden="true">👥</span>
      <span class="label">
        <span class="name">Social</span>
        <span class="blurb">Friends, boards & history</span>
      </span>
    </button>
  {/if}

  <div class="spacer"></div>

  <p class="section">MORE</p>
  <button class="link" onclick={() => { uiStore.statsOpen = true; closeOnMobile(); }}>Statistics</button>
  <button class="link" onclick={() => { uiStore.aboutOpen = true; closeOnMobile(); }}>About</button>
</nav>

<style>
  .scrim {
    position: fixed;
    inset: 0;
    z-index: 24;
    border: 0;
    background: rgba(0, 0, 0, 0.45);
    cursor: default;
  }

  .sidenav {
    position: fixed;
    top: 0;
    left: 0;
    bottom: 0;
    z-index: 25;
    width: 15rem;
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    padding: calc(var(--sat) + 0.6rem) 0.7rem calc(var(--sab) + 0.7rem);
    background: #0d3527;
    border-right: 1px solid rgba(255, 255, 255, 0.12);
    transform: translateX(-102%);
    transition: transform 180ms ease;
    user-select: none;
  }

  .sidenav.open {
    transform: translateX(0);
  }

  /* Docked on desktop — no scrim needed there. */
  @media (min-width: 900px) {
    .scrim {
      display: none;
    }
  }

  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.2rem 0.35rem 0.6rem;
  }

  .brand {
    font-weight: 800;
    letter-spacing: 0.22em;
    font-size: 0.95rem;
    color: #f5f7f5;
  }

  .x {
    border: 0;
    background: rgba(255, 255, 255, 0.1);
    color: rgba(255, 255, 255, 0.75);
    border-radius: 8px;
    padding: 0.3rem 0.55rem;
    font: inherit;
    cursor: pointer;
  }

  .section {
    margin: 0.8rem 0.35rem 0.35rem;
    font-size: 0.66rem;
    font-weight: 700;
    letter-spacing: 0.18em;
    color: rgba(255, 255, 255, 0.45);
  }

  .item {
    position: relative;
    display: flex;
    align-items: center;
    gap: 0.65rem;
    padding: 0.55rem 0.6rem;
    border: 1px solid transparent;
    border-radius: 10px;
    background: transparent;
    color: #f5f7f5;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .item:hover {
    background: rgba(255, 255, 255, 0.08);
  }

  .item.active {
    background: rgba(255, 255, 255, 0.13);
    border-color: rgba(255, 255, 255, 0.18);
  }

  .icon {
    flex: none;
    width: 1.9rem;
    height: 1.9rem;
    display: grid;
    place-items: center;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.1);
    font-size: 1rem;
  }

  .label {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .name {
    font-weight: 700;
    font-size: 0.92rem;
  }

  .blurb {
    font-size: 0.7rem;
    color: rgba(255, 255, 255, 0.6);
  }

  .chip {
    position: absolute;
    right: 0.5rem;
    padding: 0.15rem 0.4rem;
    border-radius: 6px;
    background: #ffd166;
    color: #0b3d2e;
    font-size: 0.58rem;
    font-weight: 800;
    letter-spacing: 0.06em;
  }

  .spacer {
    flex: 1;
  }

  .link {
    padding: 0.5rem 0.6rem;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: rgba(255, 255, 255, 0.72);
    font: inherit;
    font-size: 0.85rem;
    text-align: left;
    cursor: pointer;
  }

  .link:hover {
    background: rgba(255, 255, 255, 0.08);
  }
</style>
