# Mobile progress follow-up (#627)

Reference base: `7748355389c56becc9d34013e6cba554028ff466`.
Owner: `codex/627-mobile-progress-actions`, project-local worktree.

User Pixel/iPhone screenshots identified tiny headword metadata, a handle-only drag
area, pointer-driven Safari focus rings, bottom actions near the screen edge,
and missing secondary action explanations. Product source remains the current
Library / Training / native DialogSurface; no prototype screen replaces it.

The menu regression check first failed in all three locales because visible help
was absent. Mobile browser checks also exposed the fixed 76px card dock spilling
44px touch actions 20px below the viewport. Removing the dock's fixed height fixes
that reproduced overflow. WebKit omitted the native focus-visible ring after
keyboard Escape restored the pointer-opened trigger; explicit keyboard modality
styles preserve keyboard focus while suppressing pointer-only rings.

Validation:
- 114 focused UI tests, including shared-header drag/control isolation and menus.
- 8 new Chromium/WebKit checks: Library/progress header drag, independent scrolling,
  headword typography, pointer/keyboard focus, EN/NL/RU menu descriptions, 320px
  touch targets and viewport fit.
- 9 existing browser checks: Library gesture edges, approved Training presentation,
  exclusion menu on front/back cards and keyboard dismissal.
- Typecheck, lint, production build, practice-style guard passed. Existing lint
  warning in TrainingSenseCardV2Session about handlePlayAudio remains unchanged.
- Owner's Chrome profile: actual local app, 390x844, drag Library by headword and
  Learning Progress by title, inspect visible menu descriptions, close and restore
  the browser viewport. Screenshots use dedicated local QA content/state.

Build initially lacked Supabase build-time environment; rerun with the standard
public local build configuration passed. Browser harness initially used the wrong
Supabase storage-key origin; rerun with the server's 127.0.0.1 origin resolved it.
Locator corrections target the real Library header rather than its hidden close
fallback, and localized close copy. These were harness failures, not waived checks.

Local DB221 was applied through the managed forward gate to match the already
merged #624 reference. This issue changes no DB schema, scheduler or learning state.
WebKit automation is not a physical iPhone check; home-indicator/notch insets still
need the owner's real-device confirmation after release.
