/**
 * Nakama connection singleton: device auth + socket + session refresh.
 * Lazily created — the module never connects until `connect()` is called,
 * so solo play never touches the network.
 *
 * Config via env (all optional, localhost dev defaults):
 *   VITE_NAKAMA_HOST / VITE_NAKAMA_PORT / VITE_NAKAMA_SSL / VITE_NAKAMA_KEY
 */
import { Client, Session, type Socket } from '@heroiclabs/nakama-js';

const HOST = import.meta.env.VITE_NAKAMA_HOST ?? 'localhost';
const PORT = import.meta.env.VITE_NAKAMA_PORT ?? '7350';
const USE_SSL = import.meta.env.VITE_NAKAMA_SSL === 'true';
const SERVER_KEY = import.meta.env.VITE_NAKAMA_KEY ?? 'defaultkey';

const DEVICE_KEY = 'solitaire.deviceId';
const SESSION_KEY = 'solitaire.nakamaSession';

let client: Client | null = null;
let socket: Socket | null = null;
let session: Session | null = null;

function deviceId(): string {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

function nakamaClient(): Client {
  client ??= new Client(SERVER_KEY, HOST, PORT, USE_SSL);
  return client;
}

function persistSession(s: Session): void {
  session = s;
  localStorage.setItem(SESSION_KEY, JSON.stringify({ token: s.token, refresh: s.refresh_token }));
}

async function authenticate(): Promise<Session> {
  const c = nakamaClient();
  const stored = localStorage.getItem(SESSION_KEY);
  if (stored) {
    try {
      const { token, refresh } = JSON.parse(stored) as { token: string; refresh: string };
      const s = Session.restore(token, refresh);
      // Reuse if the token still has >1 day of life; otherwise refresh.
      if (!s.isexpired(Date.now() / 1000 + 86400)) {
        session = s;
        return s;
      }
      const refreshed = await c.sessionRefresh(s, {});
      persistSession(refreshed);
      return refreshed;
    } catch {
      localStorage.removeItem(SESSION_KEY);
    }
  }
  const s = await c.authenticateDevice(deviceId(), true);
  persistSession(s);
  return s;
}

/**
 * Connect + authenticate. Returns the live socket and our user id.
 * Reuses an open socket if one exists.
 */
export async function connect(): Promise<{ socket: Socket; userId: string }> {
  const s = await authenticate();
  if (!socket) {
    socket = nakamaClient().createSocket(USE_SSL, false);
  }
  await socket.connect(s, true);
  return { socket, userId: s.user_id! };
}

export function getSocket(): Socket | null {
  return socket;
}

export function getUserId(): string | null {
  return session?.user_id ?? null;
}
