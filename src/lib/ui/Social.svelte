<script lang="ts">
  /**
   * Social overlay (Phase 10) — four tabs over Nakama's REST API:
   *   board   — race_wins + race_best leaderboards
   *   friends — list / add-by-username / remove
   *   history — past races with replay buttons (move-log playback)
   *   profile — username + email identity upgrade
   */
  import { socialStore, type HistoryEntry, type SocialTab } from '../stores/socialStore.svelte.js';
  import { replayStore } from '../stores/replayStore.svelte.js';
  import { uiStore } from '../stores/ui.svelte.js';

  let friendName = $state('');
  let friendMsg = $state<string | null>(null);
  let usernameDraft = $state('');
  let profileMsg = $state<string | null>(null);
  let emailDraft = $state('');
  let passwordDraft = $state('');
  let emailMsg = $state<string | null>(null);

  const TABS: { id: SocialTab; label: string }[] = [
    { id: 'board', label: 'Leaderboard' },
    { id: 'friends', label: 'Friends' },
    { id: 'history', label: 'History' },
    { id: 'profile', label: 'Profile' }
  ];

  function fmtDate(ms: number): string {
    if (!ms) return '';
    return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  function outcomeClass(o: HistoryEntry['outcome']): string {
    return o === 'won' ? 'won' : o === 'draw' ? 'draw' : 'lost';
  }

  async function addFriend(): Promise<void> {
    const name = friendName.trim();
    if (!name) return;
    friendMsg = null;
    const ok = await socialStore.addFriend(name);
    friendMsg = ok ? null : `No player named "${name}"`;
    if (ok) friendName = '';
  }

  async function saveName(): Promise<void> {
    const name = usernameDraft.trim();
    if (!name) return;
    profileMsg = null;
    try {
      await socialStore.saveUsername(name);
      profileMsg = 'Saved.';
      usernameDraft = '';
    } catch {
      profileMsg = 'That name is taken.';
    }
  }

  async function link(): Promise<void> {
    const email = emailDraft.trim();
    if (!email || !passwordDraft) return;
    emailMsg = null;
    try {
      await socialStore.linkEmail(email, passwordDraft);
      emailMsg = 'Email linked — your account now survives device changes.';
      emailDraft = '';
      passwordDraft = '';
    } catch {
      emailMsg = 'Could not link that email.';
    }
  }

  function watch(e: HistoryEntry, side: 'me' | 'opponent'): void {
    uiStore.socialOpen = false;
    uiStore.menuOpen = false;
    replayStore.open(e, side);
  }

  $effect(() => {
    if (uiStore.socialOpen) void socialStore.load();
  });
</script>

{#if uiStore.socialOpen}
  <div class="overlay" role="dialog" aria-modal="true" aria-label="Social" tabindex="-1">
    <div class="panel">
      <div class="head">
        <span class="title">Social</span>
        <button class="ghost" onclick={() => (uiStore.socialOpen = false)}>✕</button>
      </div>

      <nav class="tabs" aria-label="Social sections">
        {#each TABS as t (t.id)}
          <button
            class="tab"
            class:on={socialStore.tab === t.id}
            onclick={() => (socialStore.tab = t.id)}>{t.label}</button>
        {/each}
      </nav>

      {#if socialStore.errorMsg}
        <p class="err">{socialStore.errorMsg}</p>
      {:else if socialStore.loading && socialStore.wins.length === 0}
        <p class="dim">Loading…</p>

      {:else if socialStore.tab === 'board'}
        <div class="scroll">
          <h3>Most wins</h3>
          {#if socialStore.wins.length === 0}<p class="dim">No races finished yet.</p>{/if}
          {#each socialStore.wins as r (r.userId)}
            <div class="row" class:me={r.mine}>
              <span class="rank">#{r.rank}</span>
              <span class="name">{r.username}</span>
              <span class="val">{r.value}</span>
            </div>
          {/each}
          <h3>Best score</h3>
          {#each socialStore.best as r (r.userId)}
            <div class="row" class:me={r.mine}>
              <span class="rank">#{r.rank}</span>
              <span class="name">{r.username}</span>
              <span class="val">{r.value}</span>
            </div>
          {/each}
        </div>

      {:else if socialStore.tab === 'friends'}
        <div class="scroll">
          <form class="add" onsubmit={(e) => { e.preventDefault(); void addFriend(); }}>
            <input bind:value={friendName} placeholder="Friend's username" autocomplete="off" />
            <button class="btn primary" type="submit">Add</button>
          </form>
          {#if friendMsg}<p class="err small">{friendMsg}</p>{/if}
          {#if socialStore.friends.length === 0}<p class="dim">No friends yet — add by username.</p>{/if}
          {#each socialStore.friends as f (f.user?.id)}
            <div class="row">
              <span class="name">{f.user?.username ?? 'player'}</span>
              <button class="ghost" onclick={() => void socialStore.removeFriend(f.user?.id ?? '')}>✕</button>
            </div>
          {/each}
        </div>

      {:else if socialStore.tab === 'history'}
        <div class="scroll">
          {#if socialStore.history.length === 0}<p class="dim">Finish a race and it lands here.</p>{/if}
          {#each socialStore.history as h (h.matchId)}
            <div class="hrow">
              <div class="hinfo">
                <span class="badge {outcomeClass(h.outcome)}">{h.outcome}</span>
                <span class="name">vs {h.opponentName}</span>
                <span class="dim small">{h.myScore}–{h.oppScore} · {fmtDate(h.playedAt)}</span>
              </div>
              <div class="hact">
                <button class="btn small" onclick={() => watch(h, 'me')}>▶ Me</button>
                <button class="btn small" onclick={() => watch(h, 'opponent')}>▶ Them</button>
              </div>
            </div>
          {/each}
        </div>

      {:else}
        <div class="scroll">
          <h3>Player name</h3>
          <p class="dim small">Current: <b>{socialStore.username || '—'}</b></p>
          <form class="add" onsubmit={(e) => { e.preventDefault(); void saveName(); }}>
            <input bind:value={usernameDraft} placeholder="New username" autocomplete="off" />
            <button class="btn primary" type="submit">Save</button>
          </form>
          {#if profileMsg}<p class="dim small">{profileMsg}</p>{/if}

          <h3>Secure your account</h3>
          {#if socialStore.emailLinked}
            <p class="dim small">Email linked — you can sign in on any device.</p>
          {:else}
            <p class="dim small">Right now you only exist on this device. Link an email to keep your stats.</p>
            <form class="addcol" onsubmit={(e) => { e.preventDefault(); void link(); }}>
              <input bind:value={emailDraft} type="email" placeholder="Email" autocomplete="email" />
              <input bind:value={passwordDraft} type="password" placeholder="Password" autocomplete="new-password" />
              <button class="btn primary" type="submit">Link email</button>
            </form>
            {#if emailMsg}<p class="dim small">{emailMsg}</p>{/if}
          {/if}
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
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
    width: min(24rem, calc(100vw - 2rem));
    max-height: min(34rem, calc(100dvh - 2rem));
    display: flex;
    flex-direction: column;
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

  .tabs {
    display: flex;
    gap: 0.3rem;
    margin-bottom: 0.7rem;
  }

  .tab {
    flex: 1;
    padding: 0.35rem 0.2rem;
    font-size: 0.75rem;
    font-weight: 600;
    border-radius: 8px;
  }

  .tab.on {
    background: #ffd166;
    color: #1a2b23;
  }

  .scroll {
    overflow-y: auto;
    min-height: 8rem;
  }

  h3 {
    margin: 0.8rem 0 0.4rem;
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: rgba(255, 255, 255, 0.5);
  }

  h3:first-child {
    margin-top: 0;
  }

  .row {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.4rem 0.2rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.07);
  }

  .row.me .name {
    color: #ffd166;
  }

  .rank {
    width: 2.2rem;
    font-size: 0.75rem;
    color: rgba(255, 255, 255, 0.5);
    font-variant-numeric: tabular-nums;
  }

  .name {
    flex: 1;
    font-weight: 600;
    font-size: 0.9rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .val {
    font-variant-numeric: tabular-nums;
    font-weight: 700;
  }

  .hrow {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.45rem 0.2rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.07);
  }

  .hinfo {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    min-width: 0;
  }

  .hact {
    display: flex;
    gap: 0.3rem;
  }

  .badge {
    font-size: 0.65rem;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  .badge.won { color: #7ee2a8; }
  .badge.draw { color: #ffd166; }
  .badge.lost { color: #ff9d9d; }

  .add {
    display: flex;
    gap: 0.4rem;
    margin-bottom: 0.5rem;
  }

  .addcol {
    display: grid;
    gap: 0.4rem;
    margin-bottom: 0.5rem;
  }

  input {
    flex: 1;
    min-width: 0;
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 8px;
    color: #f5f7f5;
    padding: 0.45rem 0.6rem;
    font: inherit;
    font-size: 0.85rem;
  }

  input::placeholder {
    color: rgba(255, 255, 255, 0.4);
  }

  .dim {
    color: rgba(255, 255, 255, 0.55);
    font-size: 0.85rem;
  }

  .small {
    font-size: 0.75rem;
  }

  .err {
    color: #ffb3b3;
    font-size: 0.85rem;
  }

  .err.small {
    font-size: 0.75rem;
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

  .btn.small {
    padding: 0.3rem 0.7rem;
    font-size: 0.75rem;
  }

  .btn.primary {
    background: #ffd166;
    color: #1a2b23;
  }
</style>
