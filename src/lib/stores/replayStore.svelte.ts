/**
 * Replay controller (Phase 10): plays a persisted race history entry back
 * on the real board. The engine guarantees identical results — the stored
 * move log is replayed through `initialState(seed)` + `applyMove`, the same
 * deterministic path the server used to validate the race.
 *
 * `gameStore` does the rendering (read-only `startReplay`/`replayApply`);
 * this store owns the playhead, the move queue, and the playback timer.
 */
import type { Move } from '../engine/types.js';
import type { HistoryEntry } from './socialStore.svelte.js';
import { gameStore } from './gameStore.svelte.js';

/** How fast auto-play steps through the log. */
const STEP_MS = 350;

export type ReplaySide = 'me' | 'opponent';

class ReplayStore {
  /** `true` while a replay is loaded (drives the Replay.svelte bar). */
  active = $state(false);
  playing = $state(false);
  /** Index into `queue` — how many moves have been applied. */
  pos = $state(0);
  side = $state<ReplaySide>('me');
  entry = $state<HistoryEntry | null>(null);

  #timer: ReturnType<typeof setInterval> | null = null;

  /** The move log being watched right now. */
  get queue(): Move[] {
    const e = this.entry;
    if (!e) return [];
    return this.side === 'me' ? e.myMoves : e.oppMoves;
  }

  get total(): number {
    return this.queue.length;
  }

  /** Load a history entry on the board and pause at move 0. */
  open(entry: HistoryEntry, side: ReplaySide = 'me'): void {
    this.stop();
    this.entry = entry;
    this.side = side;
    this.pos = 0;
    this.active = true;
    gameStore.startReplay(entry.variant, entry.seed);
  }

  /** Switch perspective mid-replay — rebuilds at the same move index. */
  setSide(side: ReplaySide): void {
    if (side === this.side) return;
    this.side = side;
    this.pos = Math.min(this.pos, this.total);
    gameStore.replaySeek(this.pos, this.queue);
  }

  play(): void {
    if (!this.active || this.playing) return;
    this.playing = true;
    this.#timer = setInterval(() => this.#step(), STEP_MS);
  }

  pause(): void {
    this.playing = false;
    if (this.#timer) {
      clearInterval(this.#timer);
      this.#timer = null;
    }
  }

  /** Seek to an absolute move index (slider). */
  seek(pos: number): void {
    const p = Math.max(0, Math.min(pos, this.total));
    this.pos = p;
    gameStore.replaySeek(p, this.queue);
    if (p >= this.total) this.pause();
  }

  /** Step forward/back one move (pauses playback). */
  stepBy(delta: number): void {
    this.pause();
    this.seek(this.pos + delta);
  }

  /** Leave replay mode entirely — back to the menu. */
  close(): void {
    this.stop();
    gameStore.stopReplay();
  }

  /** Reset timer + playhead (used by open/close). */
  stop(): void {
    this.pause();
    this.pos = 0;
    this.active = false;
    this.entry = null;
  }

  #step(): void {
    const q = this.queue;
    if (this.pos >= q.length) {
      this.pause();
      return;
    }
    if (gameStore.replayApply(q[this.pos])) this.pos += 1;
    else {
      // Stored log had an unapplicable move — never expected; stop cleanly.
      this.pause();
    }
  }
}

export const replayStore = new ReplayStore();
