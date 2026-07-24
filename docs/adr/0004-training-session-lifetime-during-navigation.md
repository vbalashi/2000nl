# Training Session Lifetime During Navigation

Status: proposed
Date: 2026-07-24

## Context

The current authenticated root mounts only `TrainingScreen`
(`apps/ui/app/page.tsx:37-45`). `SettingsModal` is mounted from inside that
component, so opening search/lists/statistics/settings does not currently
unmount Training.

The active training session is not a persisted aggregate. Its state is spread
across `TrainingScreen` React state and refs:

- current card and reveal/hint state:
  `apps/ui/components/training/TrainingScreen.tsx:171-176`;
- transient language/filter/sidebar state:
  `TrainingScreen.tsx:197-202,265-295`;
- pending-action guard, review turn ID, and reviewed-in-session set:
  `TrainingScreen.tsx:294-302`;
- queue turn/counter, active scope projection, and session reset dependencies:
  `TrainingScreen.tsx:373-447`;
- load guard, one-shot override, and prefetch cache:
  `TrainingScreen.tsx:457-478`;
- prefetch cancellation on unmount/navigation:
  `TrainingScreen.tsx:874-946`;
- review can present the prefetched next card before the current review
  mutation finishes:
  `TrainingScreen.tsx:980-1059`.

Unmounting loses the current card, reveal state, queue rotation, turn ID,
reviewed set, one-shot override, and prefetch. A refresh also loses them. The
database persists review/card state and active training preferences, but there
is no persisted resumable session snapshot.

## Decision

Use a **persistent-shell-first strangler** for the first navigation slices.
The shell owns destination selection and keeps the existing `TrainingScreen`
instance mounted while Library or another migrated destination is visible.
This preserves current behavior while application areas are separated.

This ADR does not introduce a persisted `TrainingSession` aggregate. That
requires a later decision about identity, snapshot versioning, expiry,
multi-device ownership, resume conflict, and scheduler interaction.

### Navigation semantics

For the first shell:

- In-app destination changes hide/show the same mounted Training instance.
- Opening Library, Statistics, Training Setup, or App Settings is not a session
  end and does not reset current card, reveal/hint state, queue turn,
  reviewed-in-session set, turn ID, one-shot override, or prefetch.
- Browser Back/Forward between shell destinations changes the visible
  destination while retaining that mounted Training instance.
- Mobile destination changes have the same lifetime as desktop; closing a
  drawer is not navigation.
- Changing a session-defining value (language, scenario, modes, pool/filter,
  list) keeps the existing explicit reset semantics at
  `TrainingScreen.tsx:436-447`. It is not silently applied merely because the
  user viewed Training Setup.
- A saved/default setup edit and a temporary session override remain distinct.
  Returning to Training must not apply an unconfirmed draft setup.

### Pending review action

An explicit review mutation is a critical section.

- While `actionLoadingRef`/`actionLoading` is true, the shell blocks starting a
  destination transition and disables navigation controls.
- The shell must not unmount Training to handle a pending action.
- Once the mutation settles, a previously requested destination is not applied
  implicitly; the user can navigate deliberately.
- The existing optimistic next-card presentation
  (`TrainingScreen.tsx:1004-1059`) must be characterized before shell work.
  Persistent mounting preserves it but does not make refresh/unload safe.
- No new review action, record-view action, or setup persistence is triggered
  by navigation itself.

### Prefetch and hidden Training

An already-started prefetch may finish while Training is hidden and remains
associated with the same current card/turn. Hiding Training does not start
another prefetch. Returning uses it only if the existing card-key checks still
match. An actual unmount continues to invalidate the prefetch as it does today
at `TrainingScreen.tsx:937-945`.

### Refresh, close, and leaving the application

Refresh, tab/window close, sign-out, or navigation outside the persistent
shell ends the transient UI session.

- Persisted reviews and saved active scope remain authoritative.
- The next mount asks the scheduler for a fresh card using the saved scope.
- Reveal/hint, queue rotation, reviewed-in-session exclusions, prefetch,
  one-shot overrides, and the prior turn ID are not restored.
- The application must not restore a revealed answer or replay an unconfirmed
  review after refresh.
- Browser unload cannot guarantee completion of an in-flight mutation. The
  shell may warn when a review is pending, but warning is not durability.
  Existing server idempotency/turn semantics must be characterized before
  claiming exactly-once behavior across unload.

This deliberate refresh behavior is acceptable for the first strangler. A
requirement to resume the exact card across refresh or devices triggers the
separate persisted-session ADR; it is not implemented through ad hoc
`localStorage`.

## Acceptance gates

Before the first navigation slice:

1. characterize desktop and mobile behavior for current card, reveal, hint,
   queue turn, reviewed set, active scope, one-shot override, and prefetch;
2. prove Library → Training → Back/Forward retains the same mounted instance;
3. prove setup drafts do not alter the running session until an explicit apply;
4. prove navigation is disabled throughout a pending review and cannot submit
   or lose a second action;
5. characterize refresh before reveal, after reveal, while prefetch is ready,
   and while review is pending;
6. prove refresh starts fresh without restoring reveal or replaying a review;
7. prove hidden Training does not emit lookup or mutation side effects merely
   because another destination is viewed;
8. prove changing a session-defining value resets only through the existing
   explicit boundary;
9. preserve existing Training tests before extracting any shell/module
   boundary.

Wave 0 current-state evidence is tracked in:

- `docs/architecture/settings-modal-entrypoint-task-map.md`;
- `docs/architecture/evidence/settings-training-wave0/`;
- `apps/ui/tests/TrainingScreen.test.tsx`, including current-card/reveal
  persistence across modal tab navigation and close.

This evidence characterizes the compatibility overlay. It does not yet prove
Back/Forward behavior in the future persistent shell or pending-review
navigation blocking, because those controls do not exist yet.

## Consequences

- Navigation can be introduced without first designing durable sessions.
- Training remains memory-resident while the first destinations migrate.
- Refresh does not resume the exact transient session.
- The shell is a compatibility adapter, not a new owner of scheduler or review
  semantics.
- A later persisted-session design can replace this policy only through a new
  ADR and migration plan.
