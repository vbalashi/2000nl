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

## Route Timing Follow-Up

PR #42 added route-level `Server-Timing` spans and `X-Request-Id`:

- `route.auth`
- `route.parse`
- `route.operation`
- `route.total`
- existing operation spans such as `search.db` and `lookup.db`

Production smoke after deploy:

```text
query=de group=examples total=3089.3ms
route.auth=9.2ms route.parse=9.9ms route.operation=3067.4ms
route.total=3089.3ms search.db=3066.4ms
```

This captured a 3s-class outlier directly after instrumentation. The outlier
was almost entirely inside `route.operation/search.db`, not request parsing,
catalog-token auth, response construction, or generic route overhead.

Focused 50-sample 2000NL HTTP run after route instrumentation:

| query | group | warm n | total p95 ms | total p99 ms | total max ms | route.operation max ms | search.db max ms |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| de | full | 49 | 200.4 | 255.7 | 299.2 | 226.5 | 226.5 |
| de | headwords | 49 | 121.7 | 146.8 | 163.9 | 111.9 | 111.9 |
| de | examples | 49 | 170.1 | 202.9 | 203.3 | 153.2 | 153.2 |
| de | definitions | 49 | 175.6 | 204.1 | 211.6 | 157.1 | 157.0 |
| de | alphabetical | 49 | 147.6 | 173.6 | 179.4 | 123.1 | 123.1 |
| het | full | 49 | 208.7 | 297.8 | 375.8 | 156.2 | 156.2 |
| het | headwords | 49 | 126.8 | 161.1 | 191.1 | 137.7 | 137.6 |
| het | examples | 49 | 155.2 | 251.1 | 319.6 | 191.3 | 191.3 |
| het | definitions | 49 | 164.9 | 191.4 | 199.4 | 140.6 | 140.5 |
| het | alphabetical | 49 | 143.5 | 187.0 | 211.0 | 148.3 | 148.3 |

No row in this 50-sample run exceeded 1.5s. `route.auth` and `route.parse` max
values stayed around 1-3ms in the warm run.

Updated attribution:

1. Generic Next route overhead is not the source.
2. Catalog-token auth and JSON parsing are not the source.
3. The outlier is inside the Supabase RPC call boundary currently measured by
   `search.db`.
4. Since local direct SQL warm runs remain stable, the next comparison should be
   server-side Supabase RPC over PostgREST vs server-side direct pooled
   PostgreSQL for the same catalog RPC/group calls.

Local token handling:

- The benchmark now runs from local gitignored env files, not 1Password.
- Token locations are documented in
  `docs/runbooks/dictionary-platform-smoke.md`.

## Direct PostgreSQL Diagnostic Assessment

The next useful comparison is server-side Supabase RPC/PostgREST versus
server-side direct pooled PostgreSQL. A production route for that comparison is
not a safe blind change yet:

- `pg` is currently a devDependency of `apps/ui`, used by tests.
- The production image uses Next standalone output. Adding a runtime direct
  PostgreSQL path would require making `pg` a production dependency.
- `/api/health` reports the Supabase API target, not a Postgres connection URL.
  It does not prove that `SUPABASE_DB_URL` or `DATABASE_URL` is available to the
  production Next runtime.
- The nuc runtime env file is external to the repo (`/srv/2000nl-ui/.env`).
  We should verify or add the Postgres URL there deliberately before deploying
  any direct-Postgres diagnostic route.

Safe next options:

1. Run a one-off diagnostic from the nuc host/container where the same network
   path and runtime env are available, using `pg` outside the public HTTP API.
2. Add a guarded internal diagnostic route only after confirming:
   - `pg` is intentionally promoted to production dependency;
   - `SUPABASE_DB_URL` or a dedicated read-only pooled diagnostic URL is present
     in the runtime env;
   - the route is protected by an internal diagnostic token/flag and never logs
     the URL or query content.

Until that is done, the confirmed root cause remains narrower but not final:
slow samples are inside the server-side Supabase RPC boundary (`search.db`),
not generic route overhead.

## Nuc One-Off Diagnostic Access Attempt

Attempted a non-secret nuc preflight to verify `/srv/2000nl-ui/.env`, container
state, and runtime tool availability before adding any direct-Postgres code.

Current blocker:

```text
sign_and_send_pubkey: signing failed for ED25519 "SSH Home" from agent:
communication with agent failed
Received disconnect from 192.168.178.141 port 22:2: Too many authentication failures
```

Observed SSH state:

- `ssh -G nuc` resolves to `user khrustal`, `hostname nuc`,
  `IdentityAgent` under the 1Password agent socket, and `IdentitiesOnly no`.
- One-shot attempts with local keys and `IdentityAgent=none` failed:
  - `~/.ssh/id_rsa`
  - `~/.ssh/mint_den_khrustal_ed25519`
- No local private key matching `ssh_home.pub` was present.

Conclusion: the safe one-off diagnostic is blocked on scoped nuc SSH access,
not on application code.

Next safe ways forward:

1. Restore a scoped local SSH key for `nuc`, or add a `Host nuc` config that
   uses the correct local key with `IdentitiesOnly yes` and avoids the broad
   1Password wildcard agent.
2. If SSH remains undesirable, add a temporary/manual self-hosted GitHub Actions
   diagnostic workflow that runs on the nuc runner, prints only key presence and
   timing summaries, and never prints secrets.
3. After host access is restored, run the one-off direct comparison from
   `/srv/2000nl-ui` or the running container before considering a production
   diagnostic route.

## Nuc One-Off Diagnostic Results

Scoped SSH access was restored with a local `~/.ssh/ssh_home` key exported from
the `SSH Home` 1Password item using OpenSSH format. The local `Host nuc` config
now uses:

```text
IdentityAgent none
IdentityFile ~/.ssh/ssh_home
IdentitiesOnly yes
```

Non-secret nuc preflight:

- `/srv/2000nl-ui/.env` exists.
- `DATABASE_URL` is present.
- `PLATFORM_CATALOG_ACCESS_TOKEN` is present.
- `NEXT_PUBLIC_SUPABASE_URL` is present.
- `SUPABASE_SECRET_KEY` is present.
- `SUPABASE_DB_URL` and `SUPABASE_SERVICE_ROLE_KEY` are not present.
- UI container `2000nl-ui-ui-1` is running.
- Host Node is available and host `apps/ui/node_modules/pg` is present.
- The standalone production container does not include `pg`.

Smoke from nuc host:

| layer | query | path | total ms | Server-Timing |
| --- | --- | --- | ---: | --- |
| sql | ontdekken | full search | 64.0 | n/a |
| http-2000nl | ontdekken | full search | 1802.8 | `route.operation=1243.1ms`, `search.db=1242.3ms` |

Focused nuc host 50-sample run, warm rows only:

| layer | query | group | warm n | total p50 ms | total p95 ms | total p99 ms | max ms | search.db max ms |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| sql | de | full | 49 | 88.4 | 117.6 | 138.1 | 150.2 | n/a |
| sql | de | headwords | 49 | 36.4 | 43.2 | 46.3 | 47.4 | n/a |
| sql | de | examples | 49 | 61.0 | 64.3 | 66.4 | 66.5 | n/a |
| sql | de | definitions | 49 | 58.0 | 61.0 | 64.2 | 66.0 | n/a |
| sql | de | alphabetical | 49 | 36.6 | 39.8 | 42.6 | 44.1 | n/a |
| sql | het | full | 49 | 94.9 | 128.0 | 130.4 | 130.9 | n/a |
| sql | het | headwords | 49 | 36.3 | 41.3 | 45.4 | 47.8 | n/a |
| sql | het | examples | 49 | 64.0 | 67.7 | 71.4 | 71.8 | n/a |
| sql | het | definitions | 49 | 62.0 | 64.8 | 65.6 | 65.7 | n/a |
| sql | het | alphabetical | 49 | 36.9 | 40.0 | 42.1 | 43.4 | n/a |
| http-2000nl | de | full | 49 | 170.2 | 270.0 | 412.4 | 534.7 | 478.2 |
| http-2000nl | de | headwords | 49 | 110.3 | 153.1 | 485.5 | 720.0 | 666.6 |
| http-2000nl | de | examples | 49 | 139.9 | 214.3 | 276.8 | 326.7 | 168.5 |
| http-2000nl | de | definitions | 49 | 131.2 | 221.1 | 369.8 | 438.8 | 388.0 |
| http-2000nl | de | alphabetical | 49 | 111.8 | 150.1 | 155.3 | 158.9 | 96.8 |
| http-2000nl | het | full | 49 | 177.8 | 242.7 | 346.6 | 358.4 | 304.2 |
| http-2000nl | het | headwords | 49 | 112.1 | 142.7 | 186.7 | 196.4 | 138.9 |
| http-2000nl | het | examples | 49 | 139.2 | 187.7 | 296.4 | 347.5 | 280.4 |
| http-2000nl | het | definitions | 49 | 136.5 | 170.1 | 193.1 | 207.8 | 148.2 |
| http-2000nl | het | alphabetical | 49 | 112.9 | 130.6 | 188.0 | 228.8 | 177.0 |

Outliers above 1.5s in this nuc 50-sample run:

```text
sql de examples sample=1 first_after_idle total=1620.4ms
```

Updated attribution:

- Warm direct SQL remains fast and stable.
- Direct SQL can still produce a first-after-idle body-group outlier on nuc.
  This keeps the common-term/cold-buffer body-group hypothesis alive.
- HTTP 2000NL warm calls remain consistently slower than direct SQL and can show
  additional `search.db` spikes, but this run did not reproduce >1.5s warm HTTP
  rows.
- The next fix should not be public response caching. A better next diagnostic
  is a cold/warm SQL-focused run for `examples` and `definitions`, including
  `EXPLAIN (ANALYZE, BUFFERS)` for first-after-idle body-group calls when
  feasible.

## Nuc EXPLAIN Body-Group Probe

Ran a one-off `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` from the nuc host using
the same `DATABASE_URL`. The query called:

```sql
select private.search_dictionary_group_keyset_v1(
  NULL, true, $query, 'nl', NULL, $group, 6, NULL
) as result
```

First loop:

| query | group | elapsed ms | execution ms | shared hit | shared read | temp read/write |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| de | examples | 371.0 | 317.225 | 5,622 | 0 | 0 / 0 |
| de | definitions | 59.2 | 25.515 | 3,119 | 0 | 0 / 0 |
| het | examples | 69.2 | 34.109 | 6,221 | 0 | 0 / 0 |
| het | definitions | 60.8 | 28.063 | 4,736 | 0 | 0 / 0 |

Immediate second loop:

| query | group | elapsed ms | execution ms | shared hit | shared read | temp read/write |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| de | examples | 57.5 | 21.201 | 4,028 | 0 | 0 / 0 |
| de | definitions | 55.7 | 23.692 | 4,527 | 0 | 0 / 0 |
| het | examples | 61.7 | 28.526 | 7,734 | 0 | 0 / 0 |
| het | definitions | 56.0 | 26.195 | 7,734 | 0 | 0 / 0 |

This confirms a direct SQL cold/warm gap for body-group execution on nuc. The
wrapper-level plan does not expose the internal query plan of
`private.search_dictionary_body_group_v1`, but the spike is inside direct SQL
function execution and does not require the HTTP/PostgREST boundary to appear.

Updated next step:

- Inspect and likely refactor the body-group query shape for common terms.
- Prefer early-terminating key selection before hydration and avoid materialized
  complete common-term match sets in the blocking preview path.
- Keep route/PostgREST observations as secondary overhead, not the only root
  cause.
