import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import http from "node:http";
import path from "node:path";
import test from "node:test";

const script = path.resolve(import.meta.dirname, "verify-deploy-health.mjs");
const commit = "1234567890123456789012345678901234567890";

function run(url) {
  return new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      [script, "--url", url, "--expected-commit", commit, "--attempts", "1", "--interval-ms", "0"],
      { encoding: "utf8" },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (status) => resolve({ status, stdout, stderr }));
  });
}

async function server(payload) {
  const instance = http.createServer((_request, response) => {
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify(payload));
  });
  await new Promise((resolve) => instance.listen(0, "127.0.0.1", resolve));
  const address = instance.address();
  return {
    instance,
    url: `http://127.0.0.1:${address.port}/api/health?deep=1`,
  };
}

test("accepts only the exact app commit and DB contract", async () => {
  const target = await server({
    status: "ok",
    commit,
    checks: {
      databaseContract: {
        status: "ok",
        details: {
          expected: "2000nl-db-126",
          actual: "2000nl-db-126",
          expectedMigration: 126,
          actualMigration: 126,
          compatible: true,
        },
      },
    },
  });
  try {
    const result = await run(target.url);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /compatible/);
  } finally {
    target.instance.close();
  }
});

test("fails closed when health advertises a stale DB contract", async () => {
  const target = await server({
    status: "warning",
    commit,
    checks: {
      databaseContract: {
        status: "warning",
        details: {
          expected: "2000nl-db-126",
          actual: "2000nl-db-125",
          expectedMigration: 126,
          actualMigration: 125,
          compatible: false,
        },
      },
    },
  });
  try {
    const result = await run(target.url);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /incompatible response/);
  } finally {
    target.instance.close();
  }
});
