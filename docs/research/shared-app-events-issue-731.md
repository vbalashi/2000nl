# Shared app events — issue 731 validation checkpoint

Date: 2026-10-17. Branch: `codex/731-shared-event-design`, PR #732.
Base: production/main `c9d880f85a07a3912aa55cf5c8a64b93760a502c` (PR #729).
PR #730 continuity fixes were preserved in commit `f23ac25d` before event work.

## Implemented

Shared, refcounted Supabase browser channel registry and portable injected
transport; private user/translation/release topics; bounded event validation and
deduplication; principal cleanup and token-refresh rejoin. DB 228 publishes at
actual write origins. Deployment release publication runs after verified health.
Account/material/setup/library consumers reconcile on initial join and reconnect,
coalesce bursts and defer across optimistic writes. Translation observers perform
authoritative reads on ready/failed hints; healthy ready projections use 15-minute
safety checks rather than minute lookups. Pending observers keep their deadline
and final authoritative probe; degraded transport retains bounded recovery.

Existing Training owner-fencing checks remain at 20 seconds. Learning hints clear
prepared projections/counts; they do not reset the current card face. The PR #730
semantic-context guard and preloaded secondary current-card translation remain.

## Evidence

- Root focused UI run: 20 files / 198 tests passed.
- Additional root run: 9 files / 144 tests passed, overlapping 6 preference tests:
  **336 distinct tests across 28 files**. Subsequent release regression added one
  test; release suite 14/14 passed, bringing covered distinct tests to 337.
- Typecheck passed. Lint passed with the pre-existing `handlePlayAudio` effect
  dependency warning in TrainingSenseCardV2Session; no new warnings.
- Deployment gate/publisher Node tests 20/20 passed. Manifest validation passed.
  DB 228 checksum: `1c902d598b2e7b9ebf720961d782c1ebe15c78a49e6b1e2557cf06a31e23ead5`.
- Disposable PostgreSQL integration 1/1 passed: RLS/foreign/anon/client-forgery,
  coalescing, cache/job ready, terminal failure, rollback, and publication failure
  preserving accepted writes. Forward local migration 228 retained local data.
- Actual local Realtime WebSocket integration 1/1 passed: owner received account,
  private dictionary translation and release hints; second user and anonymous
  joins explicitly returned CHANNEL_ERROR. Throwaway users/dictionary/entry
  cleaned, verified zero remaining fixtures. Repro commands and SDK timer caveat
  are in [the runbook](../runbooks/shared-app-events.md).
- Independent read-only review found first-join reconciliation and old in-flight
  release-read races. Both fixed with regressions; final review reports no
  remaining actionable blocker. Snapshot and preference readers were checked for
  write/event feedback loops; ordinary reads do not mutate, conditional training
  replanning converges when revisions match.

## Limitations and release status

Best-effort hints require reconnect and sparse safety reads; no durable replay.
Realtime caches join permissions; protected lookups remain authoritative and
subscriptions rejoin on token refresh. No resource contents travel in hints.
Self-hosting requires the complete compatible Realtime service, not only PG.
Future shared folders/collections are documented, not implemented here.

At this checkpoint production remains c9d880f; implementation awaits review, CI and release.
The active issue 731 checkout is retained for review. Issue 728 checkout remains
pending its open PR #730; production debugging captures remain ignored in reference
`reports/qa/production-post-migration/joint-blink-2026-10-17/`.

## Follow-up validation

Production Next.js build passed on local Supabase configuration (existing route
re-export warnings and the same baseline lint warning). Initial CI FSRS run
failed because its separate plain-Postgres harness lacked realtime schema.
The harness now reuses the existing CI-only Broadcast model, restricted to
recognized disposable databases; existing Supabase objects are left untouched.
`scripts/db-local-supabase.sh test-fsrs`: **377/377 tests,42files passed**, wrapper
removed the disposable database. CI is rerun on this correction.
