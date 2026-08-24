# NUC database contract deployment

The NUC deploy is fail-closed: a checked-out application commit declares one
exact database contract in
`packages/shared/deployment/db-contract.json`. The deploy builds an immutable
image first, applies only the manifest's contiguous reviewed-forward migrations,
runs exact SQL probes, switches the container, and then accepts the release only
when deep health reports the same commit and database contract.

The NUC host does not provide `psql` and must not be mutated to add it. The
workflow runs PostgreSQL client 17 from the official digest-pinned container in
`DB_PSQL_IMAGE`. Before the expensive app build it starts that image with no
network and runs only `psql --version`. A missing Docker runtime, unavailable
image, non-zero client, or wrong client major therefore stops deployment before
`.env` is read or any database connection is possible. The apply command repeats
that preflight and then reuses the already-pulled exact image.

## Current coordinated rollout

Issue #233 first integrated the gate with `rollout.status: hold` and
`requiredMigrationId: 126`. That held deployment stopped before Docker build,
database connection, migration, or container switch. The contract was first
enabled after #232 appended migration 126 with its exact SHA-256. Issue #238
advances it to migration 127 after the bounded pre-switch read exposed
repeatable cold scheduler I/O even after migration 126.

An enabled deployment must apply or verify migrations 123 through 127 in order
before it advertises compatibility. The runner rejects an enabled manifest
whose last migration is below the required migration.

## What the gate guarantees

- The baseline-122 read-only probe runs before the gate creates its ledger.
- The ledger itself is an immutable pre-managed migration declared with its
  own checksum in the manifest. It is separate from the numbered application
  sequence only because it must exist before migration 123 can be recorded;
  later ledger/state schema changes must use the numbered migration sequence.
- Migration filenames are contiguous and their bytes must match manifest
  SHA-256 values.
- One PostgreSQL advisory lock serializes the full gate.
- Each missing migration and its ledger/state record commit in the same
  transaction. A failed migration leaves neither its schema changes nor its
  ledger row.
- A database newer than the checked-out app, or a changed already-recorded
  migration, stops deployment.
- Postflight checks exact RPC signatures, role grants, and a deterministic
  `EXPLAIN (FORMAT JSON)` contract proving the default NT2 scheduler scope uses
  its narrow synchronized projection instead of wide dictionary rows. It pins
  materialized learner settings/status and readable-dictionary sets, the legacy
  selector fallback, application compatibility, and the bounded health signal.
- Before compatibility is advertised, the gate executes the checksum-pinned
  session-plan selector as exactly one `test@2000nl.test` principal inside
  `BEGIN READ ONLY`, with a 2,000 ms statement timeout. It discards only the
  deployment session's cached plans and cannot review, report, mark known, or
  otherwise mutate learner state.
- The pre-switch read runs on no-op retries too. This is deliberate: forward
  migrations commit independently, so a timed-out first read must not be
  bypassed merely because the retry sees those migrations in the ledger.
- The database URL is passed to `psql` through `PG*` environment variables,
  never command arguments. Gate output redacts URLs and credential-like values.
- Containerized `psql` receives only named `PG*` variables, runs read-only with
  all Linux capabilities dropped and `no-new-privileges`, and mounts no host
  files. TLS still defaults to `require`; the advisory lock, transactions,
  postflight, health contract, and app-image rollback are unchanged.

Inspect the commit-owned contract without database access:

```bash
node db/scripts/deploy_db_contract.mjs expected
node db/scripts/deploy_db_contract.mjs rollout-status
node db/scripts/deploy_db_contract.mjs validate
node db/scripts/deploy_db_contract.mjs client-preflight \
  --psql-container-image \
  postgres@sha256:ef257d85f76e48da1c64832459b59fcaba1a4dac97bf5d7450c77753542eee94
```

For a reviewed non-production database, run the same gate with an exact commit:

```bash
DEPLOY_APP_COMMIT="$(git rev-parse HEAD)" \
  node db/scripts/deploy_db_contract.mjs apply \
    --psql-container-image \
    postgres@sha256:ef257d85f76e48da1c64832459b59fcaba1a4dac97bf5d7450c77753542eee94 \
    --env-file .env.local
```

Never point this command at production outside the NUC deployment workflow.

## Deployment and stop conditions

The workflow keeps the current container running while it builds the new image.
It stops without switching the app when the manifest is held, the pinned client
preflight fails, the baseline is too old, the DB is newer than the app, a
checksum differs, a migration fails, or postflight fails. Client preflight also
runs before building. A missing/ambiguous QA identity, read-only violation, or
selector read exceeding 2,000 ms also stops before the app switch. The old app
continues serving; rerunning the same immutable deployment repeats the read
probe even when every forward migration is now a no-op. After the container
switch, deep health must report:

- the exact 40-character deployed commit;
- overall `status: ok`;
- `checks.databaseContract.status: ok`;
- identical expected/actual contract IDs and migration IDs.

Health exposes only contract IDs, migration numbers, and compatibility. It does
not expose function definitions, grants, schema names, checksums, or credentials.

## Rollback and recovery ownership

App rollback and DB recovery are deliberately separate:

- The NUC deploy workflow owns the app image. If container startup or health
  fails after switching, it restores the exact previous image automatically.
  If no previous image exists, it stops the incompatible new container.
- Forward DB migrations remain in place during app-image rollback. Every
  enabled migration must therefore be compatible with the previous app.
- The migration's owning issue owns DB recovery. Issue #238 owns migration 127
  and any reviewed corrective-forward or explicit rollback SQL. Issue #232
  retains ownership of migration 126; #233 owns gate/ledger/probe machinery.
- Any explicit DB rollback must be reviewed as a complete contract transition:
  restore compatible functions and indexes, then reconcile the matching ledger
  and state rows in the same recovery plan. Never advertise contract 127 after
  removing its bounded plan function or index.
- Never improvise reverse SQL in the workflow. Preserve the failed run, exact
  commit, contract ID, last applied migration lines, and health response; then
  use the owning issue's reviewed recovery path.
- A retry with the same immutable contract is the normal recovery after a
  transactional migration failure. Applied rows are verified/no-op; the failed
  migration is attempted again.

CI proves that recovery path against a real disposable PostgreSQL database: a
fixture fails after visible DDL, both the DDL and migration ledger row are
verified absent, then the repaired immutable input succeeds on the same
database and its next replay is verified as a no-op. Separate real-PostgreSQL
coverage proves that the pre-switch probe rejects writes, times out at its
declared bound, reruns after committed migrations, and preserves all learner
state for the exact QA identity.

## First-call latency ownership

The migration-126 rollout first observed a 3,282.6 ms read followed by warm p50
126.1 ms. A later no-op deployment timed out the same exact read after two
seconds, disproving the earlier one-time-post-DDL explanation. Read-only
production diagnostics then showed one warm call touching 18,853 shared blocks
(about 147 MB of buffer traffic) for a 71 MB `word_entries` heap. The default
scope had no narrow NT2 index, and session-plan counts still executed
selector-only ordering plus repeated learner-setting lookups.

Migration 127 adds a narrow, trigger-synchronized projection of trainable NT2
entry identities and a count-only default session-plan path. Dictionary access,
learner settings, status, and today's review sets are each resolved once. List
and filtered plans retain the authoritative selector fallback. On a disposable
production-shaped fixture, the previous contract touched 15,409 shared blocks.
An index-only version fell back to 10,066 after distributed NT2 heap pages were
dirtied; the synchronized projection stayed at 1,825 blocks and 16.647 ms after
both source and projection visibility were invalidated. Queue counts remained
identical across single-mode `both`/`new`/`review` and multi-mode cases. CI keeps
a 4,000-block and 2,000-ms fail-closed budget; the production pre-switch probe
remains exactly read-only and retains its two-second timeout.

## Production QA sessions

The deploy never mints, copies, or revokes an Auth session. Production smoke
must use only `scripts/ab-auth-prod.sh`, which verifies the dedicated QA identity
before opening the site.

- Keep the wrapper process alive for the whole smoke; do not copy its session
  JSON or browser profile.
- Normal exit, failure, or interruption clears browser storage, globally
  revokes the QA session, and removes its temporary artifacts.
- If revocation fails, the wrapper preserves a protected recovery directory and
  prints only its path. Do not delete it. With the same private env file, set
  `QA_SESSION_JSON_PATH` to its `prod-session.json` and run
  `apps/ui/scripts/revoke-prod-qa-session.ts`; delete the recovery directory only
  after that command succeeds.
- Do not use a personal/reference account for smoke. Read-only smoke remains the
  default; mutations require their own owning issue.

See `docs/runbooks/production-login.md` for the identity and cleanup contract.
