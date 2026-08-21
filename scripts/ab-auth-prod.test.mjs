import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const repoRoot = path.resolve(import.meta.dirname, "..");

test("production wrapper rejects a caller-supplied URL before minting", () => {
  const result = spawnSync("bash", ["scripts/ab-auth-prod.sh", "--url", "https://attacker.example/"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Unknown arg: --url/);
});

test("browser launcher receives no Supabase, database, or provider secrets", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "qa-browser-env-test-"));
  const fake = path.join(directory, "agent-browser");
  fs.writeFileSync(fake, "#!/usr/bin/env bash\nenv | sort\n", { mode: 0o700 });
  const result = spawnSync("bash", ["scripts/lib/run-sanitized-agent-browser.sh", "--version"], {
    cwd: repoRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${directory}:${process.env.PATH}`,
      SUPABASE_SERVICE_ROLE_KEY: "must-not-cross",
      NEXT_PUBLIC_SUPABASE_URL: "must-not-cross",
      DATABASE_URL: "must-not-cross",
      OPENAI_API_KEY: "must-not-cross",
    },
  });
  assert.equal(result.status, 0);
  assert.doesNotMatch(result.stdout, /SUPABASE|DATABASE_URL|OPENAI_API_KEY|must-not-cross/);
});

test("wrapper fails truthfully and retains protected artifacts when revocation fails", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "qa-auth-cleanup-test-"));
  const bin = path.join(directory, "bin");
  fs.mkdirSync(bin);
  fs.writeFileSync(
    path.join(bin, "agent-browser"),
    "#!/usr/bin/env bash\nif [[ \"$*\" == *\"eval --stdin\"* ]]; then cat >/dev/null; fi\nexit 0\n",
    { mode: 0o700 },
  );
  fs.writeFileSync(
    path.join(bin, "npx"),
    `#!/usr/bin/env bash
set -e
if [[ "$*" == *"mint-prod-qa-session.ts"* ]]; then
  mkdir -p "$QA_SESSION_OUTPUT_DIR"
  printf '%s' '{"session":{"access_token":"fixture"}}' > "$QA_SESSION_OUTPUT_DIR/prod-session.json"
  printf '%s' 'e30=' > "$QA_SESSION_OUTPUT_DIR/prod-session.b64"
  exit 0
fi
if [[ "$*" == *"revoke-prod-qa-session.ts"* && "${"$"}QA_FAKE_REVOKE_FAIL" == "1" ]]; then
  exit 9
fi
exit 0
`,
    { mode: 0o700 },
  );
  const envFile = path.join(directory, "fixture.env");
  fs.writeFileSync(envFile, "QA_FAKE_REVOKE_FAIL=1\n", { mode: 0o600 });

  const result = spawnSync(
    "bash",
    ["scripts/ab-auth-prod.sh", "--env-file", envFile, "--session", "qa-cleanup-fixture"],
    {
      cwd: repoRoot,
      encoding: "utf8",
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
    },
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /revocation failed.*artifacts retained/i);
  const recoveryDirectory = result.stderr.match(/retained at ([^\s.]+(?:\.[^\s.]+)*)/)?.[1];
  assert.ok(recoveryDirectory && fs.existsSync(recoveryDirectory));
  assert.deepEqual(fs.readdirSync(recoveryDirectory).sort(), ["prod-session.b64", "prod-session.json"]);
  fs.rmSync(recoveryDirectory, { recursive: true, force: true });
});

test("wrapper kills a TERM-ignoring revoker within the cleanup deadline", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "qa-auth-timeout-test-"));
  const bin = path.join(directory, "bin");
  fs.mkdirSync(bin);
  fs.writeFileSync(
    path.join(bin, "agent-browser"),
    "#!/usr/bin/env bash\nif [[ \"$*\" == *\"eval --stdin\"* ]]; then cat >/dev/null; fi\nexit 0\n",
    { mode: 0o700 },
  );
  fs.writeFileSync(
    path.join(bin, "npx"),
    `#!/usr/bin/env bash
set -e
if [[ "$*" == *"mint-prod-qa-session.ts"* ]]; then
  mkdir -p "$QA_SESSION_OUTPUT_DIR"
  printf '%s' '{"session":{"access_token":"fixture"}}' > "$QA_SESSION_OUTPUT_DIR/prod-session.json"
  printf '%s' 'e30=' > "$QA_SESSION_OUTPUT_DIR/prod-session.b64"
  exit 0
fi
if [[ "$*" == *"revoke-prod-qa-session.ts"* ]]; then
  trap '' TERM
  while true; do sleep 1; done
fi
`,
    { mode: 0o700 },
  );
  const envFile = path.join(directory, "fixture.env");
  fs.writeFileSync(envFile, "QA_FIXTURE=1\n", { mode: 0o600 });
  const started = Date.now();
  const result = spawnSync(
    "bash",
    ["scripts/ab-auth-prod.sh", "--env-file", envFile, "--session", "qa-timeout-fixture"],
    {
      cwd: repoRoot,
      encoding: "utf8",
      timeout: 15_000,
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
    },
  );
  const elapsed = Date.now() - started;
  assert.equal(result.status, 1);
  assert.ok(elapsed < 12_000, `cleanup took ${elapsed}ms`);
  assert.match(result.stderr, /revocation failed.*artifacts retained/i);
  const recoveryDirectory = result.stderr.match(/retained at ([^\s.]+(?:\.[^\s.]+)*)/)?.[1];
  assert.ok(recoveryDirectory && fs.existsSync(recoveryDirectory));
  fs.rmSync(recoveryDirectory, { recursive: true, force: true });
});

test("revoker fails closed for existing tokenless or unconfigured recovery artifacts", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "qa-revoker-input-test-"));
  const tokenless = path.join(directory, "tokenless.json");
  const configured = path.join(directory, "configured.json");
  fs.writeFileSync(tokenless, '{"session":{}}', { mode: 0o600 });
  fs.writeFileSync(configured, '{"session":{"access_token":"fixture"}}', { mode: 0o600 });
  const run = (sessionPath) =>
    spawnSync("npx", ["vite-node", "scripts/revoke-prod-qa-session.ts"], {
      cwd: path.join(repoRoot, "apps/ui"),
      encoding: "utf8",
      timeout: 10_000,
      env: { PATH: process.env.PATH, HOME: process.env.HOME, QA_SESSION_JSON_PATH: sessionPath },
    });
  const tokenlessResult = run(tokenless);
  const unconfiguredResult = run(configured);
  assert.notEqual(tokenlessResult.status, 0);
  assert.match(tokenlessResult.stderr, /no access token/i);
  assert.notEqual(unconfiguredResult.status, 0);
  assert.match(unconfiguredResult.stderr, /configuration is missing/i);
  assert.ok(fs.existsSync(tokenless));
  assert.ok(fs.existsSync(configured));
});
