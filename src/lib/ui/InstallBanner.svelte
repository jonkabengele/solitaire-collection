<script lang="ts">
  import { installStore } from '../stores/install.svelte.js';
</script>

{#if installStore.bannerOpen}
  <div class="banner" role="dialog" aria-label="Install app">
    <div class="text">
      <b>Nice win.</b>
      {#if installStore.ios}
        Add to your Home Screen — tap Share, then "Add to Home Screen".
      {:else}
        Install Solitaire for instant offline play.
      {/if}
    </div>
    <div class="btns">
      {#if installStore.canPrompt}
        <button class="primary" onclick={() => installStore.install()}>Install</button>
      {/if}
      <button class="ghost" onclick={() => installStore.dismiss()}>
        {installStore.canPrompt ? 'Not now' : 'Got it'}
      </button>
    </div>
  </div>
{/if}

<style>
  .banner {
    position: fixed;
    left: 50%;
    bottom: calc(var(--sab) + 0.9rem);
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: 1rem;
    background: #123f30;
    border: 1px solid rgba(255, 255, 255, 0.18);
    border-radius: 12px;
    padding: 0.7rem 0.9rem;
    width: min(26rem, calc(100vw - 1.5rem));
    box-shadow: 0 8px 28px rgba(0, 0, 0, 0.4);
    z-index: 50;
    font-size: 0.85rem;
  }

  .text {
    flex: 1;
    color: rgba(255, 255, 255, 0.85);
  }

  .text b {
    color: #ffd166;
    margin-right: 0.3rem;
  }

  .btns {
    display: flex;
    gap: 0.4rem;
    flex: none;
  }

  button {
    border: 0;
    border-radius: 999px;
    padding: 0.4rem 0.9rem;
    font: inherit;
    font-weight: 600;
    cursor: pointer;
  }

  .primary {
    background: #ffd166;
    color: #123f30;
  }

  .ghost {
    background: rgba(255, 255, 255, 0.12);
    color: #f5f7f5;
  }
</style>
