# Settings and Statistics destination strangler

Status: completed
Issue: `vbalashi/2000nl#117`
Implementation PR: `vbalashi/2000nl#118`
Feature SHA: `1a4bc6156abaad59dfbd82f95fcdc5307c05bbab`
Integrated main SHA: `29c3989828eb76fd0b80d6f8dee1c278bef840fe`
Completed: 2026-08-10

## Goal

Add App Settings and Statistics as reversible destinations in the existing
persistent Training/Library shell without remounting or changing the active
training session.

## Public seams under test

- destination URL/history navigation through `TrainingLibraryShell`;
- retained Training state while sibling destinations are visible;
- app-preference persistence through the existing onboarding/settings hook;
- destination content and return actions rendered from real in-memory data.

## Delivered scope

- destinations `training`, `library`, `statistics`, and `settings`;
- an independent off-by-default rollout flag;
- desktop and mobile reachability/return behavior;
- General settings: theme, interface language, translation language;
- read-only keyboard shortcut inventory shared with the Training help dialog;
- Statistics subset backed by current `DetailedStats` values;
- interface-language persistence without starting onboarding;
- focused tests, browser smoke, visual comparison, and owner review.

## Deferred scope

- profile/subscription and provider/audio controls;
- Training Setup extraction or legacy modal retirement;
- editable keyboard shortcut persistence, conflict handling, and reset;
- saved training plans;
- new statistics contracts for period/activity history, streak, on-time rate,
  queue breakdown, or recent progress;
- scheduler, card action, dictionary, or database changes.

The owner explicitly approved the truthful reduced first-pilot contract on
2026-08-10. Richer Pen concepts `30.70.10–13` remain post-pilot hypotheses and
must not be described as implemented without the deferred contracts above.

## Verification

Before merge, on feature SHA `1a4bc6156abaad59dfbd82f95fcdc5307c05bbab`:

- full UI suite: 433 passed, 74 skipped;
- TypeScript typecheck: pass;
- lint: pass;
- production build with navigation and destination flags enabled: pass;
- desktop/mobile browser smoke and visual audit: pass.

After squash merge:

- stable patch ID matched the reviewed feature diff;
- integrated main SHA: `29c3989828eb76fd0b80d6f8dee1c278bef840fe`;
- focused destination/Training/onboarding suite: 49 passed;
- TypeScript typecheck and diff check: pass.

Existing React `act(...)`, Next runtime-export, and local dictionary-index
warnings were unchanged and were not introduced by this slice.

## Rollback

Set `NEXT_PUBLIC_SETTINGS_STATISTICS_DESTINATIONS_V1=false`. The existing
Training/Library shell and overloaded Settings modal remain available; this
slice changes no database schema or learning state and needs no data rollback.
