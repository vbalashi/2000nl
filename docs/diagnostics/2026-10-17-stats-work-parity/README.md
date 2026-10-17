# #737: discarded ordinary-statistics SQL work

2026-10-17; reference e4d82d00; disposable database only, existing local PostgreSQL
17/Supabase Docker server, no production contact. Decision:
[discussion](../../discussions/2026-10-17-11-stats-work-parity.md).

## Evidence before implementation

The unmodified migration130 legacy helper performs five daily aggregate statements
whose eight JSON values are overwritten by effective local daily statistics.
Migration230 preserves the three settings/totals statements verbatim in a private
helper and substitutes only the base call in migration147's wrapper. The helper
and wrapper bodies in the exploratory candidate are exactly those shipped in230;
only migration transaction framing, ACL and explanatory comments were added.
No local helper, scheduler, dictionary access helper or grants were rewritten.

The pre230 public RPC passed six characterization tests before230 existed:
125 combinations (five clocks × five modes × five list arguments), plus default
argument, absent-setting and owner cases. Oracle SQL is an independent copy of
130/147, not extracted from the candidate. After230 the same oracle compares exact
11-key JSON with both real public overloads. Additional tests cover real curated
membership, foreign user lists, English entries in Dutch scope, denied/entitled/
unpublished dictionary, Known and paired/exact-entry exclusions, sibling spelling,
frozen/hidden state, zero/default limits and catalog ACL. The effective local helper
is clock-injected transactionally for UTC04, Kiritimati04 and23/25-hour DST cases;
its old/new implementation is deliberately unchanged. Explicit expected metrics
protect the local semantics in addition to parity. Failed exploratory assertion
showed meaning-pair exclusion covers both recall directions; the test was corrected
to preserve that existing behavior (no product change).

## Local work measurement

[Raw pgss snapshot deltas](exploratory-pgss.jsonl). Each row covers **20 calls total**,
after three warmups, one old→candidate trial, session pg_stat_statements.track=all.
500 scoped entries with500 active statuses and30,000 historical reviews is synthetic.
The empty case has no scoped entries/history. All fixture writes rolled back.
No reset of shared pgss or canonical database was performed.

| Fixture | Old cumulative wall ms | Candidate cumulative wall ms | Nested calls old→candidate | Nested shared-hit sum old→candidate |
|---|---:|---:|---:|---:|
| empty |31.93|23.17|880→780|1132→1040|
|500 entries/30k reviews|1299.33|1209.63|108880→70780|573228→383838|

Exactly five direct discarded aggregate executions per call disappear (100 for20
calls). Wide-case nested reduction additionally contains their nested access checks.
The nested shared-hit sums overlap across parent/child statements: **not unique
buffers, physical IO, or overall server savings**. Shared reads were zero. Timing is
illustrative: fixed execution order, one sample, shared local server, warm cache,
and unchanged local aggregate variance mean these numbers are not a reliable speedup
estimate. Work elimination is measured; production/user latency remains unmeasured.

Reproduction after migration bootstrap, from repo root with an owned disposable
`2000nl_fsrs_*` DB and pg_stat_statements installed in that DB:

```
FSRS_TEST_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/2000nl_fsrs_stats737 node db/scripts/measure-training-stats-work.cjs
cd apps/ui
FSRS_TEST_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/2000nl_fsrs_stats737 npm test -- tests/fsrs/trainingStatsParity.test.ts tests/fsrs/trainingStudyDay.test.ts
```

The durable measurement script uses the frozen oracle and actual installed230
rather than the temporary exploratory candidate. Do not run against a shared,
canonical, or production DB. Production measurement needs the separate approved
latency runbook workflow.

## Rollout hold

230 follows Connect's reserved229. This branch intentionally leaves manifest and
app contract at228. The read-only230 chain references229's postflight, absent on
this branch until integration. Standalone totals probe can run against owned DB;
full chain and deployment require curator integration, reviewed SHA256 and exact
contract advance. Never bypass that dependency. Rollback keeps forward230; an app
rollback remains compatible with both unchanged public signatures.

## Validation of executable migration230

- Original pre230 characterization:6 tests passed (before migration file existed).
- Actual230 plus study-day suite:15 tests passed; exact JSON against independent
  baseline across both overloads.
- Complete FSRS suite:43 files,385 tests passed in owned disposable database.
- UI `trainingService.stats.test.ts`:2 tests passed, unchanged consumer contract.
- Typecheck passed. Lint passed with the existing unrelated missing
  `handlePlayAudio` dependency warning in `TrainingSenseCardV2Session.tsx:661`.
- Standalone `training-stats-totals-probe.sql` passed; complete230 postflight is
  intentionally held on229 integration. Measurement script syntax checked.
- No full UI suite: DB-only runtime change; curator accepted full FSRS plus narrow
  UI consumer/typecheck/lint. No browser, production timing, provider calls or
  state/scheduling mutation beyond synthetic disposable fixtures.

Owned disposable DB removed after validation; source/evidence retained here.
