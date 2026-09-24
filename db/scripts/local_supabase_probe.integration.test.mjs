import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";

const repoRoot = path.resolve(import.meta.dirname, "../..");
const databaseUrl = process.env.LOCAL_SUPABASE_PROBE_TEST_DATABASE_URL;

function validateTestDatabaseUrl(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("integration test requires a local contract_test database URL");
  }

  const isLocalHost = ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname);
  const isLocalPostgresPort = ["5432", "54322"].includes(parsed.port);
  const isDisposableDatabase = parsed.pathname === "/contract_test";
  if (
    !["postgres:", "postgresql:"].includes(parsed.protocol) ||
    !isLocalHost ||
    !isLocalPostgresPort ||
    !isDisposableDatabase ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error("integration test only permits a loopback contract_test database");
  }
  return value;
}

function runPsql(args, input) {
  return spawnSync("psql", ["-X", "-v", "ON_ERROR_STOP=1", ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    input,
  });
}

test("integration target validation permits only the disposable local database", () => {
  assert.doesNotThrow(() =>
    validateTestDatabaseUrl("postgresql://postgres:postgres@127.0.0.1:54322/contract_test"),
  );
  for (const unsafeUrl of [
    "postgresql://postgres:secret@db.example.com:5432/contract_test",
    "postgresql://postgres:secret@127.0.0.1:54322/postgres",
    "postgresql://postgres:secret@127.0.0.1:54322/contract_test?host=db.example.com",
  ]) {
    assert.throws(() => validateTestDatabaseUrl(unsafeUrl));
  }
});

test("local schema probe rejects a matching but NOT VALID ratio constraint", {
  skip: !databaseUrl,
}, () => {
  const safeDatabaseUrl = validateTestDatabaseUrl(databaseUrl);
  const probePath = path.join(repoRoot, "db/scripts/local_supabase_probe.sql");
  const baseline = runPsql([safeDatabaseUrl, "-f", probePath]);
  assert.equal(baseline.status, 0, "baseline probe must accept the migrated schema");

  const nonvalidatedSchema = runPsql([safeDatabaseUrl], `
BEGIN;
ALTER TABLE public.training_sessions
  DROP CONSTRAINT training_sessions_new_review_ratio_check;
ALTER TABLE public.training_sessions
  ADD CONSTRAINT training_sessions_new_review_ratio_check
  CHECK (new_review_ratio IS NULL OR (new_review_ratio >= 1 AND new_review_ratio <= 5))
  NOT VALID;
\\echo NOT_VALID_FIXTURE_READY
\\i ${probePath}
ROLLBACK;
`);

  assert.notEqual(nonvalidatedSchema.status, 0, "probe must reject the NOT VALID constraint");
  assert.match(nonvalidatedSchema.stdout, /NOT_VALID_FIXTURE_READY/);
  assert.match(
    nonvalidatedSchema.stderr,
    /missing or incompatible migration 156 training_sessions_new_review_ratio_check/,
  );

  const restoredState = runPsql(
    [safeDatabaseUrl, "-Atq", "-c", `
      SELECT convalidated
      FROM pg_constraint
      WHERE conrelid = 'public.training_sessions'::regclass
        AND conname = 'training_sessions_new_review_ratio_check'
    `],
  );
  assert.equal(restoredState.status, 0, "failed probe transaction must leave the schema intact");
  assert.equal(restoredState.stdout.trim(), "t");
});
