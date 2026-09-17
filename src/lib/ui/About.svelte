<script lang="ts">
  /**
   * About overlay (Phase 7): version, credits, source link, tech badge,
   * privacy note. Opened from the menu footer via `uiStore.aboutOpen`.
   */
  import { uiStore } from '../stores/ui.svelte.js';
  import { APP_VERSION, REPO_URL } from '../version.js';
</script>

<div class="overlay" role="dialog" aria-modal="true" aria-label="About">
  <div class="dialog">
    <p class="title">SOLITAIRE COLLECTION</p>
    <p class="ver">v{APP_VERSION}-solo</p>

    <p class="line">
      Klondike · FreeCell · TriPeaks — every deal solver-verified.
    </p>

    <p class="badge">Made with Svelte + Phaser</p>

    <p class="line privacy">
      No data leaves your device.<br />Stats and settings live in local storage only.
    </p>

    {#if REPO_URL}
      <a class="src" href={REPO_URL} target="_blank" rel="noopener noreferrer">Source on GitHub</a>
    {/if}

    <div class="row">
      <button class="primary" onclick={() => (uiStore.aboutOpen = false)}>Done</button>
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
  }

  .dialog {
    background: #123f30;
    border: 1px solid rgba(255, 255, 255, 0.16);
    border-radius: 14px;
    padding: 1.25rem 1.4rem;
    max-width: 22rem;
    text-align: center;
  }

  .title {
    margin: 0;
    font-weight: 700;
    letter-spacing: 0.18em;
    font-size: 0.95rem;
  }

  .ver {
    margin: 0.2rem 0 0;
    font-size: 0.75rem;
    color: rgba(255, 255, 255, 0.55);
    font-variant-numeric: tabular-nums;
  }

  .line {
    margin: 0.9rem 0 0;
    font-size: 0.82rem;
    color: rgba(255, 255, 255, 0.75);
    line-height: 1.45;
  }

  .badge {
    display: inline-block;
    margin: 0.9rem 0 0;
    padding: 0.35rem 0.8rem;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.2);
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    color: #ffd166;
  }

  .privacy {
    color: rgba(255, 255, 255, 0.8);
  }

  .src {
    display: inline-block;
    margin-top: 0.9rem;
    font-size: 0.8rem;
    color: #ffd166;
  }

  .row {
    display: flex;
    justify-content: center;
    margin-top: 1rem;
  }

  .primary {
    border: 0;
    border-radius: 999px;
    padding: 0.45rem 1.2rem;
    background: #ffd166;
    color: #123f30;
    font: inherit;
    font-weight: 700;
    cursor: pointer;
  }
</style>
