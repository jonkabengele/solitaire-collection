/**
 * Live E2E for race mode — exercises the REAL Nakama server:
 * two clients → device auth → matchmaker → join → START (same seed) →
 * MOVES sync → SCORE broadcast → full solver-driven solve → END (solved).
 *
 * Gated: only runs with NAKAMA_E2E=1 and a local Nakama up
 * (`docker compose -f docker-compose.nakama.yml up -d`).
 */
import { describe, expect, it } from 'vitest';
import { Client, type MatchData, type Socket } from '@heroiclabs/nakama-js';
import type { Move } from '../src/lib/engine/types.js';
import { getVariant } from '../src/lib/variants/index.js';
import { solve } from '../src/lib/engine/solver.js';
import { OP, type EndMsg, type ScoreMsg, type StartMsg } from '../src/lib/net/protocol.js';

const LIVE = process.env.NAKAMA_E2E === '1';
const itLive = LIVE ? it : it.skip;

interface TestClient {
  socket: Socket;
  userId: string;
  matchId: string | null;
  start: StartMsg | null;
  scores: ScoreMsg[];
  rejects: unknown[];
  end: EndMsg | null;
  presences: { userId: string; connected: boolean }[];
}

async function mkClient(deviceId: string): Promise<TestClient> {
  const client = new Client('defaultkey', 'localhost', '7350', false);
  const session = await client.authenticateDevice(deviceId, true);
  const socket = client.createSocket(false, false);
  const tc: TestClient = {
    socket,
    userId: session.user_id!,
    matchId: null,
    start: null,
    scores: [],
    rejects: [],
    end: null,
    presences: []
  };
  socket.onmatchdata = (d: MatchData) => {
    let msg: unknown;
    try {
      msg = JSON.parse(new TextDecoder().decode(d.data as Uint8Array));
    } catch {
      return;
    }
    switch (d.op_code) {
      case OP.START:
        tc.start = msg as StartMsg;
        break;
      case OP.SCORE:
        tc.scores.push(msg as ScoreMsg);
        break;
      case OP.REJECT:
        tc.rejects.push(msg);
        break;
      case OP.END:
        tc.end = msg as EndMsg;
        break;
      case OP.PRESENCE:
        tc.presences.push(msg as { userId: string; connected: boolean });
        break;
    }
  };
  await socket.connect(session, true);
  socket.onmatchmakermatched = async (m) => {
    const match = await socket.joinMatch(m.match_id || undefined, m.token || undefined);
    tc.matchId = match.match_id;
  };
  return tc;
}

async function waitFor(pred: () => boolean, ms = 15000, label = 'condition'): Promise<void> {
  const t0 = Date.now();
  while (!pred()) {
    if (Date.now() - t0 > ms) throw new Error(`timeout waiting for ${label}`);
    await new Promise((r) => setTimeout(r, 50));
  }
}

describe('live race E2E (requires local Nakama)', () => {
  itLive(
    'two clients race the same seed to a solve',
    async () => {
      const a = await mkClient(`e2e-a-${Date.now()}`);
      const b = await mkClient(`e2e-b-${Date.now()}`);

      await a.socket.addMatchmaker('*', 2, 2);
      await b.socket.addMatchmaker('*', 2, 2);

      await waitFor(() => a.matchId !== null && b.matchId !== null, 20000, 'matchmaker');
      expect(a.matchId).toBe(b.matchId);

      await waitFor(() => a.start !== null && b.start !== null, 15000, 'START broadcast');
      expect(a.start!.seed).toBe(b.start!.seed);
      expect(a.start!.variant).toBe('klondike');
      expect(a.start!.endsAt - a.start!.serverNow).toBe(5 * 60 * 1000);
      expect(a.start!.players).toHaveLength(2);

      // A sends a few real moves; both should see the SCORE broadcast.
      const variant = getVariant('klondike');
      const path = solve(variant, variant.initialState(a.start!.seed), { budgetMs: 30000 });
      expect(path).not.toBeNull();

      const firstFive = path!.slice(0, 5);
      await a.socket.sendMatchState(a.matchId!, OP.MOVES, JSON.stringify({ moves: firstFive }));
      await waitFor(
        () => b.scores.some((s) => s.userId === a.userId),
        10000,
        'score broadcast to opponent'
      );
      const lastScore = b.scores.filter((s) => s.userId === a.userId).at(-1)!;
      expect(lastScore.score).toBeGreaterThanOrEqual(0);

      // B sends an illegal move — only B should get REJECT.
      const illegal: Move = {
        type: 'move',
        from: { area: 'tableau', index: 0 },
        to: { area: 'foundation', index: 0 },
        cardId: 's13'
      };
      await b.socket.sendMatchState(b.matchId!, OP.MOVES, JSON.stringify({ moves: [illegal] }));
      await waitFor(() => b.rejects.length > 0, 10000, 'reject for illegal move');
      expect(a.rejects).toHaveLength(0);

      // A solves the whole deal — server must declare A the winner.
      await a.socket.sendMatchState(a.matchId!, OP.MOVES, JSON.stringify({ moves: path! }));
      await waitFor(() => a.end !== null && b.end !== null, 20000, 'END broadcast');
      expect(a.end!.winnerId).toBe(a.userId);
      expect(b.end!.winnerId).toBe(a.userId);
      expect(a.end!.reason).toBe('solved');
      expect(a.end!.scores[a.userId]).toBeGreaterThan(0);

      await a.socket.disconnect(false);
      await b.socket.disconnect(false);
    },
    90000
  );
});
