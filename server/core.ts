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

export function matchInit(_ctx: nk.Context, logger: nk.Logger, nk: nk.Nakama, params: Record<string, unknown>) {
  const variant = (params['variant'] as VariantId | undefined) ?? 'klondike';
  // Deal solver-verified seeds so every race is winnable; if the bounded
  // search doesn't confirm one in time, fall back to the raw uuid.
  const found = findSolvableSeed(getVariant(variant), nk.uuidv4(), {
    budgetMs: 1500,
    maxAttempts: 6
  });
  const seed = found.solved ? found.seed : nk.uuidv4();
  logger.info('race match init: variant=%s seed=%s solvable=%s attempts=%d', variant, seed, found.solved, found.attempts);
  return {
    state: { m: createMatch(seed, variant, Date.now()), endBroadcastAt: 0 } as ServerState,
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
  _ctx: nk.Context,
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
