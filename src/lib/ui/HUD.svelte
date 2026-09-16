<script lang="ts">
  import { gameStore } from '../stores/gameStore.svelte.js';

  let now = $state(Date.now());
  $effect(() => {
    const t = setInterval(() => {
      now = Date.now();
    }, 500);
    return () => clearInterval(t);
  });

  const cur = $derived(gameStore.state);
  const elapsed = $derived(
    cur.status === 'playing' ? now - cur.startedAt : cur.elapsedMs
  );

  function fmt(ms: number): string {
    const s = Math.max(0, Math.floor(ms / 1000));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }
</script>

<header class="hud">
  <span class="brand">Solitaire</span>
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

<style>
  .hud {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.5rem 0.75rem;
    background: rgba(0, 0, 0, 0.28);
    font-size: 0.9rem;
    user-select: none;
  }

  .brand {
    font-weight: 700;
    letter-spacing: -0.02em;
  }

  .stats {
    display: flex;
    gap: 0.9rem;
    color: rgba(255, 255, 255, 0.75);
    font-variant-numeric: tabular-nums;
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
</style>
