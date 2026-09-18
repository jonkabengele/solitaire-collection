/**
 * Solo practice race — the offline stand-in for the Nakama-backed race
 * mode. Same shape (deal + countdown + score), no server: the player
 * races a fixed clock instead of an opponent. Deliberately chrome-level:
 * it never touches engine state, it just arms a deadline and reads
 * `variant.score(state)` when the deadline hits.
 */
export const PRACTICE_MS = 5 * 60 * 1000; // five-minute countdown

class PracticeStore {
  /** Epoch ms when the race ends; null = not racing. */
  endsAt = $state<number | null>(null);
  /** Deadline hit while still playing — HUD shows the result modal. */
  timeUp = $state(false);

  get active(): boolean {
    return this.endsAt !== null;
  }

  /** Arm the countdown — call right after dealing the race game. */
  start(): void {
    this.endsAt = Date.now() + PRACTICE_MS;
    this.timeUp = false;
  }

  stop(): void {
    this.endsAt = null;
    this.timeUp = false;
  }
}

export const practiceStore = new PracticeStore();
