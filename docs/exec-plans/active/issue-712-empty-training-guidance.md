# #712 — empty training guidance

Owner: Codex chat with repository owner. Accepted decision:
[discussion](../../discussions/2026-10-18-01-empty-training-guidance.md),
[no live builder counts](../../discussions/2026-10-18-02-no-live-builder-counts.md).
Branch `codex/712-empty-training-explanation`; base e068e559e71d2743cf4091cb5f5a28dcfadc842d.

## Boundary

UI-only: shared display guidance, Overview, Session Builder, selected-recipe
availability and three locale catalogs. Counts remain read-only, start RPC remains
authoritative, no SQL migrations or changes to scheduling/enrollment/access.

## Implemented

- Empty review selection explains available new cards and opens Session explicitly.
- Main explanation sits beside the button in the counter-caption font, slightly
  stronger contrast; it wraps below on narrow screens without horizontal growth.
- Availability queries remain on the overview only. No counters or live draft
  requests in the builder. It reuses a settled home snapshot only for the same
  owner, language and normalized material/exercise/filter scope; changed scopes
  remain unknown until explicit Start. Known-empty guidance stays inside Session,
  and the sticky footer contains actions only.
- All due labels explicitly name reviews. Changing the mix retains the existing
  finite-size rule. Save/start remain explicit.
- Empty start results remain visible after counts settle, including errors, and
  match the attempted canonical draft plus training language. Old empty results
  cannot block a corrected preset. Existing resume and early-review actions remain.

## Validation

- Regression tests first reproduced missing overview explanation (2 failing tests).
- 140 targeted tests passed across six files; typecheck passed; lint passed with
  the existing unrelated `handlePlayAudio` dependency warning.
- Automated matrix: review/new/both, positive/zero/unknown counts, all three
  languages, early review, stale positive counts after an authoritative empty
  plan, corrected draft, availability failure, no saved preset, opening Session,
  explicit save and corrected launch. Existing hook/start-controller suites also run.
- Local deep health passed, target local, DB contract 228.
- Real local browser: empty fixture list disables Start with contextual guidance;
  test collection review-only with a lexical filter exposes 0/0/1 and Include new;
  action opens Session, finite mixed setup saves, main offers Start, start RPC 200,
  first card rendered at 0/5 without grading. Local existing fixture data retained.
- Desktop and 390×844 screenshots in `/tmp/2000nl-712-qa/`; horizontal scrollWidth
  390 at mobile viewport. These are actual local backend captures, not mocked data. Final editor capture:
  `builder-no-live-counts-mobile.png`; older editor-counter variants are rejected.
- Production diagnosis earlier confirmed a finite mixed setup starts. This is not
  production verification of the new code; release remains separate.

## Completion / preservation

Keep this worktree while its PR is pending review and it owns local screenshot
artifacts and preview runtime. Do not retire research checkout 603. Merge, rollout
verification, reference-main sync and retirement remain pending until accepted.
