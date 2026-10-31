# Training session lifecycle

Status: implementation contract for issues #25–#29. This document describes the
migration seam; it does not claim the common owner is already installed.

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
| Accepted grade, next preparation fails | Recover preparation; never repeat accepted mutation | Existing accepted-next-unavailable | Required adapter parity | Required adapter parity |
| Grade ambiguous | Keep event ID/payload; reconcile | Existing action reconciliation | Existing client reconciliation | Existing client reconciliation |
| Grade rejected | No progress; retain recoverable turn or retire on superseded | Existing action semantics | #24 retirement | Required adapter parity |
| Content pending | Wait/retry same target; no grade/unavailable mark | Context preparation | If applicable | Existing translation recovery with trailing read |
| Permanently unavailable content | Explicitly retire member, then select | Existing selection port | Existing exercise endpoint | Existing exercise endpoint |
| completed / exhausted | Trust server terminal/count; cancel preparation | Existing finite plan | Shared completion shell | Shared completion shell |
| Explicit replacement / superseded | Retire run/presentation before recovery; no generic Retry loop | Existing root recovery | #24 recovery | Required adapter parity |
| Focus / online / visible return / periodic check | Read-only validation, fence unresolved authority, no actions | Existing root validation | Migration must add parity | Migration must add parity |
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
fail in each family (four failures); restoring it passes all 12 contract cases. These tests deliberately enable the
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

Current asymmetries must be explicit until migrated. Root return/reconnect/polling
is gated by the ordinary session ID, which is cleared for specialized families.
Sentence next calls the superseded callback, but its action catch still treats
supersession generically. Specialized progress/orchestration and ordinary root
orchestration remain separate. The shared ACK contract does not prove these paths
are already equivalent; migration needs targeted regressions for each gap.

## Authority extraction in progress

The first #28 implementation moves ordinary authority checking, stale-response
fencing, coalesced replan ownership and return/reconnect/poll subscriptions into
`useTrainingSessionAuthority`. `TrainingScreen` supplies its ordinary snapshot and
reconciliation adapter; its old authority generations, pending-replan ref and
listener effects are removed. The queue still uses `useTrainingTurnController`.

`useTrainingSessionAuthority.test.tsx` covers account and same-ID replacement,
late active/superseded responses, offline fencing, failed/retried and concurrent
replans, unmount and event/poll rebinding. Existing TrainingScreen tests continue
to exercise the actual integration. This extraction is not completion of #28 or
#29: Start/resume orchestration and specialized adapters remain to be migrated,
and the complete common controller is not yet released.

## Migration and deletion gates

1. Land #24 and #26 regressions before moving their behavior. #27 establishes this
   contract and common presentation tests.
2. In #28 deepen the existing controller, move ordinary Start/resume/authority and
   accepted recovery out of `TrainingScreen`, preserving its queue/preparation.
   Remove the replaced root handlers in the same change.
3. In #29 connect idiom/sentence adapters and remove their duplicate generations,
   event IDs, load/action loops and lifecycle effects after parity. Move pending
   translation orchestration behind its content adapter, retaining bounded hints
   and its trailing read. Do not leave old and new owners active together.
4. Verify the complete four-family integration, including desktop/mobile,
   hidden/return and real ACK. Release the complete integration as one candidate.

A single generic component that receives many family flags would retain scattered
lifecycle decisions. A new owner wrapping unchanged controllers would create two
owners. Both are rejected in favor of replacing orchestration at the existing
controller seam. Database/FSRS, action semantics, authorization, provider jobs and
visual redesign are outside this migration.
