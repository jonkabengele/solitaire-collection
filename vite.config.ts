import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    svelte(),
    VitePWA({
      // 'prompt' keeps workbox's default waiting lifecycle: a new SW
      // installs in the background, activates only after every tab closes
      // → updates apply on next launch, never mid-game (spec §Phase 6).
      // ('autoUpdate' would force skipWaiting+clientsClaim, hijacking a
      // live session.) We never render the prompt UI; launch is the prompt.
      registerType: 'prompt',
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
});
