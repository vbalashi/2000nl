# Issue #441: Training setup readiness boundary

Status: implementation is in draft PR [#445](https://github.com/vbalashi/2000nl/pull/445); this note records the behavior contract, not final product approval.

## Readiness states

| State | Required evidence | User behavior |
| --- | --- | --- |
| Setup usable | The authenticated Training screen has resolved the learning-language catalog and hydrated the active list catalog for the selected language. A missing catalog/list is represented as first-use; catalog failures remain errors. Statistics, first-card selection, and card projection are not setup prerequisites. | Today and Setup render; setup controls can be edited while stats or card preparation is pending. |
| Start or resume pending | Start is accepted only after setup prerequisites, saved-session validation, and a prepared current card are ready. Start then commits the selected scope and awaits the existing server session-start path. A saved session is checked against the server snapshot before its saved scope and member queue are restored. | Start remains disabled while those prerequisites are unresolved. Resume failures expose retry and do not silently create a replacement session. Continue only opens the already-prepared active card. |
| First actionable card | The selected entry has passed the required Platform V2 lookup and renderability check and is installed as the current presentation. A resumed session must still have an authoritative active member; live session-authority checks also gate grading after focus/reconnect or return from another destination. Translation/audio preparation may continue separately. | Card actions are disabled until the current card and session authority are ready. Stats completion is independent. |

The implementation derives setup prerequisites in
`apps/ui/components/training/TrainingScreen.tsx` and keeps the user-facing
Today/Setup state in
`apps/ui/components/training/pilot/useTrainingPilotController.ts`. The three
states are deliberately independent: a pending statistics request or a slow
selection/projection must not hide editable setup, while neither can make an
unready card actionable.

## Stale work and scope ownership

Statistics are keyed by user, language, card modes, and active list. Responses
from another key or generation are ignored. Card selection and projection are
owned by `useTrainingTurnController`; changing scope invalidates the prior
load generation, and unmounting invalidates the mounted guard. A late selection
or projection therefore cannot install a card after logout/navigation or
replace the result for a newer scope. If the Training component is unmounted
(including an auth logout), pending work is fenced from installing a card.
Preparation remains read-only; only the explicit Start/Resume and answer-action
paths can create or mutate a session.

## Evidence and remaining gates

- Component tests hold stats and card preparation pending while setup remains
  available, and cover errors, retry, resume validation, and stale scope stats.
- The existing `scope-key replacement cancels the old selection and presents
  exactly one new-scope result` test and the screen-level `footer list selector
  still changes active training scope` test cover a prior selection resolving
  after scope replacement. Turn-controller tests also cover a stale old-scope
  projection and late selection/projection results after unmount.
- Delayed-network Playwright tests hold stats, selection, and projection for ten
  seconds and capture timing plus sanitized request identities. These are
  route-mocked local QA evidence, not production latency evidence.
- Local Auth/PostgREST Start/reload/resume evidence is recorded in PR #445; it
  confirmed the same active session/card. A follow-up on the exact PR head
  `67c3a45c058f6c9d88cdc046a5be103c334e7b1f` used the local QA identity
  and real PostgREST/SQL paths: explicit Start returned a ten-member session;
  the first-card response identified ordinal 1 and exactly matched the first
  member's entry ID in the local DB. Reload in the same in-app browser tab
  returned the same session ID, ten-member snapshot, ordinal-1 entry ID, and
  visible card. No answer/progress action was submitted. The local health
  warning concerned the optional grouped search index/deployment receipt;
  the DB migration contract probe passed.
- An earlier new-tab smoke appeared to show a different card under an
  "active session" heading. That tab did not own the saved session record:
  it made ordinary `get_next_card` calls and no session-snapshot call.
  The displayed ordinary card therefore did not test same-tab membership
  preservation. Its misleading Continue label is tracked in #452; do not
  cite it as a proven lost-member defect in this PR.
- A page-level auth `SIGNED_OUT` test now unmounts the authenticated Training
  shell; controller tests separately prove that late selection/projection
  results cannot install a card after unmount. This does not simulate an
  actually expired or remotely revoked token.
- Desktop/mobile QA captures still need product-owner review against the
  currently approved visuals. The checked-in Playwright captures include the
  Next.js development badge and are not approval screenshots.
- The duplicate same-identity projection handoff remains owned by #442; this
  issue does not change cache/session ownership or claim a first-card speedup.
  The current route-mocked A→B→A identities have no matched main-vs-branch
  before/after comparison yet; do not treat them as production counts or as
  evidence that the duplicate request was eliminated.
