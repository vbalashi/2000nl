# Collection/training junior validation runbook

Date: 2026-09-20
Status: Ready for a first evidence pass against the current implementation.
Parent plan: [collection-training-validation.md](./collection-training-validation.md)
Product contract: [collection-training-contract.md](../../intent/search-and-lists/collection-training-contract.md)

## Assignment

Produce evidence for the 35 parent-plan scenarios without inventing missing
product behavior. First characterize the checked-out commit, then run only the
tests marked `RUN_NOW` or the current sub-part of `SPLIT`. For `GAP_ONLY`, prove
the missing schema/API with the inventory queries below and record `NOT_IMPLEMENTED`;
do not write a fake implementation, mock refresh worker, or expected-failing
acceptance test. Performance workloads F1-F3 wait until their required behavior
exists and F0 correctness passes.

The resulting report must let a reviewer answer three different questions:

1. What does the current code actually do?
2. Where does it differ from the owner-approved target contract?
3. For behavior that exists, is the selected set, state transition and latency correct?

## Fixed vocabulary and oracles

Use these exact grade predicates throughout SQL, test names and the report:

| UI meaning | Event predicate | FSRS grade |
| --- | --- | --- |
| Again / forgotten | `action='review-card' AND result='fail'` | 1 |
| Hard | `action='review-card' AND result='hard'` | 2 |
| Good | `action='review-card' AND result='success'` | 3 |
| Easy | `action='review-card' AND result='easy'` | 4 |
| Any answer / graded | `action='review-card' AND result IN ('fail','hard','success','easy')` | 1-4 |
| Positive recall, if needed | `action='review-card' AND result IN ('hard','success','easy')` | 2-4 |

Keep two history predicates separate. The current first-release
“encountered/viewed” condition means that at least one event row exists for the
same user, exact entry/card target, source (when narrowed), and time window;
this deliberately includes a recorded action of any kind. It is not a grade
predicate. The explicit grade predicates above are reserved for the future
“Any answer”/“Again” controls and must use the same row's `action` and
`result`; they must not be approximated by event-row existence.

Target “last X days” means `[session_start - X*24 hours, session_start]` using
the server time captured for the session. The lower and upper endpoints are
inclusive for this validation proposal; an event one microsecond before the
lower endpoint and an event one microsecond after session start are excluded.
Record this proposal separately if implementation work reveals a product-visible
reason to change it.

## Current implementation gate

Before adding tests, confirm the following from the pinned commit. These are the
expected findings as of this document; a mismatch means the repository moved and
the report must cite the new evidence.

| Capability | Expected current state | Primary anchors |
| --- | --- | --- |
| Manual user collections | Available as `user_word_lists` + unique `user_word_list_items` | migration 004, `apps/ui/lib/training/listService.ts` |
| Curated materialized lists | Available as `word_lists` + `word_list_items` | migration 001, ingestion importer |
| VanDale/NT2 2k refresh | Importer rewrites that list from `is_nt2_2000` | `packages/ingestion/src/importer/source_import.py` |
| Generic rule/nested collections | Not implemented | no rule/dependency/revision/build schema or API |
| Presets | Not implemented | no training-preset schema or API |
| Dictionary source selector | Not implemented in Training | selector accepts one list ID/type; null means default NT2 scope |
| Multiple/all-accessible dictionary selector | Not implemented | same selector boundary |
| Training history source filter | Available | migration 086 and Training Setup |
| History grade filter | Not implemented | scheduler match currently omits `action`/`result` |
| Rolling elapsed-hour window | Not implemented | current filter is local calendar `today/yesterday/daysAgo` |
| Finite/latching sessions | Available | migrations 132-153, session tests |
| Access checks in selection/action | Available | scheduler/access RPCs and Platform actions |
| Partial-source notice | Not implemented as the approved multi-dictionary UX | multi-dictionary selector itself is absent |
| Four V2 grades + FSRS/provenance atomicity | Available | migrations 113/121/154, Platform action tests |

### Inventory evidence

Save the output of these read-only checks in `evidence/inventory/`:

```text
git rev-parse HEAD
git status --short
rg -n "CREATE TABLE.*(word_lists|user_word_lists|collection|preset)|rule_revision|materializ" db/migrations apps/ui packages
rg -n "p_list_id|p_list_type|p_training_filter" db/migrations/140_consolidate_training_scheduler_candidates.sql apps/ui/lib/training/selectionService.ts
rg -n "event.action|event.result|dateWindow|daysAgo" db/migrations/086_training_source_filters.sql db/migrations/123_authoritative_training_session_plan.sql db/migrations/142_renderable_ordinary_training_candidates.sql
rg -n "fail|hard|success|easy" packages/shared/types/platformV2.ts db/migrations/113_platform_v2_known_marks.sql
```

The first report row is an inventory gate, not a product test. If generic
collection/preset/multi-dictionary APIs now exist, stop only the affected
`GAP_ONLY` classification, cite the new surface, and design the real test from
the parent contract; do not infer semantics from a table name.

## Deterministic fixture manifest

Create `apps/ui/tests/fsrs/collectionTrainingContract.test.ts` for new DB
characterization/contract tests. Reuse `runMigrations`, `withTransaction`,
`ensureUserWithSettings` and `insertWord` from `dbTestUtils.ts`. Every test rolls
back. Do not seed a shared development database.

Set the transaction-local clock before temporal calls:

```sql
select set_config('training.test_reference_now',
                  '2026-09-20T12:00:00Z', true);
```

Use stable symbolic names in assertions and write their generated UUID mapping
to the test output/report. Seed these common objects:

- users `U`, `V`, `U10`, `U50`;
- readable shared dictionary `D`, U-owned personal dictionary `P`, denied
  dictionary `Z`;
- YouTube sources `video-A` and `video-B` with distinct `learning_sources.id`;
- all positive entries have renderable raw content and Platform presentation
  identity unless a test intentionally makes one invalid;
- same spelling never substitutes for entry identity.

### Small selection corpus

| Entry | Dictionary / properties | Grade events for U |
| --- | --- | --- |
| `d-door` | D, noun, core | `fail`, A, T-24h |
| `d-mouse` | D, noun, core | `hard`, A, T-48h |
| `p-furniture` | P, noun | `fail`, A, T-24h |
| `d-corn` | D, noun, core | `fail`, A, T-240h |
| `d-bread` | D, noun, core | `fail`, B, T-24h; `success`, A, T-1h |
| `d-bank-seat` | D, noun, core | `fail`, A, T-24h |
| `d-bank-money` | D, noun, core | no event |
| `d-run` | D, verb, core | no event |
| `d-walk` | D, verb, non-core | no event |
| `p-door` | P, same spelling as d-door | no event |

Create manual M = `{d-door,p-furniture,d-run}`. Existing-code tests may create
static curated K = all `core` fixture entries, but must not call it a functioning
rule collection. KV/MV are target-only until generic rule collections exist.

Seed one U event duplicated by a distinct user action ID, one matching V-only
event, one `record-view`, one `start-learning`, and one Known action. This proves
deduplication and that non-grade events do not satisfy future grade predicates.

Expected seven-day target sets after the missing grade/rolling filters exist:

| Predicate over D+P | Expected entry IDs |
| --- | --- |
| Again, A | `d-door,p-furniture,d-bank-seat` |
| Any answer, A | `d-door,d-mouse,p-furniture,d-bread,d-bank-seat` |
| Again, any video | `d-door,p-furniture,d-bread,d-bank-seat` |
| Again, A, no time limit | `d-door,p-furniture,d-corn,d-bank-seat` |

### Exact temporal boundary corpus

Use separate entries so deduplication cannot hide a boundary error:

| Entry | Event time | Expected in seven-day window at T |
| --- | --- | --- |
| `boundary-low` | T-168h exactly | yes |
| `boundary-inside` | T-168h+1 microsecond | yes |
| `boundary-before` | T-168h-1 microsecond | no |
| `boundary-high` | T exactly | yes |
| `boundary-future` | T+1 microsecond | no |

Also run T across Europe/Amsterdam's spring and autumn DST changes. The same
elapsed instants must match regardless of local-date labels.

### Session-size corpora

Use isolated users so unrelated fixture rows cannot enter the plan.

- `U10`: exactly 10 eligible renderable targets: 4 new, 3 learning due, 3
  review due. Add three excluded controls: one future review, one active Known
  mark and one hidden card. Starting size 10 must latch exactly the ten eligible
  target keys; size 50 must exhaust truthfully at ten.
- `U50`: exactly 50 eligible renderable targets: 20 new, 15 learning due and
  15 review due. Add ten excluded controls: four future reviews, three active
  Known marks and three hidden cards. Starting size 50 must latch exactly 50
  unique `(entry_id,card_type_id)` members.
- Give every eligible row a stable fixture key (`u50-new-01` …
  `u50-review-15`) and compare the full expected/actual key sets, not only counts.
- For unavailable replacement, add two spare eligible targets outside the
  initial requested set in the same configured list/filter scope. Revoke one member's
  dictionary access and separately corrupt one member's render model. Verify
  replacement, budget and final exhaustion exactly.

## Concrete first-pass tests

The junior agent should implement or run these tests in the order shown. Existing
tests count as evidence only when their exact test name and output are copied to
`coverage.md`; add a focused test when the current suite proves only part of the
assertion.

### DB-01 — Manual membership and identity (`COL01`, `COL12` current parts)

1. Create M through the real user-list RPC/service boundary.
2. Add `d-door`, `p-furniture`, `d-run`; retry `d-door`; remove and re-add it.
3. Assert exact set, one row per `(list_id,word_id)`, dictionary rows unchanged,
   and no `user_card_status`/review-log mutation caused by membership edits.
4. Evidence: before/after row sets and constraints. Expected: PASS.

### DB-02 — Current NT2 materialization (`COL03` current part)

Run the existing ingestion integration path twice over a tiny manifest, then
change one `is_nt2_2000` flag and reimport. Assert exact `word_list_items`, rank,
idempotency and stale membership removal. This proves only the bespoke NT2
importer behavior, not generic rule refresh. Expected: PASS or implementation bug.

### DB-03 — Exact entry/user/event identity (`SEL02`)

Seed `d-door` and `p-door`, repeated U grade events, and a V-only event. Query
distinct matching `(entry_id,card_type_id)` for U. Assert no spelling merge,
no duplicate entry, and no V leakage. Run through DB and the current HTTP/read
surface where available. Expected: PASS.

### DB-04 — Grade predicate characterization (`SEL01`, `SEL06` split)

Run two independent queries:

1. the approved oracle query with explicit `action='review-card'` and `result`;
2. the current scheduler/history filter RPC over the same fixtures.

Save both exact sets and their diff. The approved query must produce the sets
above. As of the pinned code, the RPC is expected to overmatch `record-view`,
`start-learning`, Known and non-fail grades because its `matched` relation does
not filter action/result. Record the scenario `NOT_IMPLEMENTED`, not PASS and
not a test-harness failure.

### DB-05 — Time-window characterization (`SEL04`, `SEL05` split)

Run the approved 168-hour oracle over the five boundary entries and compare it
with current `dateWindow` behavior. Current `daysAgo` selects one local calendar
date, not a rolling range; save the mismatch and mark rolling windows
`NOT_IMPLEMENTED`. Separately verify that a started session stores its
`training_filter`, selected members and `planned_at` unchanged after advancing
the test clock and resuming. That latching sub-contract can PASS.

### DB-06 — Historical fail plus later success (`SEL06` current part)

For `d-bread`, prove the approved event-existence query still finds its earlier
`fail` after later `success`. Then set the card future-due and prove the finite
normal session does not pull it forward. Record the grade-filter integration as
the DB-04 gap until the real filter accepts a result predicate.

### DB-07 — Four canonical grades (`ACT01`)

From four isolated identical initial states, submit V2 `review-card` with
`fail`, `hard`, `success`, `easy` and controlled T. Assert `fsrs_last_grade`
1/2/3/4, canonical `last_result`, one provenance event with the same result,
and expected state-revision change. Repeat equivalent first-party Training and
Connected Client calls on separate initial states; learning output must match
while actor/provenance differ. Never grade one state sequentially for parity.

### DB-08 — Idempotency and atomicity (`ACT02`, `ACT03`)

Reuse the existing action receipt/RPC tests and add fixture-specific assertions:
identical `clientEventId` is duplicate with one mutation/event; changed payload
is conflict; two real client IDs create two events. Force provenance and FSRS
failure in separate transactions and assert both sides roll back. Expected: PASS.

### DB-09 — Read-only versus explicit answer (`ACT04`)

Perform lookup/reveal/generated personal-entry creation and assert no
`review-card` grade event and no FSRS review mutation. Then submit an explicit
video-sourced grade for that exact entry and assert one atomic state/event change.
Expected: PASS for mutation boundary; encounter-only product semantics remain
separate.

### DB-10 — Exact target and session authority (`ACT05`, `ACT06`)

Grade `d-bank-seat` in one direction and assert no state/event change for
`d-bank-money`, another dictionary copy, reverse direction or content-bound
target. During an active first-party session, submit a non-session Connected
Client grade and prove it does not consume the session action budget. Exercise
stale state revision, invalid principal and non-member session target. Expected: PASS.

### DB-11 — Session sizes and latching (`RUN01`, `RUN04` current parts)

Use U10/U50. Assert complete target-key sets for size 10 and 50, no excluded
control, stable members after user-list edits, idempotent start request, one
active run, superseded old run, and stable resume snapshot. Rule-change portions
remain `NOT_IMPLEMENTED`.

### DB-12 — Permanent unavailable members (`RUN02`, `RUN03`)

Test each practically constructible server-supported reason with authoritative
evidence: `dictionary-access-revoked`, `projection-missing`, `model-invalid`,
`direct-example-missing`, and `reverse-definition-missing`. The code also accepts
the defensive reason `entry-not-found`, but the session-member foreign key uses
`ON DELETE RESTRICT`; prove that constraint and do not disable it merely to
manufacture a runtime case.
An arbitrary reason against a renderable member must be rejected. A transient
read/network error must be retried and must not set `unavailable_at`. Removal
from the source list alone must not retire a latched member. Verify replacement
does not spend accepted-action budget and reports truthful completion/exhaustion.

Run one explicit latching check after adding a new qualifying entry to the
list after session start. The active session queue is a snapshot: the new
entry must not appear in its members or as a replacement. If an already
latched member becomes permanently unavailable, a replacement may only come
from members already reserved by that session; otherwise the session ends or
exhausts truthfully. If the current implementation admits the newly added
entry, report this as `FAIL` against the accepted latching contract, not as a
new product choice.

### DB-13 — Access reduction in an existing list (`SEL08` current part)

Create a manual list spanning D and P, start/plan with both readable, revoke D,
and assert current selection/action cannot expose D while P remains usable.
Restore D and recheck. This proves access enforcement but not the target
multi-dictionary selector or partial-access notice; those stay `NOT_IMPLEMENTED`.

### UI-01 — Existing Training filter controls (`SEL01`, `UI02` current parts)

Run component tests for source/date controls and one local browser smoke against
the real local backend. Capture the submitted payload. It should show one list
scope and current calendar/source fields. Record absence of grade selector,
rolling-X-days range, multi-dictionary source and preset save as gaps. Do not
accept a mock-only screenshot as DB selection evidence.

### UI-02 — Loading/race/access messages (`UI03`, `UI04` split)

Exercise the current setup request cancellation/stale-response behavior if a
real surface exists. Record exact handling of slow/error/cancel. For partial
dictionary access, the target notice cannot be accepted until the selector
exists; current generic errors or silent omissions are evidence of the gap,
not substitutes for the required copy/counts.

## Disposition of all 35 parent scenarios

`SPLIT` means run the named current tests and report the remaining target portion
separately. `GAP_ONLY` means inventory evidence only in this pass.

| Parent ID | First-pass disposition | Concrete evidence |
| --- | --- | --- |
| COL01 | RUN_NOW | DB-01 |
| COL02 | GAP_ONLY | no rule/derived/manual-copy API |
| COL03 | SPLIT | DB-02 for NT2 importer; generic lexical refresh gap |
| COL04 | GAP_ONLY | no rule editor/validator |
| COL05 | GAP_ONLY | no generic build revision/publication model |
| COL06 | GAP_ONLY | no generic build failure states |
| COL07 | GAP_ONLY | no dependency refresh worker |
| COL08 | GAP_ONLY | no rule revision/job publication schema |
| COL09 | GAP_ONLY | no dependency graph/cycle API |
| COL10 | GAP_ONLY | no collection/preset dependency model |
| COL11 | GAP_ONLY | no generic nesting implementation |
| COL12 | SPLIT | DB-01 mixed manual membership; rule multi-source rejection absent |
| SEL01 | SPLIT | DB-03/04 and UI-01; grade/multi-dictionary gaps |
| SEL02 | RUN_NOW | DB-03 |
| SEL03 | GAP_ONLY | no collection lexical-rule/direct Training POS filter |
| SEL04 | SPLIT | DB-05 current calendar characterization; rolling window gap |
| SEL05 | SPLIT | DB-05 session latching; preset/new rolling launch gaps |
| SEL06 | SPLIT | DB-06 scheduler/state separation; grade filter gap |
| SEL07 | GAP_ONLY | no all-accessible/explicit dictionary selector |
| SEL08 | SPLIT | DB-13 access enforcement; selector + notice gap |
| SEL09 | GAP_ONLY | no direct dictionary lexical filter or preset |
| ACT01 | RUN_NOW | DB-07 |
| ACT02 | RUN_NOW | DB-08 |
| ACT03 | RUN_NOW | DB-08 |
| ACT04 | RUN_NOW | DB-09 |
| ACT05 | RUN_NOW | DB-10 |
| ACT06 | RUN_NOW | DB-10 |
| RUN01 | SPLIT | DB-11 manual-list latch; rule revision gap |
| RUN02 | RUN_NOW | DB-12 |
| RUN03 | RUN_NOW | DB-12 |
| RUN04 | RUN_NOW | DB-10/11 |
| UI01 | GAP_ONLY | no rule collection state UI |
| UI02 | SPLIT | UI-01 current source/date flow; multi-dict/preset gap |
| UI03 | SPLIT | UI-02 only for existing requests |
| UI04 | GAP_ONLY | approved partial-access UX depends on absent selector |

## Commands and execution order

1. Pin inventory and write `manifest.json`.
2. Start/reuse the guarded local Supabase stack; never target production.
3. Run the full existing DB suite before adding characterization tests:
   `scripts/db-local-supabase.sh test-fsrs`.
4. Add the focused test file and rerun the guarded suite. The harness currently
   owns disposable DB creation; do not bypass its loopback/database-name guards.
5. For DB-02, bootstrap ingestion dependencies and run
   `scripts/db-local-supabase.sh test-ingestion`.
6. Run focused UI unit tests from `apps/ui` for `TrainingTodaySetup.test.tsx`,
   `TrainingScreen.test.tsx`, Platform action routes and learning routes.
7. Use the `nl-local-ui-qa` skill/runbook for UI smoke on canonical port 3100.
8. Only after F0 correctness, run F1 timing on the applicable existing paths.
   Do not run F2/F3 rule-collection workloads while the engine is absent.

If a test requires modifying product code to make it runnable, stop that test
and report the missing surface. Test helpers/fixtures and evidence collection
are allowed; production feature implementation is a separate issue/worktree.

## Required evidence layout

Create this under the junior agent's worktree/report directory:

```text
evidence/collection-training-2026-09-20/
  manifest.json
  coverage.md
  oracle.json
  findings.md
  decision.md
  commands/
  db/
  http/
  ui/
  timings/
  query-plans/
```

Each `coverage.md` row must contain:

```text
scenario_id | status | commit | test_name_or_inventory_query |
expected_exact_set_or_state | actual_exact_set_or_state |
evidence_path | gap_or_failure_reason | owner_layer | retest
```

Allowed statuses are `PASS`, `FAIL`, `NOT_IMPLEMENTED`, `BLOCKED`, `DEFERRED`.
Use `FAIL` only when an implemented applicable contract behaves incorrectly.
Use `NOT_IMPLEMENTED` when the required schema/API/UI does not exist. Never turn
that into PASS because an inventory query found nothing.

For every set assertion, store sorted symbolic IDs and UUIDs plus added/missing
diffs. For every grade, store before/after state, event row and receipt. For every
timing, store raw samples and environment metadata. Redact tokens and private
content. Finish with one bounded retest list, grouped by product gap versus bug.
