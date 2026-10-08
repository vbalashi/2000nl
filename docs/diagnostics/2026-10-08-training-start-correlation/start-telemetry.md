# Ordinary Training Start correlation

## Released baseline

PR620 was deployed as `0.18.1197`, commit
`9ca3c52fdc03a137075bccd38dd300614e8c8764`; deployment
https://github.com/vbalashi/2000nl/actions/runs/37783609225 succeeded.
Production health and DB214 contract were healthy. The owner-approved follow-up
QA capture (one Start, zero answers/grades, temporary login revoked) measured
2348ms click-to-first-card versus the earlier6877ms sample. This pair is not a
stable speedup estimate or evidence that the database tail is fixed.

The follow-up trace contained no completed hidden Library search. Its first
scope/start/next/lookup reads took about168/873/327/711ms respectively.
The Start-triggered statistics read began after initial lookup completion.
An automatic statistics read began343ms before the click and overlapped Start.
The recorder sees completed requests only, so absence is not proof of SQL
cancellation. Raw follow-up evidence is preserved locally with SHA256SUMS at
`.worktrees/.reference-sync-backup-2026-10-08/413-after-release/`.

## Bounded next slice

Before this slice, accepted ordinary Start does not start a user transition.
Scope persistence and session creation have no common timing ID with the first
selection, lookup and rendered-card timing. The browser observes a card while
no `start-ready` total is recorded. Direct RPC HTTP responses also provide no
SQL stage breakdown. Existing preference/bootstrap timing is a separate action.

Use a diagnostic ID for ordinary meaning/word-in-context Start and pass it through
scope commit, session creation and `loadWord` to the existing presentation owner.
Only the existing rendered-card readiness signal can finish successfully.
Failures, empty plans and cancellation must terminate without reporting ready.
Leaving the visible Training destination cancels only the measurement before
the child card can report readiness; the session and network request continue.
This ID is separate from the mutation idempotency UUID; retries must retain their
existing RPC key and payload. Idiom/sentence instrumentation remains unchanged.

The production capture script saves transition events alongside click/ready
wall-clock times and sanitized completed-request metadata. Scope and session
stages are mutations, not bootstrap hydration; the attribution harness includes
them in its existing non-overlapping critical-path calculation. Timings are
client intervals, not PostgreSQL execution times. No card content, user/list/
session identifiers or request payloads are added to timing events.

## Background statistics finding

`TrainingScreen` automatically starts detailed statistics once preferences,
language and active list are hydrated. Today does not display those aggregates;
its availability counts have their own source. Statistics nevertheless affect
availability refresh keys, session footer and `initialReviewDue`. Returning to
a scope deliberately reuses a pending statistics request. Late results are
fenced by account/scope/generation, rather than cancelled at transport level.

Do not blindly abort all reads on Start: the backend may already be executing
SQL, and removing pending-request adoption can cause duplicate work. A later
separate change can gate the initial detailed read with characterization of
Today, the footer baseline and same-scope reuse. This instrumentation slice
changes neither statistics lifecycle nor scheduling/learner data.

## Validation protocol

- Browser regression first reproduces visible first card with no Start total.
- Deferred unit tests cover scope/session/selection order, terminal results,
  cancellation, idempotency stability and unchanged special families.
- Browser fixture delays scope and session reads independently, verifies both
  intervals belong to one Start and finish exactly once at rendered readiness,
  and sends no answer/review action.
- Attribution replay classifies scope/session as mutations and includes their
  intervals without adding overlaps twice.
- Existing accepted-answer attribution and Training startup tests remain green.

#413 stays open: this provides a reliable client measurement seam. It does not
identify or fix the managed PostgreSQL first-call tail. No new production QA
Start was performed while implementing this slice.

Local browser validation:2/2 new Start scenarios;5/5 existing answer attribution,
setup readiness and startup continuity scenarios; the separate2500ms injected
delay still produces the expected red attribution verdict. Attribution replay
3/3 passes after first failing on misclassified Start mutation spans.

Final local validation:111/111 tests across TrainingScreen, transition integration,
commit hook, timing sanitizer and attribution replay; typecheck passes. Full lint
passes with the pre-existing handlePlayAudio dependency warning at
TrainingSenseCardV2Session.tsx:617. Independent review accepted the revised
visibility cancellation. No production measurement or deployment in this slice.
