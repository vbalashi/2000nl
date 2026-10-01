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
test("Library POS/article filters before tiers/pages and keeps whole articles", { skip: !target }, () => {
  const url = new URL(target);
  assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(url.hostname));
  const name = `library_filters_test_${randomUUID().replaceAll("-", "")}`;
  psql(target, `CREATE DATABASE ${name};`);
  url.pathname = `/${name}`;
  try {
    psql(url.href, [
      "db/scripts/plain_postgres_supabase_compat.sql",
      "db/migrations/bootstrap.sql",
      "db/migrations/185_library_material_lookup.sql",
      "db/migrations/185_library_material_lookup.sql",
      "db/migrations/186_library_entry_filters.sql",
      "db/migrations/186_library_entry_filters.sql",
      "db/scripts/library_material_lookup.integration.sql",
      "db/scripts/library_entry_filters.integration.sql",
      "db/deploy-contract/read-only-postflight-186.sql",
    ].map(file => `\\i ${file}`).join("\n"));
  } finally {
    psql(target, `DROP DATABASE ${name} WITH (FORCE);`);
  }
});
