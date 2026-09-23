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
Run the same exact manifest probe as the first call on each genuinely new direct
backend (record PID/start), compare with two calls in that backend, and repeat
through a transaction pooler while collecting host CPU scheduling/I/O/wait
telemetry. Enable nested statement planning/execution timing only in that
isolated environment. Reproduce a >2-second first call before changing SQL or
runtime settings; compare one variable at a time. Restart/evict caches only on
the isolated instance, never on the shared QA or production database.

If the isolated instance cannot reproduce it, the next missing evidence is
synchronized read-only production host/pooler telemetry during an ordinary
failed readiness run. Query counters alone cannot attribute time lost to CPU
scheduling or host storage. Do not increase the release timeout, add warm-up
retries, or treat the issue as completed on the strength of passing local tests.
