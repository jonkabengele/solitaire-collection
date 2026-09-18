import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { VitePWA } from 'vite-plugin-pwa';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string;
};

export default defineConfig(({ command }) => ({
  // Production builds target GitHub Pages project hosting at /<repo>/, so
  // they must never emit root-relative asset URLs. BASE_PATH can override
  // (e.g. a future root-domain deploy); 'serve' stays at '/' for dev.
  base: process.env.BASE_PATH ?? (command === 'build' ? '/solitaire-collection/' : '/'),
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __REPO_URL__: JSON.stringify(process.env.REPO_URL ?? '')
  },
  plugins: [
    svelte(),
    VitePWA({
      // 'prompt' keeps workbox's default waiting lifecycle: a new SW
      // installs in the background, activates only after every tab closes
      // → updates apply on next launch, never mid-game (spec §Phase 6).
      // ('autoUpdate' would force skipWaiting+clientsClaim, hijacking a
      // live session.) We never render the prompt UI; launch is the prompt.
      registerType: 'prompt',
      // Registered manually via virtual:pwa-register in sw.svelte.ts so the
      // app holds the updateSW handle for the settings "Check Updates" flow.
      injectRegister: false,
      includeAssets: ['icons/*.png'],
      manifest: {
        name: 'Solitaire Collection',
        short_name: 'Solitaire',
        description: 'Klondike, FreeCell, and TriPeaks — an offline-first solitaire collection.',
        display: 'standalone',
        orientation: 'any',
        theme_color: '#0b3d2e',
        background_color: '#0b3d2e',
        icons: [
          {
            src: 'icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: 'icons/icon-maskable-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable'
          },
          {
            src: 'icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      },
      workbox: {
        // Precache every build asset: JS/CSS bundles, card SVGs, sounds, icons.
        globPatterns: ['**/*.{js,css,html,ico,png,svg,mp3,ogg,wav,woff,woff2}'],
        // Phaser is a large dependency; allow big precache entries.
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        navigateFallback: 'index.html',
        // Spec §Phase 6: updates apply on next launch, never mid-game.
        skipWaiting: false,
        clientsClaim: false
      }
    })
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('node_modules/phaser')) return 'phaser';
        }
      }
    }
  }
}));
