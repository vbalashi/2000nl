# VanDale collection/training validation run — 2026-09-20

Status: initial evidence pass complete for the currently implemented VanDale
training path. This is not yet acceptance of the complete C1–C28 plan.

## Scope and environment

- Checkout: `bbbf97fb706fafafe248710f3725f3c88aed1d0c` (dirty, local QA only).
- Database: the Docker-local `supabase_db_2000nl` container, rebuilt with
  `scripts/db-local-supabase.sh all --confirm-reset` and queried inside the
  container. Host ports 54321/54322 were excluded because an existing SSH
  tunnel occupied them.
- Local disposable suites: 241 FSRS/training tests passed; 70 ingestion tests
  passed; the local Docker database probes passed.
- Local data: 18,163 VanDale entries plus the deterministic fixture entries;
  the controlled local preparation populated the full-list materialization and
  completed search backfill at extraction version 2.
- Search projection after local backfill: 18,253 documents and 94,407 fields.

The browser/UI attempt was discarded as evidence: the host's SSH tunnel also
occupied port 54321, so that process was not connected to the Docker-local
Supabase instance. The results below are direct local RPC/SQL evidence only.

## VanDale results

| Check | Result |
| --- | --- |
| `nt2-2000` materialized list | 4,031 items |
| `vandale-all` before controlled preparation | 0 items |
| `vandale-all` after controlled local preparation | 18,163 items |
| source dictionary `nl-vandale` | 18,163 entries |
| 10-card plan on `nt2-2000` | 9 new + 1 review |
| 10-card plan on `vandale-all` | 9 new + 1 review |
| full-list queue includes non-2K entries | `dealen in`, `baret`, `afwijken van`, and others |
| start-learning + `review-card/fail` | accepted; FSRS grade 1 |
| session member consumption after answer | 1 of 10 |
| queue after adding a new source-list member | unchanged; latching PASS |

After the controlled local materialization, the full-list server path is
operational: the RPC plans and starts a session against `vandale-all`, its
latched queue includes entries outside NT2 2K, and the normal learning action
followed by an FSRS grade consumes exactly one session member.

## Current gaps found

1. The normal importer invocation refreshes the NT2 list, but the materialized
   full list was empty after the clean bootstrap. A controlled local
   reconciliation was required before the full-list session could be tested.
   This is a collection-materialization/import follow-up, not a queue or FSRS
   failure.
2. The current Training UI deliberately excludes the curated list named
   `VanDale` from its training picker (`isDictionarySourceList`); the full-list
   RPC path works after materialization, but the user-facing picker still needs
   an explicit product decision/change to expose it.
3. The host-port collision is itself a QA-environment defect: the local QA
   launcher must detect an SSH tunnel before claiming that UI/API traffic is
   local. No browser result from the collided ports is used here.

## Timing sample

These are single local warm-ish `psql` round trips, not HTTP p95 claims:

| Full VanDale plan | Result | Real time |
| --- | --- | ---: |
| 5 cards | 4 new + 1 review | 0.28 s |
| 10 cards | 9 new + 1 review | 0.27 s |
| 50 cards | 49 new + 1 review | 0.25 s |
| all due today | 13,865 new + 1 review | 0.28 s |

These samples are enough to expose the current scale, not enough to close the
performance gate requiring repeated p50/p95 samples.

## Decision for the next pass

The implemented session engine is suitable for continued VanDale work, but the
full user-facing VanDale path is not yet “done”: reconcile the full materialized
list and decide whether the Training picker should expose it. The history
follow-up and elapsed-168-hour window remain deferred as recorded in
`training-history-filter-follow-up.md`.
