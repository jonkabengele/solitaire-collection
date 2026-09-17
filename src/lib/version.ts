/**
 * Build-time constants for the About screen. `__APP_VERSION__` comes from
 * package.json via vite `define`; `__REPO_URL__` is set for deployed builds
 * (empty locally — the link hides itself).
 */
declare const __APP_VERSION__: string;
declare const __REPO_URL__: string;

export const APP_VERSION: string = __APP_VERSION__;
export const REPO_URL: string = __REPO_URL__;
