/**
 * Race-mode client store (spec Phase 9). Owns the Nakama session, the
 * matchmaking flow, and the live race view: opponent progress + server
 * countdown + result. The player's own game still runs entirely through
 * `gameStore` — this store just mirrors every committed move log to the
 * server, which validates it authoritatively.
 *
 * Lifecycle: idle → connecting → searching → matched → racing → ended.
 * 'error' is reachable from any state; 'left' means we quit cleanly.
 */
import type { Match, MatchData, MatchmakerMatched, Socket } from '@heroiclabs/nakama-js';
import type { VariantId } from '../engine/types.js';
import { gameStore } from './gameStore.svelte.js';
import { statsStore } from './stats.svelte.js';
import { api, connect, getUserId } from '../net/nakama.js';
import {
  OP,
  type EndMsg,
  type PresenceMsg,
  type RejectMsg,
  type ScoreMsg,
  type StartMsg
} from '../net/protocol.js';

export type RacePhase =
  | 'idle'
  | 'connecting'
  | 'searching'
  | 'matched'
  | 'racing'
  | 'ended'
  | 'error';

export interface Opponent {
  userId: string;
  username: string;
  score: number;
  finished: boolean;
  connected: boolean;
}

export interface RaceResult {
  outcome: 'won' | 'lost' | 'draw' | 'aborted';
  reason: string;
  myScore: number;
  oppScore: number;
}

class RaceStore {
  phase = $state<RacePhase>('idle');
  /** Seconds left on the server countdown (null until the race starts). */
  secondsLeft = $state<number | null>(null);
  opponent = $state<Opponent | null>(null);
  myScore = $state(0);
  result = $state<RaceResult | null>(null);
  errorMsg = $state<string | null>(null);
  /** Match id of a private race we created — the invite code. */
  inviteId = $state<string | null>(null);

  #socket: Socket | null = null;
  #match: Match | null = null;
  #ticket: string | null = null;
  #clockOffset = 0;
  #tickTimer: ReturnType<typeof setInterval> | null = null;
  #endsAt = 0;
  #unsubGame: (() => void) | null = null;

  get inRace(): boolean {
    return this.phase === 'racing' || this.phase === 'matched';
  }

  /** Enter matchmaking: connect, join the pool, wait for a match. */
  async findMatch(): Promise<void> {
    if (this.phase === 'connecting' || this.phase === 'searching') return;
    this.errorMsg = null;
    this.result = null;
    this.phase = 'connecting';
    try {
      const { socket } = await connect();
      this.#socket = socket;
      this.#wireSocket(socket);
      this.phase = 'searching';
      const t = await socket.addMatchmaker('*', 2, 2);
      this.#ticket = t.ticket;
    } catch (e) {
      this.#fail(e);
    }
  }

  /**
   * Create a private race and sit in its lobby. The returned match id is
   * the invite — a friend joins it via `joinPrivate` (deep link `?race=`).
   * Private lobbies wait far longer for the second seat than matchmaking.
   */
  async createPrivate(): Promise<void> {
    if (this.phase === 'connecting' || this.phase === 'searching' || this.phase === 'matched') return;
    this.errorMsg = null;
    this.result = null;
    this.phase = 'connecting';
    try {
      const { client, session } = await api();
      const res = await client.rpc(session, 'create_private_race', {});
      const { matchId } = res.payload as { matchId: string };
      const { socket } = await connect();
      this.#socket = socket;
      this.#wireSocket(socket);
      this.#match = await socket.joinMatch(matchId);
      this.inviteId = matchId;
      this.phase = 'matched';
    } catch (e) {
      this.#fail(e);
    }
  }

  /** Join a private race from an invite code or `?race=` deep link. */
  async joinPrivate(matchId: string): Promise<void> {
    if (this.phase === 'connecting' || this.phase === 'searching' || this.phase === 'matched') return;
    this.errorMsg = null;
    this.result = null;
    this.phase = 'connecting';
    try {
      const { socket } = await connect();
      this.#socket = socket;
      this.#wireSocket(socket);
      this.#match = await socket.joinMatch(matchId);
      this.phase = 'matched';
    } catch (e) {
      this.#fail(e);
    }
  }

  /** Leave the queue or the match entirely. */
  async leave(): Promise<void> {
    try {
      if (this.#ticket) await this.#socket?.removeMatchmaker(this.#ticket);
      if (this.#match) await this.#socket?.leaveMatch(this.#match.match_id);
    } catch {
      /* leaving is best-effort */
    }
    this.#teardown();
    this.phase = 'idle';
  }

  /** Quit the race view (after seeing the result) and reset. */
  dismiss(): void {
    this.#teardown();
    this.phase = 'idle';
    this.result = null;
  }

  #wireSocket(socket: Socket): void {
    socket.onmatchmakermatched = (m: MatchmakerMatched) => void this.#onMatched(m);
    socket.onmatchdata = (d: MatchData) => this.#onData(d);
    socket.ondisconnect = () => {
      if (this.inRace) {
        this.errorMsg = 'Connection lost — reconnect to keep your race.';
      }
    };
  }

  async #onMatched(m: MatchmakerMatched): Promise<void> {
    if (!this.#socket) return;
    try {
      this.#match = await this.#socket.joinMatch(m.match_id, m.token);
      this.phase = 'matched';
    } catch (e) {
      this.#fail(e);
    }
  }

  #onData(d: MatchData): void {
    let msg: unknown;
    try {
      msg = JSON.parse(new TextDecoder().decode(d.data as Uint8Array));
    } catch {
      return;
    }
    switch (d.op_code) {
      case OP.START:
        this.#onStart(msg as StartMsg);
        break;
      case OP.SCORE:
        this.#onScore(msg as ScoreMsg);
        break;
      case OP.END:
        this.#onEnd(msg as EndMsg);
        break;
      case OP.REJECT:
        this.#onReject(msg as RejectMsg);
        break;
      case OP.PRESENCE:
        this.#onPresence(msg as PresenceMsg);
        break;
    }
  }

  #onStart(m: StartMsg): void {
    this.#clockOffset = m.serverNow - Date.now();
    this.#endsAt = m.endsAt;
    const me = getUserId();
    const opp = m.players.find((p) => p.userId !== me);
    if (opp) {
      this.opponent = { userId: opp.userId, username: opp.username, score: 0, finished: false, connected: true };
    }
    // Deal the identical seed the server dealt, then jump to the board.
    gameStore.newGame(m.variant as VariantId, m.seed);
    gameStore.selectVariant(m.variant as VariantId);
    this.phase = 'racing';
    this.#startCountdown();
    this.#syncMoves();
    // Mirror every committed local move to the server.
    this.#unsubGame ??= gameStore.subscribe(() => this.#syncMoves());
  }

  #onScore(m: ScoreMsg): void {
    if (this.opponent && m.userId === this.opponent.userId) {
      this.opponent = { ...this.opponent, score: m.score, finished: m.finished };
    } else if (m.userId === getUserId()) {
      this.myScore = m.score;
    }
  }

  #onEnd(m: EndMsg): void {
    const me = getUserId();
    const oppScore = this.opponent ? (m.scores[this.opponent.userId] ?? 0) : 0;
    const mine = me ? (m.scores[me] ?? this.myScore) : this.myScore;
    let outcome: RaceResult['outcome'];
    if (m.reason === 'abort') outcome = 'aborted';
    else if (m.winnerId === null) outcome = 'draw';
    else outcome = m.winnerId === me ? 'won' : 'lost';
    this.result = { outcome, reason: m.reason, myScore: mine, oppScore };
    this.phase = 'ended';
    if (outcome === 'lost' && gameStore.started) {
      statsStore.recordLoss(gameStore.state.variant);
    }
    this.#stopCountdown();
  }

  #onReject(_m: RejectMsg): void {
    // Server rejected our log — resync the full authoritative log once.
    this.#syncMoves();
  }

  #onPresence(m: PresenceMsg): void {
    if (this.opponent && m.userId === this.opponent.userId) {
      this.opponent = { ...this.opponent, connected: m.connected };
    }
  }

  #syncMoves(): void {
    if (!this.#socket || !this.#match || !gameStore.started) return;
    const moves = gameStore.state.moves;
    void this.#socket.sendMatchState(
      this.#match.match_id,
      OP.MOVES,
      JSON.stringify({ moves })
    );
  }

  #startCountdown(): void {
    this.#stopCountdown();
    const update = () => {
      this.secondsLeft = Math.max(0, Math.ceil((this.#endsAt - (Date.now() + this.#clockOffset)) / 1000));
    };
    update();
    this.#tickTimer = setInterval(update, 250);
  }

  #stopCountdown(): void {
    if (this.#tickTimer) {
      clearInterval(this.#tickTimer);
      this.#tickTimer = null;
    }
  }

  #fail(e: unknown): void {
    this.errorMsg = e instanceof Error ? e.message : 'Connection failed';
    this.phase = 'error';
    this.#teardown();
  }

  #teardown(): void {
    this.#stopCountdown();
    this.#unsubGame?.();
    this.#unsubGame = null;
    this.#match = null;
    this.#ticket = null;
    this.inviteId = null;
    this.opponent = null;
    this.myScore = 0;
    this.secondsLeft = null;
  }
}

export const raceStore = new RaceStore();
