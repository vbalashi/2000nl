# First-pilot Training Today, Setup, and recovery states

Status: active
Issue: `vbalashi/2000nl#121`
Branch: `codex/121-training-today-setup`
Base: `b010bf67b03c306dd7e4832120643495c1c87f1e`
Started: 2026-08-10

## Goal

Implement the approved first-pilot journey from Training Today to Training
Setup and the minimum loading, empty, error, and first-use recovery states.
Keep the current training session mounted until the learner explicitly starts
a replacement session.

## Approved visual contract

- Pen `30.55.01` — Mobile Training / Today (`hBfSr`)
- Pen `30.55.02` — Mobile Training / Setup (`uulI0`)
- Pen `30.55.04` — owner-review follow-up for the truthful first pilot
  (`a808mf`)
- Pen `30.50.10` — desktop owner-review follow-up for the truthful first pilot
  (`xLx00`)
- Pen `30.55.03` — desktop recovery-state matrix (`vwR6d`)
- Owner approval recorded in issues #72 and #75 on 2026-08-10.

## Owning layer and boundaries

The slice belongs to `apps/ui`. It composes existing training preferences,
active-list state, queue loading, and statistics. It adds no DB, scheduler,
dictionary, provenance, or public Platform contract.

The rollout boundary is `NEXT_PUBLIC_TRAINING_TODAY_SETUP_V1`. When disabled,
the existing Training screen remains the entry point and rollback needs no data
change.

## Public seams under test

1. Training opens on Today; entering Setup and returning does not replace the
   mounted/current session.
2. Setup changes remain a draft. Back/cancel discards the draft; Start applies
   it as one explicit session transition.
3. Loading, empty, error, and first-use states have distinct copy and truthful
   recovery actions.
4. Today, Setup, Start, Back, and Retry remain reachable on narrow/mobile
   layouts.
5. With the rollout flag disabled, the legacy Training entry is unchanged.

## First-pilot scope

- Today summary and explicit Continue/Start/Adjust actions.
- Setup controls backed by existing scenario, card-filter, mode, list, ratio,
  date, and source data only.
- Meaning and Reverse are independent multi-select directions within the
  authoritative Understanding scenario. Listening remains visible but disabled
  until its training flow is implemented and enabled for this pilot.
- New and Reviews are independent session-composition toggles. The ratio is
  enabled only when both are selected and stays limited to the ratios already
  supported by the scheduler contract.
- Session size is UI-local in this pilot and must not claim scheduler support
  that does not exist; `all matching cards` is the truthful bottom summary.
- Loading, empty, error, and first-use recovery surfaces.
- Focused tests, typecheck, lint, production build, and desktop/mobile browser
  QA.

## Deferred

- Saved Training Plans and routine management.
- New queue-count or eligibility APIs.
- The live count, Saved Training Plans, and `Save as plan` action represented
  by Pen `30.60`/`TL8hb`; the pilot does not imitate them with client-side
  estimates.
- New advanced lexical filters.
- New scheduler or persistence semantics.
- Final visual polish beyond the approved balanced pilot.

## TDD sequence

1. Characterize rollout-off and mounted-session behavior.
2. Add failing Today/Setup navigation and draft/cancel/start tests.
3. Add failing recovery-state tests.
4. Implement the smallest UI state model and destination components.
5. Integrate existing preferences and queue actions without moving their
   authority.
6. Run focused and full validation, then independent Standards/Spec review.

## Completion evidence

Pre-merge evidence (2026-08-10):

- Full UI suite: 449 passed, 74 skipped (the skips are the repository's
  existing opt-in FSRS/platform suites).
- Typecheck and lint: pass, with no lint warnings.
- Production build: pass against the local Supabase environment. Existing
  Next.js runtime-export and browser-data freshness warnings remain unchanged.
- Browser QA: desktop empty/recovery and Setup, plus 390×844 mobile Setup.
  Captures live under `tmp/issue-121-qa/` and are intentionally gitignored.
- Mobile Setup exposes Meaning and Reverse as independent choices, Listening as
  an explicitly unavailable future mode, New/Reviews as independent choices,
  a conditional new/review ratio, and list/source/time-window controls without
  horizontal overflow.
- Settings remains a separate utility destination. While it is open, the
  central Training / Library / Statistics navigation has no active item, the
  right utility toolbar stays visible, and its Settings control is active.
- Local health check targets the local database and passes the platform RPC
  check. The worktree has no dictionary seed payload, so the grouped-search
  readiness warning and empty queue are recorded as environment limitations;
  real-card behavior remains covered by component/integration tests.
- Initial Standards/Spec reviews found broad-file orchestration, non-atomic
  scope persistence, an invalid scenario/mode combination, missing truthful
  controls, and rollout-off error swallowing. The implementation was revised
  to extract a focused pilot controller, use a named queue-load request,
  persist the complete scope atomically, guard duplicate Start, normalize
  scenario/mode transitions, expose supported controls, and preserve legacy
  error behavior. The final Spec pass additionally required keeping recovery
  visible when replacement loading fails and honoring backend-disabled
  scenarios. The queue boundary now distinguishes loaded, empty, error, and
  skipped results, and scenario actions stay disabled until backend
  capabilities resolve. These cases have explicit integration tests. Final
  validation also prevents Start when the authoritative scenario set is empty
  or no longer contains the persisted scenario, and normalizes Setup to the
  first server-supported scenario when one exists. Selected card modes are
  likewise checked against the chosen scenario's server-advertised modes;
  unsupported persisted directions cannot start and Setup offers Reverse only
  when the backend advertises it. Final independent re-review is required on
  the amended SHA.

Still required: exact final feature SHA, final Standards/Spec verdicts, draft
PR and review-ready checkpoint, owner pilot decision, merged-main SHA, and
post-merge verification.
