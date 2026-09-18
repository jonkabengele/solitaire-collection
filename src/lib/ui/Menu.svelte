<script lang="ts">
  /**
   * Home screen — a scrollable, tiered variant picker (pure DOM, no
   * Phaser). Implemented games render in full colour with stats; planned
   * games show grayed-out "COMING SOON" placeholders so the collection's
   * roadmap is visible without promising playable content.
   */
  import type { VariantId } from '../engine/types.js';
  import { gameStore } from '../stores/gameStore.svelte.js';
  import { statsStore } from '../stores/stats.svelte.js';
  import { uiStore } from '../stores/ui.svelte.js';
  import { RACE_AVAILABLE } from '../net/nakama.js';

  type MenuGame = {
    /** Present only for implemented variants — absent = placeholder. */
    id?: VariantId;
    name: string;
    blurb: string;
    /** Face-card id used as the decorative mini-preview. */
    preview: string;
  };

  type Tier = {
    name: string;
    /** Accent colour for the section header. */
    hue: string;
    games: MenuGame[];
  };

  const TIERS: Tier[] = [
    {
      name: 'Easy · Casual',
      hue: '#7dd87d',
      games: [
        { id: 'klondike', name: 'Klondike', blurb: 'The classic', preview: 's1' },
        { id: 'tripeaks', name: 'TriPeaks', blurb: 'Clear the peaks', preview: 'h10' },
        { id: 'pyramid', name: 'Pyramid', blurb: 'Pairs to thirteen', preview: 'd13' },
        { name: 'Golf', blurb: 'Nine columns, one wrap chain', preview: 'h5' }
      ]
    },
    {
      name: 'Strategic',
      hue: '#ffd166',
      games: [
        { id: 'freecell', name: 'FreeCell', blurb: 'All open, pure skill', preview: 's12' },
        { id: 'spider', name: 'Spider', blurb: 'Two decks, ten columns', preview: 's13' },
        { name: 'Yukon', blurb: 'Klondike without the stock', preview: 's11' },
        { name: 'Canfield', blurb: 'Reserve piles, tight scoring', preview: 'h13' },
        { name: "Baker's Dozen", blurb: 'Open deck, kings to the top', preview: 'c9' }
      ]
    },
    {
      name: 'Hardcore',
      hue: '#ff8f97',
      games: [
        { name: 'Scorpion', blurb: 'One suit, no mercy', preview: 's8' },
        { name: 'Forty Thieves', blurb: 'Two decks, brutal odds', preview: 'd10' },
        { name: 'Russian Solitaire', blurb: 'Yukon, suit-locked', preview: 'c13' },
        { name: 'La Belle Lucie', blurb: 'Fans of three, redealt twice', preview: 'h11' },
        { name: 'Aces Up', blurb: 'Discard to the aces', preview: 's1' },
        { name: 'Calculation', blurb: 'Skip-count foundations', preview: 'h9' }
      ]
    },
    {
      name: 'Weird & Wonderful',
      hue: '#b48cff',
      games: [
        { name: 'Accordion', blurb: 'One long squeezing line', preview: 'd6' },
        { name: 'Clock', blurb: 'The deck decides everything', preview: 's12' },
        { name: 'Cruel', blurb: 'Redeals on demand — at a price', preview: 'c5' }
      ]
    }
  ];

  function fmtBest(ms: number | null): string {
    if (ms === null) return '—';
    return `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;
  }
</script>

<div class="menu" role="navigation" aria-label="Choose a game">
  <h1 class="title">SOLITAIRE</h1>
  <p class="subtitle">COLLECTION</p>

  <div class="scroll">
    {#each TIERS as tier (tier.name)}
      <section class="tier">
        <h2 class="tier-name" style="--hue: {tier.hue}">{tier.name}</h2>
        <div class="grid">
          {#each tier.games as g (g.name)}
            {#if g.id}
              {@const st = statsStore.for(g.id)}
              <button class="vcard" onclick={() => gameStore.selectVariant(g.id as VariantId)}>
                <span class="fan" aria-hidden="true">
                  <img class="mini back" src="assets/cards/back.svg" alt="" />
                  <img class="mini face" src="assets/cards/{g.preview}.svg" alt="" />
                </span>
                <span class="meta">
                  <span class="name">{g.name}</span>
                  <span class="blurb">{g.blurb}</span>
                  <span class="stat">
                    Best {fmtBest(st.bestMs)} · Win {st.played === 0 ? '—' : `${Math.round((st.won / st.played) * 100)}%`}
                  </span>
                </span>
                {#if gameStore.hasInProgress(g.id)}
                  <span class="chip">CONTINUE</span>
                {/if}
              </button>
            {:else}
              <div class="vcard soon" aria-disabled="true" title="Coming soon">
                <span class="fan" aria-hidden="true">
                  <img class="mini back" src="assets/cards/back.svg" alt="" />
                  <img class="mini face" src="assets/cards/{g.preview}.svg" alt="" />
                </span>
                <span class="meta">
                  <span class="name">{g.name}</span>
                  <span class="blurb">{g.blurb}</span>
                </span>
                <span class="soon-chip">SOON</span>
              </div>
            {/if}
          {/each}
        </div>
      </section>
    {/each}
  </div>

  <div class="footer">
    {#if RACE_AVAILABLE}
      <button class="race-link" onclick={() => (uiStore.raceOpen = true)}>⚔ RACE</button>
      <button class="stats-link" onclick={() => (uiStore.socialOpen = true)}>SOCIAL</button>
    {/if}
    <button class="stats-link" onclick={() => (uiStore.settingsOpen = true)}>SETTINGS</button>
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
    padding: calc(var(--sat) + 1rem) 0.5rem calc(var(--sab) + 1rem);
    user-select: none;
  }

  .title {
    margin: 2vh 0 0;
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

  /* The tiers scroll under a fixed title/footer. Scrollbar stays
     invisible — full bleed, narrow gutters. */
  .scroll {
    flex: 1;
    width: 100%;
    overflow-y: auto;
    padding: 0.8rem 0.25rem;
    scrollbar-width: none;
  }

  .scroll::-webkit-scrollbar {
    display: none;
  }

  .tier {
    margin-top: 0.9rem;
  }

  .tier-name {
    margin: 0 0 0.45rem;
    font-size: 0.72rem;
    font-weight: 800;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: var(--hue);
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(9.5rem, 1fr));
    gap: 0.6rem;
  }

  .vcard {
    position: relative;
    display: flex;
    align-items: center;
    gap: 0.8rem;
    min-height: 74px;
    padding: 0.65rem 0.8rem;
    border: 1.5px solid rgba(255, 255, 255, 0.18);
    border-radius: 14px;
    background: rgba(255, 255, 255, 0.07);
    color: #f5f7f5;
    font: inherit;
    text-align: left;
    cursor: pointer;
    transition: background 120ms ease;
  }

  button.vcard:active {
    background: rgba(255, 255, 255, 0.14);
    transform: scale(0.985);
  }

  /* Placeholder tier: muted, dashed, non-interactive. */
  .vcard.soon {
    cursor: default;
    border-style: dashed;
    border-color: rgba(255, 255, 255, 0.16);
    background: rgba(255, 255, 255, 0.03);
    color: rgba(255, 255, 255, 0.45);
  }

  .vcard.soon .fan {
    filter: grayscale(1) brightness(0.7);
    opacity: 0.6;
  }

  .soon-chip {
    position: absolute;
    top: 0.5rem;
    right: 0.6rem;
    padding: 0.15rem 0.45rem;
    border: 1px solid rgba(255, 255, 255, 0.3);
    border-radius: 6px;
    color: rgba(255, 255, 255, 0.55);
    font-size: 0.56rem;
    font-weight: 800;
    letter-spacing: 0.12em;
  }

  .fan {
    position: relative;
    flex: none;
    width: 3.2rem;
    height: 3.4rem;
  }

  .mini {
    position: absolute;
    width: 2.4rem;
    top: 0.3rem;
    border-radius: 4px;
    filter: drop-shadow(0 2px 3px rgba(0, 0, 0, 0.35));
  }

  .mini.back {
    left: 0;
    transform: rotate(-7deg);
  }

  .mini.face {
    left: 0.8rem;
    transform: rotate(7deg);
  }

  .meta {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .name {
    font-size: 1.02rem;
    font-weight: 700;
  }

  .blurb {
    font-size: 0.72rem;
    color: rgba(255, 255, 255, 0.7);
  }

  .vcard.soon .blurb {
    color: rgba(255, 255, 255, 0.4);
  }

  .stat {
    margin-top: 0.15rem;
    font-size: 0.66rem;
    color: rgba(255, 255, 255, 0.62);
    font-variant-numeric: tabular-nums;
  }

  .chip {
    position: absolute;
    top: 0.5rem;
    right: 0.6rem;
    padding: 0.2rem 0.5rem;
    border-radius: 6px;
    background: #ffd166;
    color: #0b3d2e;
    font-size: 0.58rem;
    font-weight: 700;
    letter-spacing: 0.06em;
  }

  .footer {
    display: flex;
    gap: 0.6rem;
    padding-top: 0.6rem;
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
</style>
