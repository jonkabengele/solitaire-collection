<script lang="ts">
  /**
   * Variant picker — a plain DOM overlay (no Phaser). Keeping the menu out
   * of WebGL means the 1.4MB engine bundle only loads after the player
   * picks a variant: fast first paint, near-zero boot TBT.
   */
  import type { VariantId } from '../engine/types.js';
  import { gameStore } from '../stores/gameStore.svelte.js';
  import { statsStore } from '../stores/stats.svelte.js';
  import { uiStore } from '../stores/ui.svelte.js';
  import { RACE_AVAILABLE } from '../net/nakama.js';

  type VariantCard = {
    id: VariantId;
    name: string;
    blurb: string;
    /** Face-card ids used as the decorative mini-preview. */
    preview: string;
  };

  const VARIANTS: VariantCard[] = [
    { id: 'klondike', name: 'Klondike', blurb: 'The classic', preview: 's1' },
    { id: 'freecell', name: 'FreeCell', blurb: 'All open, pure skill', preview: 's12' },
    { id: 'tripeaks', name: 'TriPeaks', blurb: 'Clear the peaks', preview: 'h10' }
  ];

  function fmtBest(ms: number | null): string {
    if (ms === null) return '—';
    return `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;
  }
</script>

<div class="menu" role="navigation" aria-label="Choose a game">
  <h1 class="title">SOLITAIRE</h1>
  <p class="subtitle">COLLECTION</p>

  <div class="cards">
    {#each VARIANTS as v (v.id)}
      {@const st = statsStore.for(v.id)}
      <button class="vcard" onclick={() => gameStore.selectVariant(v.id)}>
        <span class="fan" aria-hidden="true">
          <img class="mini back" src="assets/cards/back.svg" alt="" />
          <img class="mini face" src="assets/cards/{v.preview}.svg" alt="" />
        </span>
        <span class="meta">
          <span class="name">{v.name}</span>
          <span class="blurb">{v.blurb}</span>
          <span class="stat">
            Best {fmtBest(st.bestMs)} · Win rate {st.played === 0 ? '—' : `${Math.round((st.won / st.played) * 100)}%`}
          </span>
        </span>
        {#if gameStore.hasInProgress(v.id)}
          <span class="chip">CONTINUE</span>
        {/if}
      </button>
    {/each}
  </div>

  <div class="footer">
    {#if RACE_AVAILABLE}
      <button class="race-link" onclick={() => (uiStore.raceOpen = true)}>⚔ RACE</button>
      <button class="stats-link" onclick={() => (uiStore.socialOpen = true)}>SOCIAL</button>
    {/if}
    <button class="stats-link" onclick={() => (uiStore.statsOpen = true)}>STATISTICS</button>
    <button class="stats-link" onclick={() => (uiStore.aboutOpen = true)}>ABOUT</button>
  </div>
</div>

<style>
  .menu {
    position: fixed;
    inset: 0;
    z-index: 20;
    display: flex;
    flex-direction: column;
    align-items: center;
    background: #0b3d2e;
    padding: calc(var(--sat) + 1rem) 1rem calc(var(--sab) + 1rem);
    user-select: none;
  }

  .title {
    margin: 4vh 0 0;
    font-size: clamp(1.9rem, 7vw, 2.75rem);
    font-weight: 700;
    letter-spacing: 0.28em;
    color: #f5f7f5;
  }

  .subtitle {
    margin: 0.15rem 0 0;
    font-size: clamp(0.7rem, 2.4vw, 1rem);
    letter-spacing: 0.55em;
    color: rgba(255, 255, 255, 0.7);
  }

  .cards {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 0.9rem;
    width: min(32rem, 100%);
    padding: 1rem 0;
  }

  .vcard {
    position: relative;
    display: flex;
    align-items: center;
    gap: 1rem;
    min-height: 72px;
    padding: 0.7rem 1rem;
    border: 1.5px solid rgba(255, 255, 255, 0.18);
    border-radius: 14px;
    background: rgba(255, 255, 255, 0.07);
    color: #f5f7f5;
    font: inherit;
    text-align: left;
    cursor: pointer;
    transition: background 120ms ease;
  }

  .vcard:active {
    background: rgba(255, 255, 255, 0.14);
    transform: scale(0.985);
  }

  .fan {
    position: relative;
    flex: none;
    width: 3.4rem;
    height: 3.6rem;
  }

  .mini {
    position: absolute;
    width: 2.55rem;
    top: 0.35rem;
    border-radius: 4px;
    filter: drop-shadow(0 2px 3px rgba(0, 0, 0, 0.35));
  }

  .mini.back {
    left: 0;
    transform: rotate(-7deg);
  }

  .mini.face {
    left: 0.85rem;
    transform: rotate(7deg);
  }

  .meta {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .name {
    font-size: 1.15rem;
    font-weight: 700;
  }

  .blurb {
    font-size: 0.8rem;
    color: rgba(255, 255, 255, 0.75);
  }

  .stat {
    margin-top: 0.15rem;
    font-size: 0.72rem;
    color: rgba(255, 255, 255, 0.68);
    font-variant-numeric: tabular-nums;
  }

  .chip {
    position: absolute;
    top: 0.55rem;
    right: 0.7rem;
    padding: 0.2rem 0.5rem;
    border-radius: 6px;
    background: #ffd166;
    color: #0b3d2e;
    font-size: 0.62rem;
    font-weight: 700;
    letter-spacing: 0.06em;
  }

  .footer {
    display: flex;
    gap: 0.6rem;
  }

  .stats-link {
    padding: 0.7rem 1.1rem;
    border: 0;
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.1);
    color: rgba(255, 255, 255, 0.78);
    font: inherit;
    font-size: 0.8rem;
    font-weight: 700;
    letter-spacing: 0.2em;
    cursor: pointer;
  }

  .race-link {
    padding: 0.7rem 1.1rem;
    border: 0;
    border-radius: 10px;
    background: #ffd166;
    color: #0b3d2e;
    font: inherit;
    font-size: 0.8rem;
    font-weight: 800;
    letter-spacing: 0.2em;
    cursor: pointer;
  }

  /* Landscape: three columns. */
  @media (min-aspect-ratio: 1/1) and (min-width: 640px) {
    .cards {
      flex-direction: row;
      align-items: center;
      width: auto;
    }

    .vcard {
      flex-direction: column;
      width: min(15rem, 26vw);
      min-height: 13rem;
      text-align: center;
      justify-content: center;
    }

    .meta {
      align-items: center;
    }
  }
</style>
