import assert from "node:assert/strict";
import { chmod, mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const repoRoot = path.resolve(import.meta.dirname, "../..");
const runner = path.join(repoRoot, "db/scripts/deploy_db_contract.mjs");
const pinnedPsqlImage =
  "postgres@sha256:ef257d85f76e48da1c64832459b59fcaba1a4dac97bf5d7450c77753542eee94";

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
    path.join(root, "db/deploy-contract/pre-switch-read-probe-123.sql"),
    "SELECT 'fixture-pre-switch-read-probe';\n",
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
      preSwitchReadProbe: {
        file: "db/deploy-contract/pre-switch-read-probe-123.sql",
        sha256: "1acff5a07e0e0f1fde97875d4e4bd0ce847b05cbdfd51a555de0ce74fd3a0202",
        statementTimeoutMs: 50,
      },
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

async function fakeContainerRuntime(root, mode = "success") {
  const executable = path.join(root, "fake-docker.sh");
  await writeFile(
    executable,
    `#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$@" >> "$FAKE_CONTAINER_CAPTURE"
printf '%s\n' '-- invocation --' >> "$FAKE_CONTAINER_CAPTURE"
case "${mode}" in
  success)
    if [[ " $* " == *" psql --version "* ]]; then
      if [[ "\${FAKE_ASSERT_DB_ENV_ABSENT:-0}" == "1" ]] &&
         [[ -n "\${SUPABASE_DB_URL:-}\${DATABASE_URL:-}\${TEST_DATABASE_URL:-}\${PGPASSWORD:-}" ]]; then
        printf '%s\n' 'preflight inherited database configuration' >&2
        exit 12
      fi
      printf '%s\n' 'psql (PostgreSQL) 17.6'
    else
      cat >/dev/null
      printf '%s\n' 'db-contract-gate: applied 123' 'db-contract-gate: compatible fixture-123'
    fi
    ;;
  unusable)
    printf '%s\n' 'runtime failed postgresql://user:leaked@db.invalid/prod' >&2
    exit 9
    ;;
  wrong-version)
    printf '%s\n' 'psql (PostgreSQL) 16.10'
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

test("rejects a pre-switch read probe above the rollout budget", async () => {
  const root = await fixture();
  const manifestPath = path.join(root, "packages/shared/deployment/db-contract.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.preSwitchReadProbe.statementTimeoutMs = 2_001;
  await writeFile(manifestPath, JSON.stringify(manifest));

  const result = spawnSync(
    process.execPath,
    [runner, "validate", "--repo-root", root, "--psql-bin", "/definitely/not/psql"],
    { encoding: "utf8" },
  );

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Invalid pre-switch read probe contract/);
});

test("client preflight fails before database URL lookup when runtime is missing", async () => {
  const root = await fixture();
  const result = spawnSync(
    process.execPath,
    [
      runner,
      "client-preflight",
      "--repo-root",
      root,
      "--psql-container-image",
      pinnedPsqlImage,
      "--container-runtime-bin",
      "/definitely/not/docker",
      "--database-url-env",
      "DEFINITELY_MISSING_DATABASE_URL",
    ],
    { encoding: "utf8" },
  );

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /client runtime unavailable/i);
  assert.doesNotMatch(result.stderr, /DEFINITELY_MISSING_DATABASE_URL|database URL/i);
});

test("client preflight rejects an unusable or wrong-major container without leaking output", async () => {
  const root = await fixture();
  const capture = path.join(root, "container-args.txt");
  const unusableRuntime = await fakeContainerRuntime(root, "unusable");
  const unusable = spawnSync(
    process.execPath,
    [
      runner,
      "client-preflight",
      "--repo-root",
      root,
      "--psql-container-image",
      pinnedPsqlImage,
      "--container-runtime-bin",
      unusableRuntime,
    ],
    { encoding: "utf8", env: { ...process.env, FAKE_CONTAINER_CAPTURE: capture } },
  );
  assert.equal(unusable.status, 9);
  assert.match(unusable.stderr, /client unusable/i);
  assert.doesNotMatch(unusable.stderr, /postgresql:\/\/|leaked/);

  const wrongRuntime = await fakeContainerRuntime(root, "wrong-version");
  const wrong = spawnSync(
    process.execPath,
    [
      runner,
      "client-preflight",
      "--repo-root",
      root,
      "--psql-container-image",
      pinnedPsqlImage,
      "--container-runtime-bin",
      wrongRuntime,
    ],
    { encoding: "utf8", env: { ...process.env, FAKE_CONTAINER_CAPTURE: capture } },
  );
  assert.notEqual(wrong.status, 0);
  assert.match(wrong.stderr, /requires PostgreSQL client major 17/i);
});

test("container client requires a digest and forwards DB settings by name, never value", async () => {
  const root = await fixture();
  const capture = path.join(root, "container-args.txt");
  const runtime = await fakeContainerRuntime(root);
  const unpinned = spawnSync(
    process.execPath,
    [
      runner,
      "client-preflight",
      "--repo-root",
      root,
      "--psql-container-image",
      "postgres:17.6-alpine",
      "--container-runtime-bin",
      runtime,
    ],
    { encoding: "utf8", env: { ...process.env, FAKE_CONTAINER_CAPTURE: capture } },
  );
  assert.notEqual(unpinned.status, 0);
  assert.match(unpinned.stderr, /digest-pinned/i);

  const applied = spawnSync(
    process.execPath,
    [
      runner,
      "apply",
      "--repo-root",
      root,
      "--psql-container-image",
      pinnedPsqlImage,
      "--container-runtime-bin",
      runtime,
      "--database-url-env",
      "TEST_DATABASE_URL",
      "--app-commit",
      "1234567890123456789012345678901234567890",
    ],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        TEST_DATABASE_URL: "postgresql://user:topsecret@db.example/prod",
        SUPABASE_DB_URL: "postgresql://should:not-leak@db.invalid/prod",
        FAKE_CONTAINER_CAPTURE: capture,
        FAKE_ASSERT_DB_ENV_ABSENT: "1",
      },
    },
  );

  assert.equal(applied.status, 0, applied.stderr);
  const args = await readFile(capture, "utf8");
  assert.match(args, /--network\nnone[\s\S]*psql\n--version/);
  assert.match(args, /--env\nPGPASSWORD/);
  assert.match(args, /--env\nPGSSLMODE/);
  assert.match(args, new RegExp(`${pinnedPsqlImage.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\npsql`));
  assert.doesNotMatch(args, /topsecret|postgresql:\/\/|db\.example/);
});

test("the repository contract enables the issue 238 scheduler contract", () => {
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
  assert.equal(result.stdout.trim(), "enabled 127 238");
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

test("runs the exact bounded read-only probe after migrations and before compatibility", async () => {
  const { capture, result } = await applyFixture("success");

  assert.equal(result.status, 0, result.stderr);
  const sql = await readFile(capture, "utf8");
  const migrationCommit = sql.indexOf("db-contract-gate: applied 123");
  const postflight = sql.indexOf("-- Exact RPC, grant, index/plan, and application compatibility contract.");
  const readOnlyProbe = sql.indexOf("BEGIN READ ONLY", postflight);
  const probeBody = sql.indexOf("fixture-pre-switch-read-probe");
  const compatible = sql.indexOf("db-contract-gate: compatible fixture-123");

  assert.ok(migrationCommit > 0);
  assert.ok(postflight > migrationCommit);
  assert.ok(readOnlyProbe > postflight);
  assert.ok(probeBody > readOnlyProbe);
  assert.ok(compatible > probeBody);
  assert.match(sql, /SET LOCAL statement_timeout = '50ms'/);
  assert.match(sql, /db-contract-gate: pre-switch-read-probe passed/);
});

test("accepts an already-applied no-op after validating the exact checksum", async () => {
  const { capture, result } = await applyFixture("noop");

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /no-op 123/);
  const sql = await readFile(capture, "utf8");
  assert.match(sql, /migration checksum drift/);
  assert.match(sql, /apply_migration_123/);
  assert.match(sql, /BEGIN READ ONLY;[\s\S]*fixture-pre-switch-read-probe/);
  assert.match(sql, /db-contract-gate: pre-switch-read-probe passed/);
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
