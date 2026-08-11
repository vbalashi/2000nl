# Approved SenseCard in the real Training review loop

Status: active
Issue: `vbalashi/2000nl#124`
Branch: `codex/124-training-sensecard-loop`
Base: `982192df100ad9a29a05a590195de1652040c58f`
Started: 2026-08-10

## Goal

Turn the existing first-pilot Today/Setup entry into a complete real-card
review loop by enabling the already-approved Platform V2 Training SenseCard
surface and removing duplicate legacy session controls from that pilot.

## Approved visual contract

- Existing reusable `TrainingSenseCardStage` and `SenseCardChrome` components.
- Approved Pen/HTML card contract already integrated by issues #74, #77, and
  #79; this issue does not redesign or fork it.
- Today/Setup flow merged by #121/#122.

## Owning layer and boundaries

The slice belongs to `apps/ui` plus the local pilot launcher. It composes the
existing Platform V2 lookup/action routes, SenseCard renderer, Training queue,
and review callbacks. It adds no DB, scheduler, dictionary, provenance, or
public Platform contract.

The pilot remains reversible through existing rollout flags. History and Word
Details retain their current legacy contracts; their push/overlay behavior is
explicitly outside this slice.

## Public seams under test

These seams were agreed in the owner-approved sequence for this slice:

1. The owner-review `--pilot` launcher enables the complete existing Training
   V2 route/UI profile, not only Today/Setup and Library.
2. `TrainingScreen` in the pilot session renders the approved reusable
   SenseCard Face/Answer interaction and does not expose duplicate legacy
   period/source/footer session controls.
3. An accepted review/start/known action advances through the existing queue
   owner without duplicating the mutation.
4. Missing/unavailable V2 presentation data preserves the existing legacy
   fallback and rollback path.

## TDD sequence

1. Characterize the pilot launcher profile and duplicate-footer behavior.
2. Add a failing TrainingScreen pilot composition test.
3. Enable the existing V2 lookup/action/UI flags in the pilot launcher and
   conditionally omit the legacy footer for the Today/Setup pilot.
4. Run focused tests, typecheck, lint, full UI tests, and browser QA against
   real local data.
5. Run independent Standards and Spec review on the exact final SHA.

## Progress

- [x] Pilot launcher enables Today/Setup, Platform V2 lookup/actions, and the
  V2 Training renderer as one explicit profile.
- [x] Duplicate legacy inline session controls are hidden while Today/Setup is
  active; the existing progress summary remains visible.
- [x] Direct and reverse understanding modes use the shared V2 Training stage.
- [x] Exact entry selection works when the trained entry belongs to a
  multi-sense headword group.
- [x] Start-learning mutation was accepted on real local data and advanced to
  the next queue card.
- [x] Focused and full UI tests, typecheck, lint, production build, and visual
  QA pass.
- [x] Compared the runtime against Pen board `30.90` (`Oiksc`) with three
  clean-context reviews covering visual fidelity, responsive state, and
  keyboard/accessibility flow.
- [x] Added the missing session context/exit chrome, compact responsive
  progress footer, mobile fill geometry, scroll-state fades/continuation,
  visible Face/Answer prompts, More/Report affordances, and deterministic
  focus/keyboard transitions.
- [x] Independent Standards and Spec review: PASS on exact implementation SHA
  `ad9d8e5e38c2f64797cdc25050e26737ee73889f`.

## Local QA note

The imported local Van Dale dataset initially had no grouped-search documents,
so Platform V2 correctly returned no groups and the reversible legacy fallback
remained visible. The documented resumable extraction-version-2 backfill was
completed for all 18,163 local entries before the real browser cycle. No
production data or schema was changed by that operational preparation.

## Deferred

- History versus Word Details panel interaction model.
- Saved Training Plans and advanced filters.
- Listening cards and other non-understanding training presentations.
- New scheduler/count APIs or data-model changes.
- Exact queue-total display in session chrome. The current Training owner can
  state the local card ordinal truthfully, but has no authoritative count API
  for the filtered one-card-at-a-time queue. The pilot therefore labels the
  session as open instead of fabricating a `current / total` value.
- Durable report submission UI. Training exposes the capability visually but
  keeps it unavailable until the existing typed `report-content` capability
  has an owned mutation/dialog contract; this slice must not invent one.
