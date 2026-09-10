# Issue #142 — retire the legacy TrainingCard renderer

Implementation/review: PR #300, based on `ef91acd9`. GitHub #142 owns live status.

## Goal

Remove the old `TrainingCard` runtime path from active Training flows after
every supported mode and every active caller has moved to the V2 session
contract. The approved Face/Answer visual contract and FSRS semantics must not
change as part of the cleanup.

## Completed checkpoints

- `listen-recognize` is routed through the V2 session/stage (PR #292).
- Pilot-session loading and exhausted-queue states stay inside
  `TrainingSessionV2Layout` (PR #295, integrated as `ef91acd9`).
- The old renderer is no longer used for these two pilot transitions.
- PR #300 removes the remaining renderer, projection and review adapter.
  Supported Screen scenarios are re-baselined on V2 with no skipped tests;
  the caller inventory records the disposition of every retired V1 assertion.
  Integration still requires final reviews, full CI and browser smoke.
- Final review removed duplicate raw-payload audio preloading from the turn
  controller; normalized V2 preparation remains the owner. The unreferenced
  `FirstTimeButtonGroup`, `AudioModeToggle` and `InteractiveText` components are
  deleted and forbidden by the final-retirement CI guard.
- The multi-grade Screen characterization now waits for each accepted
  transition receipt, not just the next mounted heading. Actual V2 rapid click
  and hotkey deduplication remains covered separately.
- Local dedicated-account QA verified Learn and Good as distinct History
  entries, Details/navigation preservation, mobile card rendering and retry
  from an unusable reverse prompt. Retry recovered; its ordinal increment
  without a grade is recorded under #294. Audio/translation provider failures
  in this local environment are not counted as passed media QA.

## Remaining dependencies

1. **Details boundary verified.** Training More suppresses global footer
   actions under #269. Its freeze/hide callback was unreachable; Library
   callers supplied no such callback. Remove that dead wiring, not replace it
   with new actions. A future menu design is independent of renderer removal.
2. **`listen-type`.** It is not a supported V2 mode: it needs an input and
   answer-checking contract. Do not route it to V2 by predicate alone and do
   not silently keep it as an active production fallback.
3. **Caller inventory (#255).** The [bounded inventory](../../architecture/target-state-2026-09/training-legacy-callers.md)
   identifies the internal renderer/test callers and distinguishes them from
   active public learning actions. No AudioFilms/Pontix import of the internal
   renderer was found. Public `start-learning` remains current in both V1 and
   V2 and is not scheduled for deletion by #142.

## Removal sequence

1. Preserve characterization tests for listening, loading, exhausted and the
   absence of global footer actions in Training More.
2. Make the V2 mode predicate single-source in Screen, controller and
   prefetch; keep `listen-type` explicitly unsupported until its own feature
   exists.
3. Remove unreachable Details callbacks. Remove `useLegacyTrainingReviewPort`
   and `submitLegacyReview` together with their remaining legacy Training
   button, keyboard and swipe callers; preserve the shared acceptance/recovery
   controller used by V2.
4. Migrate or retire legacy-only TrainingScreen tests and remove the fallback
   JSX, old reveal/grading state, projection and imports.
5. Move any still-valid presentation tests to V2 model/stage tests, then
   delete `TrainingCard.tsx` and `trainingCardPresentation.ts`.
6. Update architecture/design docs and run no-caller checks.
7. Run spec, architecture and refactor review; then focused/full UI tests,
   desktop/mobile smoke and a test-environment rollout.

## Guardrails

- Do not touch draft PR #144 or blind review #143.
- Do not rewrite historical migrations or reset learning identities.
- No future Details-menu design or external action migration blocks deletion
  of the internal TrainingCard renderer. Remove only the verified internal
  paths and retain active Platform actions and their DB implementations.
