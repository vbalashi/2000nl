# Selected Training availability: measured local query cost

2026-10-03. Read-only local database measurements; no production learner state changes.

## Scope and reproduction

Run `node ../../docs/qa/575-training-state-design/performance-benchmark.cjs` from `apps/ui`.
The script uses the canonical local Postgres port54322, existing imported dictionary and local learner with most status rows. No credentials/user IDs are written to evidence. Queries are timed through one persistent node-postgres connection; timings include loopback/driver overhead, exclude authentication/API/browser/network/render time. First call is reported separately; it is **not a controlled cold-buffer measurement**. Subsequent20 samples provide median and nearest-rank p95 for stats/aggregate probes; expensive scheduler probes use3 samples and p95 is intentionally not reported.

The dense fixture is **session-local temporary table only**:10,000 existing entries ×2 directions =20,000 synthetic answered states, mixed past/future dates. Temp table creation/population precedes measurements; every measured query runs in `BEGIN READ ONLY`. Session closure deletes temp fixture. No public learner records are inserted or changed.

## Semantics and limits

* Existing `get_detailed_training_stats` reports broader daily activity/counters and repeatedly scopes entries. It does not accept complete Training recipe filters (POS, contextual Translation eligibility, idiom targets). Its counts cannot simply be relabelled as the three new indicators.
* `private.training_scheduler_candidates_v2` measures the **actual ordinary selection path**, including rendering guards, meaning order, lexical filters, source/dictionary access and exclusions. Its query performs ranking/random ordering and other work unnecessary for aggregate counts. It is read-only, but should not become the availability endpoint merely because it is already present.
* Prototype combined aggregate isolates scan/join cost for three counters across50/500/4,031/18,163-entry scopes and sparse/dense state. It does **not** implement access/known/frozen/hidden guards, first-meaning sequencing, Translation examples, idiom identity or local-study-day scheduling contract. It is a cost baseline, not production-ready availability or proven UI numbers.
* Material size is imported dictionary entry/meaning records; counts are direction-specific cards. Distinct words may be fewer.
* No production hardware/concurrency or owner-session network timing measured. Do not present these local milliseconds as production latency guarantees.


## Results

Local Supabase Docker PostgreSQL17.6, aarch64;18,163 entry records,4,031 core-marked records,40,403 V2 content nodes,19 canonical status rows. Sharedbuffers128 MiB, work_mem4 MiB. One benchmark process; connection reused.

| Probe | Repetitions after first | First ms | Median ms | p95 ms |
|---|---:|---:|---:|---:|
| stats-core-direct | 20 | 66.99 | 64.83 | 70.89 |
| stats-core-both | 20 | 66.17 | 65.61 | 69.02 |
| scheduler-core-direct | 3 | 379.50 | 366.31 | — |
| scheduler-all-direct | 3 | 6210.33 | 6214.28 | — |
| scheduler-all-both | 3 | 12343.47 | 12323.27 | — |
| scheduler-nouns | 3 | 2090.01 | 2080.10 | — |
| scheduler-context | 3 | 644.25 | 504.43 | — |
| prototype-count-50 | 20 | 1.66 | 0.81 | 1.06 |
| prototype-count-500 | 20 | 1.41 | 1.32 | 1.39 |
| prototype-count-4031 | 20 | 5.22 | 5.00 | 5.83 |
| prototype-count-18163 | 20 | 21.07 | 19.22 | 19.67 |
| prototype-count-50-dense20 k | 20 | 1.86 | 0.97 | 1.35 |
| prototype-count-500-dense20 k | 20 | 3.53 | 3.33 | 3.74 |
| prototype-count-4031-dense20 k | 20 | 8.42 | 8.01 | 8.49 |
| prototype-count-18163-dense20 k | 20 | 25.32 | 25.26 | 33.90 |

The all material candidate query is **6.21 seconds** fordirect and **12.32 seconds** forboth directions locally; a full planner is not an acceptable availability-count shortcut. Narrow aggregate baseline at18,163 entries/20,000 answeredstates is **25.26 ms median,33.90 ms p95**. Eligibility/auth/idiom/context work is omitted there, so this proves feasibility of aggregate scans, not final endpoint speed.

Dense aggregate output atfull scope:6,000 today /20,000 answeredreview /16,326 unanswered directioncards. Sparse scope output:3 today /4 answeredreview /36,322 unanswered. Due today uses end of local day Europe/Amsterdam, not now; nearest needs review eligibility still belongs to final authoritative projection. Existing stats and candidate outputs remain inrawJSON. Candidate counts are already eligibility-filtered (2,334 core direct;13,868 all direct;13,877 all both;7,531 nouns;9 context).

No100-recipe fanout was implemented or executed. Multiplying the slow planner by100 would be an extrapolation; design avoids it entirely. Real selected recipe endpoint and remote production measurements remain work, explicitly not claimed complete.

## Recommendation

Use one read-only availability projection for selected recipe, sharing authoritative scheduler eligibility semantics but omitting candidate ordering, randomization, per-session latch and grading side effects. Do not run a full planner per saved recipe. Cache by authenticated owner + normalized recipe + learning revision + local study day. Invalidate after accepted grade/Learn/known/exclude, recipe/filter changes, dictionary access/content change, and study-day rollover. Preserve fresh cached values during refresh; cancel/discard stale responses when selection changes. Start still rechecks current authoritative eligibility.

A modest in-memory60 second freshness window is an initial UX choice, **not a measured optimum**.100 saved recipes add zero automatic aggregate calls; selected recipe gets one combined request. Avoid background polling every few seconds. Verify API/request multiplicity and measured production end-to-end latency once endpoint exists.
