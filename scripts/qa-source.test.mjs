import assert from "node:assert/strict";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const script = path.resolve(import.meta.dirname, "qa-source.mjs");
const serverCheckScript = path.resolve(import.meta.dirname, "check-qa-server.mjs");

function git(cwd, args) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function createFixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), "2000nl-qa-source-"));
  const remote = path.join(root, "remote.git");
  const repo = path.join(root, "repo");
  git(root, ["init", "--bare", remote]);
  git(root, ["init", repo]);
  git(repo, ["config", "user.email", "qa@example.test"]);
  git(repo, ["config", "user.name", "QA"]);
  git(repo, ["branch", "-M", "main"]);
  writeFileSync(path.join(repo, "README.md"), "qa source fixture\n");
  git(repo, ["add", "README.md"]);
  git(repo, ["commit", "-m", "fixture"]);
  git(repo, ["remote", "add", "origin", remote]);
  git(repo, ["push", "-u", "origin", "main"]);
  return { root, repo, commit: git(repo, ["rev-parse", "HEAD"]) };
}

function run(args) {
  return spawnSync(process.execPath, [script, ...args], {
    encoding: "utf8",
  });
}

async function withHealthServer(payload, callback) {
  const server = createServer((request, response) => {
    if (request.url !== "/api/health?deep=1") {
      response.statusCode = 404;
      response.end();
      return;
    }
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify(payload));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  try {
    await callback(address.port);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
}

function runServerCheck(args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [serverCheckScript, ...args], {
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf8",
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (status) => resolve({ status, stdout, stderr }));
  });
}

function healthyLocalQaPayload({
  commit,
  checkoutPath = "/tmp/2000nl-preview",
  dirty = false,
  workRef = "247",
} = {}) {
  return {
    commit,
    status: "ok",
    database: { target: "local" },
    checks: {
      platformRpcContract: { status: "ok" },
      dictionarySearchIndex: { status: "ok" },
      databaseContract: { status: "ok", details: { compatible: true } },
    },
    qaSource: { mode: "preview", workRef, commit, checkoutPath, dirty },
  };
}

test("accepts an explicitly identified preview checkout", () => {
  const fixture = createFixture();
  try {
    const result = run([
      "verify",
      "--repo-root",
      fixture.repo,
      "--mode",
      "preview",
      "--work-ref",
      "247",
      "--expected-commit",
      fixture.commit,
      "--no-fetch",
    ]);
    assert.equal(result.status, 0, result.stderr);
    const source = JSON.parse(result.stdout);
    assert.deepEqual(
      {
        mode: source.mode,
        workRef: source.workRef,
        commit: source.commit,
        dirty: source.dirty,
        originMain: source.originMain,
      },
      {
        mode: "preview",
        workRef: "247",
        commit: fixture.commit,
        dirty: false,
        originMain: fixture.commit,
      },
    );
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("accepts a clean canonical main checkout after origin verification", () => {
  const fixture = createFixture();
  try {
    const result = run([
      "verify",
      "--repo-root",
      fixture.repo,
      "--mode",
      "canonical",
    ]);
    assert.equal(result.status, 0, result.stderr);
    const source = JSON.parse(result.stdout);
    assert.equal(source.mode, "canonical");
    assert.equal(source.workRef, "canonical-main");
    assert.equal(source.commit, fixture.commit);
    assert.equal(source.originMain, fixture.commit);
    assert.equal(source.dirty, false);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("refuses a preview when the expected full commit is stale", () => {
  const fixture = createFixture();
  try {
    const result = run([
      "verify",
      "--repo-root",
      fixture.repo,
      "--mode",
      "preview",
      "--work-ref",
      "247",
      "--expected-commit",
      "0".repeat(40),
      "--no-fetch",
    ]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Git command failed|Preview commit mismatch/);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("refuses canonical startup from a dirty checkout", () => {
  const fixture = createFixture();
  try {
    writeFileSync(path.join(fixture.repo, "untracked.txt"), "preserve me\n");
    const result = run([
      "verify",
      "--repo-root",
      fixture.repo,
      "--mode",
      "canonical",
      "--no-fetch",
    ]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /clean checkout/);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("reuses only an existing server with matching source evidence", async () => {
  const commit = "a".repeat(40);
  const checkoutPath = "/tmp/2000nl-preview";
  const payload = healthyLocalQaPayload({ commit, checkoutPath });
  await withHealthServer(payload, async (port) => {
    const result = await runServerCheck([
      "--port",
      String(port),
      "--mode",
      "preview",
      "--work-ref",
      "247",
      "--expected-commit",
      commit,
      "--expected-checkout-path",
      checkoutPath,
      "--expected-dirty",
      "false",
    ]);
    assert.equal(result.status, 0, result.stderr);

    const mismatch = await runServerCheck([
      "--port",
      String(port),
      "--mode",
      "preview",
      "--work-ref",
      "339",
      "--expected-commit",
      commit,
      "--expected-checkout-path",
      checkoutPath,
      "--expected-dirty",
      "false",
    ]);
    assert.notEqual(mismatch.status, 0);
    assert.match(mismatch.stderr, /does not match requested/);
  });
});

test("refuses an unhealthy local server even when source fields match", async () => {
  const commit = "b".repeat(40);
  const checkoutPath = "/tmp/2000nl-preview";
  const payload = healthyLocalQaPayload({ commit, checkoutPath });
  payload.status = "warning";
  await withHealthServer(payload, async (port) => {
    const result = await runServerCheck([
      "--port",
      String(port),
      "--mode",
      "preview",
      "--work-ref",
      "247",
      "--expected-commit",
      commit,
      "--expected-checkout-path",
      checkoutPath,
      "--expected-dirty",
      "false",
    ]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /local deep-health contract/);
  });
});

test("refuses a healthy remote server even when source fields match", async () => {
  const commit = "d".repeat(40);
  const checkoutPath = "/tmp/2000nl-preview";
  const payload = healthyLocalQaPayload({ commit, checkoutPath });
  payload.database.target = "remote";
  await withHealthServer(payload, async (port) => {
    const result = await runServerCheck([
      "--port",
      String(port),
      "--mode",
      "preview",
      "--work-ref",
      "247",
      "--expected-commit",
      commit,
      "--expected-checkout-path",
      checkoutPath,
      "--expected-dirty",
      "false",
    ]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /local deep-health contract/);
  });
});

test("refuses a same-commit server from another checkout or dirty preview", async () => {
  const commit = "c".repeat(40);
  const checkoutPath = "/tmp/2000nl-requested";
  await withHealthServer(
    healthyLocalQaPayload({ commit, checkoutPath: "/tmp/2000nl-other" }),
    async (port) => {
      const otherCheckout = await runServerCheck([
        "--port",
        String(port),
        "--mode",
        "preview",
        "--work-ref",
        "247",
        "--expected-commit",
        commit,
        "--expected-checkout-path",
        checkoutPath,
        "--expected-dirty",
        "false",
      ]);
      assert.notEqual(otherCheckout.status, 0);
      assert.match(otherCheckout.stderr, /does not match requested/);
    },
  );
  await withHealthServer(healthyLocalQaPayload({ commit, checkoutPath, dirty: true }), async (port) => {
    const dirtyPreview = await runServerCheck([
      "--port",
      String(port),
      "--mode",
      "preview",
      "--work-ref",
      "247",
      "--expected-commit",
      commit,
      "--expected-checkout-path",
      checkoutPath,
      "--expected-dirty",
      "true",
    ]);
    assert.notEqual(dirtyPreview.status, 0);
    assert.match(dirtyPreview.stderr, /dirty preview/);
  });
});
