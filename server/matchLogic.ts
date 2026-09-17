/**
 * Pure race-match core for Nakama (spec Phase 9). No Nakama imports — every
 * function takes `now` explicitly so the whole state machine is unit-testable
 * in Vitest and identically runnable inside the goja JS runtime.
 *
 * Protocol: clients send their full move log (`OP_MOVES`). The server replays
 * it through `initialState(seed)` + `applyMove` — the same engine the client
 * runs — so undo/redo need no special handling and an illegal move anywhere
 * in the log rejects the sync. Server state is authoritative.
 */
import type { GameState, Move, VariantId } from '../src/lib/engine/types.js';
import { getVariant } from '../src/lib/variants/index.js';

/** Message opcodes — shared with the client (`src/lib/net/protocol.ts`). */
export const OP = {
  /** server → clients: deal + countdown info. */
  START: 1,
  /** client → server: full move log sync. */
  MOVES: 2,
  /** server → clients: a player's score/progress update. */
  SCORE: 3,
  /** server → clients: match ended. */
  END: 4,
  /** server → client: its last sync was rejected (illegal move in log). */
  REJECT: 5,
  /** server → clients: opponent presence change. */
  PRESENCE: 6
} as const;

export const MAX_PLAYERS = 2;
/** Spec: 5-minute countdown, server-authoritative. */
export const RACE_DURATION_MS = 5 * 60 * 1000;
/** Spec: 90-second reconnection grace. */
export const RECONNECT_GRACE_MS = 90 * 1000;
/** How long to wait for both players to join before aborting the match. */
export const LOBBY_TIMEOUT_MS = 15 * 1000;

export type EndReason = 'solved' | 'timeout' | 'forfeit' | 'draw' | 'abort';

export interface PlayerSlot {
  userId: string;
  username: string;
  sessionId: string;
  connected: boolean;
  /** Tick (ms) the player disconnected at; null while connected. */
  disconnectedAt: number | null;
  /** Authoritative engine state — rebuilt from the client's move log. */
  state: GameState;
  score: number;
  /** Set when the player's state reached `won`; null while still playing. */
  finishedAt: number | null;
}

export interface MatchState {
  phase: 'lobby' | 'racing' | 'ended';
  seed: string;
  variant: VariantId;
  createdAt: number;
  endsAt: number;
  /** How long the lobby waits for a second seat — longer for private races. */
  lobbyTimeoutMs: number;
  players: Record<string, PlayerSlot>;
  winnerId: string | null;
  /** `'draw'` in winnerId means tied; endReason explains the finish. */
  endReason: EndReason | null;
}

export function createMatch(
  seed: string,
  variant: VariantId,
  now: number,
  lobbyTimeoutMs = LOBBY_TIMEOUT_MS
): MatchState {
  return {
    phase: 'lobby',
    seed,
    variant,
    createdAt: now,
    endsAt: 0,
    lobbyTimeoutMs,
    players: {},
    winnerId: null,
    endReason: null
  };
}

/** True while a fresh user may still join (lobby, seats free, no reconnect). */
export function canJoinAttempt(m: MatchState, userId: string): boolean {
  if (m.players[userId] !== undefined) return true; // reconnect attempt — always allowed
  return m.phase === 'lobby' && Object.keys(m.players).length < MAX_PLAYERS;
}

export function addPlayer(
  m: MatchState,
  userId: string,
  sessionId: string,
  username: string
): void {
  const existing = m.players[userId];
  if (existing) {
    // Reconnect: keep the authoritative state, refresh the session.
    existing.connected = true;
    existing.disconnectedAt = null;
    existing.sessionId = sessionId;
    return;
  }
  m.players[userId] = {
    userId,
    username,
    sessionId,
    connected: true,
    disconnectedAt: null,
    state: getVariant(m.variant).initialState(m.seed),
    score: 0,
    finishedAt: null
  };
  if (Object.keys(m.players).length === MAX_PLAYERS) m.phase = 'racing';
}

export function markDisconnected(m: MatchState, userId: string, now: number): void {
  const p = m.players[userId];
  if (!p) return;
  p.connected = false;
  p.disconnectedAt = now;
}

export type SyncResult =
  | { ok: true; score: number; finished: boolean; solved: boolean }
  | { ok: false; at: number };

/**
 * Replay the client's full move log into a fresh deal and adopt it as the
 * authoritative state. Rejects if any move is illegal (engine returns the
 * same object) or the log is shorter than already-seen progress — a client
 * can never roll the server's view backwards.
 */
export function syncMoves(m: MatchState, userId: string, moves: Move[], now: number): SyncResult {
  const p = m.players[userId];
  if (!p || m.phase !== 'racing') return { ok: false, at: -1 };
  if (moves.length < p.state.moves.length) return { ok: false, at: p.state.moves.length };
  const v = getVariant(m.variant);
  let s = v.initialState(m.seed);
  for (let i = 0; i < moves.length; i++) {
    const next = v.applyMove(s, moves[i]);
    if (next === s) return { ok: false, at: i };
    s = next;
  }
  p.state = s;
  p.score = v.score(s);
  if (v.isWon(s) && p.finishedAt === null) p.finishedAt = now;
  return { ok: true, score: p.score, finished: p.finishedAt !== null, solved: v.isWon(s) };
}

/**
 * Decide the winner from scores and finish times.
 * Spec order: first to solve wins; on time expiry higher score() wins;
 * score tie → more time remaining (earlier finish) wins. Neither finished
 * and equal score → draw.
 */
export function resolveWinner(m: MatchState): { winnerId: string | null; reason: EndReason } {
  const [a, b] = Object.values(m.players);
  const fa = a.finishedAt;
  const fb = b.finishedAt;
  if (fa !== null && fb === null) return { winnerId: a.userId, reason: 'solved' };
  if (fb !== null && fa === null) return { winnerId: b.userId, reason: 'solved' };
  if (fa !== null && fb !== null) {
    if (fa !== fb) return { winnerId: fa < fb ? a.userId : b.userId, reason: 'solved' };
    if (a.score !== b.score) return { winnerId: a.score > b.score ? a.userId : b.userId, reason: 'timeout' };
    return { winnerId: null, reason: 'draw' };
  }
  if (a.score !== b.score) return { winnerId: a.score > b.score ? a.userId : b.userId, reason: 'timeout' };
  return { winnerId: null, reason: 'draw' };
}

/** Events the glue layer turns into broadcasts. */
export type TickEvent =
  | { type: 'end'; winnerId: string | null; reason: EndReason; scores: Record<string, number> }
  | { type: 'forfeit-warn'; userId: string; deadline: number };

/**
 * Advance the match clock. Called once per Nakama tick.
 * - lobby → abort if a seat never filled
 * - racing → forfeit a player gone >90s; end at endsAt on score
 */
export function tick(m: MatchState, now: number): TickEvent[] {
  const out: TickEvent[] = [];
  if (m.phase === 'lobby') {
    if (now - m.createdAt > m.lobbyTimeoutMs && Object.keys(m.players).length < MAX_PLAYERS) {
      m.phase = 'ended';
      m.endReason = 'abort';
      out.push({ type: 'end', winnerId: null, reason: 'abort', scores: scoresOf(m) });
    }
    return out;
  }
  if (m.phase !== 'racing') return out;

  for (const p of Object.values(m.players)) {
    if (!p.connected && p.disconnectedAt !== null && now - p.disconnectedAt > RECONNECT_GRACE_MS) {
      const other = Object.values(m.players).find((o) => o.userId !== p.userId) ?? null;
      m.phase = 'ended';
      m.winnerId = other?.userId ?? null;
      m.endReason = 'forfeit';
      out.push({
        type: 'end',
        winnerId: m.winnerId,
        reason: 'forfeit',
        scores: scoresOf(m)
      });
      return out;
    }
  }

  const solved = Object.values(m.players).find((p) => p.finishedAt !== null);
  if (solved) {
    m.phase = 'ended';
    m.winnerId = solved.userId;
    m.endReason = 'solved';
    out.push({ type: 'end', winnerId: m.winnerId, reason: 'solved', scores: scoresOf(m) });
    return out;
  }

  if (now >= m.endsAt) {
    m.phase = 'ended';
    const r = resolveWinner(m);
    m.winnerId = r.winnerId;
    m.endReason = r.reason;
    out.push({ type: 'end', winnerId: r.winnerId, reason: r.reason, scores: scoresOf(m) });
  }
  return out;
}

/** Arm the countdown — called when the race phase begins. */
export function startClock(m: MatchState, now: number): void {
  m.endsAt = now + RACE_DURATION_MS;
}

function scoresOf(m: MatchState): Record<string, number> {
  const o: Record<string, number> = {};
  for (const p of Object.values(m.players)) o[p.userId] = p.score;
  return o;
}
