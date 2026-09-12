# Training safety and exercise delivery handoff

Owner: vbalashi/2000nl. Authoritative backlog: #327. Accepted policy:
[ADR0013](../../adr/0013-single-active-training-run.md). This document is an
implementation brief, not a duplicate task-status board.

## Start from the right baseline

Audit baseline main485b8a231. Recheck remote and live migration ledger before
implementation. The separate local branch codex/332-idiom-session-runtime at
eaf3eedce contains rejected prototype256188196 plus a docs-only amendment. Do
not merge it wholesale. Preserve it as evidence. At audit, its manifest enabled
153 despite its ADR saying not to deploy; active main remained contract152.
If any environment has applied153, do not rewrite it: design a forward correction.

Use the project create-worktree wrapper with the owning issue; read AGENTS and
engineering principles. Claim migration sequence and contract scope. Serialize
DB work and rebase on the integrated predecessor. Preserve dirty/unintegrated
worktrees. Do not migrate/reset production or clean up user state during tests.

## Execution sequence

1. #392: integrate the decision/docs and prove the rejected153 is absent from the
   intended deployment path (manifest, bootstrap, drift, probes and runbook).
2. #393: ordinary Training end-to-end single-active-run authority and safe reset.
   Reuse existing queue storage; do not rebuild FSRS or add cross-device resume.
3. #394: exercise action idempotency/access and queue-mixing regression coverage;
   compose with ownership. Characterization can precede #393, but shared writes
   are serialized. Do not spend time repairing the rejected153 implementation.
4. #195 content-policy closure and #332 legacy-state inventory; #331 design can
   proceed independently. Ambiguous legacy mappings require owner approval.
5. #332 idiom consumer after the relevant policy/design/safety gates. Attached
   idioms remain supporting ordinary-card content, without idiom grades there.
6. #333 translation consumer, reusing the same authority/action boundary. Each
   exact example has independent progress; translation language does not.

#290 owns composed regression evidence; every fix still carries its own tests.
#298 owns naming/counter presentation, not another scheduler. #279 is separate
FSRS-reference work, not a reason to change formulas in these slices.

## Concrete implementation seams to inspect

- Ordinary resume: apps/ui/lib/training/sessionResumeStore.ts and TrainingScreen
  resume effect currently require a localStorage pointer; this is NOT automatic
  cross-device discovery. Do not let shared storage transfer active tab ownership.
- Ordinary start/selection/action service and pilot controller; split ownership
  behavior into a focused module instead of growing the screen controller.
- SQL session selector136 and consumption139 use membership within one session;
  grading in another session does not consume its members. Action113 has state
  revision checks, but freshly projecting an old queue can carry a current
  revision. Revision checks alone do not solve obsolete queued work.
- Existing action wrapper134: add ownership enforcement at the same atomic
  mutation boundary. Server-derived user only, no client authority assertions.
- Content exercise152 hashes raw sourceContext and needs semantic retry review.
  Transport observations must not change action identity. Keep real provenance.

These are evidence pointers, not an instruction to edit historical migrations.
Use forward migrations and current canonical modules after inspecting callers.

## Required state transitions and races

An explicit start/continue-here claims a run; validation never claims it. Repeated
delivery of the same start request returns the same result, not a fresh takeover.
Before displaying an actionable face after reentry, hide/disable old interaction
and validate. Superseded means discard queue/card/hints/revealed-answer/counter;
deliberate continuation builds anew at0/N. Background events cannot auto-restart.
The run generation guards every async read/translation/action result.

Takeover and grade share serialization: old accepted grade first means new queue
observes it; takeover first means old new grade has no effects. Lost-success
retry after takeover returns the old receipt without mutating the new run. No
offline grade replay. A last-millisecond race may be rejected internally, but
normal returning users must not be invited to grade obsolete cards first.

## Acceptance matrix

- Two devices: phone20/five accepted; computer starts/five accepted; phone
  returns: no stale actionable face; continue builds current queue at0/N.
- Two tabs, simultaneous starts, duplicated start request, visibility/focus,
  reconnect, BFCache, notification loss and two tabs visible without ping-pong.
- Two DB connections: takeover-vs-grade and concurrent lost-success retries;
  assert exact receipt/event/FSRS counts, not just returned status.
- Permissions revoked after selection: no private content/metadata leaks.
- N10 with20new+20due at1:5: new+5review+new+3review. The prototype first truncated
  to10new, making later mixing ineffective. A one-new/one-review test is weak.
- Category exhaustion and permitted-mode fallback; no future practice pulled
  forward; hint/reveal/load failure/retry/reset do not spend the action budget.
- Preserve Known, enrollment, ordinary and content-target history, and separate
  directions/examples. No automatic one-to-many legacy progress copy.
- Old first-party cached clients cannot bypass ownership; non-training external
  action contracts continue working. Specify rollout compatibility before merge.

Run local DB integration, UI/route tests, typecheck/lint and two-browser-context
tests. Use isolated fixtures, not personal production state. Record exact tested
SHA and CI evidence. Do not claim end-to-end coverage from mocked tests alone.

## Audit findings and their disposition

Deployment contradiction is #392. Multi-device stale ordinary queues are #393.
Prototype153 permission leakage, concurrent retry failure and ratio starvation
are regression requirements in #394/#332; not observed production incidents.
Raw152 source-context idempotency is an active-boundary audit item in #394.
Final selector visuals remain unapproved under #331. No full production audit or
two-device reproduction was claimed by the senior-model static review.
