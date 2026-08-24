import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const repoRoot = path.resolve(import.meta.dirname, "../..");
const runner = path.join(repoRoot, "db/scripts/deploy_db_contract.mjs");
const baseDatabaseUrl = process.env.DB_CONTRACT_INTEGRATION_DATABASE_URL;
const containerImage = process.env.DB_CONTRACT_INTEGRATION_PSQL_CONTAINER_IMAGE;
const containerNetwork = process.env.DB_CONTRACT_INTEGRATION_PSQL_CONTAINER_NETWORK ?? "bridge";
const containerDatabaseHost = process.env.DB_CONTRACT_INTEGRATION_PSQL_HOST;

function sha256(source) {
  return createHash("sha256").update(source).digest("hex");
}

function postgresEnvironment(urlString, databaseOverride) {
  const url = new URL(urlString);
  return {
    ...process.env,
    PGHOST: url.hostname,
    PGPORT: url.port || "5432",
    PGDATABASE: databaseOverride ?? decodeURIComponent(url.pathname.slice(1)),
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGSSLMODE: url.searchParams.get("sslmode") ?? "disable",
  };
}

function psql(urlString, sql, databaseOverride) {
  return spawnSync("psql", ["-X", "--no-psqlrc", "-At", "--set=ON_ERROR_STOP=1"], {
    input: sql,
    encoding: "utf8",
    env: postgresEnvironment(urlString, databaseOverride),
  });
}

async function writeFixture(
  root,
  migrationSource,
  preSwitchReadProbeSource = `DO $$
BEGIN
  IF current_setting('transaction_read_only') <> 'on' THEN
    RAISE EXCEPTION 'pre-switch probe was not read-only';
  END IF;
END $$;
`,
) {
  const ledgerSource = `BEGIN;
CREATE TABLE IF NOT EXISTS public.app_db_contract_migrations (
  migration_id integer PRIMARY KEY,
  filename text NOT NULL UNIQUE,
  checksum_sha256 text NOT NULL,
  contract_id text NOT NULL,
  app_commit text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE IF NOT EXISTS public.app_db_contract_state (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  contract_id text NOT NULL,
  migration_id integer NOT NULL,
  app_commit text NOT NULL,
  verified_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
COMMIT;
`;
  const baselineSource = "DO $$ BEGIN PERFORM current_setting('server_version_num'); END $$;\n";
  const postflightSource = `DO $$
BEGIN
  IF to_regclass('public.rollback_marker') IS NULL THEN
    RAISE EXCEPTION 'db-contract-gate: postflight-failed marker';
  END IF;
END $$;
`;

  await mkdir(path.join(root, "db/migrations"), { recursive: true });
  await mkdir(path.join(root, "db/deploy-contract"), { recursive: true });
  await mkdir(path.join(root, "packages/shared/deployment"), { recursive: true });
  await writeFile(path.join(root, "db/migrations/123_rollback_probe.sql"), migrationSource);
  await writeFile(path.join(root, "db/deploy-contract/baseline-122.sql"), baselineSource);
  await writeFile(path.join(root, "db/deploy-contract/ledger-v1.sql"), ledgerSource);
  await writeFile(path.join(root, "db/deploy-contract/postflight-123.sql"), postflightSource);
  await writeFile(
    path.join(root, "db/deploy-contract/pre-switch-read-probe-123.sql"),
    preSwitchReadProbeSource,
  );
  await writeFile(
    path.join(root, "packages/shared/deployment/db-contract.json"),
    JSON.stringify({
      schemaVersion: 1,
      contractId: "integration-123",
      rollout: { status: "enabled", requiredMigrationId: 123, coordinationIssue: 233 },
      baseline: { migrationId: 122, probe: "db/deploy-contract/baseline-122.sql" },
      ledger: { file: "db/deploy-contract/ledger-v1.sql", sha256: sha256(ledgerSource) },
      migrations: [
        {
          migrationId: 123,
          file: "db/migrations/123_rollback_probe.sql",
          sha256: sha256(migrationSource),
        },
      ],
      postflightProbe: "db/deploy-contract/postflight-123.sql",
      preSwitchReadProbe: {
        file: "db/deploy-contract/pre-switch-read-probe-123.sql",
        sha256: sha256(preSwitchReadProbeSource),
        statementTimeoutMs: 50,
      },
    }),
  );
}

function applyFixture(root, databaseUrl) {
  const clientArgs = containerImage
    ? [
        "--psql-container-image",
        containerImage,
        "--psql-container-network",
        containerNetwork,
      ]
    : [];
  return spawnSync(
    process.execPath,
    [
      runner,
      "apply",
      "--repo-root",
      root,
      ...clientArgs,
      "--database-url-env",
      "DB_CONTRACT_TEST_TARGET_URL",
      "--app-commit",
      "1234567890123456789012345678901234567890",
    ],
    {
      encoding: "utf8",
      env: { ...process.env, DB_CONTRACT_TEST_TARGET_URL: databaseUrl },
    },
  );
}

test(
  "real PostgreSQL rolls back visible DDL and ledger, then recovers on the same database",
  { skip: !baseDatabaseUrl },
  async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "2000nl-db-contract-integration-"));
    const databaseName = `contract_gate_${process.pid}_${Date.now()}`;
    const nativeTargetUrl = new URL(baseDatabaseUrl);
    nativeTargetUrl.pathname = `/${databaseName}`;
    nativeTargetUrl.searchParams.set("sslmode", "disable");
    const targetUrl = new URL(nativeTargetUrl);
    if (containerDatabaseHost) targetUrl.hostname = containerDatabaseHost;

    const create = psql(baseDatabaseUrl, `CREATE DATABASE ${databaseName};\n`);
    assert.equal(create.status, 0, create.stderr);

    try {
      const brokenMigration = `BEGIN;
CREATE TABLE public.rollback_marker(id integer PRIMARY KEY);
INSERT INTO public.rollback_marker(id) VALUES (1);
SELECT 1 / 0;
COMMIT;
`;
      await writeFixture(root, brokenMigration);
      if (containerImage) {
        const preflight = spawnSync(
          process.execPath,
          [
            runner,
            "client-preflight",
            "--repo-root",
            root,
            "--psql-container-image",
            containerImage,
            "--psql-container-network",
            containerNetwork,
          ],
          { encoding: "utf8" },
        );
        assert.equal(preflight.status, 0, preflight.stderr);
        assert.match(preflight.stdout, /client-ready PostgreSQL 17 container/);
      }
      const failed = applyFixture(root, targetUrl.toString());
      assert.notEqual(failed.status, 0, "the migration must fail after creating visible DDL");

      const rolledBack = psql(
        nativeTargetUrl.toString(),
        `SELECT
          to_regclass('public.rollback_marker') IS NULL,
          count(*) FILTER (WHERE migration_id = 123),
          (SELECT count(*) FROM public.app_db_contract_state)
        FROM public.app_db_contract_migrations;\n`,
      );
      assert.equal(rolledBack.status, 0, rolledBack.stderr);
      assert.equal(rolledBack.stdout.trim(), "t|0|0");

      const repairedMigration = `BEGIN;
CREATE TABLE public.rollback_marker(id integer PRIMARY KEY);
INSERT INTO public.rollback_marker(id) VALUES (1);
COMMIT;
`;
      await writeFixture(root, repairedMigration);
      const recovered = applyFixture(root, targetUrl.toString());
      assert.equal(recovered.status, 0, recovered.stderr);
      assert.match(recovered.stdout, /applied 123/);
      assert.match(recovered.stdout, /pre-switch-read-probe passed/);
      assert.match(recovered.stdout, /compatible integration-123/);

      const committed = psql(
        nativeTargetUrl.toString(),
        `SELECT
          to_regclass('public.rollback_marker') IS NOT NULL,
          count(*) FILTER (WHERE migration_id = 123),
          (SELECT contract_id FROM public.app_db_contract_state WHERE singleton),
          (SELECT migration_id FROM public.app_db_contract_state WHERE singleton)
        FROM public.app_db_contract_migrations;\n`,
      );
      assert.equal(committed.status, 0, committed.stderr);
      assert.equal(committed.stdout.trim(), "t|1|integration-123|123");

      const replay = applyFixture(root, targetUrl.toString());
      assert.equal(replay.status, 0, replay.stderr);
      assert.match(replay.stdout, /no-op 123/);
      assert.match(replay.stdout, /pre-switch-read-probe passed/);
      assert.match(replay.stdout, /compatible integration-123/);
    } finally {
      const drop = psql(
        baseDatabaseUrl,
        `DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE);\n`,
      );
      await rm(root, { recursive: true, force: true });
      assert.equal(drop.status, 0, drop.stderr);
    }
  },
);

test(
  "real PostgreSQL bounds the probe and refuses writes before compatibility",
  { skip: !baseDatabaseUrl },
  async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "2000nl-db-probe-integration-"));
    const databaseName = `contract_probe_${process.pid}_${Date.now()}`;
    const nativeTargetUrl = new URL(baseDatabaseUrl);
    nativeTargetUrl.pathname = `/${databaseName}`;
    nativeTargetUrl.searchParams.set("sslmode", "disable");
    const targetUrl = new URL(nativeTargetUrl);
    if (containerDatabaseHost) targetUrl.hostname = containerDatabaseHost;

    const create = psql(baseDatabaseUrl, `CREATE DATABASE ${databaseName};\n`);
    assert.equal(create.status, 0, create.stderr);

    try {
      const migration = `BEGIN;
CREATE TABLE public.rollback_marker(id integer PRIMARY KEY);
COMMIT;
`;
      const mutatingProbe = `CREATE TABLE public.probe_must_remain_read_only(id integer);\n`;
      await writeFixture(root, migration, mutatingProbe);
      const rejectedWrite = applyFixture(root, targetUrl.toString());
      assert.notEqual(rejectedWrite.status, 0);
      assert.match(rejectedWrite.stderr, /read-only transaction/i);
      assert.doesNotMatch(rejectedWrite.stdout, /compatible integration-123/);

      const noProbeMutation = psql(
        nativeTargetUrl.toString(),
        `SELECT
          to_regclass('public.rollback_marker') IS NOT NULL,
          to_regclass('public.probe_must_remain_read_only') IS NULL,
          count(*) FILTER (WHERE migration_id = 123)
        FROM public.app_db_contract_migrations;\n`,
      );
      assert.equal(noProbeMutation.status, 0, noProbeMutation.stderr);
      assert.equal(noProbeMutation.stdout.trim(), "t|t|1");

      const slowProbe = `SELECT pg_sleep(0.075);\n`;
      await writeFixture(root, migration, slowProbe);
      const timedOut = applyFixture(root, targetUrl.toString());
      assert.notEqual(timedOut.status, 0);
      assert.match(timedOut.stderr, /statement timeout/i);
      assert.match(timedOut.stderr, /no-op 123/);
      assert.doesNotMatch(`${timedOut.stdout}\n${timedOut.stderr}`, /compatible integration-123/);

      const safeProbe = `SELECT current_setting('transaction_read_only');\n`;
      await writeFixture(root, migration, safeProbe);
      const recovered = applyFixture(root, targetUrl.toString());
      assert.equal(recovered.status, 0, recovered.stderr);
      assert.match(recovered.stdout, /no-op 123/);
      assert.match(recovered.stdout, /pre-switch-read-probe passed/);
      assert.match(recovered.stdout, /compatible integration-123/);
    } finally {
      const drop = psql(
        baseDatabaseUrl,
        `DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE);\n`,
      );
      await rm(root, { recursive: true, force: true });
      assert.equal(drop.status, 0, drop.stderr);
    }
  },
);
