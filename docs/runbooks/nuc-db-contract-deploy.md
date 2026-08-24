# NUC database contract deployment

The NUC deploy is fail-closed: a checked-out application commit declares one
exact database contract in
`packages/shared/deployment/db-contract.json`. The deploy builds an immutable
image first, applies only the manifest's contiguous reviewed-forward migrations,
runs exact SQL probes, switches the container, and then accepts the release only
when deep health reports the same commit and database contract.

## Current rollout hold

Issue #233 intentionally ships with `rollout.status` set to `hold` and
`requiredMigrationId` set to `126`. Merging #233 alone therefore stops before
Docker build, database connection, migration, or container switch. This prevents
the reverted production scheduler from receiving migrations 123–125 before the
set-based scheduler fix from #232 is present.

The first enabled rollout order is mandatory:

1. integrate #233 while the manifest remains held;
2. rebase #232 on the integrated gate;
3. append migration 126 and its exact SHA-256 to the manifest;
4. extend the postflight probe for migration 126;
5. change only `rollout.status` from `hold` to `enabled` while retaining
   `requiredMigrationId: 126`;
6. merge #232 so one deploy applies or verifies 123, 124, 125, and 126 in order.

The runner rejects an enabled manifest whose last migration is below the
required migration. Do not enable the current 125 contract as an intermediate
release.

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
  `EXPLAIN (FORMAT JSON)` contract proving the scheduler's pointer-only
  anti-join can use its partial index, plus legacy selector compatibility and
  the bounded health signal grant.
- The database URL is passed to `psql` through `PG*` environment variables,
  never command arguments. Gate output redacts URLs and credential-like values.

Inspect the commit-owned contract without database access:

```bash
node db/scripts/deploy_db_contract.mjs expected
node db/scripts/deploy_db_contract.mjs rollout-status
node db/scripts/deploy_db_contract.mjs validate
```

For a reviewed non-production database, run the same gate with an exact commit:

```bash
DEPLOY_APP_COMMIT="$(git rev-parse HEAD)" \
  node db/scripts/deploy_db_contract.mjs apply --env-file .env.local
```

Never point this command at production outside the NUC deployment workflow.

## Deployment and stop conditions

The workflow keeps the current container running while it builds the new image.
It stops without switching the app when the manifest is held, the baseline is
too old, the DB is newer than the app, a checksum differs, a migration fails, or
postflight fails. After the container switch, deep health must report:

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
- The migration's owning issue owns DB recovery. For the first rollout, #232
  owns migration 126 and any reviewed corrective-forward or explicit rollback
  SQL. #233 owns failures in the gate/ledger/probe machinery.
- Never improvise reverse SQL in the workflow. Preserve the failed run, exact
  commit, contract ID, last applied migration lines, and health response; then
  use the owning issue's reviewed recovery path.
- A retry with the same immutable contract is the normal recovery after a
  transactional migration failure. Applied rows are verified/no-op; the failed
  migration is attempted again.

CI proves that recovery path against a real disposable PostgreSQL database: a
fixture fails after visible DDL, both the DDL and migration ledger row are
verified absent, then the repaired immutable input succeeds on the same
database and its next replay is verified as a no-op.

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
