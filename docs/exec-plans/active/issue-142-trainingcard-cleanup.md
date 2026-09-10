# Issue #142 — retire the legacy TrainingCard renderer

Status: in progress. Base: `origin/main` at `f076fba7`.

## Goal

Remove the old `TrainingCard` runtime path from active Training flows after
every supported mode and every active caller has moved to the V2 session
contract. The approved Face/Answer visual contract and FSRS semantics must not
change as part of the cleanup.

## Completed checkpoints

- `listen-recognize` is routed through the V2 session/stage (PR #292).
- Pilot-session loading and exhausted-queue states stay inside
  `TrainingSessionV2Layout` (PR #295, draft; CI and browser smoke green).
- The old renderer is no longer used for these two pilot transitions.

## Remaining dependencies

1. **Details action placement.** Training More is the read-only surface from
   #269. Do not add footer actions there. Any future freeze/hide action must
   first be designed as part of the ellipsis menu, then get its own typed
   contract and caller migration before the shared legacy review port is removed.
2. **`listen-type`.** It is not a supported V2 mode: it needs an input and
   answer-checking contract. Do not route it to V2 by predicate alone and do
   not silently keep it as an active production fallback.
3. **Caller inventory (#255).** Confirm no external or compatibility caller
   still requires the old renderer, controller port, or presentation helper.

## Removal sequence

1. Add characterization tests for listening, loading, exhausted and Details
   actions.
2. Make the V2 mode predicate single-source in Screen, controller and
   prefetch; keep `listen-type` explicitly unsupported until its own feature
   exists.
3. Resolve the separately designed Details-menu action contract, then remove
   `useLegacyTrainingReviewPort` from Details.
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
- Do not delete the old path until the Details-menu action decision and the
  actual-caller inventory are complete.
