<script lang="ts">
  /**
   * Shared settings rows — volume + app updates. Used by the in-game
   * pause dialog (HUD) and the standalone Settings overlay reachable
   * from the sidenav, so both stay in sync.
   */
  import { settingsStore } from '../stores/settings.svelte.js';
  import { swStore, checkForUpdates, applyUpdate } from '../stores/sw.svelte.js';
</script>

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
{:else if swStore.update === 'unsupported'}
  <p class="update-hint">Update checks need the installed app — this build runs without a service worker.</p>
{:else if swStore.update === 'ready'}
  <p class="update-hint">A new version is ready — applying reloads the app.</p>
{/if}

<style>
  .slider-row {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    margin: 0.6rem 0;
    font-size: 0.85rem;
  }

  .slider-row input[type='range'] {
    flex: 1;
  }

  .vol {
    width: 2.6rem;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  .update-btn {
    margin-left: auto;
  }

  .update-hint {
    margin: 0.2rem 0 0;
    font-size: 0.72rem;
    color: rgba(255, 255, 255, 0.5);
  }
</style>
