<script lang="ts">
  import type { VariantId } from '../engine/types.js';
  import { statsStore, type VariantStats } from '../stores/stats.svelte.js';
  import { uiStore } from '../stores/ui.svelte.js';

  const VARIANTS: { id: VariantId; name: string }[] = [
    { id: 'klondike', name: 'Klondike' },
    { id: 'freecell', name: 'FreeCell' },
    { id: 'tripeaks', name: 'TriPeaks' },
    { id: 'spider', name: 'Spider' }
  ];

  /** Two-step reset confirmation per variant. */
  let confirmReset = $state<VariantId | null>(null);

  function fmt(ms: number | null): string {
    if (ms === null) return '—';
    const s = Math.max(0, Math.floor(ms / 1000));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  function rate(s: VariantStats): number {
    return s.played === 0 ? 0 : Math.round((s.won / s.played) * 100);
  }

  /** SVG ring geometry for the win-rate donut. */
  const R = 26;
  const CIRC = 2 * Math.PI * R;
</script>

<div class="overlay" role="dialog" aria-modal="true" aria-label="Statistics" tabindex="-1">
  <div class="panel">
    <div class="head">
      <span class="title">Statistics</span>
      <button class="ghost" onclick={() => (uiStore.statsOpen = false)}>✕</button>
    </div>
    <div class="grid">
      {#each VARIANTS as v (v.id)}
        {@const s = statsStore.for(v.id)}
        <div class="card">
          <div class="card-head">
            <span class="vname">{v.name}</span>
            {#if confirmReset === v.id}
              <span class="confirm">
                Sure?
                <button class="mini danger" onclick={() => { statsStore.reset(v.id); confirmReset = null; }}>Yes</button>
                <button class="mini" onclick={() => (confirmReset = null)}>No</button>
              </span>
            {:else}
              <button class="mini ghosty" onclick={() => (confirmReset = v.id)} disabled={s.played === 0}>Reset</button>
            {/if}
          </div>
          <div class="body">
            <svg class="ring" viewBox="0 0 64 64" aria-label={`Win rate ${rate(s)}%`}>
              <circle cx="32" cy="32" r={R} fill="none" stroke="rgba(255,255,255,0.12)" stroke-width="6" />
              <circle
                cx="32"
                cy="32"
                r={R}
                fill="none"
                stroke="#ffd166"
                stroke-width="6"
                stroke-linecap="round"
                stroke-dasharray="{CIRC * (rate(s) / 100)} {CIRC}"
                transform="rotate(-90 32 32)"
              />
              <text x="32" y="36" text-anchor="middle" class="pct">{rate(s)}%</text>
            </svg>
            <div class="nums">
              <div><b>{s.played}</b><span>played</span></div>
              <div><b>{s.won}</b><span>won</span></div>
              <div><b>{fmt(s.bestMs)}</b><span>best</span></div>
              <div><b>{s.currentStreak}</b><span>streak</span></div>
            </div>
          </div>
        </div>
      {/each}
    </div>
    <p class="foot">Stats live on this device only — nothing is sent anywhere.</p>
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
  }

  .panel {
    background: #123f30;
    border: 1px solid rgba(255, 255, 255, 0.16);
    border-radius: 14px;
    padding: 1rem 1.1rem;
    width: min(34rem, calc(100vw - 2rem));
    max-height: calc(100dvh - 2rem);
    overflow: auto;
  }

  .head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.8rem;
  }

  .title {
    font-weight: 700;
    font-size: 1.05rem;
  }

  .grid {
    display: grid;
    gap: 0.7rem;
  }

  .card {
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 10px;
    padding: 0.7rem 0.8rem;
  }

  .card-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    min-height: 1.6rem;
  }

  .vname {
    font-weight: 700;
  }

  .body {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin-top: 0.3rem;
  }

  .ring {
    width: 64px;
    height: 64px;
    flex: none;
  }

  .pct {
    fill: #f5f7f5;
    font-size: 13px;
    font-weight: 700;
  }

  .nums {
    display: grid;
    grid-template-columns: repeat(4, auto);
    gap: 0.4rem 1.1rem;
    flex: 1;
  }

  .nums div {
    display: flex;
    flex-direction: column;
  }

  .nums b {
    font-variant-numeric: tabular-nums;
    font-size: 1.05rem;
  }

  .nums span {
    font-size: 0.68rem;
    color: rgba(255, 255, 255, 0.55);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .foot {
    margin: 0.9rem 0 0;
    font-size: 0.75rem;
    color: rgba(255, 255, 255, 0.5);
    text-align: center;
  }

  button {
    border: 0;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.14);
    color: #f5f7f5;
    font: inherit;
    cursor: pointer;
  }

  .ghost {
    background: transparent;
    font-size: 1rem;
    padding: 0.2rem 0.5rem;
  }

  .mini {
    font-size: 0.72rem;
    padding: 0.2rem 0.6rem;
  }

  .ghosty {
    background: rgba(255, 255, 255, 0.08);
    color: rgba(255, 255, 255, 0.6);
  }

  .danger {
    background: #d64545;
  }

  .confirm {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.75rem;
    color: rgba(255, 255, 255, 0.7);
  }

  button:disabled {
    opacity: 0.35;
    cursor: default;
  }

  @media (min-width: 700px) {
    .grid {
      grid-template-columns: repeat(3, 1fr);
    }

    .body {
      flex-direction: column;
      gap: 0.6rem;
    }

    .nums {
      grid-template-columns: repeat(2, 1fr);
      width: 100%;
    }
  }
</style>
