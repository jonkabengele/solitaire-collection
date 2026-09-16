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


===================
Solitaire Collection — Phase 3 to End: Approvals & Recommendations
Approval Summary
Phase	Status	Approval
0 — Scaffold	✅ Complete	—
1 — Engine Core	✅ Complete	—
2 — Klondike Render	🔄 In Progress	Approved
3 — FreeCell + TriPeaks + Menu	Approved	✅
4 — Feel & Polish	Approved	✅
5 — Solvable Deals + Stats	Approved	✅
6 — PWA Hardening	Approved	✅
7 — Solo Pilot Release	Approved	✅
8 — Native Wrap	Approved	✅
9 — Multiplayer Race Mode	Approved	✅
10 — Social Layer	Approved	✅
11 — Ethical Monetization	Approved (optional)	✅
All phases approved. Agent executes sequentially without re-approval between phases 3–7. Phases 8–11 are approved in principle and execute when their trigger condition is met.

Phase 3 — FreeCell + TriPeaks + Menu
Approved. Agent proceeds immediately after Phase 2 acceptance.

Recommendation
Reuse Phase 2's CardSprite, DragController, and layout utilities. Only variant-specific rules and layouts are new code. gameStore gains setVariant(variant) and per-variant state slots so switching preserves in-progress games.

Scope
FreeCellScene: 4 free cells (top-left), 4 foundations (top-right), 8 cascades below. All cards face-up . Drag any card or stack onto a cascade if descending and alternating color. Free cells hold one card each.

TriPeaksScene: 3 peaks of overlapping cards, 28 total in tableau (18 peak + 10 row base), plus stock and waste. Tap a tableau card that is one rank above or below the waste top to move it . No drag — tap-to-play. Chains clear peaks; clearing all three peaks wins.

MenuScene: Variant cards with name, mini-preview, best time, win rate. Respects safe areas. Large tap targets (min 48px).

HUD variant switcher: Segmented control in top bar. Switching mid-game prompts "Save and switch?" with Save / Discard / Cancel.

Acceptance
All three variants fully playable and winnable on desktop + mobile.

Variant switching preserves in-progress state.

No engine/ or variants/ modifications required.

Phase 4 — Feel & Polish
Approved.

Recommendations
Tween timings: Flip 200ms cubic-bezier(0.4, 0.0, 0.2, 1); Place 150ms ease-out with 5% overshoot; Deal stagger 40ms.

Haptics: navigator.vibrate() with iOS detection guard ('vibrate' in navigator). Pattern map: pickup 10ms, placement [15, 10, 15], invalid [30], win [50, 30, 50, 30, 100]. Phase 8 replaces with Capacitor Haptics on native.

Swipe gestures: Left edge → undo. Right edge → redo. Anywhere else → no-op to avoid accidental triggers.

Hint system: legalMoves(state) sorted by heuristic (foundation moves first, then tableau). Highlight top move for 2s with pulsing outline.

Sounds: CC0 from Freesound. Card place (soft thud), flip (paper swish), shuffle (riffle), win (short chime). Volume sliders in settings.

Auto-complete: Trigger when remainingMovesAreTrivial(state) returns true (only foundation moves left). One tap animates all cards home.

Acceptance
No dropped frames on Pixel 4a / iPhone SE (2020).

Haptics fire on supported devices; no-op silently on iOS Safari (pre-Capacitor).

Swipe gestures don't conflict with card drag.

Phase 5 — Solvable Deals + Stats
Approved.

Recommendations
Solver strategy per variant:

Klondike: A* with priority = foundation count + tableau order heuristics. 500ms cap. ~82% of random deals solvable .

FreeCell: DFS with free-cell/cascade heuristics. >99.9% solvable naturally . Verify anyway.

TriPeaks: DFS with peak-clearing priority. 96.6–97% solvable naturally . Verify anyway.

Seed cache: Store last 100 solvable seeds per variant in localStorage under solitaire.seeds.{variant}. On new game, check cache first.

Stats schema (localStorage solitaire.stats):

ts
{
  version: 1,
  perVariant: {
    klondike: { played, won, bestMs, currentStreak, longestStreak, lastPlayed },
    freecell: { ... },
    tripeaks: { ... }
  }
}
Stats.svelte: Grid layout. Per-variant card with win-rate ring, best time, streak. Reset button per variant with confirm dialog.

Acceptance
Every new deal solvable (verified by solver before deal shown).

Stats persist across sessions and variants.

No solver timeouts leak into UI (solver runs on main thread with 500ms cap; if exceeded, reshuffle).

Note: If solver blocks UI noticeably, move to Web Worker in Phase 6. Recommendation: start on main thread, measure, migrate only if needed.

Phase 6 — PWA Hardening
Approved.

Recommendations
Workbox strategy: Precache app shell + card SVGs + sounds (CacheFirst). Runtime cache nothing (game is fully offline). skipWaiting: false so updates apply on next launch, never mid-game.

Install prompt: Show custom banner after player wins their first game (not on first load). "Add to Home Screen" with instructions per platform.

Offline test matrix: Airplane mode after first load; cold-start offline; mid-game offline; new game offline.

Lighthouse: Target 100/100 PWA, 95+ Performance, 100 Accessibility.

If solver lag observed in Phase 5: Migrate solver to Web Worker here. Use comlink for ergonomics.

Acceptance
Installs cleanly on iOS Safari + Android Chrome.

Plays fully offline after first load.

Lighthouse PWA 100/100.

Phase 7 — Solo Pilot Release
Approved.

Recommendations
Version: v0.1.0-solo.

About screen: Version, credits, link to source, "Made with Svelte + Phaser" badge, privacy statement ("no data leaves your device").

Deploy target: Cloudflare Pages (free, fast, global). Alternative: Netlify.

Analytics: None in pilot. Add privacy-respecting analytics (Plausible/Umami, self-hosted) only in Phase 10 if needed.

Post-launch: Collect qualitative feedback. No telemetry.

Acceptance
Public URL live.

Installs and plays on iOS + Android.

Tagged v0.1.0-solo in git.

Phase 8 — Native Wrap
Approved. Trigger: pilot validated with real users, ready to pursue app stores.

Recommendations
Capacitor 6+. cap init, cap add ios, cap add android.

Haptics: Replace haptics.ts implementation with @capacitor/haptics. Keep same interface so no call-site changes.

Push notifications: @capacitor/push-notifications. Use sparingly — only "your streak is at risk" once per day max. Never promotional.

iOS Guideline 4.2 mitigation: Haptics + push notifications + native share sheet differentiate from "repackaged website" . Also add native splash screen and status bar styling.

Android first: Ship as TWA (Trusted Web Activity) to Google Play. Then native bundle for App Store.

App Store review prep: Privacy manifest, App Tracking Transparency (declare no tracking), demo account not needed (no auth).

Acceptance
Native builds install and run.

Haptics fire natively.

Both stores approved.

Phase 9 — Multiplayer Race Mode
Approved. Trigger: native apps live, community requesting competition.

Recommendations
Nakama self-hosted on Hetzner CX22 (~€4/mo) or DigitalOcean ($6/mo). Docker Compose + Postgres 15 + Caddy for TLS.

Match handler (authoritative):

text
onJoin: assign player slot, wait for 2 players or 10s timeout
onMatchStart: generate seed (crypto.randomUUID), broadcast to both
onMove: validate applyMove(state, move), update player's state copy, score
onComplete: first winner → broadcast win; else timer expiry → compare scores
Anti-cheat: Server never sends full deck. Only sends seed at match start. Clients generate same deck locally. Server validates moves against its own state copy. If client state diverges, server wins.

Reconnection: 90-second grace. Nakama preserves match state in memory; client rejoin uses matchId.

Scoring for tiebreaks: score(state) = (cardsInFoundations * 100) + (cardsInFreeCells * 10) + (cardsInOrder * 1). Time remaining as final tiebreak.

Countdown: 5:00 server-authoritative. Client displays but doesn't own time.

Acceptance
Two players race same deck, correct winner declared.

Disconnect/reconnect works within grace period.

No way for client to see opponent's hidden cards.

Phase 10 — Social Layer
Approved. Trigger: multiplayer stable, users want persistence.

Recommendations
Auth: Nakama device ID by default, optional email upgrade. No social login in first iteration (privacy-first).

Leaderboards: Nakama's built-in. One per variant (all-time) + one combined (weekly). "Get around user" queries for friend comparisons .

Friends: Nakama social graph. Add by username or QR code. No contact book access.

Tournaments: User creates, sets variant + duration, generates invite link. Nakama tournament API handles registration and result tracking .

Match history: Store move logs server-side (Nakama storage). Enable replay: re-run applyMove sequence from initial state.

Privacy: Users can delete account + all data in-app. GDPR compliant.

Acceptance
Players create tournaments, invite friends, see leaderboards.

Match replays work.

Account deletion removes all data.

Phase 11 — Ethical Monetization (Optional)
Approved as optional. Trigger: only if server costs exceed sustainable threshold or user base requests premium features.

Recommendations
One-time purchase: "Remove ads + unlock 4-color deck + custom card backs" — $4.99.

Rewarded ads: Optional, only for hints/undos. Never forced. Never timed.

No energy systems. No forced interstitials. No pay-to-win. No loot boxes. No battle passes.

If monetization can't be done ethically, don't do it. Server costs at pilot scale are <$10/mo. This phase may never be needed.

Acceptance
Monetization exists without degrading experience.

No player feels pressured to pay.

Agent Execution Rules (Updated)
Phases 2–7 execute sequentially with no re-approval required between them. Report at end of each phase but continue immediately to next unless a rule violation occurs.

Stop and report if:

Acceptance criteria can't be met.

A rule in §4 or §9 must be violated.

A dependency not listed in §3 is needed.

Phases 8–11 require explicit "Go" from the human before starting, since they involve infrastructure costs, store submissions, or scope expansion.

All architectural rules from the original spec remain in force.