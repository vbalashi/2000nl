import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";

const repoRoot = path.resolve(import.meta.dirname, "../..");
const databaseUrl = process.env.DATABASE_URL;

function runPsql(args, input) {
  return spawnSync("psql", ["-X", "-v", "ON_ERROR_STOP=1", ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    input,
  });
}

test("local schema probe rejects a matching but NOT VALID ratio constraint", {
  skip: !databaseUrl,
}, () => {
  const probePath = path.join(repoRoot, "db/scripts/local_supabase_probe.sql");
  const baseline = runPsql([databaseUrl, "-f", probePath]);
  assert.equal(baseline.status, 0, "baseline probe must accept the migrated schema");

  const nonvalidatedSchema = runPsql([databaseUrl], `
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
    [databaseUrl, "-Atq", "-c", `
      SELECT convalidated
      FROM pg_constraint
      WHERE conrelid = 'public.training_sessions'::regclass
        AND conname = 'training_sessions_new_review_ratio_check'
    `],
  );
  assert.equal(restoredState.status, 0, "failed probe transaction must leave the schema intact");
  assert.equal(restoredState.stdout.trim(), "t");
});
