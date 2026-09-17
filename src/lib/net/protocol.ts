/**
 * Race-mode wire protocol — opcodes + payload shapes shared with
 * `server/matchLogic.ts`. Keep the two files in sync.
 */
import type { Move, VariantId } from '../engine/types.js';

export const OP = {
  START: 1,
  MOVES: 2,
  SCORE: 3,
  END: 4,
  REJECT: 5,
  PRESENCE: 6
} as const;

/** server → client: deal + countdown. `serverNow` lets clients compute clock skew. */
export type StartMsg = {
  seed: string;
  variant: VariantId;
  endsAt: number;
  serverNow: number;
  players: { userId: string; username: string }[];
};

/** client → server: full move log (server replays + validates). */
export type MovesMsg = { moves: Move[] };

/** server → client: one player's progress. */
export type ScoreMsg = { userId: string; score: number; finished: boolean };

export type EndReason = 'solved' | 'timeout' | 'forfeit' | 'draw' | 'abort';

/** server → client: match over. `winnerId: null` = draw. */
export type EndMsg = { winnerId: string | null; reason: EndReason; scores: Record<string, number> };

/** server → client: the last MOVES sync failed validation. */
export type RejectMsg = { at: number };

/** server → client: opponent connect/disconnect. */
export type PresenceMsg = { userId: string; username?: string; connected: boolean };
