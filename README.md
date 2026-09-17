# Solitaire Collection

Offline-first solitaire PWA — Klondike, FreeCell, and TriPeaks with
solver-verified deals, plus live 1v1 race mode on Nakama. Svelte 5 + Phaser
4 front end over a pure, deterministic TypeScript engine (no DOM/Phaser in
`src/lib/engine` — the same code validates moves server-side).

**Live:** https://jonkabengele.github.io/solitaire-collection/

## Stack

| Layer       | Tech                                            |
| ----------- | ----------------------------------------------- |
| UI          | Svelte 5 (runes), Phaser 4 (lazy-loaded)        |
| Engine      | Pure TS — `initialState`/`applyMove`/`score`    |
| PWA         | vite-plugin-pwa (Workbox), offline after 1 load |
| Multiplayer | Nakama (self-hosted) + `@heroiclabs/nakama-js`  |

## Develop

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # vitest (engine + match logic)
npm run check      # svelte-check
npm run build      # production build → dist/
```

Solo play needs nothing else. The app is fully usable offline after first
load; stats/deals live in localStorage.

## Race mode (Phase 9)

1v1, same seed, 5 minutes. First to solve wins; on time, higher `score()`
wins; tie → earlier finish. Server-authoritative: the Nakama module replays
every client's move log through the real engine.

```bash
npm run build:server                          # → server/build/index.js
docker compose -f docker-compose.nakama.yml up -d
```

Client defaults: `localhost:7350`, server key `defaultkey` (device auth,
no signup). Override with `VITE_NAKAMA_HOST|PORT|SSL|KEY`.

- `server/matchLogic.ts` — pure match core (vitest-covered, no Nakama deps)
- `server/core.ts` — handlers → bundled to `engine.js`
- `server/entry.js` — ES5 glue Nakama's runtime AST-parses (top-level
  `InitModule` + handler identifiers — required, don't inline/bundle it)
- `server/live.e2e.test.ts` — real two-client race; run with
  `NAKAMA_E2E=1 npx vitest run server/live.e2e.test.ts`

Production deploy: run Nakama on a VPS with this compose file, set
`VITE_NAKAMA_*` at build time, use a real `--socket.server_key`.

## Layout

```
src/lib/engine      pure game logic (types, deck, rng, applyMove, solver)
src/lib/variants    klondike / freecell / tripeaks rules + scoring
src/lib/stores      Svelte rune stores (game, race, stats, ui, settings)
src/lib/phaser      scenes, sprites, input, layout, sfx
src/lib/net         nakama client + wire protocol
src/lib/ui          DOM overlays (menu, HUD, race, stats, about)
server/             Nakama match module + build + tests
```
