I'll answer as a senior algorithm engineer specializing in spaced-repetition schedulers and learning systems.

## Context and Previous State
- The training flow used SM2-like scheduling stored in `user_word_status` with `sm2_n`, `sm2_ef`, `sm2_interval`, and `next_review_at`. Review/click handling lived in Postgres functions (`handle_review`, `handle_click`), and selection used `get_next_word` prioritizing overdue SM2 reviews then random new NT2-2000 words. UI exposed only binary success/fail plus freeze/hide; definition clicks recorded separately but loosely treated as lapses.
- Limitations: SM2 provides coarse adaptation, no concept of graded difficulty (hard/easy), weak handling of clicks-as-lapses, no daily new/review limits in the algorithm, and limited logging for analysis. No FSRS state persisted, so migrating required new columns and logs.

## Requirements as I Understand Them
- Functional:
  - Replace SM2 with FSRS-6 scheduling (grades 1–4) for word reviews.
  - Treat definition clicks as a “missed/forgotten” signal (grade=1) and reschedule accordingly.
  - Support daily card limits and mixed new/review selection; allow configuration.
  - Keep ability to hide/freeze items.
  - Expose richer grading in UI (again/hard/good/easy).
  - Persist per-review logs for analytics/debug.
- Non-functional:
  - Run inside Postgres (Supabase) to keep scheduling close to data; low latency per RPC.
  - Maintain backward compatibility / migration from SM2 without losing progress.
  - Keep selection performant with indexes; predictable behavior for due queries.
  - Testability via pure TS helper (fsrs math mirror) and SQL functions.
- Assumptions:
  - Postgres/Supabase is the source of truth for scheduling.
  - NT2-2000 list is the target pool for new cards.
  - Timestamps are UTC; day boundaries align to `current_date` in DB.
  - Click should act as grade=1 (again) and be logged.
- Uncertainties:
  - Exact desired daily limit defaults (used 10 new / 40 review as starting point).
  - Whether to gate FSRS per-user behind flags beyond initial migration default.

## Proposed Approach and Rationale
- Core idea: Implement FSRS-6 entirely in Postgres with stored functions for parameter set, interval calculation, state update, and selection. Mirror the math in a small TS helper for unit coverage and future client-side uses.
- Algorithm: Standard FSRS-6 formulas with same-day handling, lapse handling, difficulty mean reversion, and retention-based interval calculation. Definition clicks map to grade 1. Daily limits enforced in selection using per-user settings and review logs.
- Why this approach:
  - Keeps logic server-side, minimizing divergence between UI and scheduling.
  - Uses SQL functions for atomic state updates and logging.
  - Migration path from SM2 is explicit and preserves progress.
  - Aligns with existing RPC architecture.
- Alignment: Reuses Supabase RPC pattern; adds FSRS-specific columns and logs without removing SM2 fields (backward compatibility). Adds user settings table for limits/retention.

## Changes Made So Far
- Schema & state:
  - `0010_fsrs6.sql`: Added FSRS fields to `user_word_status` (stability, difficulty, reps, lapses, last_grade, last_interval, target_retention, params_version, fsrs_enabled), `user_review_log`, and `user_settings` (daily limits, mix mode, retention, use_fsrs flag + trigger).
  - `0012_fsrs6_seed_from_sm2.sql`: Seed FSRS fields from SM2 (stability ≈ interval, difficulty from EF), enable FSRS flag, set `use_fsrs=true`.
- Scheduling functions:
  - `0011_fsrs6_functions.sql`: FSRS parameters, interval helper, core compute; FSRS versions of `handle_review`, `handle_click`, `get_next_word`, and `get_training_stats` with daily limits and click-as-lapse.
  - `0013_fsrs6_grades.sql`: Updated `handle_review` to accept full grades (fail/hard/success/easy → 1/2/3/4).
- UI/Types:
  - Added 4-grade actions and hotkeys (K again, H hard, J good, L easy) in `TrainingScreen.tsx`; updated `ReviewResult` type and button layout.
  - Extended event map in `trainingService.ts` to cover hard/easy.
- Tests & helper:
  - Added `apps/ui/lib/fsrsMath.ts` as a TS mirror of FSRS math; unit tests in `apps/ui/tests/fsrsMath.test.ts` for init, lapse, easy, and hard vs good growth.
- Temporary/experimental: TS helper is for validation and potential client use; source of truth remains SQL. SM2 columns retained for safety/migration.

## What Is Still Missing / Open Points
- Need end-to-end tests hitting the RPCs to validate DB functions (grades, clicks, limits, selection priority, freeze/hide).
+- UI still labels “success” as “Goed (Good)” but internally maps to grade 3; verify translations/UX copy.
- Migration safety: large-table migration timings and trigger creation on `auth.users` need verification in staging.
- Performance validation: indexes exist, but overdue counts and daily-limit counts should be profiled under load.
- Observability: add metrics/logging for grade distribution, queue sizes, click-induced lapses.
- Clarify defaults for daily_new_limit/daily_review_limit and whether to honor per-mode overrides.

## Implementation Plan and Anticipated Complexity
- Step 1: DB validation in staging
  - Run migrations 0010–0013; verify `handle_review`, `handle_click`, `get_next_word`, `get_training_stats` via RPC calls.
  - Check trigger creation for `user_settings`.
  - Risk: migration time/locks on `user_word_status`.
- Step 2: Integration tests
  - Add API-level tests (could be Vitest hitting Supabase test DB) for: new card init, grade transitions 1–4, click-as-lapse, daily limit enforcement, freeze/hide, mix of exclude IDs.
  - Risk: test harness setup for DB.
- Step 3: UI polish
  - Update labels/help/hotkey dialog to reflect four grades; ensure sidebar history shows hard/easy results.
  - Risk: minor UX inconsistencies.
- Step 4: Observability
  - Add logging/metrics around `user_review_log` aggregation; optional dashboards for grade mix and overdue backlog.
  - Risk: scope creep; keep lightweight.
- Step 5: Rollout controls
  - Confirm `use_fsrs` gating logic if we need staged rollout; currently default is true after migration.
  - Risk: mixed environments if old clients rely on SM2 fields.

## Strengths, Weaknesses, and Risk Analysis
- Strengths:
  - Full FSRS-6 implemented server-side; click-as-lapse handled natively.
  - Daily limits and selection integrated into `get_next_word`.
  - Backward-compatible: SM2 columns preserved; seed migration provided.
  - Auditable: `user_review_log` captures before/after state.
- Weaknesses:
  - Logic split between SQL (source of truth) and TS helper (mirror); potential divergence if future changes occur.
  - No end-to-end RPC tests yet; UI still binary history result rendering might need tweaks.
  - Migration uses heuristic mapping from SM2 EF→difficulty; accuracy limited.
- Risks & failure modes:
  - Long-running migration on large `user_word_status`.
  - Misconfigured daily limits causing starvation of new or review cards.
  - Grade/key mapping confusion in UI leading to skewed data.
  - Click volume could inflate lapses if users browse definitions frequently.
  - Detection: monitor review log grade distribution, overdue queue size, daily served counts vs limits, and error logs from RPC.

## Validation and Rollout Strategy
- Testing: unit (done for math), add integration tests against Supabase for review/click/selection; manual QA for hotkeys/labels.
- Data scenarios: new card init, overdue review, same-day multiple reviews, click before any review, mixed exclude list, frozen/hidden items, limits reached.
- Rollout: run migrations in staging, validate RPCs, then production with `use_fsrs` default true (or gate per user if desired). Keep SM2 data untouched for rollback; rollback by switching RPC calls to SM2 functions if needed.

## Summary and Recommendations
- Implemented FSRS-6 in Postgres with full 4-grade support, click-as-lapse, daily limits, and logging; UI updated to expose grades and hotkeys; TS helper/tests added for math parity. State migration from SM2 is provided.
- Status: close to production-ready pending integration tests and staging validation of migrations and limits.
- Recommendation: proceed with staging validation and integration tests; align UX copy, then roll out with `use_fsrs` flag enabled, keeping SM2 fields as fallback. Monitor grade mix and queue sizes post-launch.
