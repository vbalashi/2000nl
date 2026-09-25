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
- No DB migration has been authored or applied by this worktree yet.

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
3. **Footer data:** idiom session payload has bounded members, not corpus/day
   statistics. Never populate its footer with word statistics or treat session
   size as total corpus. Add the read-only projection described below and use
   the same footer renderer. Fetch independently of first-card readiness.
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
