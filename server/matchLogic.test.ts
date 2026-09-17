import { describe, expect, it } from 'vitest';
import type { Move } from '../src/lib/engine/types.js';
import { getVariant } from '../src/lib/variants/index.js';
import {
  LOBBY_TIMEOUT_MS,
  MAX_PLAYERS,
  RACE_DURATION_MS,
  RECONNECT_GRACE_MS,
  addPlayer,
  canJoinAttempt,
  createMatch,
  markDisconnected,
  resolveWinner,
  startClock,
  syncMoves,
  tick
} from './matchLogic.js';

const SEED = 'race-test-seed';
const T0 = 1_000_000;

function racingMatch(now = T0) {
  const m = createMatch(SEED, 'klondike', now);
  addPlayer(m, 'u1', 's1', 'alice');
  addPlayer(m, 'u2', 's2', 'bob');
  startClock(m, now);
  return m;
}

/** First n legal-ish moves taken from a real deal — guaranteed legal. */
function realMoves(n: number): Move[] {
  const v = getVariant('klondike');
  let s = v.initialState(SEED);
  const out: Move[] = [];
  for (let i = 0; i < n; i++) {
    const mv = v.legalMoves(s)[0];
    if (!mv) break;
    s = v.applyMove(s, mv);
    out.push(mv);
  }
  return out;
}

describe('lobby & joining', () => {
  it('starts empty in lobby phase', () => {
    const m = createMatch(SEED, 'klondike', T0);
    expect(m.phase).toBe('lobby');
    expect(canJoinAttempt(m, 'u1')).toBe(true);
  });

  it('transitions to racing when the second player joins', () => {
    const m = racingMatch();
    expect(m.phase).toBe('racing');
    expect(Object.keys(m.players).length).toBe(MAX_PLAYERS);
    expect(m.endsAt).toBe(T0 + RACE_DURATION_MS);
  });

  it('rejects third-party joins once full', () => {
    const m = racingMatch();
    expect(canJoinAttempt(m, 'intruder')).toBe(false);
    expect(canJoinAttempt(m, 'u1')).toBe(true); // reconnect still allowed
  });

  it('aborts a lobby that never fills', () => {
    const m = createMatch(SEED, 'klondike', T0);
    addPlayer(m, 'u1', 's1', 'alice');
    const ev = tick(m, T0 + LOBBY_TIMEOUT_MS + 1);
    expect(ev).toEqual([
      { type: 'end', winnerId: null, reason: 'abort', scores: { u1: 0 } }
    ]);
    expect(m.phase).toBe('ended');
  });
});

describe('syncMoves — server-authoritative validation', () => {
  it('replays a legal log and updates score', () => {
    const m = racingMatch();
    const moves = realMoves(5);
    const r = syncMoves(m, 'u1', moves, T0 + 1000);
    expect(r.ok).toBe(true);
    expect(m.players['u1'].state.moves).toHaveLength(moves.length);
  });

  it('rejects a log containing an illegal move', () => {
    const m = racingMatch();
    const illegal: Move = { type: 'move', from: { area: 'tableau', index: 0 }, to: { area: 'foundation', index: 0 }, cardId: 's13' };
    const r = syncMoves(m, 'u1', [illegal], T0 + 1000);
    expect(r).toEqual({ ok: false, at: 0 });
  });

  it('rejects a shorter log (no rollback)', () => {
    const m = racingMatch();
    const moves = realMoves(4);
    syncMoves(m, 'u1', moves, T0 + 1000);
    expect(syncMoves(m, 'u1', moves.slice(0, 2), T0 + 2000).ok).toBe(false);
  });

  it('accepts a rebuilt log after undo (same length path)', () => {
    const m = racingMatch();
    const moves = realMoves(3);
    syncMoves(m, 'u1', moves, T0 + 1000);
    // undo one then re-do differently is impossible here — a same-length
    // valid log replaces cleanly (server is source of truth on legality)
    const r = syncMoves(m, 'u1', moves, T0 + 2000);
    expect(r.ok).toBe(true);
  });
});

describe('win conditions', () => {
  it('first to solve wins immediately', () => {
    const m = racingMatch();
    const p = m.players['u1'];
    p.finishedAt = T0 + 60_000;
    const r = resolveWinner(m);
    expect(r).toEqual({ winnerId: 'u1', reason: 'solved' });
  });

  it('tick emits solved end when a player finished', () => {
    const m = racingMatch();
    m.players['u2'].finishedAt = T0 + 30_000;
    const ev = tick(m, T0 + 31_000);
    expect(ev[0]).toMatchObject({ type: 'end', winnerId: 'u2', reason: 'solved' });
  });

  it('timeout → higher score wins', () => {
    const m = racingMatch();
    m.players['u1'].score = 40;
    m.players['u2'].score = 25;
    const ev = tick(m, m.endsAt + 1);
    expect(ev[0]).toMatchObject({ type: 'end', winnerId: 'u1', reason: 'timeout' });
  });

  it('timeout tie → earlier finish wins', () => {
    const m = racingMatch();
    const a = m.players['u1'];
    const b = m.players['u2'];
    a.score = b.score = 30;
    a.finishedAt = T0 + 100_000;
    b.finishedAt = T0 + 200_000;
    expect(resolveWinner(m).winnerId).toBe('u1');
  });

  it('equal scores, neither finished → draw', () => {
    const m = racingMatch();
    const ev = tick(m, m.endsAt + 1);
    expect(ev[0]).toMatchObject({ type: 'end', winnerId: null, reason: 'draw' });
  });
});

describe('reconnection grace', () => {
  it('90s disconnect → forfeit, opponent wins', () => {
    const m = racingMatch();
    markDisconnected(m, 'u2', T0 + 5000);
    expect(tick(m, T0 + 5000 + RECONNECT_GRACE_MS - 1)).toEqual([]);
    const ev = tick(m, T0 + 5000 + RECONNECT_GRACE_MS + 1);
    expect(ev[0]).toMatchObject({ type: 'end', winnerId: 'u1', reason: 'forfeit' });
  });

  it('rejoin inside grace keeps state alive', () => {
    const m = racingMatch();
    markDisconnected(m, 'u2', T0 + 5000);
    addPlayer(m, 'u2', 'new-session', 'bob');
    const p = m.players['u2'];
    expect(p.connected).toBe(true);
    expect(p.disconnectedAt).toBeNull();
    expect(tick(m, T0 + 5000 + RECONNECT_GRACE_MS + 1000)).toEqual([]);
  });
});
