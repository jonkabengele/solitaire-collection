/**
 * Minimal ambient types for the Nakama JavaScript (goja) server runtime —
 * only the surface this module uses. Keeps the server build dependency-free;
 * the authoritative reference is Nakama's `nakama-runtime` types.
 */

declare namespace nk {
  /** Per-invocation context. */
  interface Context {
    readonly matchId: string;
    readonly node: string;
    readonly env: Record<string, string>;
    readonly userId?: string;
    readonly sessionId?: string;
    readonly username?: string;
  }

  interface Logger {
    info(msg: string, ...args: unknown[]): void;
    warn(msg: string, ...args: unknown[]): void;
    error(msg: string, ...args: unknown[]): void;
    debug(msg: string, ...args: unknown[]): void;
  }

  /** A connected session inside a match. */
  interface Presence {
    readonly userId: string;
    readonly sessionId: string;
    readonly username: string;
    readonly node: string;
  }

  /** An inbound realtime message delivered to matchLoop. */
  interface MatchMessage {
    readonly sender: Presence;
    readonly opCode: number;
    readonly data: Uint8Array;
    readonly reliable: boolean;
    readonly receiveTimeMs: number;
  }

  interface Dispatcher {
    broadcastMessage(
      opCode: number,
      data: string | Uint8Array,
      presences?: Presence[] | null,
      sender?: Presence | null,
      reliable?: boolean
    ): void;
  }

  interface Nakama {
    uuidv4(): string;
    binaryToString(data: Uint8Array): string;
    stringToBinary(s: string): Uint8Array;
    matchCreate(module: string, params?: Record<string, unknown>): string;
  }

  interface MatchmakerResult {
    presence: Presence;
    properties: Record<string, unknown>;
    partyId: string;
  }

  interface Initializer {
    registerMatch(name: string, handlers: MatchHandlers<unknown>): void;
    registerMatchmakerMatched(
      fn: (ctx: Context, logger: Logger, nk: Nakama, matches: MatchmakerResult[]) => string | void
    ): void;
    registerRpc(id: string, fn: (ctx: Context, logger: Logger, nk: Nakama, payload: string) => string): void;
  }

  interface MatchHandlers<S> {
    matchInit(ctx: Context, logger: Logger, nk: Nakama, params: Record<string, unknown>): {
      state: S;
      tickRate: number;
      label: string;
    };
    matchJoinAttempt(
      ctx: Context,
      logger: Logger,
      nk: Nakama,
      dispatcher: Dispatcher,
      tick: number,
      state: S,
      presence: Presence,
      metadata: Record<string, unknown>
    ): { state: S; accept: boolean; rejectMessage?: string };
    matchJoin(
      ctx: Context,
      logger: Logger,
      nk: Nakama,
      dispatcher: Dispatcher,
      tick: number,
      state: S,
      presences: Presence[]
    ): { state: S } | null;
    matchLeave(
      ctx: Context,
      logger: Logger,
      nk: Nakama,
      dispatcher: Dispatcher,
      tick: number,
      state: S,
      presences: Presence[]
    ): { state: S } | null;
    matchLoop(
      ctx: Context,
      logger: Logger,
      nk: Nakama,
      dispatcher: Dispatcher,
      tick: number,
      state: S,
      messages: MatchMessage[]
    ): { state: S } | null;
    matchTerminate(
      ctx: Context,
      logger: Logger,
      nk: Nakama,
      dispatcher: Dispatcher,
      tick: number,
      state: S,
      graceSeconds: number
    ): { state: S } | null;
    matchSignal(
      ctx: Context,
      logger: Logger,
      nk: Nakama,
      dispatcher: Dispatcher,
      tick: number,
      state: S,
      data: string
    ): { state: S; data?: string } | null;
  }
}
