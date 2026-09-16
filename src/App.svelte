<main class="shell">
  <h1>Solitaire Collection</h1>
  <p>Klondike &middot; FreeCell &middot; TriPeaks</p>
</main>

<style>
  .shell {
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: calc(1rem + var(--sat)) calc(1rem + var(--sar))
      calc(1rem + var(--sab)) calc(1rem + var(--sal));
    text-align: center;
  }

  h1 {
    font-size: clamp(1.75rem, 6vw, 3rem);
    font-weight: 700;
    letter-spacing: -0.02em;
  }

  p {
    color: rgba(255, 255, 255, 0.65);
    font-size: clamp(0.95rem, 3vw, 1.15rem);
  }
</style>
