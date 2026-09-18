/**
 * Per-variant stats (spec §Phase 5 schema), persisted to localStorage
 * under `solitaire.stats`:
 *
 *   { version: 1, perVariant: { klondike: {...}, freecell: {...}, tripeaks: {...} } }
 *
 * A deal counts as `played` when its first move commits (deduped per
 * seed per session by the gameStore). `won`/`bestMs`/streaks update on
 * the playing→won transition; a `lost` transition or abandoning an
 * in-progress game via New breaks the current streak.
 */
import type { VariantId } from '../engine/types.js';

export type VariantStats = {
  played: number;
  won: number;
  bestMs: number | null;
  currentStreak: number;
  longestStreak: number;
  lastPlayed: number;
};

export type StatsFile = {
  version: 1;
  perVariant: Record<VariantId, VariantStats>;
};

const KEY = 'solitaire.stats';

const empty = (): VariantStats => ({
  played: 0,
  won: 0,
  bestMs: null,
  currentStreak: 0,
  longestStreak: 0,
  lastPlayed: 0
});

function load(): StatsFile {
  const blank: StatsFile = {
    version: 1,
    perVariant: {
      klondike: empty(),
      freecell: empty(),
      tripeaks: empty(),
      spider: empty(),
      pyramid: empty()
    }
  };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return blank;
    const p = JSON.parse(raw) as Partial<StatsFile>;
    if (p.version !== 1 || !p.perVariant) return blank;
    for (const v of ['klondike', 'freecell', 'tripeaks', 'spider', 'pyramid'] as const) {
      const src = p.perVariant[v];
      if (src && typeof src === 'object') {
        blank.perVariant[v] = { ...empty(), ...src };
      }
    }
    return blank;
  } catch {
    return blank;
  }
}

class StatsStore {
  #stats = $state<StatsFile>(load());

  /** Stats for one variant (reactive). */
  for(v: VariantId): VariantStats {
    return this.#stats.perVariant[v];
  }

  /** The whole file — menus read this for the overview. */
  get all(): StatsFile {
    return this.#stats;
  }

  /** A deal saw its first committed move. */
  recordPlayed(v: VariantId): void {
    const s = { ...this.#stats.perVariant[v] };
    s.played += 1;
    s.lastPlayed = Date.now();
    this.#write(v, s);
  }

  /** The live game transitioned playing→won. */
  recordWin(v: VariantId, ms: number): void {
    const s = { ...this.#stats.perVariant[v] };
    s.won += 1;
    s.bestMs = s.bestMs === null ? ms : Math.min(s.bestMs, ms);
    s.currentStreak += 1;
    s.longestStreak = Math.max(s.longestStreak, s.currentStreak);
    this.#write(v, s);
  }

  /** The live game ended `lost`, or an in-progress game was abandoned via New. */
  recordLoss(v: VariantId): void {
    const s = { ...this.#stats.perVariant[v] };
    s.currentStreak = 0;
    this.#write(v, s);
  }

  /** Zero one variant's stats (Stats screen confirm dialog). */
  reset(v: VariantId): void {
    this.#write(v, empty());
  }

  #write(v: VariantId, s: VariantStats): void {
    this.#stats = {
      ...this.#stats,
      perVariant: { ...this.#stats.perVariant, [v]: s }
    };
    try {
      localStorage.setItem(KEY, JSON.stringify(this.#stats));
    } catch {
      /* non-fatal */
    }
  }
}

export const statsStore = new StatsStore();
