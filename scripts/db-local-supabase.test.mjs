import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const localUrl = "postgresql://postgres:fixture-secret@127.0.0.1:54322/postgres";

function fixture(t, failTool = "", sleepTool = "") {
  const dir = mkdtempSync(path.join(os.tmpdir(), "2000nl-local-wrapper-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const log = path.join(dir, "calls");
  for (const tool of ["psql", "supabase", "docker", "npm", "createdb", "dropdb", "python"]) {
    const file = path.join(dir, tool);
    writeFileSync(file, `#!/bin/bash
printf '%s %s PGOPTIONS=%s PGHOSTADDR=%s PGSERVICE=%s FSRS_TEST_DB_URL=%s INGESTION_TEST_DATABASE_URL=%s\\n' '${tool}' "$*" "$PGOPTIONS" "$PGHOSTADDR" "$PGSERVICE" "$FSRS_TEST_DB_URL" "$INGESTION_TEST_DATABASE_URL" >> "$QA_CALL_LOG"
if [[ "$QA_SLEEP_TOOL" == '${tool}' ]]; then exec sleep 30; fi
if [[ "$QA_FAIL_TOOL" == '${tool}' ]]; then exit 37; fi
if [[ '${tool}' == psql && "$*" != *'-f '* ]]; then cat >> "$QA_CALL_LOG"; fi
`);
    chmodSync(file, 0o755);
  }
  const environment = (target) => ({ ...process.env, PATH: `${dir}:${process.env.PATH}`,
    QA_CALL_LOG: log, QA_FAIL_TOOL: failTool, QA_SLEEP_TOOL: sleepTool,
    LOCAL_SUPABASE_DB_URL: target, PYTHON: path.join(dir, "python"),
    PGHOSTADDR: "203.0.113.1", PGSERVICE: "remote-fixture", PGPORT: "64321" });
  const command = (args) => [path.join(root, "scripts/db-local-supabase.sh"), ...args];
  return {
    run: (args, target = localUrl) => spawnSync("bash", command(args), {
      cwd: root, encoding: "utf8", timeout: 10_000, env: environment(target),
    }),
    runAsync: (args, target = localUrl) => spawn("bash", command(args), {
      cwd: root, stdio: "ignore", env: environment(target),
    }),
    calls: () => existsSync(log) ? readFileSync(log, "utf8") : "",
  };
}

async function waitForCall(fixtureState, pattern) {
  const deadline = Date.now() + 3_000;
  while (Date.now() < deadline) {
    if (pattern.test(fixtureState.calls())) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.fail(`Timed out waiting for ${pattern}`);
}

for (const args of [["all"], ["reset"], ["all", "some-data"],
  ["all", "--confirm-reset", "--typo"], ["reset", "--confirm-reset", "extra"]]) {
  test(`rejects unsafe rebuild invocation ${args.join(" ")} before side effects`, (t) => {
    const f = fixture(t);
    assert.notEqual(f.run(args).status, 0);
    assert.equal(f.calls(), "");
  });
}

for (const target of [
  "postgresql://postgres:fixture-secret@production.example/postgres",
  localUrl.replace(":54322", ""),
  `${localUrl}?host=production.example`, `${localUrl}?hostaddr=10.1.2.3`,
  `${localUrl}?service=other`, `${localUrl}#fragment`, "not-a-url-fixture-secret",
]) {
  test(`rejects nonlocal or ambiguous target ${target.replaceAll("fixture-secret", "***")}`, (t) => {
    const f = fixture(t);
    const result = f.run(["check"], target);
    assert.notEqual(result.status, 0);
    assert.equal(f.calls(), "");
    assert.doesNotMatch(result.stderr, /fixture-secret/);
  });
}

test("confirmed reset cannot target a different DB than the canonical Supabase reset", (t) => {
  const f = fixture(t);
  for (const target of [localUrl.replace("54322", "5432"), localUrl.replace(/\/postgres$/, "/other")]) {
    assert.notEqual(f.run(["reset", "--confirm-reset"], target).status, 0);
  }
  assert.equal(f.calls(), "");
});

test("confirmed reset preserves the intentional rebuild command", (t) => {
  const f = fixture(t);
  const result = f.run(["reset", "--confirm-reset"]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(f.calls(), /supabase db reset/);
  assert.match(f.calls(), /psql .*bootstrap.sql/);
});

test("confirmed all uses disposable test databases and the small QA fixture", (t) => {
  const f = fixture(t);
  const result = f.run(["all", "--confirm-reset"]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(f.calls(), /supabase start/);
  assert.match(f.calls(), /supabase db reset/);
  assert.match(f.calls(), /createdb .*2000nl_fsrs_/);
  assert.match(f.calls(), /npm test/);
  assert.match(f.calls(), /dropdb .*2000nl_fsrs_/);
  assert.match(f.calls(), /createdb .*2000nl_ingestion_/);
  assert.match(f.calls(), /pytest/);
  assert.match(f.calls(), /dropdb .*2000nl_ingestion_/);
  assert.match(f.calls(), /search_multisource\.sql/);
  assert.match(f.calls(), /training_smoke\.sql/);
});

test("FSRS tests never target the canonical app database", (t) => {
  const f = fixture(t);
  const result = f.run(["test-fsrs"]);
  assert.equal(result.status, 0, result.stderr);
  const calls = f.calls();
  assert.match(calls, /createdb .*2000nl_fsrs_/);
  assert.match(calls, /FSRS_TEST_DB_URL=/);
  assert.match(calls, /dropdb .*2000nl_fsrs_/);
  assert.doesNotMatch(calls, new RegExp(`FSRS_TEST_DB_URL=${localUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
});

test("disposable database URLs preserve accepted connection options", (t) => {
  const f = fixture(t);
  const target = `${localUrl}?sslmode=disable`;
  const result = f.run(["test-fsrs"], target);
  assert.equal(result.status, 0, result.stderr);
  assert.match(
    f.calls(),
    /FSRS_TEST_DB_URL=.*\/2000nl_fsrs_.*\?sslmode=disable/,
  );
});

test("a failed ingestion suite still removes its disposable database", (t) => {
  const f = fixture(t, "python");
  const result = f.run(["test-ingestion"]);
  assert.equal(result.status, 37, result.stderr);
  const calls = f.calls();
  assert.match(calls, /createdb .*2000nl_ingestion_/);
  assert.match(calls, /python .*pytest/);
  assert.match(calls, /dropdb .*2000nl_ingestion_/);
});

test("a failed ingestion bootstrap skips pytest and still cleans up", (t) => {
  const f = fixture(t, "psql");
  const result = f.run(["test-ingestion"]);
  assert.equal(result.status, 37, result.stderr);
  const calls = f.calls();
  assert.match(calls, /createdb .*2000nl_ingestion_/);
  assert.doesNotMatch(calls, /python .*pytest/);
  assert.match(calls, /dropdb .*2000nl_ingestion_/);
});

test("SIGTERM stops the owned test process and removes its database", async (t) => {
  const f = fixture(t, "", "python");
  const child = f.runAsync(["test-ingestion"]);
  await waitForCall(f, /python .*pytest/);
  child.kill("SIGTERM");
  const exitCode = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", resolve);
  });
  assert.equal(exitCode, 143);
  assert.match(f.calls(), /dropdb --force .*2000nl_ingestion_/);
});

test("SIGINT promptly stops an interrupt-ignoring test and cleans up", async (t) => {
  const f = fixture(t, "", "python");
  const child = f.runAsync(["test-ingestion"]);
  await waitForCall(f, /python .*pytest/);
  child.kill("SIGINT");
  const exitCode = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", resolve);
  });
  assert.equal(exitCode, 130);
  assert.match(f.calls(), /dropdb --force .*2000nl_ingestion_/);
});

test("check invokes only a read-only psql session and reports receipts separately from version", (t) => {
  const f = fixture(t);
  const result = f.run(["check"]);
  assert.equal(result.status, 0, result.stderr);
  const calls = f.calls();
  assert.doesNotMatch(calls, /supabase |npm |docker |bootstrap.sql|INSERT INTO/i);
  assert.match(calls, /default_transaction_read_only=on/);
  assert.doesNotMatch(calls, /203\.0\.113\.1|remote-fixture/);
  assert.match(calls, /learner_card_states/);
  assert.match(calls, /actual.checksum_sha256 <> expected.checksum_sha256/);
  assert.match(calls, /local_supabase_probe.sql/);
  assert.match(calls, /postflight-\d+.sql/);
});
