/**
 * Nakama race-match implementation — exported handlers invoked by the ES5
 * glue in `server/entry.js`. All game rules live in the pure `matchLogic`
 * core; this file only translates presences/messages/dispatcher calls.
 *
 * Bundled to `server/build/engine.js` (global `RaceEngine`) by `npm run
 * build:server`; Nakama requires handlers be top-level globals, which is
 * why the ES5 forwarding entry exists alongside this bundle.
 */
import {
  OP,
  addPlayer,
  canJoinAttempt,
  createMatch,
  markDisconnected,
  startClock,
  syncMoves,
  tick as advance,
  type MatchState
} from './matchLogic.js';
import type { Move, VariantId } from '../src/lib/engine/types.js';
import { getVariant } from '../src/lib/variants/index.js';
import { findSolvableSeed } from '../src/lib/engine/solver.js';

/** Match state + glue-only bookkeeping (JSON-safe for goja persistence). */
interface ServerState {
  m: MatchState;
  /** ms timestamp when OP_END was broadcast; match tears down shortly after. */
  endBroadcastAt: number;
  /** Private-race invite code (system-owned `race_invites` object), if any. */
  inviteCode: string | null;
}

function broadcastStart(d: nk.Dispatcher, m: MatchState, now: number): void {
  d.broadcastMessage(
    OP.START,
    JSON.stringify({
      seed: m.seed,
      variant: m.variant,
      endsAt: m.endsAt,
      serverNow: now,
      players: Object.values(m.players).map((p) => ({ userId: p.userId, username: p.username }))
    }),
    null,
    null,
    true
  );
}

/** Private races wait 5min for the invited friend (vs 15s matchmaking). */
const PRIVATE_LOBBY_TIMEOUT_MS = 5 * 60 * 1000;

export function matchInit(_ctx: nk.Context, logger: nk.Logger, nk: nk.Nakama, params: Record<string, unknown>) {
  const variant = (params['variant'] as VariantId | undefined) ?? 'klondike';
  const isPrivate = params['private'] === true;
  // Deal solver-verified seeds so every race is winnable; if the bounded
  // search doesn't confirm one in time, fall back to the raw uuid.
  const found = findSolvableSeed(getVariant(variant), nk.uuidv4(), {
    budgetMs: 1500,
    maxAttempts: 6
  });
  const seed = found.solved ? found.seed : nk.uuidv4();
  logger.info('race match init: variant=%s seed=%s solvable=%s attempts=%d private=%s', variant, seed, found.solved, found.attempts, isPrivate);
  const lobbyTimeout = isPrivate ? PRIVATE_LOBBY_TIMEOUT_MS : undefined;
  const inviteCode = typeof params['code'] === 'string' ? params['code'] : null;
  return {
    state: {
      m: createMatch(seed, variant, Date.now(), lobbyTimeout),
      endBroadcastAt: 0,
      inviteCode
    } as ServerState,
    tickRate: 5,
    label: `race:${variant}`
  };
}

export function matchJoinAttempt(
  _ctx: nk.Context,
  _logger: nk.Logger,
  _nk: nk.Nakama,
  _d: nk.Dispatcher,
  _tick: number,
  state: ServerState,
  presence: nk.Presence
) {
  const accept = canJoinAttempt(state.m, presence.userId);
  return { state, accept, rejectMessage: accept ? undefined : 'match full or ended' };
}

export function matchJoin(
  _ctx: nk.Context,
  logger: nk.Logger,
  _nk: nk.Nakama,
  dispatcher: nk.Dispatcher,
  _tick: number,
  state: ServerState,
  presences: nk.Presence[]
) {
  const wasRacing = state.m.phase === 'racing';
  for (const p of presences) {
    addPlayer(state.m, p.userId, p.sessionId, p.username);
    logger.info('player joined: %s (%s)', p.username, p.userId);
    dispatcher.broadcastMessage(
      OP.PRESENCE,
      JSON.stringify({ userId: p.userId, username: p.username, connected: true }),
      null,
      null,
      true
    );
  }
  if (!wasRacing && state.m.phase === 'racing') {
    startClock(state.m, Date.now());
    broadcastStart(dispatcher, state.m, Date.now());
    logger.info('race started, ends at %d', state.m.endsAt);
  } else if (state.m.phase === 'racing') {
    // Reconnect mid-race: resend the full start payload.
    broadcastStart(dispatcher, state.m, Date.now());
  }
  return { state };
}

export function matchLeave(
  _ctx: nk.Context,
  logger: nk.Logger,
  _nk: nk.Nakama,
  dispatcher: nk.Dispatcher,
  _tick: number,
  state: ServerState,
  presences: nk.Presence[]
) {
  for (const p of presences) {
    markDisconnected(state.m, p.userId, Date.now());
    logger.info('player left: %s', p.userId);
    dispatcher.broadcastMessage(
      OP.PRESENCE,
      JSON.stringify({ userId: p.userId, connected: false }),
      null,
      null,
      true
    );
  }
  return { state };
}

export function matchLoop(
  ctx: nk.Context,
  logger: nk.Logger,
  nk: nk.Nakama,
  dispatcher: nk.Dispatcher,
  _tick: number,
  state: ServerState,
  messages: nk.MatchMessage[]
) {
  const now = Date.now();
  for (const msg of messages) {
    if (msg.opCode !== OP.MOVES) continue;
    let moves: Move[] | undefined;
    try {
      moves = (JSON.parse(nk.binaryToString(msg.data)) as { moves: Move[] }).moves;
    } catch {
      logger.warn('bad MOVES payload from %s', msg.sender.userId);
      continue;
    }
    if (!Array.isArray(moves)) continue;
    const r = syncMoves(state.m, msg.sender.userId, moves, now);
    if (r.ok) {
      dispatcher.broadcastMessage(
        OP.SCORE,
        JSON.stringify({ userId: msg.sender.userId, score: r.score, finished: r.finished }),
        null,
        null,
        true
      );
    } else {
      dispatcher.broadcastMessage(OP.REJECT, JSON.stringify({ at: r.at }), [msg.sender], null, true);
    }
  }
  for (const ev of advance(state.m, now)) {
    if (ev.type !== 'end') continue;
    dispatcher.broadcastMessage(
      OP.END,
      JSON.stringify({ winnerId: ev.winnerId, reason: ev.reason, scores: ev.scores }),
      null,
      null,
      true
    );
    state.endBroadcastAt = now;
    logger.info('race ended: winner=%s reason=%s', ev.winnerId, ev.reason);
    recordResult(nk, logger, state.m, ev.winnerId, ev.reason ?? 'draw', ctx.matchId);
    releaseInvite(nk, logger, state);
  }
  // Tear down shortly after the end broadcast so it reliably lands.
  if (state.m.phase === 'ended' && state.endBroadcastAt !== 0 && now - state.endBroadcastAt > 2000) {
    return null;
  }
  return { state };
}

export function matchTerminate(
  _ctx: nk.Context,
  _logger: nk.Logger,
  _nk: nk.Nakama,
  _d: nk.Dispatcher,
  _tick: number,
  state: ServerState
) {
  return { state };
}

export function matchSignal(
  _ctx: nk.Context,
  _logger: nk.Logger,
  _nk: nk.Nakama,
  _d: nk.Dispatcher,
  _tick: number,
  state: ServerState,
  data: string
) {
  return { state, data };
}

export function matchmakerMatched(_ctx: nk.Context, _logger: nk.Logger, nk: nk.Nakama) {
  return nk.matchCreate('race', { variant: 'klondike' });
}

/** Unambiguous invite alphabet — no 0/O, 1/I/L to misread. */
const INVITE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const INVITE_COLLECTION = 'race_invites';

/** Derive a 6-char code from uuid entropy (two nibbles → alphabet index). */
function makeInviteCode(nk: nk.Nakama): string {
  const hex = nk.uuidv4().replace(/-/g, '');
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += INVITE_ALPHABET[parseInt(hex[i], 16) * 2];
  }
  return code;
}

/**
 * RPC 'create_private_race' → { matchId, code }. The creator joins directly
 * with joinMatch(matchId); friends join via the 6-char code ('join_private_race')
 * or the ?race=CODE deep link. The code→match mapping is a system-owned
 * storage object the match deletes when it ends or aborts.
 */
export function rpcCreatePrivateRace(
  ctx: nk.Context,
  logger: nk.Logger,
  nk: nk.Nakama,
  _payload: string
): string {
  const host = ctx.userId ?? null;
  // Retry on code collision — the key space is huge so this almost never loops.
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = makeInviteCode(nk);
    const existing = nk.storageRead([{ collection: INVITE_COLLECTION, key: code }]);
    if (existing.length > 0) continue;
    const matchId = nk.matchCreate('race', { variant: 'klondike', private: true, code });
    nk.storageWrite([
      {
        collection: INVITE_COLLECTION,
        key: code,
        value: { matchId, host, createdAt: Date.now() },
        permissionRead: 2,
        permissionWrite: 0
      }
    ]);
    logger.info('private race created: code=%s match=%s', code, matchId);
    return JSON.stringify({ matchId, code, host });
  }
  throw new Error('could not allocate an invite code');
}

/** RPC 'join_private_race' { code } → { matchId } | { matchId: null }. */
export function rpcJoinPrivateRace(
  _ctx: nk.Context,
  _logger: nk.Logger,
  nk: nk.Nakama,
  payload: string
): string {
  let code = '';
  try {
    code = String((JSON.parse(payload) as { code?: string }).code ?? '').toUpperCase().trim();
  } catch {
    code = '';
  }
  if (!/^[A-Z2-9]{6}$/.test(code)) return JSON.stringify({ matchId: null });
  const found = nk.storageRead([{ collection: INVITE_COLLECTION, key: code }]);
  const matchId = found.length > 0 ? ((found[0].value as { matchId?: string }).matchId ?? null) : null;
  return JSON.stringify({ matchId });
}

/** Drop a private match's invite once the race ends/aborts. */
function releaseInvite(nk: nk.Nakama, logger: nk.Logger, state: ServerState): void {
  if (!state.inviteCode) return;
  try {
    nk.storageDelete([{ collection: INVITE_COLLECTION, key: state.inviteCode }]);
    state.inviteCode = null;
  } catch (e) {
    logger.warn('invite cleanup failed: %s', e);
  }
}

/** Called once from InitModule — creates the race leaderboards (idempotent). */
export function setupLeaderboards(nk: nk.Nakama, logger: nk.Logger): void {
  for (const [id, op] of [
    ['race_wins', 'incr'],
    ['race_best', 'best']
  ] as const) {
    try {
      nk.leaderboardCreate(id, true, 'desc', op);
    } catch (e) {
      logger.warn('leaderboard %s: %s', id, e);
    }
  }
}

/**
 * Persist a finished race: winner's win count, both players' best score,
 * and a per-player history record carrying both move logs for replays.
 * All writes are best-effort — a storage failure must not kill the match.
 */
function recordResult(
  nk: nk.Nakama,
  logger: nk.Logger,
  m: MatchState,
  winnerId: string | null,
  reason: string,
  matchId: string
): void {
  if (reason === 'abort') return; // a lobby that never started isn't history
  try {
    const players = Object.values(m.players);
    if (winnerId !== null) {
      const w = m.players[winnerId];
      nk.leaderboardRecordWrite('race_wins', winnerId, w?.username ?? '', 1, 0, {}, 'incr');
    }
    for (const p of players) {
      nk.leaderboardRecordWrite('race_best', p.userId, p.username, p.score, 0, {}, 'best');
    }
    for (const p of players) {
      const opp = players.find((o) => o.userId !== p.userId);
      const outcome = winnerId === null ? 'draw' : winnerId === p.userId ? 'won' : 'lost';
      nk.storageWrite([
        {
          collection: 'race_history',
          key: `${matchId}`,
          userId: p.userId,
          value: {
            matchId,
            variant: m.variant,
            seed: m.seed,
            endedAt: Date.now(),
            outcome,
            reason,
            me: { userId: p.userId, username: p.username, score: p.score },
            opp: opp ? { userId: opp.userId, username: opp.username, score: opp.score } : null,
            myMoves: p.state.moves,
            oppMoves: opp ? opp.state.moves : []
          },
          permissionRead: 1,
          permissionWrite: 0
        }
      ]);
    }
  } catch (e) {
    logger.error('recordResult failed: %s', e);
  }
}
