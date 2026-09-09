import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const localUrl = "postgresql://postgres:fixture-secret@127.0.0.1:54322/postgres";

function fixture(t) {
  const dir = mkdtempSync(path.join(os.tmpdir(), "2000nl-local-wrapper-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const log = path.join(dir, "calls");
  for (const tool of ["psql", "supabase", "docker", "npm"]) {
    const file = path.join(dir, tool);
    writeFileSync(file, `#!/bin/bash
printf '%s %s PGOPTIONS=%s PGHOSTADDR=%s PGSERVICE=%s\\n' '${tool}' "$*" "$PGOPTIONS" "$PGHOSTADDR" "$PGSERVICE" >> "$QA_CALL_LOG"
if [[ '${tool}' == psql && "$*" != *'-f '* ]]; then cat >> "$QA_CALL_LOG"; fi
`);
    chmodSync(file, 0o755);
  }
  return {
    run: (args, target = localUrl) => spawnSync("bash", [
      path.join(root, "scripts/db-local-supabase.sh"), ...args,
    ], {
      cwd: root, encoding: "utf8", timeout: 10_000,
      env: { ...process.env, PATH: `${dir}:${process.env.PATH}`,
        QA_CALL_LOG: log, LOCAL_SUPABASE_DB_URL: target,
        PGHOSTADDR: "203.0.113.1", PGSERVICE: "remote-fixture" },
    }),
    calls: () => existsSync(log) ? readFileSync(log, "utf8") : "",
  };
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

test("confirmed all strips acknowledgement before passing the optional data directory", (t) => {
  const f = fixture(t);
  const result = f.run(["all", "--confirm-reset", path.join(os.tmpdir(), "absent-2000nl-fixture-data")]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(f.calls(), /supabase start/);
  assert.match(f.calls(), /supabase db reset/);
  assert.match(f.calls(), /npm test/);
  assert.match(result.stdout, /Skipping dictionary import/);
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
