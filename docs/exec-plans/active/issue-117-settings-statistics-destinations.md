# Settings and Statistics destination strangler

Status: active
Issue: `vbalashi/2000nl#117`
Branch: `codex/117-settings-statistics-destinations`
Worktree: `/Users/khrustal/adhoc/2000nl-issue-117-settings-statistics`
Base: `51657eecab67cc3eb11930cbeba93ed14e2d67dd`

## Goal

Add App Settings and Statistics as reversible destinations in the existing
persistent Training/Library shell without remounting or changing the active
training session.

## Public seams under test

- destination URL/history navigation through `TrainingLibraryShell`;
- retained Training state while sibling destinations are visible;
- app-preference persistence through the existing onboarding/settings hook;
- destination content and return actions rendered from real in-memory data.

## In scope

- destinations `training`, `library`, `statistics`, and `settings`;
- an independent off-by-default rollout flag;
- desktop and mobile reachability/return behavior;
- General settings: theme, interface language, translation language;
- read-only keyboard shortcut inventory shared with the Training help dialog;
- Statistics subset backed by current `DetailedStats` values;
- interface-language persistence without starting onboarding;
- focused tests, browser smoke, visual comparison, and review.

## Out of scope

- profile/subscription and provider/audio controls;
- Training Setup extraction or legacy modal retirement;
- editable keyboard shortcut persistence;
- saved training plans;
- new statistics RPCs for streak, retention, or weekly series;
- scheduler, card action, dictionary, or database changes.

## Sequence

1. Characterize destination parsing/history, retained Training state, and the
   interface-language persistence gap with failing tests.
2. Extend the destination codec and persistent shell behind the nested flag.
3. Add responsive Settings and Statistics destinations using existing
   preference handlers and real statistics data only.
4. Keep the compatibility Settings modal authoritative when the flag is off.
5. Run focused tests, typecheck, lint, local browser smoke, and independent
   Standards/Spec review.
6. Push a clean review-ready branch and record the exact SHA in issue #117.

## Rollback

Set `NEXT_PUBLIC_SETTINGS_STATISTICS_DESTINATIONS_V1=false`. The existing
Training/Library shell and overloaded Settings modal remain available; this
slice changes no database schema or learning state and needs no data rollback.

## Completion

This plan moves to `completed/` only after the exact integrated main SHA passes
the required checks. Review-ready work remains active.
