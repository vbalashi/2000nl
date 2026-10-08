# One-pass catalog: isolated function validation

Date: 2026-10-08. Reference revision94039290 (DB214). Investigation #413.

## Outcome

The complete prototype function preserves sampled catalog results and auth behavior, and reduces ordinary execution work on an isolated wide synthetic corpus. This is a review candidate, not a deployed RPC, forward migration or proven solution to managed multi-second latency. The public runtime function is unchanged.

`db/scripts/catalog_prototype_validation.py` creates/drops a disposable database on an explicitly selected dedicated local server, bootstraps the repository schema, reads the actual function definition, then clones it as `catalog_prototype_candidate`. Only the curated aggregation is transformed; auth guard, return fields, user-list path, defaults, search_path and SECURITY DEFINER boundary are preserved. New clone EXECUTE is explicitly revoked from PUBLIC/anon and granted to authenticated. Transformation anchor drift fails loudly. No primary or production database is accepted as a default target; canonical port54322 and non-loopback hosts are refused before connection.

## Checks and results

Each successful suite runs60 exact JSON comparisons (30small/mixed/empty/inaccessible cases and30wide corpus cases),4auth/anon denial checks, and5independent assertions of availability counts, unavailable-source count, private-list isolation and mixed-language flag. Language inputs: null,nl,en,unknown,whitespace,empty. List types: null,curated,user,unknown,empty. The wide fixture has18184synthetic entries, average row size above1500bytes and overlapping collections. Work_mem2184kB and JIT off match the production diagnostic settings during timing.

| Dedicated server | Reference execution range | Candidate execution range |
| --- | --- | --- |
| Vanilla PostgreSQL17.11 | 20.605–29.982ms | 11.844–17.952ms |
| Vanilla PostgreSQL17.6 | 20.637–28.710ms | 12.653–21.738ms |

Each row is4measurements per function with reversed call order and first/repeat within each new client. This is not a production percentile or cold shared-cache benchmark. Both versions passed the full semantic/auth suite. No multi-second outlier occurred. Cached-block work fell from roughly19423(reference repeat) to5068–5072(candidate repeat) on this fixture. No shared reads or temp spill reported.

A deliberate `drop-auth-guard` fault caused the suite to fail with `identity mismatch accepted`; the disposable database was removed. Default, canonical-port and remote targets were verified to refuse before connecting. The fault is available only inside this diagnostic harness, never in app/runtime code.

Optional CPU accounting reads only the measured backend's /proc stat from its dedicated Docker container; database system_identifier must match that container before attribution. Linux counter resolution was10ms. Candidate samples commonly consumed10–20msCPU versus20–30ms for reference; ranges overlap and include adjacent measurement statements. This coarse isolated evidence is consistent with lower ordinary CPU work, not a precise percentage or an explanation for production scheduling delay.

## Reproduce safely

Use a dedicated throwaway Docker server, never the canonical Supabase instance:

```sh
docker run --detach --name catalog-prototype-413 -e POSTGRES_PASSWORD=fixture-local-only -p 127.0.0.1:55431:5432 postgres:17
# Wait for pg_isready before running.
CATALOG_PROTOTYPE_TEST_BASE_DB_URL=postgresql://postgres:fixture-local-only@127.0.0.1:55431/postgres \
CATALOG_PROTOTYPE_CPU_CONTAINER=catalog-prototype-413 \
python3 db/scripts/catalog_prototype_validation.py
docker rm -fv catalog-prototype-413
```

For the17.6 matrix use postgres:17.6-alpine on a separate test port and omit optional CPU accounting if the container lacks getconf. Tags can move: record actual server_version; the recorded runs were17.11 and17.6. Python standard library, psql and Docker are the only harness prerequisites. The script is opt-in; no production or CI rollout is introduced.

## Local incident and cleanup

The initial attempt used a disposable database on the existing local Supabase server. A denial/exception probe terminated its backend with signal11 and briefly caused postmaster recovery. The cause is not established. The same suite passed on dedicated vanilla17.6/17.11; do not attribute the crash to the candidate or a specific extension from this evidence. The existing server recovered; its50entry primary fixture remained. The orphaned test database was explicitly removed. Harness then changed to require a dedicated server and refuse canonical54322. All later owned test databases and both test containers were removed; no canonical migrations or reset ran.

The local3100health check independently reported canonical application contract214 versus local DB220; main remains94039290 and freshly fetched origin/main. This mismatch was not changed by these isolated tests and was not rolled back or hidden. Coordinate the owner of the newer local schema separately before treating canonical local UI as a compatible release test.

## Review and release boundary

Next review should assess materialization cost for much larger catalogs, user-only skip behavior, nullable dictionary/source handling where schema permits it, expired/restricted entitlements and first-use measurements of an actual replacement RPC. The sampled tests are substantial characterization, not exhaustive certification of every future schema.

No forward migration/manifest entry is included: overlapping local schema work already reaches220 while this release reference remains214. Integrate a production change only after the owning migration sequence and rollout boundary are agreed and the candidate is independently reviewed. The diagnostic prototype has no authorization-safe API endpoint of its own and must not be pasted directly into a public route. #413 remains open.

Private complete outputs/checksums live in `.worktrees/.reference-sync-backup-2026-10-08/622-release-measurement/catalog-isolated-validation/`.

## Contract220 coordination

The215–220 migration sequence belongs to PR625 (issue623). Integrate that reviewed release first; the catalog optimization must be a separate forward change after220, not reuse215 or roll the local database back. No migration number is reserved or rollout authorized by this diagnostic PR.

A dedicated17.6 container validated the complete candidate on the623schema selection declaring DB220:60JSON+4auth+5contract checks passed. Initial PR625CI at04b0bb7a failed migration bootstrap coverage for219/220, not styles. The owning checkout was updated during this session; final test reported complete bootstrap coverage (no missing forward files). The harness can read an explicitly selected schema checkout and apply checksum-verified manifest files absent from bootstrap only within its disposable fixture; this does not repair source CI or alter primary DB. Full CI/review approval for625 remains a prerequisite. Test containers removed.

## Migration draft after release #625

Reference main synchronized at `04a4b3dc` (release #625 plus documentation #626).
Merged that base into the #413 checkout. Migration 221 is an unregistered draft
rebuilt from the latest catalog definition in migration 203. The harness now
accepts `CATALOG_PROTOTYPE_VALIDATE_MIGRATION=1`: it preserves the original
function, applies the actual migration in a disposable dedicated server, clones
the migrated function, and restores the baseline for exact comparisons.

PostgreSQL 17.6: all 60 JSON comparisons, four authentication checks and five
independent response checks passed. Eight reversed-order measurements: baseline
21.016–30.787 ms, migrated 11.624–21.982 ms; repeated shared hits 19423 versus
5068. No shared reads or temporary spill. This does not establish removal of
production outliers. Migration is not registered in the deploy manifest or
bootstrap yet: postflight, release integration and review remain required.
