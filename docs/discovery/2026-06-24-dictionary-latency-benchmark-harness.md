# Dictionary Latency Benchmark Harness

Date: 2026-06-24

Issue: [#40](https://github.com/vbalashi/2000nl/issues/40)

## Goal

Add repeatable latency attribution before making another search-query,
PostgREST, proxy, or cache change.

The benchmark separates:

- direct SQL RPC/group execution;
- 2000NL Platform HTTP catalog lookup/search;
- AudioFilms proxy lookup/search.

It records JSONL rows and an aggregate JSON summary with p50/p95/p99/max.

## Tooling

Script:

```bash
node db/scripts/dictionary_latency_benchmark.mjs
```

Documented in:

```text
db/scripts/README.md
```

For this environment the live HTTPS runs used `--insecure-tls` because Node's
TLS verifier rejects the current certificate chain. The benchmark does not print
tokens. The 2000NL catalog token was supplied through
`PLATFORM_CATALOG_ACCESS_TOKEN`.

## Smoke Check

Command shape:

```bash
node db/scripts/dictionary_latency_benchmark.mjs \
  --queries ontdekken \
  --samples 1 \
  --hot-samples 1 \
  --layers sql,http-2000nl,audiofilms \
  --insecure-tls \
  --output tmp/dictionary-latency-smoke.jsonl \
  --summary-output tmp/dictionary-latency-smoke-summary.json
```

Result: 18 JSONL rows for 3 layers across lookup, full search, and 4
group-specific search calls. Rows included request IDs, TTFB, result shape,
counts, and `Server-Timing` for 2000NL HTTP responses.

## Initial Baseline

Focused query set: `de`, `het`

Paths: full grouped search plus group-specific `headwords`, `examples`,
`definitions`, and `alphabetical`.

### Direct SQL, 100 Samples

Warm rows exclude the first sample for each combination.

| query | group | warm n | p50 ms | p95 ms | p99 ms | max ms |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| de | full | 99 | 89.1 | 93.9 | 98.1 | 101.9 |
| de | headwords | 99 | 36.3 | 40.0 | 41.1 | 42.4 |
| de | examples | 99 | 62.3 | 66.5 | 69.3 | 69.7 |
| de | definitions | 99 | 59.4 | 63.0 | 65.2 | 68.8 |
| de | alphabetical | 99 | 37.6 | 41.1 | 42.7 | 42.8 |
| het | full | 99 | 96.0 | 100.0 | 116.2 | 117.4 |
| het | headwords | 99 | 36.3 | 42.3 | 44.8 | 69.2 |
| het | examples | 99 | 65.1 | 69.2 | 72.2 | 80.4 |
| het | definitions | 99 | 63.7 | 68.4 | 71.5 | 78.3 |
| het | alphabetical | 99 | 37.7 | 41.1 | 42.1 | 42.1 |

Only one SQL row exceeded 300ms: first-after-idle `de/definitions` at 586.7ms.
No warm SQL row exceeded 300ms.

Initial read: warm direct SQL does not reproduce the 2s-class outlier. The
common-term body-group materialization risk remains plausible for cold buffers,
but this run did not confirm it as the warm-path root cause.

### 2000NL HTTP, 100 Samples

Warm rows exclude the first sample for each combination.

| query | group | warm n | total p50 ms | total p95 ms | total p99 ms | total max ms | search.db p99 ms | search.db max ms |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| de | full | 99 | 162.7 | 557.5 | 1077.2 | 1333.7 | 1020.1 | 1279.4 |
| de | headwords | 99 | 105.9 | 196.1 | 401.1 | 784.1 | 341.3 | 735.4 |
| de | examples | 99 | 131.3 | 248.3 | 653.9 | 698.6 | 599.9 | 626.0 |
| de | definitions | 99 | 128.3 | 239.5 | 671.1 | 1109.2 | 564.4 | 1052.0 |
| de | alphabetical | 99 | 106.4 | 161.7 | 433.0 | 1000.5 | 369.1 | 946.1 |
| het | full | 99 | 169.7 | 444.9 | 613.2 | 966.4 | 557.1 | 890.6 |
| het | headwords | 99 | 105.5 | 149.7 | 476.2 | 682.3 | 424.0 | 625.1 |
| het | examples | 99 | 136.2 | 274.6 | 559.4 | 644.9 | 500.9 | 592.8 |
| het | definitions | 99 | 131.8 | 264.9 | 430.3 | 793.2 | 377.7 | 742.1 |
| het | alphabetical | 99 | 105.7 | 322.7 | 433.7 | 481.1 | 382.2 | 427.1 |

No HTTP 2000NL row exceeded 1.5s. The largest row was `de/full` at 1333.7ms
with `search.db=1279.4ms`.

Several high rows clustered around the same sample range across different
groups, including headwords and alphabetical. Since direct SQL warm timings were
stable and group-agnostic HTTP spikes appeared, the first attribution target is
the 2000NL HTTP/RPC boundary measured by `search.db`, not one body-group SQL
shape alone.

Important caveat: `search.db` currently times the full `supabase.rpc(...)` wall
time from the Next route. It includes app-to-PostgREST, network, pooler, and SQL
execution.

### AudioFilms Proxy, 100 Samples

Warm rows exclude the first sample for each combination.

| query | group | warm n | p50 ms | p95 ms | p99 ms | max ms |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| de | full | 99 | 195.9 | 218.0 | 397.9 | 406.8 |
| de | headwords | 99 | 141.4 | 159.8 | 181.7 | 241.1 |
| de | examples | 99 | 170.1 | 182.4 | 191.6 | 221.2 |
| de | definitions | 99 | 165.4 | 189.1 | 205.7 | 223.3 |
| de | alphabetical | 99 | 144.8 | 165.0 | 198.7 | 200.5 |
| het | full | 99 | 202.6 | 229.0 | 406.7 | 416.2 |
| het | headwords | 99 | 141.2 | 160.5 | 183.2 | 204.5 |
| het | examples | 99 | 170.3 | 191.9 | 198.5 | 328.9 |
| het | definitions | 99 | 169.8 | 189.0 | 240.0 | 248.6 |
| het | alphabetical | 99 | 143.2 | 203.1 | 246.8 | 343.9 |

No AudioFilms row exceeded 1.5s. The largest warm row was `het/full` at 416.2ms.

Initial read: this run does not implicate AudioFilms proxy latency as the
primary outlier source. The proxy currently does not propagate upstream
`Server-Timing`, so this is still an end-to-end observation rather than a full
upstream/proxy split.

## Current Attribution

The first repeatable measurements point to this branch of the decision tree:

1. Warm direct SQL is stable for `de` and `het`.
2. 2000NL HTTP `search.db` has high p95/p99/max relative to direct SQL and can
   spike across unrelated groups.
3. AudioFilms proxy did not reproduce a worse 2s-class outlier in the 100-sample
   run.

Therefore the next diagnostic target should be the 2000NL HTTP/RPC boundary:

- route total vs Supabase RPC wall time;
- PostgREST/pooler/network contribution;
- module-level service client reuse / keep-alive behavior;
- whether direct pooled PostgreSQL for the server-only catalog path reduces
  p95/p99.

Do not use public response caching as the first fix. It would hide repeat
requests without explaining the first-request and p99 boundary spikes.

## Next Checks

- Add 2000NL route-level structured latency logs with correlation/request IDs.
- Split `search.db` into narrower spans if possible, or compare a server-only
  direct pooled PostgreSQL path against `supabase.rpc(...)`.
- Add AudioFilms `Server-Timing` propagation in a separate AudioFilms slice if
  extension-visible latency remains after the 2000NL boundary is stable.
