Phase 2 — Phaser Rendering: Klondike (Approved & Commencing)
All decisions made. All phases planned. Proceeding with full autonomous execution.

Decisions Locked In
Decision	Choice	Rationale
Card Assets	Programmatic SVG	Open-source standard (SVG-cards v4.0.0, LGPL-2.1) . Zero licensing friction, tiny bundle, full visual control. We'll generate our own clean SVG faces using standard card geometry.
Svelte ↔ Phaser Bridge	Svelte 5 runes + lightweight EventEmitter	Canonical state in Svelte runes. Phaser scenes subscribe via typed event bus. Zero framework coupling in engine.
Sound Assets	CC0 procedural placeholders in Phase 2, real sourcing in Phase 4	Phase 2 stubs with silent audio objects to keep scene code complete. Phase 4 sources CC0 sounds from Freesound.
Multiplayer Server	Nakama (self-hosted)	Phases 9–10. Not in pilot scope.
Card Design	Minimal, high-contrast, large tap targets	Readability > ornamentation. Clean vector shapes, 4-color deck (optional toggle).
Phase 2 Scope — Klondike Rendering
Deliverables
BootScene — Preload card SVGs (generated at build), show loading progress bar. Silent audio stubs.

KlondikeScene — Render stock, waste, foundations, tableau from GameState. Pure read of state, dispatch Move on valid interaction.

CardSprite — Phaser GameObject. Handles face-up/face-down rendering, drag pickup state, drop target highlighting.

DragController — Touch + mouse unified input. Dispatches { type: 'move', from, to, cardId } via event bus on valid drop.

gameStore (Svelte runes) — Holds canonical GameState. Exposes dispatchMove(move), undo(), newGame(seed).

HUD.svelte — Undo button, move counter, timer. Minimal Phase 2 version.

App.svelte — Mounts Phaser canvas, routes to KlondikeScene, injects store.

Explicitly NOT in Phase 2
FreeCell / TriPeaks scenes (Phase 3)

Menu scene (Phase 3)

Haptics, swipe gestures, hints, polish tweens (Phase 4)

Solvable-deal integration in UI (Phase 5 — engine ready)

PWA hardening (Phase 6)

Acceptance Criteria
Play and win a full Klondike game on desktop Chrome

Play and win a full Klondike game on mobile Safari + Chrome

Undo works correctly across full move history

No console errors

engine/ and variants/ untouched by rendering code

Remaining Phases — Full Plan
Phase 3 — FreeCell + TriPeaks + Menu
Goal: All three variants playable, clean navigation.

Tasks:

FreeCellScene: four free cells, eight cascades, foundation building. All cards face-up .

TriPeaksScene: three-peak layout, chain-by-rank highlighting (up/down), stock/waste as chain .

MenuScene: variant selection. Large tap targets, respects safe areas.

Variant switcher in HUD.

gameStore extended to handle variant switching.

Acceptance: All three variants fully playable and winnable.

Phase 4 — Feel & Polish
Goal: The game feels good.

Tasks:

Card animations: Flip (200ms, scale + rotateY), Place (150ms ease-out with overshoot), Deal (staggered 40ms/card).

Haptics (haptics.ts): Light tap on pickup, medium on placement, success pattern on win. navigator.vibrate() with iOS guard.

Swipe gestures: Left → undo. Right → redo. Down → hint.

Hints: Highlight a legal move for 2 seconds.

Sounds: CC0 place, flip, shuffle, win. Mute toggle in settings.

Auto-complete: One-tap finish when only trivial moves remain.

Card design pass: Final SVG styling, optional 4-color deck.

Acceptance: Playing feels tactile and satisfying. No lag on 3-year-old mid-range Android.

Phase 5 — Solvable Deals + Stats
Goal: Every deal is fair; players return.

Tasks:

Integrate solver.ts into deal generation.

Klondike: A* solver with 500ms cap. ~82% of random deals solvable; reshuffle until solvable .

FreeCell: >99.9% solvable naturally; verify with A* .

TriPeaks: 96.6–97% solvable naturally; verify with DFS .

Cache solvable seeds in localStorage for instant replay.

Stats store (localStorage): Games played, won, win rate per variant, best time, current/longest streak.

Stats.svelte screen.

New game button uses fresh solvable seed.

Acceptance: Every new deal is solvable. Stats persist across sessions.

Phase 6 — PWA Hardening
Goal: True offline-first, installable, native-feeling.

Tasks:

Precache all assets via Workbox.

Verify offline play (airplane mode test).

Custom install prompt UI (non-intrusive).

theme_color matches game background.

Test iOS Safari + Android Chrome.

Lighthouse PWA audit: 100/100.

Acceptance: Installs cleanly, plays offline, no console errors.

Phase 7 — Solo Pilot Release
Goal: Ship it.

Tasks:

Final QA across iOS + Android.

About screen with version.

Deploy final build.

Tag v0.1.0-solo.

Acceptance: Public URL, installable, fully playable offline.

Phase 8 — Native Wrap (Future)
Goal: App store presence.

Tasks:

Capacitor init, add iOS + Android.

@capacitor/haptics replaces navigator.vibrate.

@capacitor/push-notifications for streak reminders.

Google Play (TWA first), App Store with haptics differentiation .

Acceptance: Installable native apps, haptics work.

Phase 9 — Multiplayer Race Mode (Future)
Goal: Competitive play.

Architecture:

Self-hosted Nakama on VPS (Docker Compose + Postgres).

Match handler: server generates seed, broadcasts to players.

Clients run initialState(seed) — identical decks.

Clients send Move events; server validates via applyMove.

Server tracks score(state) per player and completion time.

5-minute countdown, server-authoritative.

Win: first to solve, or higher score() when time expires. Tie → more time remaining.

Reconnection grace: 90 seconds.

Acceptance: Two players race same deck, correct winner declared.

Phase 10 — Social Layer (Future)
Goal: Retention and community.

Tasks:

Nakama auth (device ID → email upgrade).

Leaderboards via Nakama API.

Friend system via social graph.

User-created tournaments with invite links.

Match history + replay (from move log).

Acceptance: Players can create tournaments, invite friends, see leaderboards.

Phase 11 — Ethical Monetization (Future, Optional)
Goal: Sustainability without dark patterns.

Rules:

One-time "remove ads" purchase.

Optional rewarded ads for hints/undos.

No energy systems. No forced interstitials. No pay-to-win.

Acceptance: Monetization exists without degrading experience.

Execution Order
Phase	Status	Dependencies
0 — Scaffold	✅ Complete	—
1 — Engine Core	✅ Complete	Phase 0
2 — Klondike Render	🔄 In Progress	Phase 1
3 — FreeCell + TriPeaks + Menu	Pending	Phase 2
4 — Feel & Polish	Pending	Phase 3
5 — Solvable + Stats	Pending	Phase 4
6 — PWA Hardening	Pending	Phase 5
7 — Solo Release	Pending	Phase 6
8 — Native Wrap	Future	Phase 7
9 — Multiplayer	Future	Phase 8
10 — Social	Future	Phase 9
11 — Monetization	Optional	Phase 10
Agent Instructions
Begin Phase 2 now. Execute all tasks sequentially. Stop at Phase 2 completion and report acceptance criteria. Await approval before Phase 3.

Rules in effect:

TypeScript strict mode. No any.

No Math.random() in engine/ or variants/.

No mutation of game state. Always return new objects.

No Phaser imports in engine/ or variants/.

No Svelte imports in engine/ or variants/.

Every public function has JSDoc.

Every variant implements Variant interface exactly.

Commit after each phase with tagged version.

If acceptance criteria can't be met, stop and report.

Do not skip phases. Do not build future-phase features early.