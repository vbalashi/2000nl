# Collection and training selection validation plan

Date: 2026-09-20
Status: Initial VanDale evidence pass complete; full-plan acceptance remains open.
Owner: 2000NL Platform/DB for semantics; UI for interaction; AudioFilms for actual
YouTube-client acceptance in a separately owned task.

Junior execution details, current-code gating, exact fixture additions and the
evidence template are in the
[junior validation runbook](./collection-training-junior-test-runbook.md).
The independent current-state audit is
[collection-training-current-state-map-2026-09-20.md](../../research/collection-training-current-state-map-2026-09-20.md).

The first executed VanDale pass is recorded in
[collection-training-vandale-run-2026-09-20.md](../../research/collection-training-vandale-run-2026-09-20.md).
It validates the current server-side session path and records the full-list
materialization/UI gaps; it does not claim that the unimplemented collection,
preset, multi-source or history-follow-up scenarios pass.

Junior execution details, current-code gating, exact fixture additions and the
evidence template are in the
[junior validation runbook](./collection-training-junior-test-runbook.md).

## Objective and inputs

Prove both exact selection and practical latency for the
[reconciled contract](../../intent/search-and-lists/collection-training-contract.md).
[Decision IDs C1–C28](../../intent/search-and-lists/collection-composition-decisions.md)
provide approval provenance; C23 is superseded. Do not implement it.

Deliver a reproducible report that classifies the design as supported by evidence,
requiring optimization, requiring product adaptation, or not yet testable. A
fast query returning the wrong set fails. A mocked green UI does not prove DB
correctness. Missing capability is NOT IMPLEMENTED, never PASS.

This plan authorizes no production load tests, deployment, data deletion, or
changes to FSRS mathematics. Before material implementation claim an owning issue
and use `scripts/create-worktree.sh <issue> <slug>` as required by the worktree
runbook. Keep dependencies local. This document is a test handoff, not a claim
that the proposed APIs, workers or tests already exist.

## Execution stages and agent ownership

1. **Baseline/contract agent:** pin commit, migrations, environment and fixtures;
   map every scenario below to actual RPC/API/UI code. Characterize existing
   actions and record missing capabilities. Resolve engineering closure items
   from the contract before asserting their expected results.
2. **Fixture/oracle agent:** build deterministic seeds and independent expected
   entry/target sets; share versioned fixture manifest with other agents.
3. **Collection agent:** implement/run membership, refresh and dependency tests
   through real SQL/RPC boundaries. Missing product behavior requires separately
   scoped implementation; do not substitute a fake refresh worker in acceptance.
4. **Training/history agent:** exercise real action receipts, event queries,
   eligibility, session start/resume and partial access; compare with oracle.
5. **Performance agent:** after correctness, run baseline/load matrices on the
   same reviewed commit. Diagnose hot queries and rerun affected cases after fixes.
6. **UI/client agent:** exercise actual UI states with real local backend and
   controlled failures. Actual AudioFilms extension acceptance is separate from
   a synthetic Connected Client HTTP test; label evidence accordingly.
7. **Independent reviewer:** inspect fixture expectations, raw timing samples,
   failures and coverage; reconcile report to C1–C28. No automatic visual/product
   approval from passing tests.

Stages 3 and 4 may run in parallel after the fixture and contract are pinned;
each uses its own disposable database. Load tests need exclusive resources or
explicitly measured contention. Do not let another agent's reset invalidate data.

## Existing anchors to inspect and reuse

- `packages/ingestion/src/importer/source_import.py`: current NT2 materialization.
- `apps/ui/tests/fsrs/fsrsRpc.test.ts`: FSRS/provenance atomicity and retries.
- `apps/ui/tests/fsrs/platformActionReceiptVerificationRpc.test.ts`.
- `apps/ui/tests/fsrs/trainingSessionPlanRpc.test.ts` and `trainingRunAuthority.test.ts`.
- `apps/ui/tests/api/platformV2ActionsRoute.test.ts`, `platformLearningRoutes.test.ts`.
- `packages/shared/types/platformV2.ts` and `apps/ui/lib/platform/platformV2ActionService.ts`.
- `db/scripts/scheduler_dictionary_access_benchmark.mjs`,
  `next_card_selection_latency_benchmark.mjs`, `dictionary_latency_benchmark.mjs`.
- ADR 0008 (budget), ADR 0011 (target identity), ADR 0013 (active run),
  platform engineering principles and the cross-project coordination map.

Legacy action names are not proof of V2 behavior. Record the exact action
capability/result mapping before writing grade tests. Use actual canonical
mutation functions; a test-only scheduler or copied FSRS implementation cannot
prove parity. Independent reference vectors remain useful as an oracle.

## Environment and evidence requirements

Use the guarded disposable local DB harness described in
`docs/runbooks/local-supabase-test-env.md`. `scripts/db-local-supabase.sh test-fsrs`
creates a disposable suite database; inspect its argument support before using
focused filters. For ingestion, bootstrap `--install --ingestion`, then use
`scripts/db-local-supabase.sh test-ingestion`. Run relevant route/component tests,
typecheck and lint for touched code. Browser execution must follow local UI QA
skill/runbook, reuse healthy local port 3100, and record deep health/source SHA.

Do not reset the shared browser database for concurrent DB tests. Benchmarks may
insert synthetic data only into explicit guarded disposable targets. Read the
existing benchmark guards; do not remove them or assume they accept arbitrary DBs.

Record commit/dirty patch, migration head, schema receipts where applicable,
Postgres/Node versions, CPU/RAM, container limits, indexes, fixture seed/hash,
exact runner command, clock policy and start/end times. No secrets in artifacts.

## Small deterministic oracle

Freeze T at `2026-09-20T12:00:00Z`. Seed user U, another user V, shared dictionary
D, U's private dictionary P, and an inaccessible dictionary Z. Use real UUIDs
mapped to these symbolic IDs in the fixture manifest. All selected entries must
have valid renderable content and known baseline access.

| ID | Dictionary / properties | U's events relative to T |
| --- | --- | --- |
| d-door | D, noun, core=true | `review-card`/`fail`, video A, -1 day |
| d-mouse | D, noun, core=true | `review-card`/`hard`, video A, -2 days |
| p-furniture | P, noun, manually/AI authored | `review-card`/`fail`, video A, -1 day |
| d-corn | D, noun, core=true | `review-card`/`fail`, video A, -10 days |
| d-bread | D, noun, core=true | `review-card`/`fail`, video B, -1 day; `review-card`/`success`, video A, -1 hour |
| d-bank-seat | D, noun, core=true | `review-card`/`fail`, video A, -1 day |
| d-bank-money | D, noun, core=true | none |
| d-run | D, verb, core=true | none |
| d-walk | D, verb, core=false | none |
| p-door | P, same spelling as d-door, distinct identity | none |

Create core collection K from D/core=true and derived KV from K/verb. Initial
KV is exactly `{d-run}`. Manual M is `{d-door,p-furniture,d-run}`. Derived MV
is exactly `{d-run}`. No fixture is a history-based collection.

After setting up actual accepted actions, verify the event projection. Do not
assume a grade can be submitted on an untracked card: use the actual enrollment
and target capability workflow first. Account for any extra enrollment events
by keeping the canonical test predicate explicitly grade-based.

Hand-authored expected *entry pools* for the last seven days:

| Query | Expected IDs |
| --- | --- |
| D+P, forgotten, video A | d-door, p-furniture, d-bank-seat |
| D only, forgotten, video A | d-door, d-bank-seat |
| D+P, any of the four accepted grades, video A | d-door, d-mouse, p-furniture, d-bread, d-bank-seat |
| D+P, forgotten, any video | d-door, p-furniture, d-bread, d-bank-seat |
| D+P, forgotten, video A, no time filter | d-door, p-furniture, d-corn, d-bank-seat |

Add V-only events and Z entries as negative fixtures; neither may contaminate U's
results. Duplicate U events never duplicate entry IDs. These are pool assertions,
not assertions that every entry is due. Seed separate deterministic new/learning/
due/future/Known/hidden states and derive exercise eligibility independently.

## Correctness and fault matrix

Every row requires exact expected/actual IDs or state transitions, not only a
count. Parameterize where meaningful instead of duplicating tests per UI label.

| ID | Scenario and procedure | Required oracle / decision |
| --- | --- | --- |
| COL01 | Add/remove/retry manual membership; same entry twice | Set membership, no content clone or progress mutation; C1 |
| COL02 | Build K, KV, MV; copy KV to manual; add new qualifying entry | Derivatives update; manual copy stays fixed; C1–2 |
| COL03 | Change verb to noun; change core flag; import same manifest twice | Exact expected IDs; idempotent membership; unrelated metadata doesn't change selection |
| COL04 | Attempt manual exception in rule collection, history/time/state rule | Reject unsupported rule; no partial saved mutation; C1/7/22/24 |
| COL05 | Block rebuild before publication; read/paginate/count repeatedly | Old complete revision or new complete revision, never partial mix; C3 |
| COL06 | Fail first build versus fail data refresh versus fail rule refresh | Preparing/error vs usable old result vs blocked new start; C3/5/13 |
| COL07 | Change ancestor rule while child worker is delayed | New starts blocked throughout affected chain; stale job cannot publish readiness; C12 |
| COL08 | Race two rule edits/jobs; crash after computing before publishing | Only correct current revision becomes ready; durable retry; no false ready |
| COL09 | Self-cycle, long cycle, concurrent A→B/B→A edits | Rejected atomically; previous valid rules preserved; C6 |
| COL10 | Delete source with child/preset; detach then delete | Block with dependency evidence; no cascade or learner-state deletion; C11/16 |
| COL11 | Deep chain 1/3/10/25; invalid source; repeated data updates | Supported depths correct; unsupported depth explicit; no endless work |
| COL12 | Submit multiple source references to a rule collection; create mixed manual M | Multi-source rule rejected in v1; manual mixed membership allowed; C19/26 |
| SEL01 | Run small oracle queries above via DB then HTTP | Exact sets; same-event predicate; C8/21/24/26 |
| SEL02 | Same spelling, two senses/dictionaries, repeated events and users | No spelling merge, event multiplication or cross-user leak |
| SEL03 | Add direct verb filter versus use KV at same revision | Equal entry sets; stale-vs-live difference labeled, not false parity; C14 |
| SEL04 | Window boundary at T-168h±epsilon, T±epsilon; DST/time zones | Chosen endpoint policy explicit; 168 elapsed hours; C9 |
| SEL05 | Preview at T, start later, pause/resume tomorrow, new preset launch | New start reevaluates; resumed interval/selection unchanged; C9/15 |
| SEL06 | Forgotten then success; future-due, Known, hidden, new-only/review-only | Historical pool persists; scheduler eligibility respected; C10/22 |
| SEL07 | All-accessible versus explicit D; new accessible dictionary appears | New launch respects selector mode; never silently widens explicit selection |
| SEL08 | Revoke D from D+P after preview; restore; revoke all | P-only with notice, restoration checks, distinct no-access vs no-due outcomes; C28 |
| SEL09 | Direct D/verb training versus K/verb; save and relaunch preset | D yields d-run+d-walk; K yields d-run; no hidden collection created; C18 |
| ACT01 | Same initial target/state/time and grade in Training vs Connected Client | Same canonical learning-state result; actor/provenance differ; C27 |
| ACT02 | Retry after commit/response loss, conflicting retry, two distinct marks | Once-only mutation/event; conflict rejected; distinct marks preserved |
| ACT03 | Fail provenance insert or FSRS mutation | Both rollback; no success-only event or unlogged grade |
| ACT04 | Lookup/reveal/create personal entry without explicit grade | No implied forgotten event or grade; explicit later mark binds entry/video |
| ACT05 | Select bank-seat; inspect reverse/other senses/idiom state | Only authorized exact target affected; no global word counter |
| ACT06 | Grade while first-party session active; stale revision and invalid scope | Enforce actual capability/principal; don't consume unrelated session budget |
| RUN01 | Start N=10/50, edit/delete membership, change rule, update source | Existing session scope retained; new start uses allowed revision; C4/12 |
| RUN02 | Revoke entry after session start; exhaust candidates before N | No inaccessible display; unavailable doesn't spend budget; truthful exhaustion |
| RUN03 | Repeat presentation, retry grade, reveal/hint; replace unavailable | Count accepted actions per ADR 0008; replacement respects retained scope |
| RUN04 | Start/resume retry, concurrent starts and external grade during pause | Existing single-active-run and revision semantics; no duplicate grading |
| UI01 | Real setup/library screens for all refresh matrix states | Correct enabled actions, visible notices, no fake empty result |
| UI02 | Video A scenario across D/P, preset save/new launch/resume | All intended accessible entries selectable; no intermediate collection |
| UI03 | Slow/error/cancel query; change filters while old response pending | Late old response cannot overwrite new selection; no stuck loading |
| UI04 | Partial access notice/counts at narrow and desktop widths | Notice understandable, no protected details, denominator unit explicit |

For RUN02/03, document the agreed replacement/snapshot implementation before
testing; do not resolve the C4/ADR 0008 boundary by silently widening the scope.
For ACT01 compare on isolated identical initial states at a controlled time, not
two sequential grades on the same changed record. Include all supported grades
and card phases; mark unsupported target capabilities as expected rejection.

## Performance workloads

Use synthetic realistic payloads and skew, not just empty raw rows. Scale results
by distinct entries, senses and exercise targets separately.

| Profile | Dataset | Purpose |
| --- | --- | --- |
| F0 | Small oracle above | Exact behavior and failure paths |
| F1 | ~18,000 shared entries, 2,000 core *entries* for synthetic fixture, 1,000 personal; 100k U events | Representative baseline, not a claim about real 2k sense counts |
| F2 | 10 dictionaries / 100k entries; 1m events across 100 users with one heavy user | Access, event-source/time selectivity, noisy neighbors |
| F3 | F2 with 100 derived collections, chain depths 1/3/10/25, wide fan-out | Refresh storms, batch imports and race handling |

Sweep matching ratios 0%, 0.1%, 10%, 100%; video histories 0/1/100/10k events;
repeated marks on few entries; uniform versus skewed dictionaries; 0/half/all
sources denied. Measure new-only, review-only, mixed and near-exhausted queues.

Measure these operations separately:

- first collection build; one-entry update; 1%/10%/full dictionary import refresh;
  changed ancestor rule and chain convergence;
- published membership read/page/count, manual-copy creation;
- time/video/grade selection, setup preview, preset new start, resume;
- grade transaction including provenance, and selection after that grade;
- first usable rendered card and next usable card (split query, transport,
  translation/audio loading and rendering costs rather than blame all on SQL).

Run at concurrency 1, 5, 20 with separate users for valid simultaneous sessions;
single-user concurrent-start tests are authority tests, not ordinary load. Also
run readers and grades during refresh. Limit resource use to the disposable host.

## Measurement protocol and provisional budgets

Collect 5 warmups and at least 100 timed samples per representative warm query
case. Report p50/p95/max; collect >=1,000 samples before claiming stable p99.
For expensive rebuilds collect >=10 samples and report all/min/median/max without
pretending the tail is robust. Repeat degraded cases and preserve failures/timeouts
in the denominator. First-call latency is not proof of a cold OS cache; describe
DB restart/new connection/cache conditions exactly. Never flush shared host caches.

Capture raw JSONL/CSV timings, query counts, rows inspected/returned, lock waits,
CPU/IO, temporary spills and `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` for representative
read plans on disposable data. Diagnostic execution changes timing: keep explains
separate from normal timing samples. Log UI request cancellation and error rates.

Starting investigation budgets below are **engineering proposals**, not accepted
SLOs. Report hardware and F-profile beside each result. Existing access benchmark
uses 2s first / 1s warm p95 / 2s warm max; use it as a comparison, not universal proof.

| Operation on F1 | Initial investigation threshold |
| --- | --- |
| Membership page/count and history selection | DB warm p95 <=500ms |
| Setup preview | HTTP warm p95 <=1s |
| Session start/resume metadata | HTTP warm p95 <=2s |
| Grade + provenance commit | HTTP warm p95 <=1s |
| First usable card with local deterministic content | Browser warm p95 <=3s |
| Single-entry change to ready descendant (depth <=3) | End-to-end <=2s under idle baseline |
| 18k-entry bulk rebuild/convergence | <=30s, with usable old result/status where allowed |

Budget failures demand profiling and an explicit optimization/adaptation report,
not reduced fixture sizes or a hidden threshold increase. Also flag any >20%
repeatable regression against the same-environment baseline and any operation
that lacks a bounded timeout/error path. Give slow SQL a documented timeout
(suggested 10s for interactive reads, 120s for test rebuild jobs), retain timeout
samples, and stop runaway load. No “hung” test may remain waiting indefinitely.

## Results and decision gate

Save an evidence directory in the implementing worktree with:

- `manifest.json`: environment, SHA, seed, clock, migration and exact commands;
- `coverage.md`: scenario ID, C/ADR mapping, actual surface, PASS/FAIL/NOT IMPLEMENTED/
  BLOCKED/DEFERRED, evidence path and reason;
- `oracle.json`: expected/actual entry and target sets plus differences;
- `timings.jsonl`, `summary.csv`, `query-plans/`, redacted UI captures;
- `findings.md`: correctness and latency findings, reproduction, proposed fix,
  owner layer and bounded retest list;
- `decision.md`: recommendation and remaining gaps, separating product approval
  from implementation readiness and performance evidence.

Acceptance requires no unexplained set mismatch, data leak, duplicate mutation,
partial materialization publication or stale-rule launch. Every applicable row
must have real evidence; missing runtime paths prevent full acceptance even if
implemented paths pass. No tests were executed merely by authoring this plan.

If semantics pass but timing misses: optimize indexed event/access selection,
batch invalidation or query shape before proposing narrower product scope.
If correctness cannot be maintained within resource budgets, present the measured
tradeoff and proposed product change for owner review. Finish with one of:
validated within measured envelope / optimization required / product adaptation
required / incomplete evidence. Do not describe the architecture as universally
fast based on one fixture or a mock.
