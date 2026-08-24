import assert from "node:assert/strict";
import { chmod, mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const repoRoot = path.resolve(import.meta.dirname, "../..");
const runner = path.join(repoRoot, "db/scripts/deploy_db_contract.mjs");

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "2000nl-db-contract-"));
  await mkdir(path.join(root, "db/migrations"), { recursive: true });
  await mkdir(path.join(root, "db/deploy-contract"), { recursive: true });
  await mkdir(path.join(root, "packages/shared/deployment"), { recursive: true });

  await writeFile(
    path.join(root, "db/migrations/123_example.sql"),
    "-- fixture\nBEGIN;\nCREATE TABLE public.example(id integer);\nCOMMIT;\n",
  );
  await writeFile(
    path.join(root, "db/deploy-contract/baseline-122.sql"),
    "DO $$ BEGIN PERFORM 1; END $$;\n",
  );
  await writeFile(
    path.join(root, "db/deploy-contract/ledger-v1.sql"),
    "BEGIN;\nCREATE TABLE public.gate_ledger(id integer);\nCOMMIT;\n",
  );
  await writeFile(
    path.join(root, "db/deploy-contract/postflight-123.sql"),
    "DO $$ BEGIN PERFORM 1; END $$;\n",
  );
  await writeFile(
    path.join(root, "packages/shared/deployment/db-contract.json"),
    JSON.stringify({
      schemaVersion: 1,
      contractId: "fixture-123",
      rollout: {
        status: "enabled",
        requiredMigrationId: 123,
        coordinationIssue: 233,
      },
      baseline: {
        migrationId: 122,
        probe: "db/deploy-contract/baseline-122.sql",
      },
      ledger: {
        file: "db/deploy-contract/ledger-v1.sql",
        sha256: "02ce2834ca8b1bf71e0944d771d8e9c464eb6c061e9f6085616c34a544038335",
      },
      migrations: [
        {
          migrationId: 123,
          file: "db/migrations/123_example.sql",
          sha256: "4ca8062c736bfc8751ad45c942e97993340a5bbcd7e6631ed1182625ebc3b570",
        },
      ],
      postflightProbe: "db/deploy-contract/postflight-123.sql",
    }),
  );

  return root;
}

async function fakePsql(root) {
  const executable = path.join(root, "fake-psql.sh");
  await writeFile(
    executable,
    `#!/usr/bin/env bash
set -euo pipefail
payload="$(cat)"
printf '%s' "$payload" > "$FAKE_PSQL_CAPTURE"
case "\${FAKE_PSQL_MODE:-success}" in
  success)
    printf '%s\n' 'db-contract-gate: applied 123' 'db-contract-gate: compatible fixture-123'
    ;;
  noop)
    printf '%s\n' 'db-contract-gate: no-op 123' 'db-contract-gate: compatible fixture-123'
    ;;
  migration-failure)
    printf '%s\n' 'ERROR: db-contract-gate: migration-failed 123 postgresql://user:leaked@db.invalid/prod' >&2
    exit 7
    ;;
  probe-failure)
    printf '%s\n' 'ERROR: db-contract-gate: postflight-failed rpc-contract' >&2
    exit 8
    ;;
esac
`,
  );
  await chmod(executable, 0o755);
  return executable;
}

async function applyFixture(mode) {
  const root = await fixture();
  const psql = await fakePsql(root);
  const capture = path.join(root, "captured.sql");
  const result = spawnSync(
    process.execPath,
    [
      runner,
      "apply",
      "--repo-root",
      root,
      "--psql-bin",
      psql,
      "--database-url-env",
      "TEST_DATABASE_URL",
      "--app-commit",
      "1234567890123456789012345678901234567890",
    ],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        TEST_DATABASE_URL: "postgresql://user:topsecret@127.0.0.1/example?sslmode=disable",
        FAKE_PSQL_CAPTURE: capture,
        FAKE_PSQL_MODE: mode,
      },
    },
  );
  return { root, capture, result };
}

test("prints the exact expected DB contract without requiring database credentials", async () => {
  const root = await fixture();
  const result = spawnSync(
    process.execPath,
    [runner, "expected", "--repo-root", root],
    { encoding: "utf8" },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), "fixture-123 123");
});

test("validates every immutable contract file without database access", async () => {
  const root = await fixture();
  const result = spawnSync(
    process.execPath,
    [runner, "validate", "--repo-root", root, "--psql-bin", "/definitely/not/psql"],
    { encoding: "utf8" },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), "db-contract-gate: valid fixture-123");
});

test("the repository contract enables only the complete coordinated migration 126", () => {
  const result = spawnSync(
    process.execPath,
    [
      runner,
      "rollout-status",
      "--repo-root",
      repoRoot,
    ],
    { encoding: "utf8" },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), "enabled 126 232");
});

test("applies a missing migration and its ledger row in one transaction", async () => {
  const { capture, result } = await applyFixture("success");

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /applied 123/);
  const sql = await readFile(capture, "utf8");
  assert.match(sql, /CREATE TABLE public\.example/);
  assert.match(sql, /INSERT INTO public\.app_db_contract_migrations/);
  assert.match(sql, /4ca8062c736bfc8751ad45c942e97993340a5bbcd7e6631ed1182625ebc3b570/);
  assert.doesNotMatch(sql, /BEGIN;\s*BEGIN;/);
  assert.match(sql, /COMMIT;\s*\\echo db-contract-gate: applied 123/);
});

test("accepts an already-applied no-op after validating the exact checksum", async () => {
  const { capture, result } = await applyFixture("noop");

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /no-op 123/);
  const sql = await readFile(capture, "utf8");
  assert.match(sql, /migration checksum drift/);
  assert.match(sql, /apply_migration_123/);
});

test("fails closed on migration failure without exposing the database URL", async () => {
  const { result } = await applyFixture("migration-failure");

  assert.equal(result.status, 7);
  assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /topsecret|leaked/);
  assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /postgresql:\/\//);
  assert.match(result.stderr, /\[redacted-db-url\]/);
});

test("fails closed when the post-migration contract probe fails", async () => {
  const { result } = await applyFixture("probe-failure");

  assert.equal(result.status, 8);
  assert.match(result.stderr, /postflight-failed/);
  assert.doesNotMatch(result.stdout, /compatible fixture-123/);
});

test("a failed attempt can be recovered by rerunning the same immutable contract", async () => {
  const failed = await applyFixture("migration-failure");
  assert.equal(failed.result.status, 7);

  const recovered = await applyFixture("success");
  assert.equal(recovered.result.status, 0, recovered.result.stderr);
  assert.match(recovered.result.stdout, /compatible fixture-123/);
});
