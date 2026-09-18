<script lang="ts">
  import type { VariantId } from '../engine/types.js';
  import { gameStore } from '../stores/gameStore.svelte.js';
  import { settingsStore } from '../stores/settings.svelte.js';
  import { uiStore } from '../stores/ui.svelte.js';
  import { swStore, checkForUpdates, applyUpdate } from '../stores/sw.svelte.js';
  import { practiceStore } from '../stores/practice.svelte.js';
  import { statsStore } from '../stores/stats.svelte.js';
  import { getVariant } from '../variants/index.js';

  const VARIANTS: { id: VariantId; full: string }[] = [
    { id: 'klondike', full: 'Klondike' },
    { id: 'freecell', full: 'FreeCell' },
    { id: 'tripeaks', full: 'TriPeaks' },
    { id: 'spider', full: 'Spider' },
    { id: 'pyramid', full: 'Pyramid' }
  ];

  let now = $state(Date.now());
  $effect(() => {
    const t = setInterval(() => {
      now = Date.now();
    }, 500);
    return () => clearInterval(t);
  });

  let settingsOpen = $state(false);
  let helpOpen = $state(false);
  let newConfirm = $state(false);
  let quitConfirm = $state(false);

  const RULES: Record<VariantId, { title: string; lines: string[] }> = {
    klondike: {
      title: 'How to play Klondike',
      lines: [
        'Goal: build all four foundations from Ace up to King, by suit.',
        'Tableau columns build downward in alternating colours — a red 7 goes on a black 8.',
        'Only a King can fill an empty column.',
        'Tap the deck to draw a card.',
        'Face-down cards flip over when you uncover them.'
      ]
    },
    freecell: {
      title: 'How to play FreeCell',
      lines: [
        'Goal: build all four foundations from Ace up to King, by suit.',
        'Every card is face-up — the puzzle is planning, not luck.',
        'The four free cells (top-left) each hold one card; they are your workspace.',
        'Columns build downward in alternating colours; an empty column takes any card.',
        'A run can only move if your free cells and empty columns leave enough room.'
      ]
    },
    tripeaks: {
      title: 'How to play TriPeaks',
      lines: [
        'Goal: clear all three peaks.',
        'Tap an uncovered card that is one rank higher or lower than the waste card — chains wrap, so Ace plays on King.',
        'No playable card? Tap the stock to draw — it is limited, so spend it wisely.',
        'Clearing a card can uncover the ones beneath it; long chains are the fastest way up.'
      ]
    },
    spider: {
      title: 'How to play Spider',
      lines: [
        'Goal: clear all eight runs — King down to Ace, all in the same suit.',
        'Columns build downward regardless of suit, but only same-suit runs can move together.',
        'Tap the stock to deal one card onto every column — every column must hold a card first.',
        'A completed King-to-Ace run in one suit clears itself to a top slot.',
        'Any card or run can fill an empty column.'
      ]
    },
    pyramid: {
      title: 'How to play Pyramid',
      lines: [
        'Goal: clear the whole pyramid by removing pairs that add up to 13.',
        'Only uncovered cards play — a card is blocked while anything rests on it.',
        'Kings clear on their own — tap one and it vanishes.',
        'Tap a card, then tap its partner; when a card has several partners, they glow so you can choose.',
        'Tap the stock to deal onto the waste — only the waste top plays. Stock runs out once, so spend it carefully.'
      ]
    }
  };

  const cur = $derived(gameStore.state);
  const pending = $derived(gameStore.pendingSwitch);
  const pendingName = $derived(VARIANTS.find((v) => v.id === pending)?.full ?? '');
  // The clock starts on the first move and freezes while paused (modal
  // open / tab hidden) — pauseBeganAt stands in for "now" then.
  const elapsed = $derived(
    cur.moves.length === 0
      ? 0
      : cur.status === 'playing'
        ? (gameStore.paused ? gameStore.pauseBeganAt : now) - cur.startedAt
        : cur.elapsedMs
  );
  // Practice race: the clock counts DOWN from 5:00 while racing.
  const racing = $derived(practiceStore.active && cur.status === 'playing');
  const remaining = $derived(practiceStore.endsAt === null ? 0 : practiceStore.endsAt - now);

  // Any open dialog freezes the play clock; reasons stack in the store.
  $effect(() => {
    gameStore.setPaused('settings', settingsOpen);
    gameStore.setPaused('help', helpOpen);
    gameStore.setPaused('confirm-new', newConfirm);
    gameStore.setPaused('confirm-quit', quitConfirm);
    gameStore.setPaused('switch', pending !== null);
    gameStore.setPaused('timeup', practiceStore.timeUp);
    return () => {
      for (const r of ['settings', 'help', 'confirm-new', 'confirm-quit', 'switch', 'timeup']) {
        gameStore.setPaused(r, false);
      }
    };
  });

  // Race bookkeeping: flag the deadline, stand down when the game ends.
  $effect(() => {
    if (racing && remaining <= 0) practiceStore.timeUp = true;
    if (practiceStore.active && cur.status !== 'playing') practiceStore.stop();
  });

  // End-of-game recap: the win flourish needs ~4s of runway (a skip-tap
  // just brings the modal up sooner); a loss shows almost immediately.
  let endOpen = $state(false);
  let endTimer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    const st = cur.status;
    clearTimeout(endTimer);
    if (st === 'playing') {
      endOpen = false;
      return;
    }
    endTimer = setTimeout(
      () => {
        endOpen = true;
      },
      st === 'won' ? 4000 : 800
    );
    return () => clearTimeout(endTimer);
  });
  const variantStats = $derived(statsStore.for(cur.variant));
  const isNewBest = $derived(
    cur.status === 'won' && variantStats.bestMs !== null && cur.elapsedMs <= variantStats.bestMs
  );

  /** New deals abandoning an in-progress game ask first. */
  function requestNew(): void {
    if (gameStore.inProgress) newConfirm = true;
    else gameStore.newGame();
  }

  function fmt(ms: number): string {
    const s = Math.max(0, Math.floor(ms / 1000));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }
</script>

<header class="hud">
  <div class="left">
    <button class="ghost" title="Menu" aria-label="Menu" onclick={() => (uiStore.navOpen = !uiStore.navOpen)}>
      ☰
    </button>
  </div>
  <div class="stats">
    {#if cur.status !== 'playing'}
      <span class="status">{cur.status === 'won' ? 'You win!' : 'No moves left'}</span>
    {/if}
    <span>{gameStore.moveCount} moves</span>
    {#if racing}
      <span class="race-clock" class:urgent={remaining < 60000}>⏱ {fmt(remaining)}</span>
    {:else}
      <span>{fmt(elapsed)}</span>
    {/if}
  </div>
  <div class="actions">
    <button class="wide" onclick={() => gameStore.requestHint()} disabled={cur.status !== 'playing'}>Hint</button>
    <button class="wide" onclick={() => gameStore.undo()} disabled={!gameStore.canUndo}>Undo</button>
    <button class="wide" onclick={() => gameStore.redo()} disabled={!gameStore.canRedo}>Redo</button>
    <button class="wide" onclick={requestNew}>New</button>
    <button class="ghost" title="Statistics" aria-label="Statistics" onclick={() => (uiStore.statsOpen = true)}>📊</button>
    <button class="ghost" title="How to play" aria-label="How to play" onclick={() => (helpOpen = true)}>?</button>
    <button class="ghost" title="Pause" aria-label="Pause" onclick={() => (settingsOpen = true)}>⏸</button>
  </div>
</header>

<!-- Thumb bar: icon-only game actions, bottom edge on small screens. -->
<nav class="actionbar" aria-label="Game actions">
  <button aria-label="Undo" title="Undo" onclick={() => gameStore.undo()} disabled={!gameStore.canUndo}>↶</button>
  <button aria-label="Redo" title="Redo" onclick={() => gameStore.redo()} disabled={!gameStore.canRedo}>↷</button>
  <button aria-label="Hint" title="Hint" onclick={() => gameStore.requestHint()} disabled={cur.status !== 'playing'}>💡</button>
  <button aria-label="New game" title="New game" onclick={requestNew}>＋</button>
</nav>

{#if settingsOpen}
  <div class="overlay" role="dialog" aria-modal="true" aria-label="Settings" tabindex="-1">
    <div class="dialog">
      <p class="q">Paused</p>
      <label class="slider-row">
        <span>Sound</span>
        <input
          type="range"
          min="0"
          max="100"
          value={Math.round(settingsStore.volume * 100)}
          oninput={(e) => (settingsStore.volume = Number(e.currentTarget.value) / 100)}
        />
        <span class="vol">{Math.round(settingsStore.volume * 100)}%</span>
      </label>
      <div class="slider-row">
        <span>App</span>
        {#if swStore.update === 'ready'}
          <button class="primary update-btn" onclick={applyUpdate}>Update ready — apply</button>
        {:else}
          <button
            class="ghost update-btn"
            onclick={checkForUpdates}
            disabled={swStore.update === 'checking' || swStore.update === 'applying'}
          >
            {swStore.update === 'checking' ? 'Checking…' : swStore.update === 'applying' ? 'Updating…' : 'Check Updates'}
          </button>
        {/if}
      </div>
      {#if swStore.update === 'none'}
        <p class="update-hint">You're on the latest version.</p>
      {:else if swStore.update === 'ready'}
        <p class="update-hint">A new version is ready — applying reloads the app.</p>
      {/if}
      <div class="row">
        <button class="primary" onclick={() => (settingsOpen = false)}>Resume</button>
        <button class="danger" onclick={() => (quitConfirm = true)}>Quit game</button>
      </div>
    </div>
  </div>
{/if}

{#if quitConfirm}
  <div class="overlay" role="dialog" aria-modal="true" aria-label="Quit game" tabindex="-1">
    <div class="dialog">
      <p class="q">Quit to the menu?</p>
      <p class="sub">Your game is saved — you can resume it anytime.</p>
      <div class="row">
        <button
          class="primary"
          onclick={() => {
            quitConfirm = false;
            settingsOpen = false;
            gameStore.openMenu();
          }}
        >
          Quit
        </button>
        <button onclick={() => (quitConfirm = false)}>Keep playing</button>
      </div>
    </div>
  </div>
{/if}

{#if practiceStore.timeUp}
  <div class="overlay" role="dialog" aria-modal="true" aria-label="Time up" tabindex="-1">
    <div class="dialog">
      <p class="q">⏱ Time!</p>
      <p class="sub">Final score: {getVariant(cur.variant).score(cur)} · {gameStore.moveCount} moves</p>
      <div class="row">
        <button
          class="primary"
          onclick={() => {
            gameStore.newGame();
            practiceStore.start();
          }}
        >
          Race again
        </button>
        <button
          onclick={() => {
            practiceStore.stop();
            settingsOpen = false;
            gameStore.openMenu();
          }}
        >
          Quit
        </button>
      </div>
    </div>
  </div>
{/if}

{#if helpOpen}
  <div class="overlay" role="dialog" aria-modal="true" aria-label="How to play" tabindex="-1">
    <div class="dialog help">
      <p class="q">{RULES[cur.variant].title}</p>
      <ul class="rules">
        {#each RULES[cur.variant].lines as line (line)}
          <li>{line}</li>
        {/each}
      </ul>
      <p class="sub">Tap a card to auto-play its best move, or drag cards and runs yourself.</p>
      <div class="row">
        <button class="primary" onclick={() => (helpOpen = false)}>Got it</button>
      </div>
    </div>
  </div>
{/if}

{#if newConfirm}
  <div class="overlay" role="dialog" aria-modal="true" aria-label="New game" tabindex="-1">
    <div class="dialog">
      <p class="q">Deal a new game?</p>
      <p class="sub">Your current game will be abandoned.</p>
      <div class="row">
        <button
          class="primary"
          onclick={() => {
            newConfirm = false;
            gameStore.newGame();
          }}
        >
          New game
        </button>
        <button onclick={() => (newConfirm = false)}>Keep playing</button>
      </div>
    </div>
  </div>
{/if}

{#if endOpen}
  <div class="overlay" role="dialog" aria-modal="true" aria-label="Game over" tabindex="-1">
    <div class="dialog recap-dialog">
      <button class="x-btn" aria-label="Close" onclick={() => (endOpen = false)}>✕</button>
      <p class="q">{cur.status === 'won' ? 'You win!' : 'No moves left'}</p>
      <div class="recap">
        <span class="stat-box"><b>{fmt(cur.elapsedMs)}</b><i>time</i></span>
        <span class="stat-box"><b>{cur.moves.length}</b><i>moves</i></span>
        <span class="stat-box"><b>{getVariant(cur.variant).score(cur)}</b><i>score</i></span>
      </div>
      {#if cur.status === 'won' && variantStats.bestMs !== null}
        <p class="sub">
          Best time: {fmt(variantStats.bestMs)}{isNewBest ? ' — new best!' : ''}
        </p>
      {/if}
      <div class="row">
        <button
          class="primary"
          onclick={() => {
            endOpen = false;
            gameStore.newGame();
          }}
        >
          Play again
        </button>
        <button
          onclick={() => {
            endOpen = false;
            gameStore.openMenu();
          }}
        >
          Home
        </button>
      </div>
    </div>
  </div>
{/if}

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
    gap: 0.5rem;
    padding: 0.45rem 0.6rem;
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

  .race-clock {
    color: #ffd166;
    font-weight: 700;
  }

  .race-clock.urgent {
    color: #ff8f97;
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

  /* Bottom thumb bar — phones only; hidden on desktop. */
  .actionbar {
    display: none;
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

  .row .danger {
    background: rgba(192, 42, 51, 0.25);
    color: #ffb4ba;
  }

  .slider-row {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    margin-top: 0.9rem;
    font-size: 0.85rem;
  }

  .slider-row input[type='range'] {
    flex: 1;
    accent-color: #ffd166;
  }

  .vol {
    min-width: 2.6rem;
    text-align: right;
    font-variant-numeric: tabular-nums;
    color: rgba(255, 255, 255, 0.7);
  }

  .slider-row span:first-child {
    flex: 1;
  }

  .update-btn {
    font-size: 0.8rem;
    padding: 0.4rem 0.7rem;
  }

  .update-hint {
    margin: 0.4rem 0 0;
    font-size: 0.75rem;
    color: rgba(255, 255, 255, 0.55);
  }

  .dialog.help {
    max-width: 22rem;
    text-align: left;
  }

  .dialog.help .q {
    text-align: center;
  }

  .rules {
    margin: 0.6rem 0 0;
    padding-left: 1.1rem;
    font-size: 0.82rem;
    line-height: 1.45;
    color: rgba(255, 255, 255, 0.85);
  }

  .rules li + li {
    margin-top: 0.3rem;
  }

  .recap-dialog {
    position: relative;
  }

  .x-btn {
    position: absolute;
    top: 0.45rem;
    right: 0.5rem;
    padding: 0.25rem 0.5rem;
    border-radius: 8px;
    background: transparent;
    color: rgba(255, 255, 255, 0.6);
  }

  .recap {
    display: flex;
    justify-content: center;
    gap: 1.1rem;
    margin-top: 0.9rem;
  }

  .stat-box {
    display: flex;
    flex-direction: column;
    min-width: 3.4rem;
  }

  .stat-box b {
    font-size: 1.15rem;
    font-variant-numeric: tabular-nums;
  }

  .stat-box i {
    font-style: normal;
    font-size: 0.66rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: rgba(255, 255, 255, 0.55);
  }

  @media (max-width: 620px) {
    .hud {
      gap: 0.35rem;
      padding: 0.4rem 0.45rem;
      font-size: 0.8rem;
    }

    .stats {
      gap: 0.45rem;
      font-size: 0.75rem;
    }

    /* Text action buttons move to the bottom thumb bar as icons. */
    .actions .wide {
      display: none;
    }

    .actionbar {
      display: flex;
      justify-content: space-evenly;
      gap: 0.5rem;
      padding: 0.35rem 0.6rem;
      background: rgba(0, 0, 0, 0.22);
    }

    .actionbar button {
      flex: 1;
      max-width: 6rem;
      min-height: 48px;
      font-size: 1.25rem;
      line-height: 1;
      border-radius: 12px;
    }
  }
</style>
