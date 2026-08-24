import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const script = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "scheduler_dictionary_access_benchmark.mjs",
);

const run = (connectionString) => {
  const env = { ...process.env };
  if (connectionString === undefined) {
    delete env.ISSUE_232_BENCHMARK_DB_URL;
  } else {
    env.ISSUE_232_BENCHMARK_DB_URL = connectionString;
  }
  return spawnSync(process.execPath, [script], { encoding: "utf8", env });
};

test("requires an explicit benchmark database", () => {
  const result = run(undefined);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /ISSUE_232_BENCHMARK_DB_URL is required/);
});

test("refuses non-loopback database targets", () => {
  const result = run("postgresql://postgres:postgres@db.example.com/issue232_benchmark");
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /only accepts a loopback issue232 database/);
});

test("refuses loopback databases outside the issue scope", () => {
  const result = run("postgresql://postgres:postgres@127.0.0.1:54322/postgres");
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /only accepts a loopback issue232 database/);
});
