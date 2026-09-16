<script lang="ts">
  import type { VariantId } from '../engine/types.js';
  import { gameStore } from '../stores/gameStore.svelte.js';

  const VARIANTS: { id: VariantId; short: string; full: string }[] = [
    { id: 'klondike', short: 'K', full: 'Klondike' },
    { id: 'freecell', short: 'FC', full: 'FreeCell' },
    { id: 'tripeaks', short: 'TP', full: 'TriPeaks' }
  ];

  let now = $state(Date.now());
  $effect(() => {
    const t = setInterval(() => {
      now = Date.now();
    }, 500);
    return () => clearInterval(t);
  });

  const cur = $derived(gameStore.state);
  const pending = $derived(gameStore.pendingSwitch);
  const pendingName = $derived(VARIANTS.find((v) => v.id === pending)?.full ?? '');
  const elapsed = $derived(
    cur.status === 'playing' ? now - cur.startedAt : cur.elapsedMs
  );

  function fmt(ms: number): string {
    const s = Math.max(0, Math.floor(ms / 1000));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }
</script>

<header class="hud">
  <div class="left">
    <button class="ghost" title="Menu" aria-label="Menu" onclick={() => gameStore.openMenu()}>
      ☰
    </button>
    <div class="switcher" role="group" aria-label="Variant">
      {#each VARIANTS as v (v.id)}
        <button
          class="seg"
          class:active={cur.variant === v.id}
          onclick={() => gameStore.requestSwitch(v.id)}
        >
          <span class="short">{v.short}</span>
          <span class="full">{v.full}</span>
        </button>
      {/each}
    </div>
  </div>
  <div class="stats">
    {#if cur.status !== 'playing'}
      <span class="status">{cur.status === 'won' ? 'You win!' : 'No moves left'}</span>
    {/if}
    <span>{gameStore.moveCount} moves</span>
    <span>{fmt(elapsed)}</span>
  </div>
  <div class="actions">
    <button onclick={() => gameStore.undo()} disabled={!gameStore.canUndo}>Undo</button>
    <button onclick={() => gameStore.newGame()}>New</button>
  </div>
</header>

{#if pending}
  <div class="overlay" role="dialog" aria-modal="true" aria-label="Switch variant">
    <div class="dialog">
      <p class="q">Save and switch to {pendingName}?</p>
      <p class="sub">Your current game can be resumed later.</p>
      <div class="row">
        <button class="primary" onclick={() => gameStore.confirmSwitch(true)}>Save</button>
        <button onclick={() => gameStore.confirmSwitch(false)}>Discard</button>
        <button onclick={() => gameStore.cancelSwitch()}>Cancel</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .hud {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.6rem;
    padding: 0.5rem 0.6rem;
    background: rgba(0, 0, 0, 0.28);
    font-size: 0.9rem;
    user-select: none;
  }

  .left {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
  }

  .switcher {
    display: flex;
    border-radius: 999px;
    overflow: hidden;
    background: rgba(255, 255, 255, 0.08);
  }

  .seg {
    border-radius: 0;
    background: transparent;
    padding: 0.35rem 0.6rem;
  }

  .seg.active {
    background: rgba(255, 255, 255, 0.22);
  }

  .seg .full {
    display: none;
  }

  .stats {
    display: flex;
    gap: 0.9rem;
    color: rgba(255, 255, 255, 0.75);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .status {
    color: #ffd166;
    font-weight: 600;
  }

  .actions {
    display: flex;
    gap: 0.5rem;
  }

  button {
    padding: 0.35rem 0.85rem;
    border: 0;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.14);
    color: #f5f7f5;
    font: inherit;
    font-weight: 600;
    cursor: pointer;
  }

  button:disabled {
    opacity: 0.4;
    cursor: default;
  }

  button:not(:disabled):active {
    transform: scale(0.96);
  }

  .ghost {
    padding: 0.35rem 0.6rem;
    line-height: 1;
  }

  .overlay {
    position: fixed;
    inset: 0;
    display: grid;
    place-items: center;
    background: rgba(0, 0, 0, 0.55);
    z-index: 30;
  }

  .dialog {
    background: #123f30;
    border: 1px solid rgba(255, 255, 255, 0.16);
    border-radius: 14px;
    padding: 1.1rem 1.25rem;
    max-width: 20rem;
    text-align: center;
  }

  .q {
    margin: 0;
    font-weight: 700;
  }

  .sub {
    margin: 0.35rem 0 0;
    font-size: 0.8rem;
    color: rgba(255, 255, 255, 0.6);
  }

  .row {
    display: flex;
    gap: 0.5rem;
    justify-content: center;
    margin-top: 0.9rem;
  }

  .row .primary {
    background: #ffd166;
    color: #123f30;
  }

  @media (min-width: 620px) {
    .seg .short {
      display: none;
    }

    .seg .full {
      display: inline;
    }
  }
</style>
