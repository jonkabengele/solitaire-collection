<script lang="ts">
  /**
   * Race lobby — the entry point for race mode, shaped like the future
   * online lobby: pick a game, launch it racing the 5:00 clock. The same
   * list becomes the matchmaking surface once public queues exist —
   * online private races stay reachable via "Race Online".
   */
  import type { VariantId } from '../engine/types.js';
  import { gameStore } from '../stores/gameStore.svelte.js';
  import { practiceStore } from '../stores/practice.svelte.js';
  import { uiStore } from '../stores/ui.svelte.js';
  import { RACE_AVAILABLE } from '../net/nakama.js';
  import { GAMES } from './games.js';

  function launch(v: VariantId): void {
    uiStore.raceLobbyOpen = false;
    // Same order as the online path: deal first, then switch scenes.
    gameStore.newGame(v);
    gameStore.selectVariant(v);
    practiceStore.start();
  }
</script>

<div class="overlay" role="dialog" aria-modal="true" aria-label="Race lobby">
  <div class="panel">
    <p class="title">RACE LOBBY</p>
    <p class="sub">Pick a game — you get a fresh deal and 5:00 on the clock.</p>

    <div class="games">
      {#each GAMES as g (g.id)}
        <button class="game" onclick={() => launch(g.id)}>
          <span class="icon" aria-hidden="true">{g.icon}</span>
          <span class="meta">
            <span class="name">{g.name}</span>
            <span class="blurb">{g.blurb}</span>
          </span>
          <span class="go">RACE →</span>
        </button>
      {/each}
    </div>

    {#if RACE_AVAILABLE}
      <div class="online">
        <p class="sec">ONLINE</p>
        <button
          class="online-btn"
          onclick={() => {
            uiStore.raceLobbyOpen = false;
            uiStore.raceOpen = true;
          }}
        >
          ⚔ Race a friend — same deal, fastest finish wins
        </button>
      </div>
    {/if}

    <div class="row">
      <button onclick={() => (uiStore.raceLobbyOpen = false)}>Close</button>
    </div>
  </div>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    display: grid;
    place-items: center;
    background: rgba(0, 0, 0, 0.55);
    z-index: 40;
    padding: 1rem;
  }

  .panel {
    background: #123f30;
    border: 1px solid rgba(255, 255, 255, 0.16);
    border-radius: 14px;
    padding: 1.25rem 1.4rem;
    width: min(26rem, 100%);
    max-height: 85dvh;
    overflow-y: auto;
    scrollbar-width: none;
    color: #f5f7f5;
  }

  .panel::-webkit-scrollbar {
    display: none;
  }

  .title {
    margin: 0;
    font-weight: 800;
    letter-spacing: 0.22em;
  }

  .sub {
    margin: 0.35rem 0 1rem;
    font-size: 0.8rem;
    color: rgba(255, 255, 255, 0.65);
  }

  .games {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .game {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.6rem 0.7rem;
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.14);
    background: rgba(255, 255, 255, 0.05);
    color: inherit;
    text-align: left;
    cursor: pointer;
  }

  .game:hover {
    background: rgba(255, 255, 255, 0.12);
  }

  .icon {
    font-size: 1.3rem;
    width: 1.6rem;
    text-align: center;
  }

  .meta {
    flex: 1;
    display: flex;
    flex-direction: column;
  }

  .name {
    font-weight: 700;
  }

  .blurb {
    font-size: 0.72rem;
    color: rgba(255, 255, 255, 0.6);
  }

  .go {
    font-size: 0.72rem;
    font-weight: 800;
    letter-spacing: 0.08em;
    color: #ffd166;
  }

  .online {
    margin-top: 1rem;
  }

  .sec {
    margin: 0 0 0.4rem;
    font-size: 0.68rem;
    font-weight: 800;
    letter-spacing: 0.22em;
    color: rgba(255, 255, 255, 0.5);
  }

  .online-btn {
    width: 100%;
    padding: 0.6rem 0.7rem;
    border-radius: 10px;
    border: 1px solid rgba(255, 209, 102, 0.4);
    background: rgba(255, 209, 102, 0.08);
    color: #ffd166;
    font-weight: 700;
    cursor: pointer;
  }

  .row {
    margin-top: 1rem;
    display: flex;
    justify-content: flex-end;
  }
</style>
