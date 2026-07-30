# Issue 76 — 2000NL Single-sense SenseCard Tracer

Status: preserved spike — screen integration not approved

Issue: https://github.com/vbalashi/2000nl/issues/76

Base: `01cbeeacca02e5ff0f9e64b5c79ed815f235a778`

## Preserved checkpoint

The branch contains a working technical spike of a Platform V2-driven
single-sense component, client localization, translation, and durable
Known/Undo interaction. It is intentionally not review-ready and must not be
merged.

The attempted integration into the current `TrainingScreen` was stopped after
product review: the surrounding 2000NL training screen, front/back reveal
transition, light/dark themes, history/sidebar, next-card behavior, and removal
of unrelated filters have not yet been designed and approved as one screen.
Issue #76 must resume only after that screen-level Pen work is approved.

## Intended outcome

Render one real 2000NL training card from the Platform V2 DTO using the frozen
Full/Narrow visual contract at visible Pen addresses `20.10` and `20.81`.

## Boundaries

- single returned SenseCard only; multi-sense remains on the existing UI;
- V2 lookup and mutation flags remain required and dark by default;
- interface language, content language, and translation target stay separate;
- no client-side reconstruction from labels, raw dictionary JSON, or array
  position;
- no production migration or flag rollout in this issue.

## Vertical slices

1. [x] Spike the reusable semantic SenseCard view and localized message resolver.
2. [x] Spike a guarded V2 lookup/action client for the current training card.
3. [ ] Integrate translation, learn/review, Known/Undo, audio and responsive
   Full/Narrow states without changing the legacy fallback.
4. [ ] Add contract, interaction, localization and responsive tests.
5. [ ] Compare browser captures with `20.10` and `20.81`; fix P0–P2 visual
   differences and publish review evidence.

## Rollback

Disable `NEXT_PUBLIC_PLATFORM_V2_SENSE_CARD_UI`. The existing TrainingCard and
V1 review controls remain the fallback and no V2 UI state is stored locally as
authority.
