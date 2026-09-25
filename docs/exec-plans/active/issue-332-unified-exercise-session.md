# Unified exercise session release — #332 / #499

Updated 2026-09-25. Status: implementation in progress; not release-ready.

## Accepted user contract

Words, idioms and sentence exercises share the session layout, progress strip,
history/close controls, answer-header actions, grading dock, quiet secondary
links and New/Review/Total footer. Scenario adapters supply content and numbers;
they do not invent another visual screen. Existing word-card typography/colors
remain authoritative. One exercise family per session; all advertised filters
apply to that family's content.

The quiet action is **Exclude / Uitsluiten / Исключить**. Its accessible help
explains exclusion from training in both directions. Exclusion belongs to the
content pair, regardless of direction, for every bidirectional family. Preserve
FSRS state and offer Undo/Return. Do not simulate Easy or infer that the learner
knows the material. Do not exclude sibling meanings or idioms in the same entry.

## Verified current state

- PR #498 / `641e68eba` is the baseline. It shared card templates but left idioms
  on a separate session shell and omitted action wiring.
- This worktree adds existing Platform audio/translation/details handlers and
  shared quiet-action layout, with stale-response protection.
- Idioms now use `TrainingSessionV2Layout` and `TrainingSessionChrome`, including
  progress, history and close. The parent applies the same viewport style.
- Existing word details callback also receives a click event in compatibility
  consumers; safe optional access preserves that behavior.
- Migration 167 adds a read-only, owned-session idiom stats RPC and extracts the
  source-node relation from migration 161 for both selection and counting.
  Local tests/postflight pass; production remains on DB166 and has not changed.
- Production selector body was checked through linked Supabase CLI: its MD5
  `cfff2f0f546d9c5f11eba7430cd4e9fb` exactly matches migration 161 (including
  delimiter-adjacent newlines). No production writes were made.
- Both word and idiom sessions use TrainingSessionStatsFooter. Idiom counts load
  separately, refresh after accepted grades, reject stale responses and freeze
  the review denominator after the first successful response.
- The ordinary session-plan hook no longer starts for idiom sessions.

## Release blockers (do not merge this checkpoint as a complete release)

1. **Report scope:** the WIP idiom report freezes selected nodes but retains the
   full-entry revision. Existing SQL validates the full-entry atom projection;
   real submission can reject. Add an explicit source-bound idiom content scope
   to the diagnostic contract and canonical server projection. Preserve existing
   full-entry reports and displayed-translation verification. Test submission,
   not merely opening the report sheet.
2. **Exclusion:** ordinary Known synchronizes both directions (migration 138),
   but also activates successor meanings (migration 143). Merely relabeling Known
   would retain a knowledge-specific side effect. Implement an explicit pair
   exclusion with atomic action/receipt and undo; preserve historical Known data.
   Verify ordinary and content-bound exercise selection plus already-latched
   session behavior. Do not change scheduling or manufacture reviews.
3. **Footer data:** implemented in migration 167 and the shared renderer; still
   needs the forthcoming pair-exclusion filter and final real-browser proof.
   Counts use the saved session scope; bounded session membership is not used
   as corpus size. The footer never blocks card readiness.
4. **Browser proof:** verify direct/reverse, front/back, all three locales,
   mobile narrow width and desktop, actual actions and current-session counts.
   Pending test.todo for exclusion must become an executed test before release.

## Statistics projection

Read the owned training_sessions row by session ID. Use its saved list_id,
list_type, training_filter and idiom direction, not mutable UI draft settings.
Extract the read-only source-node relation from the **latest** migration 161
candidate function before ranking/limits. Share it with candidates so eligibility
cannot drift. Preserve dictionary access, source-group eligibility, exactly one
explanation and fingerprint checks. training_extra_source_entries_v1 owns
collection/dictionary/POS and other lexical filters. Do not invoke candidates_v2
for counts: it materializes target identities and is not a read-only projection.

- New: distinct selected-direction targets first reviewed in the current study day.
- Review done: subsequent accepted review actions during that day, including
  repeated answers; retries do not add events.
- Review due: eligible scheduled targets due before study-day end, excluding
  introductions today and hidden/frozen/excluded pairs.
- Total: FSRS-enabled scoped idiom identities / all eligible scoped identities,
  including nodes without materialized targets.
- Use training_reference_now_v1 and training_study_day_bounds_v1 with the user's
  timezone. Freeze the review denominator after the first successful read, as
  ordinary sessions do. Pending/error values are unknown, not zero.

Authoritative exercise history uses user_training_exercise_action_events
(action `review-exercise`) and immutable receipts. Do not classify the first
review by state.created_at or a session queue_source. Validate first-review
classification from actual historical events/receipts.

## Validation and order

1. Shared visual shell and interaction regressions (current checkpoint).
2. Read-only stats relation/RPC + common footer; DB tests for identity, filters,
   two users, directions, study-day boundaries, retries and no read mutations.
3. Explicit pair exclusion + undo across families; scheduling/authorization/
   active-run/idempotency tests.
4. Scoped Report end-to-end validation, including translations and atom bounds.
5. Browser mobile/desktop parity, typecheck/lint/relevant suites, two-axis review.
6. Commit/PR; exact migration checksums/postflight if DB contract changes; green
   CI before main merge, which automatically deploys test production. Verify
   deployed SHA and actual runtime behavior before calling the release complete.

#413 remains nonblocking and is not part of this UI release.

## Statistics checkpoint evidence (2026-09-25)

- Full disposable SQL suite: 240 tests passed before adding the DST regression.
- Final targeted real DB suite: 12 tests passed, including the new DST test;
  entire chained postflight through 167 passed on that disposable database.
- UI/transport/deployment checks: 95 passed, one existing exclusion TODO remains.
- Typecheck passed; lint passed with the pre-existing handlePlayAudio hook warning.
- Deployment manifest validates exact migration checksum and contract 167.
- Two-axis static review found no blockers. A history-scan risk was improved:
  aggregate only events inside the study day and use the indexed prior-event
  existence check to identify introductions, instead of ranking all past events.
- No release merge/deployment has occurred. Next: pair exclusion/undo (#499),
  scoped Report, then complete browser/production verification.

## Exclusion action foundation checkpoint (2026-09-25)

Migration 168 introduces private pair marks and immutable retry receipts, plus a
service-principal action boundary. Exclude consumes the active session member
atomically; Undo restores only the exact still-active mark. Neither changes FSRS
or Known. Ordinary recall directions share identity; content-bound exercises use
their node and fingerprint, so sibling content remains available. A shared pair
lock/guard is ready for review integration.

Seventeen targeted real SQL tests and the full postflight chain through 168 pass.
Tests cover reverse undo, delayed retries after undo, stale undo after re-exclude,
superseded sessions, nonzero scheduling/history preservation and atomic rejection
of an out-of-order member. Both static reviewers found no actionable foundation
defects. Selection, review guards, current-session reads and UI integration remain
unfinished; this checkpoint must not be independently published as the release.

## Exclusion availability checkpoint (2026-09-25)

Migration 169 integrates active pair exclusions into ordinary, idiom (legacy and
scoped), and sentence candidate selection before ranking/pagination. Indexed
anti-exists predicates avoid an RPC per corpus row. Exact single-occurrence
patches operate on the latest installed definitions and fail closed if an anchor
differs; no older function bodies replace newer filters or clock behavior.

New grades/start-learning acquire the same pair lock after receipt replay; the
legacy review path acquires pair before turn lock. Already-latched members expose
`pair-excluded` and use the existing explicit unavailable-member mutation with
server evidence. Reads remain read-only. Both ordinary and idiom due statistics
omit exclusions while history/total counts retain existing progress.

Validation: all 253 disposable DB tests pass; targeted 24 SQL tests plus the full
postflight chain through 169 pass. Typecheck and nine deployment/idiom transport
tests pass. Concurrent exclusion-versus-legacy-review test confirms blocking then
rejection without creating FSRS state. Two-axis review identified missing ordinary
due filtering; fixed and independently rechecked with a 3 -> 1 -> 3 test retaining
listening state. The first manifest test caught an omitted 168 in its expected
list; corrected and rerun.

Remaining before release: HTTP/client Exclude and Undo wiring for ordinary and
idiom cards, Report submission contract, complete mobile localization/browser QA,
PR/CI/deploy verification. Neither 168 nor 169 has been applied to production.

## Exclusion UI checkpoint (2026-09-25)

A strict first-party HTTP boundary now derives the principal server-side and
invokes the atomic exclusion RPC. Shared `useTrainingExclusion`,
`TrainingExcludeAction` and `TrainingExclusionUndoNotice` serve ordinary and idiom
training. The short visible labels are Exclude/Uitsluiten/Исключить; accessible
help explains both directions. Ordinary Exclude replaces the training Known link,
while historical Known compatibility remains available on its existing surface.

Uncertain retries keep the frozen request/event ID. Accepted actions never become
new exclusions when presentation fails. Undo remains visible after next-card or
completion transitions, preserves its own retry identity and is scoped by user.
Ordinary exclusion invalidates prepared-next state (a cached reverse may now be
excluded). Idiom next-card loading ignores stale responses. Superseded exclusion
requests recover through the existing session reset in both scenarios.

Validation: typecheck; 142 component/controller/HTTP tests pass, including the
previous exclusion TODO now executed. Lint has only the pre-existing audio-effect
warning. Two-axis review found parser coercion and missing superseded recovery;
both fixed, tested and independently rechecked. No production deployment yet.
Next: finish source-bound Report submission, then complete real-browser mobile
ru/en/nl and desktop parity, release review/CI/deploy/runtime verification.
