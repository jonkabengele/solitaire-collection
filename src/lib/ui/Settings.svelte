<script lang="ts">
  /**
   * Standalone settings overlay — reachable from the sidenav outside a
   * game. Shares SettingsPanel with the in-game pause dialog so the
   * controls never diverge.
   */
  import { uiStore } from '../stores/ui.svelte.js';
  import SettingsPanel from './SettingsPanel.svelte';
</script>

<div class="overlay" role="dialog" aria-modal="true" aria-label="Settings">
  <div class="dialog">
    <p class="q">Settings</p>
    <SettingsPanel />
    <div class="row">
      <button class="primary" onclick={() => (uiStore.settingsOpen = false)}>Done</button>
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
    width: min(22rem, calc(100vw - 2rem));
    color: #f5f7f5;
  }

  .q {
    margin: 0;
    font-weight: 700;
  }

  .row {
    margin-top: 0.9rem;
    display: flex;
    justify-content: flex-end;
  }
</style>
