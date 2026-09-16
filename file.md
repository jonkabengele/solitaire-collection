Solitaire Collection — Build Specification
1. Vision Statement
Build a polished, offline-first Solitaire Collection PWA featuring three variants (Klondike, FreeCell, TriPeaks). The pilot release is solo-only but architected from day one for a future competitive multiplayer layer: race mode where players receive identical seeded decks, a 5-minute countdown, and win conditions based on completion or progress. Long-term, the app becomes a social platform with leaderboards, user-created tournaments, and friend invites. The pilot must not implement any of that—but must not architecturally prevent it either.

2. Core Principles (Non-Negotiable)
Ship solo first. No backend, no auth, no network calls in the pilot.

Code for multiplayer, don't build it. Game logic must be pure, deterministic, and network-ready.

Offline-first. The game must work with airplane mode enabled after first load.

Feel over features. Card animations, touch response, and haptics matter more than extra modes.

No dark patterns. No energy systems, no forced ads, no FOMO timers. Ever.

Respect safe areas. Notches and home indicators must never obscure cards.

3. Target Stack
Layer	Technology	Notes
Framework	Svelte 5	Runes-based reactivity, compiled output, minimal overhead
Game Engine	Phaser 4	Scenes, tweens, input handling, audio
Language	TypeScript	Strict mode enabled
Build Tool	Vite	Fast HMR, small bundles
PWA	vite-plugin-pwa (Workbox)	Manifest + service worker
Native Wrap (later)	Capacitor	Not in pilot scope
Multiplayer Server (later)	Nakama (self-hosted)	Not in pilot scope
Hosting	Netlify / Vercel / Cloudflare Pages	Static, free tier
4. Architectural Rules (Critical for Future Multiplayer)
These rules exist so v2 (multiplayer) requires zero rewrite of game logic.

4.1 Pure Game State
Every variant's state is a plain serializable object (JSON-safe).

No Phaser objects, no Svelte stores, no DOM references inside game state.

State shape example:

ts
type KlondikeState = {
  seed: string;
  stock: Card[];
  waste: Card[];
  foundations: Card[][];
  tableau: Card[][];
  moves: Move[];        // append-only log
  status: 'playing' | 'won' | 'lost';
  startedAt: number;
  elapsedMs: number;
};
4.2 Single Move Function
All state transitions go through applyMove(state, move): GameState.

Never mutate state directly. Always return a new state.

Moves are serializable: { type: 'draw' }, { type: 'move', from, to, cardId }.

This makes multiplayer trivial later: server validates applyMove, clients replay the log.

4.3 Deterministic RNG
Use a seeded PRNG (e.g., mulberry32 or xoshiro128).

Shuffle function: shuffle(seed: string): Card[].

Same seed → same deck, always. No Math.random() anywhere in game logic.

4.4 Solvable Deal Generator
For Klondike and FreeCell, generate deals that are guaranteed solvable.

Approach: generate a random deal, run a solver (A* or DFS with heuristics) with a time cap (e.g., 500ms). If unsolvable, reshuffle with next seed. Cache solvable seeds.

TriPeaks: solvability is nearly universal with proper play; still validate.

4.5 Rendering Decoupled from Logic
Phaser scenes read game state and dispatch moves.

Scenes never own game state. A Svelte store (or rune) holds the canonical GameState.

This separation means a future headless server can run the exact same logic.

5. Project Structure
solitaire/
├── public/
│   ├── icons/                 # PWA icons (192, 512, maskable)
│   └── assets/
│       ├── cards/             # SVG card faces + backs
│       ├── sounds/            # place, flip, win, shuffle
│       └── ui/                # menu backgrounds, buttons
├── src/
│   ├── main.ts                # App entry, mounts Svelte
│   ├── App.svelte             # Root component, routing
│   ├── lib/
│   │   ├── engine/            # VARIANT-AGNOSTIC CORE
│   │   │   ├── types.ts       # Card, Suit, Rank, Move, GameState
│   │   │   ├── rng.ts         # Seeded PRNG + shuffle
│   │   │   ├── deck.ts        # Deck creation, dealing
│   │   │   ├── applyMove.ts   # Dispatcher (delegates to variant)
│   │   │   └── solver.ts      # Solvability checker
│   │   ├── variants/          # PER-VARIANT RULES
│   │   │   ├── klondike.ts
│   │   │   ├── freecell.ts
│   │   │   └── tripeaks.ts
│   │   ├── stores/            # Svelte state
│   │   │   ├── gameStore.ts   # Current game state
│   │   │   ├── statsStore.ts  # Win/loss/streak (localStorage)
│   │   │   └── settingsStore.ts
│   │   ├── phaser/            # RENDERING LAYER
│   │   │   ├── scenes/
│   │   │   │   ├── BootScene.ts
│   │   │   │   ├── MenuScene.ts
│   │   │   │   ├── KlondikeScene.ts
│   │   │   │   ├── FreeCellScene.ts
│   │   │   │   └── TriPeaksScene.ts
│   │   │   ├── objects/
│   │   │   │   ├── CardSprite.ts
│   │   │   │   ├── Pile.ts
│   │   │   │   └── DragController.ts
│   │   │   └── haptics.ts     # Vibration wrapper
│   │   └── ui/                # SVELTE UI COMPONENTS
│   │       ├── Menu.svelte
│   │       ├── HUD.svelte     # Timer, moves, undo/hint buttons
│   │       ├── Settings.svelte
│   │       └── Stats.svelte
│   └── styles/
│       └── global.css         # Safe-area vars, resets
├── index.html
├── vite.config.ts
├── tsconfig.json
└── package.json
6. Build Phases
Each phase ends with a working, testable artifact. Do not proceed until the previous phase is verified.

Phase 0 — Project Scaffold
Goal: Empty Svelte + Phaser + PWA shell that installs on a phone.

Tasks:

Scaffold Vite + Svelte 5 + TypeScript.

Install Phaser 4.

Install vite-plugin-pwa, configure manifest:

name: "Solitaire Collection"

short_name: "Solitaire"

display: standalone

theme_color, background_color

icons: 192, 512, maskable

Add global.css with safe-area inset variables:

css
:root {
  --sat: env(safe-area-inset-top);
  --sab: env(safe-area-inset-bottom);
  --sal: env(safe-area-inset-left);
  --sar: env(safe-area-inset-right);
}
Configure service worker to precache all assets.

Deploy to Netlify/Vercel/Cloudflare Pages.

Acceptance: App installs to home screen, shows a blank Svelte screen, works offline.

Phase 1 — Engine Core (No UI)
Goal: Pure TypeScript game logic with tests.

Tasks:

Define types.ts: Suit, Rank, Card, Move, GameState.

Implement rng.ts with mulberry32 + shuffle(seed).

Implement deck.ts with createDeck(), deal(seed, variant).

Define variant interface:

ts
interface Variant {
  initialState(seed: string): GameState;
  applyMove(state: GameState, move: Move): GameState;
  isWon(state: GameState): boolean;
  legalMoves(state: GameState): Move[];
  score(state: GameState): number; // for future race tiebreaks
}
Implement Klondike (draw-1) fully.

Implement FreeCell fully.

Implement TriPeaks fully.

Implement solver.ts for Klondike + FreeCell solvability.

Write unit tests (Vitest) for:

Deck determinism (same seed → same order)

Legal move generation

Win detection

Solver correctness

Acceptance: All tests pass. No Phaser or Svelte imports in engine/ or variants/.

Phase 2 — Phaser Rendering: Klondike
Goal: Playable Klondike with mouse/touch, no polish yet.

Tasks:

BootScene: load card SVGs, sounds.

KlondikeScene: render tableau, stock, waste, foundations from GameState.

Drag-and-drop via Phaser input. Dispatch Move to store on drop.

Svelte gameStore holds state; scene subscribes to changes and re-renders.

Basic tween on card placement (150ms ease-out).

Undo button in HUD.svelte (pops move log, re-applies).

Acceptance: Can play and win a full Klondike game on desktop and mobile.

Phase 3 — FreeCell + TriPeaks Scenes
Goal: All three variants playable.

Tasks:

FreeCellScene: four free cells, cascade layout, foundation building.

TriPeaksScene: peak layout, chain-by-rank highlighting, no tableau drag.

MenuScene: pick variant. Clean, large tap targets.

Variant switcher respects safe areas.

Acceptance: All three variants fully playable and winnable.

Phase 4 — Feel & Polish
Goal: The game feels good.

Tasks:

Card animations:

Flip: 200ms, subtle scale + rotateY.

Place: 150ms ease-out, slight overshoot.

Deal: staggered 40ms per card.

Haptics (haptics.ts):

Light tap on card pickup.

Medium on valid placement.

Success pattern on win.

Use navigator.vibrate() (guard for iOS).

Swipe gestures:

Swipe left → undo.

Swipe right → redo.

Swipe down → hint.

Hints: highlight a legal move for 2 seconds.

Sounds: place, flip, shuffle, win. Mute toggle in settings.

Auto-complete: when only trivial moves remain, offer one-tap finish.

Acceptance: Playing feels tactile and satisfying. No lag on mid-range Android.

Phase 5 — Solvable Deals + Stats
Goal: Every deal is fair; players have a reason to return.

Tasks:

Integrate solver.ts into deal generation.

Time cap: 500ms per attempt.

Cache solvable seeds in localStorage for instant replay.

Stats store (localStorage):

Games played, won, win rate per variant.

Best time per variant.

Current streak, longest streak.

Stats.svelte screen showing all of the above.

New game button uses a fresh solvable seed.

Acceptance: Every new deal is solvable. Stats persist across sessions.

Phase 6 — PWA Hardening
Goal: True offline-first, installable, native-feeling.

Tasks:

Precache all card SVGs, sounds, and JS bundles via Workbox.

Verify offline play after first load (airplane mode test).

Add install prompt UI (custom, non-intrusive).

Set theme_color to match game background.

Test on iOS Safari + Android Chrome.

Lighthouse PWA audit: 100/100.

Acceptance: Installs cleanly, plays offline, no console errors.

Phase 7 — Solo Pilot Release
Goal: Ship it.

Tasks:

Final QA pass on all three variants across iOS + Android.

Add "About" screen with version number.

Deploy final build.

Tag v0.1.0-solo in git.

Acceptance: Public URL, installable, fully playable offline.

7. Future Phases (Documented, Not Built)
These are explicitly out of pilot scope but the architecture must support them.

Phase 8 — Native Wrap
Add Capacitor: cap init, cap add ios, cap add android.

Add @capacitor/haptics for real haptic feedback (replaces navigator.vibrate).

Add @capacitor/push-notifications for "your streak is at risk" reminders.

Submit to Google Play (as TWA first, then native bundle) and App Store.

iOS Guideline 4.2 note: haptics + push notifications differentiate the app from a "repackaged website."

Phase 9 — Multiplayer Race Mode (Nakama)
Self-host Nakama on a VPS (Docker Compose + Postgres).

Implement match handler:

Server generates seed, broadcasts to both players.

Clients run identical initialState(seed).

Clients send Move events; server validates via applyMove.

Server tracks score(state) per player and completion time.

5-minute countdown, server-authoritative.

Win conditions:

First to solve → win.

Time expires → higher score() wins.

Tie → more time remaining wins.

Reconnection grace: 90 seconds.

Phase 10 — Social Layer (Nakama)
Auth (device ID → email upgrade).

Leaderboards via Nakama's API.

Friend system via Nakama's social graph.

User-created tournaments with invite links.

Match history + replay (from move log).

Phase 11 — Monetization (Optional, Ethical)
One-time "remove ads" purchase.

Optional rewarded ads for hints/undos.

No energy systems, no forced interstitials, no pay-to-win.

8. Testing Requirements
Unit tests (Vitest): All engine + variant logic.

Determinism tests: Same seed → identical state after N moves.

Solver tests: Known-solvable seeds return true; known-unsolvable return false.

Manual QA matrix: iOS Safari, iOS PWA, Android Chrome, Android PWA, desktop Chrome.

Offline test: Load once, enable airplane mode, play a full game.

9. Code Quality Rules for the Agent
TypeScript strict mode. No any. No @ts-ignore without a comment explaining why.

No Math.random() in engine/ or variants/. Only in rng.ts via seed.

No mutation of game state. Always return new objects.

No Phaser imports in engine/ or variants/.

No Svelte imports in engine/ or variants/.

Every public function has a JSDoc comment.

Every variant implements the Variant interface exactly.

Commit after each phase with a tagged version.

If a phase's acceptance criteria can't be met, stop and report rather than hacking around it.

10. Success Criteria for the Pilot
The pilot is successful when:

All three variants are fully playable and winnable.

Every deal is solvable.

The app installs to a home screen and plays offline.

It feels smooth on a 3-year-old mid-range Android.

The engine is pure, tested, and multiplayer-ready with zero refactor needed.

No leaderboard, no multiplayer, no auth, no backend exists in the codebase.

11. What the Agent Should Do First
Read this entire document.

Confirm understanding of the architectural rules in §4.

Begin Phase 0 only.

Stop at the end of Phase 0 and report acceptance criteria results.

Wait for approval before starting Phase 1.

Do not skip phases. Do not build future-phase features early. Do not add dependencies not listed in §3 without explicit approval.