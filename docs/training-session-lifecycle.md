# Training session lifecycle

Status: integrated implementation in PR #35 for issues #25–#29. The complete
change is reviewable together; production deployment is a separate step.

## Ownership

Evolve `useTrainingTurnController` into the single session controller. Do not add
an independent controller beside the active ordinary controller. Meaning and Word
in Context already share its queue and action acceptance path. Idiom and sentence
need content adapters, rather than their own session lifecycle implementations.

A local run identity is created for an intentional Start or validated resume. It
owns a copied `TrainingRunSelection`, the server session identity once bound, and
all its presentation/operation identities. Binding the server ID to a successful
Start is not replacement: it must not cancel that Start's first selection.
Explicit replacement, takeover, exit and account change retire the local run and
invalidate its operations before any successor is opened. Reusing a server ID or
returning to an earlier scope never makes an old operation current again.

Keep separate identities for:

- the run: user, family, local lifetime, bound server ID/generation;
- the visible turn: target/card key and presentation identity;
- a logical operation: run lifetime plus operation identity, across *every* await;
- a transport attempt: retry of the same operation, not a new intentional grade.

Late renderer notifications carry the exact owned selection object. The root
checks that object before retiring a run, including during the synchronous gap
between binding a successor and unmounting its predecessor. Server ID equality
alone cannot authorize an earlier notification.

The selection snapshot is not a snapshot of access, progress, plan revision or
translations. Those remain live. An account/catalog refresh updates defaults and
cannot issue a replacement command. A callback changing identity is not a new run.

## Interface and adapter seam

The root supplies selection/setup intents and renders state from the controller.
The controller owns Start/resume, one current run, cancellation, turn preparation,
accepted-action advancement, terminal decisions and recovery. Family adapters
supply content and translate existing server contracts into these outcomes:

| Adapter operation | Normalized result | Family knowledge retained by adapter |
| --- | --- | --- |
| start / resume | active run, terminal, missing, superseded | Existing request/session shapes and direction |
| validate | active revision, replan, superseded, unavailable | Read-only snapshot endpoint |
| next | candidate, completed, exhausted, superseded, unavailable | Queue/scheduler and target identity |
| prepare | prepared content, pending, retryable failure, unavailable | Word context, expression, sentence/translation readiness |
| act | accepted receipt, rejected, ambiguous, superseded | Existing payload, event ID and reconciliation client |
| retire unavailable member | retired or retryable failure | Existing explicit unavailable mutation |

The controller exposes an observable session state and explicit intents: start,
resume, reveal, grade/exclude, retry, replace, return and exit. `retry` derives its
operation from state: it must not accept arbitrary caller-supplied session IDs.
The adapter receives the owning operation's cancellation signal and identity.
After each await the controller checks the full operation, even when a transport
cannot be aborted. Cleanup clears a pending operation only if it still owns it.

Preserve `usePreparedNextTrainingTurn` as an internal ordinary preparation seam;
consume a prepared candidate only for its exact predecessor. Its queue prediction
is an optimization, never display authority. Reuse `useCurrentTrainingCard` for
all renderers. Keep card payload models and approved shells family-specific.

## Transition matrix

| Trigger / result | Controller decision | Meaning / Word in Context | Idiom | Sentence |
| --- | --- | --- | --- | --- |
| Start accepted / resume validated | Bind run, latch selection, prepare first turn | Ordinary session and card key | Exercise target and direction | Translation target and recall direction |
| Hidden pane / no display permit | Do not expose actionable presentation | Existing ACK hook | Same ACK hook | Same ACK hook |
| ACK accepted for current target | Expose ready presentation | Word or context prompt | Expression | Prepared sentence translation |
| ACK rejected / expired | Retain target; retry read authority | Existing current-card Retry | Same behavior | Same behavior |
| Reveal | Change presentation only | No grade | No grade | No grade |
| Grade accepted | Settle receipt once; advance once | Consume exact prefetch or select | Load next target | Load next target |
| Accepted grade, next preparation fails | Recover preparation; never repeat accepted mutation | Existing accepted-next-unavailable | Shared exercise lifecycle | Shared exercise lifecycle |
| Grade ambiguous | Keep event ID/payload; reconcile | Existing action reconciliation | Existing client reconciliation | Existing client reconciliation |
| Grade rejected | No progress; retain recoverable turn or retire on superseded | Existing action semantics | #24 retirement | Shared exercise lifecycle |
| Content pending | Wait/retry same target; no grade/unavailable mark | Context preparation | If applicable | Existing translation recovery with trailing read |
| Permanently unavailable content | Explicitly retire member, then select | Existing selection port | Existing exercise endpoint | Existing exercise endpoint |
| completed / exhausted | Trust server terminal/count; cancel preparation | Existing finite plan | Shared completion shell | Shared completion shell |
| Explicit replacement / superseded | Retire run/presentation before recovery; no generic Retry loop | Existing root recovery | #24 recovery | Shared exercise lifecycle |
| Focus / online / visible return / periodic check | Read-only validation, fence unresolved authority, no actions | Existing root validation | Shared authority adapter | Shared authority adapter |
| Late response / unmount / account change | Discard old continuation and ref cleanup | #26 regressions | #24 and ACK regressions | ACK and migration regressions |

`accepted` and `ready` are distinct facts. Display failure cannot undo acceptance,
repeat a grade, manufacture completion, or advance the server queue. Pending
translation is neither permanently unavailable content nor session exhaustion.
Authority checks must not issue a review or create a replacement session.

## Characterization evidence and known gaps

`tests/support/trainingLifecycleContract.ts` runs unchanged against all four real
renderers via their test fixtures. It defers the real current-card transport and
asserts hidden/visible ACK gating, canonical target identity, no premature action,
and rejection of late ACKs after unmount or a hidden/return transition.
Removing the aborted-response guard from the real hook makes one contract test
fail in each family (four failures); restoring it passes all 16 contract cases. These tests deliberately enable the
archive/current-card feature instead of relying on the legacy always-ready path.

Additional existing integration coverage is part of the migration gate:

| Tests | Behavior protected |
| --- | --- |
| `useTrainingTurnController.test.tsx` (#26) | Deferred mark success/failure, waiting Retry, explicit/identity replacement, unmount, accepted-action fallback |
| `TrainingScreen.test.tsx` | Start ID binding, defaults, resume, replan, authority, takeover, accepted counts |
| `TrainingIdiomSession.test.tsx` (#24) | Superseded next/Retry/action, no rejected progress, fresh run, late predecessor rejection |
| `TrainingSentenceSession.test.tsx` | Pending translation, trailing recovery read, target/direction, reveal, grade and completion |
| `TrainingSenseCardV2Session.test.tsx` | Actual word/context rendering, current-card ACK/Retry, accepted action versus next failure |
| `useTrainingRunSelection.test.tsx` | Owned selection and current-run checks |

## Runtime modules

The controller is composed at existing seams, not replaced by a second active
ordinary controller. `trainingOperationScope` is the shared operation owner. Its
leases span the complete logical operation, including a wait before selection;
replacement/cleanup abort signals and invalidate commits even when transport
cannot be aborted. Channels keep preparation and an accepted action independent.
A translation preference update can refresh preparation without discarding an
accepted grading receipt.

- `useTrainingPilotController` owns Start/Continue intents. Its operation flows
  through `useCommitTrainingPilotDraft`, which dispatches the family request and
  then uses one binding/plan/selection path. Closing or superseding an intent
  prevents a late result opening a run. Failed-start retries retain request IDs.
- `recoverTrainingRun` reads and classifies every family's saved run with one
  verdict. Root preflight validates available language/material; the root applies
  the normalized run to selection/UI state rather than maintaining three resume
  machines. Binding a Start server ID does not cancel its first selection.
- `useTrainingTurnController` remains the ordinary/Word in Context adapter for
  queue rhythm, exact prefetch consumption and accepted-action advancement. Its
  former load/recovery generations use the common operation owner, including
  the #26 mark/Retry regressions.
- `useTrainingExerciseSession` owns idiom/sentence preparation, unavailable-member
  retirement, reveal, grading, terminal progress and pending-content recovery.
  `trainingExerciseAdapters` supply only target-specific transport and content.
  The renderer files no longer own load/action generations or duplicate loops.
- `useTrainingSessionAuthority` owns read-only checks and coalesced replans;
  every family uses its return/reconnect/poll policy. Its leases reject late
  responses across account changes, same-ID replacement and offline transitions.
- `useTrainingExerciseProgress`, `sessionLifecycle` and the existing session
  finalizer preserve server terminal counts and clear only terminal saved runs.

An uncertain grade retains its candidate/result/event ID; the explicit Retry
reuses that frozen intent and alternative grade buttons wait. Once accepted,
Retry prepares the next card without repeating the mutation. A snapshot can
retire an externally consumed/unavailable visible member; an unchanged member
keeps its revealed presentation. New independent sentence runs remain paused by
the existing product policy; legacy sentence restoration uses the same lifecycle.

Pending translation retains its subscription during recovery reads. Hints are
coalesced into one trailing read; clearing/rejoining the subscription mid-read
would create a self-sustaining recovery loop. `TrainingSentenceRecovery.test.tsx`
exercises the actual production registry, reconnects, sparse fallback, scope
replacement, failed translation and late responses.

## Verification and release gates

1. #24 and #26 regressions landed before moving their behavior. #27 establishes this
   contract and common presentation tests.
2. #28 reuses the ordinary controller and shared operation owner; Start and
   saved-run recovery have common verdict/binding paths. Replaced root authority
   listeners, counters and family resume branches are deleted.
3. #29 connects idiom/sentence adapters to the common exercise lifecycle. The
   old renderer generations, event IDs and load/action loops are deleted.
   Pending translation keeps bounded hints, sparse fallback and its trailing read.
4. Verify the complete four-family integration, including desktop/mobile,
   hidden/return and real ACK. Release the complete integration as one candidate.

A single generic component that receives many family flags would retain scattered
lifecycle decisions. A new owner wrapping unchanged controllers would create two
owners. Both are rejected in favor of replacing orchestration at the existing
controller seam. Database/FSRS, action semantics, authorization, provider jobs and
visual redesign are outside this migration.
