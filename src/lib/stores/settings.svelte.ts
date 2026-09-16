/**
 * User settings — persisted to localStorage under `solitaire.settings`.
 * Phase 4 scope: master SFX volume. Versioned so future fields can migrate.
 */

type Persisted = { version: 1; volume: number };

const KEY = 'solitaire.settings';

function load(): Persisted {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { version: 1, volume: 0.8 };
    const p = JSON.parse(raw) as Partial<Persisted>;
    return { version: 1, volume: typeof p.volume === 'number' ? Math.min(1, Math.max(0, p.volume)) : 0.8 };
  } catch {
    return { version: 1, volume: 0.8 };
  }
}

class SettingsStore {
  #volume = $state(load().volume);

  /** Master SFX volume, 0–1. Persisted on write. */
  get volume(): number {
    return this.#volume;
  }
  set volume(v: number) {
    this.#volume = Math.min(1, Math.max(0, v));
    try {
      localStorage.setItem(KEY, JSON.stringify({ version: 1, volume: this.#volume }));
    } catch {
      /* private mode etc. — non-fatal */
    }
  }
}

export const settingsStore = new SettingsStore();
