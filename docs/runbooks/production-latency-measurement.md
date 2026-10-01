# Production latency measurement

How to measure user-action latency in production (Training answers, session
start, dictionary search, Library collections) and attribute it to client,
auth, API, SQL and network. The first run and its findings are in
[docs/discovery/2026-09-30-user-action-latency-audit.md](../discovery/2026-09-30-user-action-latency-audit.md);
the raw evidence is in
[docs/diagnostics/2026-09-30-user-action-latency/](../diagnostics/2026-09-30-user-action-latency/).
The kit is in [scripts/latency-audit/](../../scripts/latency-audit/).

Use this runbook before proposing latency fixes and again after deploying
them, with the same scripts, so before/after numbers are comparable.

## Ground rules

- Production writes are allowed only with the owner's approval and only on the
  isolated QA account (`QA_TEST_USER_EMAIL` in `.env.local`, enforced by
  `apps/ui/lib/server/qaIdentityPolicy.ts`). Training runs create real reviews
  for that account; `library-collections.mjs` creates/toggles a `latency-audit`
  collection.
- Every browser run goes through `scripts/latency-audit/run.sh`, which mints a
  QA session and revokes it on exit. If a run is killed, the trap may not fire:
  check `tmp/latency-audit/session-*` and revoke with
  `bash scripts/lib/revoke-prod-qa-session.sh .env.local <dir>/prod-session.json "$PWD"`.
- The project has no read replica. SQL probes run on the primary inside
  `BEGIN READ ONLY` with a `statement_timeout`. Never time write RPCs directly;
  use the `pg_stat_statements` snapshot diff instead.
- Do not run SQL timing probes while a browser run is in progress unless you
  want contention in the numbers; the database has roughly 2 usable vCPUs.
- Never print secrets. Print only hosts/usernames of connection strings.

## 0. Pin the version you are measuring

```sh
curl -s https://2000.dilum.io/api/health | head -c 400   # commit + DB contract
git fetch origin && git log -1 --format=%h origin/main
```

A local `main` can be far behind production. Audit code at the deployed
commit (`git archive <commit> apps/ui db/migrations | tar -x -C /tmp/...`), and
find the latest definition of an RPC with
`grep -il "create or replace function <name>" db/migrations/*.sql | sort | tail -1`
(private helpers are often redefined in later migrations than the public RPC).

## 1. Container configuration and network baseline

```sh
bash scripts/latency-audit/container-probes.sh config      # audio root, latency env
bash scripts/latency-audit/container-probes.sh audio-head  # HEAD probe cost
bash scripts/latency-audit/container-probes.sh rtt         # nuc -> Supabase RTT
```

Expect `audio-root:inspectable`. `NOT-inspectable` means every V2 lookup
verifies new audio links with an HTTP HEAD (see `dictionaryContent.ts`).
2026-09-30 baseline: RTT to Supabase p50 ~50 ms (p95 250–400 ms), audio HEAD
p50 106 / p95 162 ms.

## 2. Training answers (browser)

```sh
psql "$DATABASE_URL" -X -q -v outfile=tmp/latency-audit/out/pgss-before.json \
  -f scripts/latency-audit/sql/09-snapshot.sql
bash scripts/latency-audit/run.sh train.mjs 60 "500,3000,8000,20000" desktop
psql "$DATABASE_URL" -X -q -v outfile=tmp/latency-audit/out/pgss-after.json \
  -f scripts/latency-audit/sql/09-snapshot.sql
cd apps/ui
node ../../scripts/latency-audit/analyze.mjs ../../tmp/latency-audit/out/desktop-*.jsonl
node ../../scripts/latency-audit/pgss-diff.mjs \
  ../../tmp/latency-audit/out/pgss-before.json ../../tmp/latency-audit/out/pgss-after.json
```

(`DATABASE_URL` comes from `.env.local`; source it in a subshell so it does
not leak into later test runs.)

- Arguments: answers, think-time pauses in ms (cycled), label. A label starting
  with `mobile` emulates iPhone 13 with +100 ms RTT, 9/1.5 Mbit/s and 4x CPU.
- Output: one JSONL record per answer/session start in
  `tmp/latency-audit/out/` (`LATENCY_AUDIT_OUT` overrides). Records contain
  timing events, request paths with UUIDs masked, `Server-Timing` and request
  ids — no bodies, tokens or content.
- Sessions have 10 cards; the script restarts sessions itself. Restarting uses
  the **Start current setup** button: after a session ends, Today still shows a
  disabled "Continue session" button (known UX defect).
- The pgss diff is exact only if nobody else used production during the run;
  check the call counts against the number of answers.

What to read in the analysis:

- `transition.total` per pause and split by `with renewal` / `without
  renewal`. `renewal-required` on `next-card.prefetch` means the prepared next
  card was refetched on the critical path; after the 2026-10 fix a fresh
  prepared card reports `lease-extended` instead.
- `route.auth` and `auth-miss` rate per API route. `auth.get-user` +
  `auth.principal-session` present = server auth cache miss; `auth.coalesced`
  = waited for a concurrent resolution.
- `lookup.*` stages: `exact-group`, `user-state`, `translations` (includes the
  audio HEAD probe when the audio root is not inspectable), `cross-references`,
  `projection-input`.
- Direct Supabase requests per answer (e.g. `get_detailed_training_stats`).

## 3. Library

```sh
bash scripts/latency-audit/run.sh library-search.mjs       # typing 'huis' per character
bash scripts/latency-audit/run.sh library-collections.mjs  # create/toggle 'latency-audit'
```

Report the number of requests per keystroke/toggle and time until controls
are enabled again.

## 4. SQL (read-only)

```sh
set -a; source .env.local; set +a   # in a subshell
psql "$DATABASE_URL" -X -q -f scripts/latency-audit/sql/01-overview.sql     # sizes, pgss settings
psql "$DATABASE_URL" -X -q -f scripts/latency-audit/sql/03-pgss-rpc.sql     # historical per-RPC means
psql "$DATABASE_URL" -X -q -v qa_email="$QA_TEST_USER_EMAIL" -f scripts/latency-audit/sql/04-time-group.sql
psql "$DATABASE_URL" -X -q -v qa_email="$QA_TEST_USER_EMAIL" -f scripts/latency-audit/sql/05-time-stats.sql
psql "$DATABASE_URL" -X -q -v qa_email="$QA_TEST_USER_EMAIL" -f scripts/latency-audit/sql/07-time-start.sql
psql "$DATABASE_URL" -X -q -v qa_email="$QA_TEST_USER_EMAIL" -f scripts/latency-audit/sql/12-buffers.sql
```

- `10-role.sql`: role/RLS effect (functions are SECURITY DEFINER; none seen).
- `11-par.sql`: run 1/2/4 copies in parallel to see CPU contention.
- `13-fresh.sql`: first vs second call on a fresh backend (session pooler URL,
  port 5432); terminates only its own backend.
- `pg_stat_statements.track` is `top`: nested statements inside PL/pgSQL are
  not recorded, so time RPC internals directly with `clock_timestamp()` in a
  `DO` block, as the scripts do.
- Always use `psql -X` and avoid the pager (`-P pager=off`) in agent terminals.

## Pitfalls seen in the first run

- Compare direct SQL time with the in-app time (pgss diff). On 2026-09-30 the
  same RPCs were 5–15x slower in the app than alone because of CPU contention,
  so a fast `EXPLAIN` alone does not clear a function.
- First calls after a few idle minutes sometimes took 3–5 s; a fresh backend
  alone did not reproduce it. Check Supabase CPU/IO metrics before blaming SQL.
- Many historical maxima near 7.9 s are the 8 s `statement_timeout` of the
  `authenticated`/`authenticator` roles, i.e. failed requests.
- zsh fails on unmatched globs such as `grep --include=*.ts`; use
  `grep -rn -e PATTERN dir`.
- Unit tests read `process.env`; do not run vitest in a shell that sourced
  `.env.local` (use `env -i PATH="$PATH" HOME="$HOME" TMPDIR="$TMPDIR" npx vitest run`).
- Port 3100 may belong to another agent's QA server; run Playwright specs with
  a temporary config on 3101. `training-secondary-actions.spec.ts` hardcodes
  origin `127.0.0.1:3100` and cannot pass on another port.
