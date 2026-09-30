import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
const target = process.env.LOCAL_SUPABASE_DB_URL;
const root = path.resolve(import.meta.dirname, "../..");
function psql(url, input) {
  const result = spawnSync("psql", [url, "-X", "-v", "ON_ERROR_STOP=1", "-At"], {
    input, encoding: "utf8", cwd: root, timeout: 60000, env: { ...process.env, PGOPTIONS: "-c client_min_messages=warning" },
  });
  assert.equal(result.status, 0, result.stderr);
}
test("new starts obey current material; existing runs/receipts retain snapshots across all families", { skip: !target }, () => {
  const url = new URL(target);
  assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(url.hostname));
  const name = `material_snapshot_test_${randomUUID().replaceAll("-", "")}`;
  psql(target, `CREATE DATABASE ${name};`);
  url.pathname = `/${name}`;
  try {
    psql(url.href, [
      "db/scripts/plain_postgres_supabase_compat.sql",
      "db/migrations/bootstrap.sql",
      "db/migrations/184_training_material_selection_snapshot.sql",
      "db/migrations/184_training_material_selection_snapshot.sql",
      "db/scripts/training_material_selection_snapshot.integration.sql",
      "db/scripts/training_lexical_candidate_filters.integration.sql",
      "db/deploy-contract/read-only-postflight-184.sql",
    ].map(file => `\\i ${file}`).join("\n"));
  } finally {
    psql(target, `DROP DATABASE ${name} WITH (FORCE);`);
  }
});
