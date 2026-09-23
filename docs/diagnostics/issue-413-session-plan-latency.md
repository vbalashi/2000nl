# Issue 413: session-plan latency investigation

Date: 2026-09-22. Base commit: `93a9530f5839d7ce63dc8262ec1b889b091772fa`.
Status: diagnosis and regression coverage; **the production timeout is not fixed**.

## Confirmed current failure

- Historical deployment [35531469093](https://github.com/vbalashi/2000nl/actions/runs/35531469093)
  at `eeb0e2b50298eda76611ec89c6068d249c0e5a78`, contract 155, timed out
  in the six-argument `get_training_session_plan`, inside
  `private.training_scheduler_candidates_v2`.
- Latest deployment [35777536937, attempt 1](https://github.com/vbalashi/2000nl/actions/runs/35777536937/attempts/1)
  applied contract 156 and failed at the same 2,000 ms read. Attempt 2 passed
  unchanged. Therefore the successful latest deployment is not evidence of a fix.
- Contract 156 retains the same six-argument probe, delegated through earlier
  probe files. The new finite-session overload does not replace that read.
- The existing JIT-off mitigation from #361/#371 is already active. Reapplying
  it would not solve this occurrence.

## Bounded read-only measurements

Used the existing diagnostic directly, with the dedicated QA identity, three
samples per component, JIT off, and a 3,000 ms *diagnostic* timeout. The release
probe remains at 2,000 ms. No production data, configuration, deployment, or
shared checkout was changed. Results contain no learner content.

```sh
node db/scripts/scheduler_readiness_diagnostic.mjs \
  --env-file /path/to/private.env --samples 3 --statement-timeout-ms 3000
```

| Sample batch | First public plan | Following public calls | Shared reads | Temp read/write blocks |
| --- | ---: | ---: | ---: | ---: |
| 1 | 2,317.099 ms | 177.629 / 176.460 ms | 0 | 280 / 564 |
| 2 | 1,934.567 ms | 253.395 / 193.667 ms | 0 | 280 / 564 |

Candidate/aggregate/next-card calls were mostly 149–243 ms; one filtered-call
outlier was 1,126.949 ms. First-batch public buffer hits were 8,450, followed
by about 5,341. Another first-call outlier had 5,421 hits. These counters do not
show the missing time being proportional to extra heap reads.

The endpoint uses a transaction pooler (port 6543). Two fresh client connections
returned the same backend PID and backend start time. **A fresh psql process
must not be described as a cold PostgreSQL backend.** The diagnostic now records
backend identity, server version, work memory, JIT, and separate outer planning
metrics so subsequent evidence can distinguish backend reuse. Top-level EXPLAIN
planning time does not reveal all nested PL/pgSQL/SQL-function compilation.

Production shape, observed only through aggregate counters: 18,224 entries,
4,031 NT2 entries, 18,203 source bindings / 14,489 groups, 16,985 active
root/type definition nodes, 14,782 example nodes, and roughly 9,000 other
active content nodes. The QA identity has 26 status rows and one review;
all users combined have 2,985 status rows and 3,380 reviews. PostgreSQL 17.6;
work memory 2,184 kB. A bounded activity snapshot observed one active connection
and no active waits; that snapshot is not proof of contention-free execution
at the earlier outlier.

A same-transaction two-call experiment measured 622.817 / 199.489 ms. A separate
transaction-local 16 MB work-memory experiment removed all temporary spilling,
but still measured 1,027.006 / 186.965 ms. This rules out spilling as a sufficient
explanation; it does not prove memory is irrelevant or justify a global change.

## Production deployment-probe recheck (2026-09-23)

Replayed the current contract-156 read-only pre-switch SQL through the production
transaction pooler: `DISCARD PLANS`, `BEGIN READ ONLY`, the existing 2,000 ms
statement timeout, JIT off, and the committed `pre-switch-read-probe-156.sql`
include chain. All six bounded client runs completed without a statement timeout.
The detailed second batch used the same physical backend PID/start time across
its three runs; its session-plan DO block took 213.011, 219.507, and 218.535 ms.
The adjacent next-card block took 213.782, 219.763, and 219.495 ms; the cached
client scheduler block took 365.844, 374.972, and 367.351 ms. This confirms that
the exact gate is currently fast on the backend and conditions sampled. It does
not reproduce a new backend under a controlled cold-start condition.

The current UI sends the eight-argument `get_training_session_plan` overload
(including `p_session_size='10'` and `p_new_review_ratio=2`). A separate direct
`PERFORM` through the same production pooler, bounded at 3,000 ms and run with
the dedicated QA identity, measured 1,948.890 ms on the first call and 216.995 /
215.490 ms on the next two calls. The three transactions reported the same
backend PID and start time. The first measured call was therefore a real
current-path near-two-second observation on a backend whose recorded start time
was 2026-09-23 09:35:23 UTC, followed by fast calls on that backend. The test
discarded the returned plan and exposed no learner content. The diagnostic used
a 3,000 ms bound to observe latency rather than
abort at 2,000 ms; the first sample was still just under the deploy threshold.
Because the transaction pooler may route a standalone `DISCARD PLANS` statement
to a different backend than the following transaction, this does not prove that
the plan cache was explicitly invalidated on the measured backend.

A read-only `pg_stat_statements` snapshot had last reset at
2026-05-16 15:55:11 UTC. It showed the pre-switch session-plan DO block at a
maximum of 1,916.2 ms over 68 calls, while normalized PostgREST session-plan
calls had historical maxima of 6,477.7 ms (45 calls, six-argument signature)
and 7,350.9 ms (69 calls, seven-argument signature). The current UI calls the
eight-argument overload; these six/seven-argument API entries are legacy
signatures and may reflect older app versions or other callers. The counters
span several months and database contracts, and do not identify the call
timestamp, caller, or parameter values. They are context, not proof that the
current UI path or deploy probe exceeded its bound. The separate diagnostic
EXPLAIN wrapper's 2,115.683 ms first sample is also not the exact deploy probe.

No learner/business data or database configuration was changed. Do not reset
production statistics or tune server settings to investigate further.

## Production readiness diagnostic rerun (2026-09-23)

The existing GitHub Actions workflow was run against the current `main` commit
`583af8e79` with three samples per component. It used the self-hosted production
runner and the dedicated QA identity, with the same bounded read-only transaction,
JIT off, and no writes. All samples used PostgreSQL 17.6 and reported the same
physical backend (`backendPid=2205899`, started at `2026-09-23 11:29:50 UTC`),
so this is a warm-backend comparison rather than a cold-backend experiment.

| Component | First sample | Following samples | Planning | Shared reads | Temp read/write |
| --- | ---: | ---: | ---: | ---: | ---: |
| public six-argument plan | 2,648.276 ms | 181.321 / 179.166 ms | 0.110–0.114 ms | 0 | 280 / 564 |
| next card | 186.833 ms | 196.435 / 182.321 ms | 0.114–0.126 ms | 0 | 280 / 564 |
| filtered card | 148.098 ms | 139.960 / 153.946 ms | 0.116–0.126 ms | 0 | 280 / 564 |
| aggregate / candidate | 176.840 / 176.361 ms | 176.909 / 176.637 and 177.440 / 177.314 ms | 0.127–0.156 ms | 0 | 280 / 564 |

This rerun reproduces the important shape: one slow first public-plan call,
followed by stable sub-200 ms calls on the same backend. The outer PostgreSQL
planner is not spending the missing seconds; the persistent query path is fast
once the backend has completed its first execution. Temporary blocks remain
present in every call, so they are a characteristic of this path rather than a
new first-call-only event. The run therefore strengthens the cold-backend,
pooler, or runtime-initialization hypothesis but does not distinguish which of
those layers owns the delay.

Workflow run: [35854847126](https://github.com/vbalashi/2000nl/actions/runs/35854847126).
The run produced no learner-content output and changed no production state.

## Repeatable local feedback loop

```sh
SESSION_PLAN_BENCHMARK_BASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres \
  node --test db/scripts/session_plan_latency.integration.test.mjs
```

The loop creates and drops its own uniquely named database. It uses current
bootstrap, 18,184 wide entries / 4,031 NT2 entries, one source binding and two
root nodes per entry, distributed dirty source/projection pages, mixed learner
queues, and the observed 2,184 kB memory limit. It checks nonempty expected
queues, samples the actual public RPC on separate direct local connections,
then runs the exact current manifest probe on another connection without a
preceding warm-up call. The production JIT setting, `DISCARD PLANS`, read-only
transaction, and 2,000 ms bound are retained.

Fixture content is synthetic: every entry has its own source group and both a
definition and example. It does not reproduce production sibling distribution,
all content types, runtime resource limits, transaction pooling, or physical
cache eviction. Root nodes are bulk-loaded with session-local trigger bypass
only inside the disposable fixture; all entries have both nodes, so the
exception-only unrenderable projection correctly remains empty. Runtime reads
use normal trigger settings. This is not an importer regression test (#397).

Measured current-plan calls are about 85–110 ms and 5,270 shared blocks, with
166 temporary blocks written. A 6,500-block bound allows catalog/plan variation
while catching a return to wide/per-candidate scanning. It is a separate
current-contract fixture budget; the historical v1 test's 4,000-block budget is
unchanged. The harness also injects a 2.1-second delay into the disposable RPC
and verifies the 2-second timeout is detected. This proves the feedback loop
can fail on the symptom; it does **not** reproduce the production cause.

## What remains and next experiment

No scheduler migration is justified yet. Current evidence ranks backend/runtime
initialization or transient resource scheduling above persistent query-volume
regression; contention and nested planning have not been separated.

Next, use an isolated PostgreSQL 17.6 environment with the production instance's
CPU/memory/storage limits and representative anonymized content multiplicities.
Run both the exact six-argument manifest probe and the current eight-argument UI
RPC as the first call on each genuinely new direct backend (record PID/start),
compare with two calls in that backend, and repeat through a transaction pooler
while collecting host CPU scheduling/I/O/wait telemetry. Enable nested statement
planning/execution timing only in that isolated environment. Reproduce the
near-two-second first-call behavior before changing SQL or runtime settings;
compare one variable at a time. Restart/evict caches only on the isolated
instance, never on the shared QA or production database.

If the isolated instance cannot reproduce it, the next missing evidence is
synchronized read-only production host/pooler telemetry during an ordinary
failed readiness run. Query counters alone cannot attribute time lost to CPU
scheduling or host storage. Do not increase the release timeout, add warm-up
retries, or treat the issue as completed on the strength of passing local tests.
