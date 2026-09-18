// Service-worker update flow. The app registers the SW here via
// virtual:pwa-register (vite.config injectRegister is off) so we hold
// the updateSW handle and can offer "Check Updates" in settings.
//
// Lifecycle (registerType 'prompt', skipWaiting:false): a new build's
// SW installs in the background and waits for every tab to close.
// checkForUpdates() forces an update() fetch; if a waiting worker
// exists (or one installs) the state flips to 'ready' and applyUpdate()
// tells it to skipWaiting → controllerchange → reload.

import { registerSW } from 'virtual:pwa-register';

export type SwUpdateState = 'idle' | 'checking' | 'none' | 'ready' | 'applying' | 'unsupported';

let updateSW: ((reloadPage?: boolean) => Promise<void>) | null = null;

export const swStore = $state({ update: 'idle' as SwUpdateState });

export function initServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return;

  updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      swStore.update = 'ready';
    },
    onRegisteredSW(_url, reg) {
      // Standard practice: poll for updates hourly while the app sits open.
      reg?.update();
      if (reg) setInterval(() => reg.update(), 60 * 60 * 1000);
    }
  });
}

export async function checkForUpdates(): Promise<void> {
  if (swStore.update === 'checking' || swStore.update === 'ready') return;
  swStore.update = 'checking';

  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) {
      // No SW = dev/uninstalled build — there is nothing to update, and
      // reporting 'none' would falsely claim the app is current.
      swStore.update = 'unsupported';
      return;
    }
    if (reg.waiting) {
      swStore.update = 'ready';
      return;
    }
    await reg.update();
    // A freshly-found worker installs async — give onNeedRefresh a beat
    // before concluding there's nothing new.
    await new Promise((r) => setTimeout(r, 2500));
    if (swStore.update === 'checking') {
      swStore.update = reg.waiting ? 'ready' : 'none';
    }
  } catch {
    swStore.update = 'none';
  }
}

export async function applyUpdate(): Promise<void> {
  swStore.update = 'applying';
  // reloadPage: true → skipWaiting + reload once the new SW takes control.
  // If the new worker never activates (e.g. a precache fetch stalls), the
  // promise never resolves — so fall back to a hard reload after 8s. The
  // browser settles the SW state itself on the next load either way.
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('sw update timed out')), 8000)
  );
  try {
    await Promise.race([updateSW?.(true), timeout]);
  } catch {
    if (swStore.update === 'applying') location.reload();
  }
}
