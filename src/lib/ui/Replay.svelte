<script lang="ts">
  /**
   * Replay transport bar — pinned to the bottom of the board while
   * `replayStore.active`. Play/pause, step, seek slider, perspective
   * toggle (my moves vs the opponent's), and exit.
   */
  import { replayStore } from '../stores/replayStore.svelte.js';
  import { uiStore } from '../stores/ui.svelte.js';

  function onSeek(e: Event): void {
    replayStore.seek(Number((e.target as HTMLInputElement).value));
  }

  function exit(): void {
    replayStore.close();
    uiStore.menuOpen = true;
  }
</script>

{#if replayStore.active && replayStore.entry}
  <div class="bar" role="region" aria-label="Race replay">
    <div class="meta">
      <span class="who">
        Replay — vs <b>{replayStore.entry.opponentName}</b>
      </span>
      <div class="sides" role="group" aria-label="Perspective">
        <button
          class="side"
          class:on={replayStore.side === 'me'}
          onclick={() => replayStore.setSide('me')}>Me</button>
        <button
          class="side"
          class:on={replayStore.side === 'opponent'}
          onclick={() => replayStore.setSide('opponent')}>Them</button>
      </div>
    </div>

    <div class="controls">
      <button class="tbtn" aria-label="Step back" onclick={() => replayStore.stepBy(-1)}>⏮</button>
      <button
        class="tbtn play"
        aria-label={replayStore.playing ? 'Pause' : 'Play'}
        onclick={() => (replayStore.playing ? replayStore.pause() : replayStore.play())}>
        {replayStore.playing ? '⏸' : '▶'}
      </button>
      <button class="tbtn" aria-label="Step forward" onclick={() => replayStore.stepBy(1)}>⏭</button>
      <input
        class="slider"
        type="range"
        min="0"
        max={replayStore.total}
        value={replayStore.pos}
        oninput={onSeek}
        aria-label="Move position" />
      <span class="count">{replayStore.pos}/{replayStore.total}</span>
      <button class="tbtn exit" onclick={exit}>✕</button>
    </div>
  </div>
{/if}

<style>
  .bar {
    position: fixed;
    left: 50%;
    bottom: calc(0.6rem + env(safe-area-inset-bottom));
    transform: translateX(-50%);
    z-index: 35;
    width: min(26rem, calc(100vw - 1rem));
    background: rgba(10, 26, 20, 0.92);
    border: 1px solid rgba(255, 255, 255, 0.18);
    border-radius: 14px;
    padding: 0.5rem 0.8rem 0.6rem;
    backdrop-filter: blur(8px);
    display: grid;
    gap: 0.45rem;
  }

  .meta {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.5rem;
  }

  .who {
    font-size: 0.78rem;
    color: rgba(255, 255, 255, 0.75);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sides {
    display: flex;
    gap: 0.25rem;
  }

  .side {
    padding: 0.2rem 0.65rem;
    font-size: 0.7rem;
    font-weight: 700;
    border-radius: 999px;
    border: 0;
    background: rgba(255, 255, 255, 0.12);
    color: #f5f7f5;
    cursor: pointer;
  }

  .side.on {
    background: #ffd166;
    color: #1a2b23;
  }

  .controls {
    display: flex;
    align-items: center;
    gap: 0.45rem;
  }

  .tbtn {
    border: 0;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.14);
    color: #f5f7f5;
    width: 2rem;
    height: 2rem;
    font-size: 0.9rem;
    cursor: pointer;
    flex-shrink: 0;
  }

  .tbtn.play {
    background: #ffd166;
    color: #1a2b23;
  }

  .tbtn.exit {
    background: transparent;
  }

  .slider {
    flex: 1;
    min-width: 0;
    accent-color: #ffd166;
  }

  .count {
    font-size: 0.7rem;
    color: rgba(255, 255, 255, 0.6);
    font-variant-numeric: tabular-nums;
    flex-shrink: 0;
  }
</style>
