<script lang="ts">
  /**
   * Race mode UI — two surfaces:
   * 1. Overlay panel: matchmaking lobby, result, and error states.
   * 2. In-race chip: server countdown + opponent score, pinned over the board.
   */
  import { raceStore } from '../stores/raceStore.svelte.js';
  import { uiStore } from '../stores/ui.svelte.js';

  function fmtClock(s: number | null): string {
    if (s === null) return '–:––';
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  const headline = $derived(
    raceStore.result?.outcome === 'won'
      ? 'You win!'
      : raceStore.result?.outcome === 'lost'
        ? 'You lost'
        : raceStore.result?.outcome === 'draw'
          ? 'Draw'
          : 'Race aborted'
  );

  const reasonText = $derived(
    raceStore.result?.reason === 'solved'
      ? 'Solved first'
      : raceStore.result?.reason === 'timeout'
        ? 'Higher score at time'
        : raceStore.result?.reason === 'forfeit'
          ? 'Opponent disconnected'
          : raceStore.result?.reason === 'draw'
            ? 'Dead even'
            : 'Not enough players'
  );

  async function find(): Promise<void> {
    uiStore.raceOpen = true;
    await raceStore.findMatch();
  }

  async function cancel(): Promise<void> {
    await raceStore.leave();
    uiStore.raceOpen = false;
  }

  function closeResult(): void {
    raceStore.dismiss();
    uiStore.raceOpen = false;
  }
</script>

<!-- In-race chip: countdown + opponent progress, visible while playing. -->
{#if raceStore.inRace && raceStore.secondsLeft !== null}
  <div class="race-chip" role="status" aria-label="Race status">
    <span class="clock" class:low={(raceStore.secondsLeft ?? 999) < 60}>{fmtClock(raceStore.secondsLeft)}</span>
    {#if raceStore.opponent}
      <span class="opp">
        <b>{raceStore.opponent.username}</b>
        {raceStore.opponent.score} pts
        {#if !raceStore.opponent.connected}<i>· offline</i>{/if}
        {#if raceStore.opponent.finished}<i>· finished!</i>{/if}
      </span>
    {/if}
  </div>
{/if}

<!-- Overlay panel: lobby / result / error. -->
{#if uiStore.raceOpen}
  <div class="overlay" role="dialog" aria-modal="true" aria-label="Race mode" tabindex="-1">
    <div class="panel">
      <div class="head">
        <span class="title">Race</span>
        {#if raceStore.phase === 'idle' || raceStore.phase === 'error'}
          <button class="ghost" onclick={() => (uiStore.raceOpen = false)}>✕</button>
        {/if}
      </div>

      {#if raceStore.phase === 'searching' || raceStore.phase === 'connecting' || raceStore.phase === 'matched'}
        <div class="center">
          <div class="spinner" aria-hidden="true"></div>
          <p class="status">
            {raceStore.phase === 'connecting'
              ? 'Connecting…'
              : raceStore.phase === 'matched'
                ? 'Opponent found — starting…'
                : 'Searching for an opponent…'}
          </p>
          <button class="btn" onclick={cancel}>Cancel</button>
        </div>
      {:else if raceStore.phase === 'ended' && raceStore.result}
        <div class="center">
          <p class="big">{headline}</p>
          <p class="reason">{reasonText}</p>
          <div class="scoreline">
            <span>You <b>{raceStore.result.myScore}</b></span>
            <span class="vs">vs</span>
            <span>{raceStore.opponent?.username ?? 'Opponent'} <b>{raceStore.result.oppScore}</b></span>
          </div>
          <div class="row">
            <button class="btn primary" onclick={find}>Race again</button>
            <button class="btn" onclick={closeResult}>Done</button>
          </div>
        </div>
      {:else if raceStore.phase === 'error'}
        <div class="center">
          <p class="status err">{raceStore.errorMsg ?? 'Something went wrong.'}</p>
          <div class="row">
            <button class="btn primary" onclick={find}>Retry</button>
            <button class="btn" onclick={() => (uiStore.raceOpen = false)}>Close</button>
          </div>
        </div>
      {:else}
        <div class="center">
          <p class="status">Race a live opponent — same deal, 5 minutes, highest score wins.</p>
          <button class="btn primary" onclick={find}>Find match</button>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .race-chip {
    position: fixed;
    top: calc(0.4rem + env(safe-area-inset-top));
    left: 50%;
    transform: translateX(-50%);
    z-index: 30;
    display: flex;
    align-items: center;
    gap: 0.7rem;
    background: rgba(10, 26, 20, 0.85);
    border: 1px solid rgba(255, 255, 255, 0.18);
    border-radius: 999px;
    padding: 0.3rem 0.9rem;
    backdrop-filter: blur(6px);
    font-variant-numeric: tabular-nums;
    pointer-events: none;
  }

  .clock {
    font-weight: 800;
    font-size: 1rem;
    color: #ffd166;
  }

  .clock.low {
    color: #ff7a7a;
  }

  .opp {
    font-size: 0.75rem;
    color: rgba(255, 255, 255, 0.8);
    display: flex;
    gap: 0.3rem;
    align-items: baseline;
  }

  .opp i {
    font-style: normal;
    color: rgba(255, 255, 255, 0.5);
  }

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
    width: min(22rem, calc(100vw - 2rem));
  }

  .head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.6rem;
  }

  .title {
    font-weight: 700;
    font-size: 1.05rem;
  }

  .center {
    display: grid;
    justify-items: center;
    gap: 0.8rem;
    padding: 0.5rem 0 0.3rem;
    text-align: center;
  }

  .status {
    margin: 0;
    font-size: 0.9rem;
    color: rgba(255, 255, 255, 0.75);
  }

  .status.err {
    color: #ffb3b3;
  }

  .big {
    margin: 0;
    font-size: 1.6rem;
    font-weight: 800;
  }

  .reason {
    margin: 0;
    font-size: 0.8rem;
    color: rgba(255, 255, 255, 0.6);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .scoreline {
    display: flex;
    gap: 0.6rem;
    align-items: baseline;
    font-size: 1rem;
    color: rgba(255, 255, 255, 0.85);
  }

  .vs {
    font-size: 0.7rem;
    color: rgba(255, 255, 255, 0.45);
    text-transform: uppercase;
  }

  .row {
    display: flex;
    gap: 0.5rem;
  }

  .spinner {
    width: 2rem;
    height: 2rem;
    border-radius: 50%;
    border: 3px solid rgba(255, 255, 255, 0.15);
    border-top-color: #ffd166;
    animation: spin 0.9s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
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

  .btn {
    padding: 0.45rem 1.1rem;
    font-weight: 600;
  }

  .btn.primary {
    background: #ffd166;
    color: #1a2b23;
  }
</style>
