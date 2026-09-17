/**
 * Social layer store (Phase 10): profile, friends, leaderboards, and race
 * history — all over Nakama's REST API via `api()` (no realtime socket).
 * Everything lazy-loads on first `load()` so solo play never touches it.
 *
 * History entries mirror what `server/core.ts` writes to `race_history`
 * storage on match end — including both players' move logs for replay.
 */
import type { Friend, LeaderboardRecord, StorageObject } from '@heroiclabs/nakama-js';
import type { Move, VariantId } from '../engine/types.js';
import { api, getUserId } from '../net/nakama.js';

/** One row of the race leaderboards. */
export interface LeaderRow {
  userId: string;
  username: string;
  /** Wins for `race_wins`, best single-race score for `race_best`. */
  value: number;
  rank: number;
  mine: boolean;
}

/** A persisted race result with both move logs (replay source). */
export interface HistoryEntry {
  matchId: string;
  variant: VariantId;
  seed: string;
  outcome: 'won' | 'lost' | 'draw' | 'aborted';
  myScore: number;
  oppScore: number;
  opponentName: string;
  opponentId: string;
  playedAt: number;
  myMoves: Move[];
  oppMoves: Move[];
}

interface RawHistorySide {
  userId?: string;
  username?: string;
  score?: number;
}

/** Shape written by `recordResult` in server/core.ts. */
interface RawHistory {
  variant?: string;
  seed?: string;
  outcome?: string;
  endedAt?: number;
  me?: RawHistorySide;
  opp?: RawHistorySide | null;
  myMoves?: Move[];
  oppMoves?: Move[];
}

export type SocialTab = 'board' | 'friends' | 'history' | 'profile';

function toHistory(o: StorageObject): HistoryEntry | null {
  const v = o.value as RawHistory;
  if (!v.seed || !v.myMoves) return null;
  return {
    matchId: o.key ?? '',
    variant: (v.variant ?? 'klondike') as VariantId,
    seed: v.seed,
    outcome: (v.outcome ?? 'lost') as HistoryEntry['outcome'],
    myScore: v.me?.score ?? 0,
    oppScore: v.opp?.score ?? 0,
    opponentName: v.opp?.username ?? 'opponent',
    opponentId: v.opp?.userId ?? '',
    playedAt: v.endedAt ?? 0,
    myMoves: v.myMoves,
    oppMoves: v.oppMoves ?? []
  };
}

function toRow(r: LeaderboardRecord): LeaderRow {
  return {
    userId: r.owner_id ?? '',
    username: r.username ?? 'anon',
    value: Number(r.score ?? 0),
    rank: Number(r.rank ?? 0),
    mine: r.owner_id === getUserId()
  };
}

class SocialStore {
  tab = $state<SocialTab>('board');
  loading = $state(false);
  errorMsg = $state<string | null>(null);

  username = $state('');
  displayName = $state('');
  emailLinked = $state(false);

  wins = $state<LeaderRow[]>([]);
  best = $state<LeaderRow[]>([]);
  friends = $state<Friend[]>([]);
  history = $state<HistoryEntry[]>([]);

  #loaded = false;

  /** Fetch everything the Social overlay needs — once per session. */
  async load(force = false): Promise<void> {
    if (this.#loaded && !force) return;
    this.loading = true;
    this.errorMsg = null;
    try {
      const { client, session } = await api();
      const [account, wins, best, friends, hist] = await Promise.all([
        client.getAccount(session),
        client.listLeaderboardRecords(session, 'race_wins', undefined, 20),
        client.listLeaderboardRecords(session, 'race_best', undefined, 20),
        client.listFriends(session, undefined, 50),
        client.listStorageObjects(session, 'race_history', session.user_id, 25)
      ]);
      this.username = account.user?.username ?? '';
      this.displayName = account.user?.display_name ?? '';
      this.emailLinked = !!account.email;
      this.wins = (wins.records ?? []).map(toRow);
      this.best = (best.records ?? []).map(toRow);
      this.friends = friends.friends ?? [];
      this.history = (hist.objects ?? [])
        .map(toHistory)
        .filter((h): h is HistoryEntry => h !== null)
        .sort((a, b) => b.playedAt - a.playedAt);
      this.#loaded = true;
    } catch (e) {
      this.errorMsg = e instanceof Error ? e.message : 'Could not reach the server';
    } finally {
      this.loading = false;
    }
  }

  /** Set/change the public username shown on leaderboards and to friends. */
  async saveUsername(username: string): Promise<void> {
    const { client, session } = await api();
    await client.updateAccount(session, { username, display_name: username });
    this.username = username;
    this.displayName = username;
  }

  /** Upgrade the device-only identity with an email login (keeps progress). */
  async linkEmail(email: string, password: string): Promise<void> {
    const { client, session } = await api();
    await client.linkEmail(session, { email, password });
    this.emailLinked = true;
  }

  /** Add a friend by exact username. Returns false when not found. */
  async addFriend(username: string): Promise<boolean> {
    try {
      const { client, session } = await api();
      await client.addFriends(session, undefined, [username]);
      this.friends = (await client.listFriends(session, undefined, 50)).friends ?? [];
      return true;
    } catch {
      return false;
    }
  }

  async removeFriend(userId: string): Promise<void> {
    const { client, session } = await api();
    await client.deleteFriends(session, [userId]);
    this.friends = this.friends.filter((f) => f.user?.id !== userId);
  }
}

export const socialStore = new SocialStore();
