/**
 * Install-prompt state (Phase 6). Captures `beforeinstallprompt` so the
 * custom banner can trigger the native flow; iOS Safari never fires it,
 * so the banner falls back to manual instructions there. The banner is
 * shown once — after the player's first win — then dismissed forever.
 */

type BipEvent = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: string }> };

const DISMISS_KEY = 'solitaire.installDismissed';

const isIOS =
  typeof navigator !== 'undefined' &&
  /iPad|iPhone|iPod/.test(navigator.userAgent) &&
  !('MSStream' in window);
const isStandalone =
  typeof matchMedia !== 'undefined' &&
  (matchMedia('(display-mode: standalone)').matches ||
    (navigator as { standalone?: boolean }).standalone === true);

class InstallStore {
  /** True when the native prompt is available (Chromium). */
  canPrompt = $state(false);
  /** True while the banner is visible. */
  bannerOpen = $state(false);
  /** True on iOS Safari → banner shows manual instructions. */
  readonly ios = isIOS;
  readonly standalone = isStandalone;
  #deferred: BipEvent | null = null;
  #dismissed = localStorage.getItem(DISMISS_KEY) === '1';

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        this.#deferred = e as BipEvent;
        this.canPrompt = true;
      });
      window.addEventListener('appinstalled', () => {
        this.#deferred = null;
        this.canPrompt = false;
        this.bannerOpen = false;
      });
    }
  }

  /**
   * Whether the banner should be offered: not installed, never dismissed,
   * and either a native prompt is available or we're on iOS (manual path).
   */
  get shouldSuggest(): boolean {
    return !this.standalone && !this.#dismissed && (this.canPrompt || this.ios);
  }

  /** Called on a won transition — opens the banner once. */
  suggestAfterWin(): void {
    if (this.shouldSuggest && !this.bannerOpen) this.bannerOpen = true;
  }

  /** Fire the native install prompt, or close (iOS manual path). */
  async install(): Promise<void> {
    if (this.#deferred) {
      await this.#deferred.prompt().catch(() => {});
      await this.#deferred.userChoice.catch(() => {});
      this.#deferred = null;
      this.canPrompt = false;
    }
    this.dismiss();
  }

  /** Close and never show again. */
  dismiss(): void {
    this.bannerOpen = false;
    this.#dismissed = true;
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* non-fatal */
    }
  }
}

export const installStore = new InstallStore();
