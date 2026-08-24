import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import vm from "node:vm";
import {
  safeDiagnosticSvg,
  surfaceProbeExpression,
} from "./lib/wait-for-prod-qa-surface.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..");

const todayBrowser = `#!/usr/bin/env bash
if [[ "$*" == *"eval --stdin"* ]]; then cat >/dev/null; fi
if [[ "$*" == *"QA_SURFACE:TODAY"* ]]; then echo QA_SURFACE:TODAY; fi
exit 0
`;

function createWrapperFixture(prefix, { agentBrowser, npx, env = "QA_FIXTURE=1\n" }) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const bin = path.join(directory, "bin");
  const envFile = path.join(directory, "fixture.env");
  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, "agent-browser"), agentBrowser, { mode: 0o700 });
  fs.writeFileSync(path.join(bin, "npx"), npx, { mode: 0o700 });
  fs.writeFileSync(envFile, env, { mode: 0o600 });
  return {
    directory,
    run(session, options = {}) {
      return spawnSync(
        "bash",
        ["scripts/ab-auth-prod.sh", "--env-file", envFile, "--session", session],
        {
          cwd: repoRoot,
          encoding: "utf8",
          timeout: options.timeout ?? 5_000,
          env: {
            ...process.env,
            PATH: `${bin}:${process.env.PATH}`,
            ...options.env,
          },
        },
      );
    },
  };
}

test("production wrapper rejects a caller-supplied URL before minting", () => {
  const result = spawnSync("bash", ["scripts/ab-auth-prod.sh", "--url", "https://attacker.example/"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Unknown arg: --url/);
});

test("surface probe recognizes the approved uppercase Dutch Today label", () => {
  const marker = vm.runInNewContext(surfaceProbeExpression, {
    document: { body: { innerText: "TRAINING · VANDAAG" } },
    localStorage: {},
  });
  assert.equal(marker, "QA_SURFACE:TODAY");
});

test("surface probe does not treat a stale storage key as visible authentication", () => {
  const marker = vm.runInNewContext(surfaceProbeExpression, {
    Date,
    document: {
      body: { innerText: "Loading" },
      querySelector: () => null,
    },
    localStorage: {
      "sb-fixture-auth-token": "fixture",
      getItem: () => JSON.stringify({ access_token: "expired", expires_at: 1 }),
    },
  });
  assert.equal(marker, "QA_SURFACE:UNAUTHENTICATED");
});

test("diagnostic image contains only fixed safe classification and origin", () => {
  const svg = safeDiagnosticSvg("authenticated-without-today");
  assert.match(svg, /2000NL QA diagnostic/);
  assert.match(svg, /authenticated-without-today/);
  assert.match(svg, /https:\/\/2000\.dilum\.io\//);
  assert.doesNotMatch(svg, /localStorage|getItem|innerText|access_token/);
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

test("authenticated surface wait stays bounded when the browser command hangs", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "qa-auth-surface-hang-state-"));
  const calls = path.join(directory, "eval-calls");
  const fixture = createWrapperFixture("qa-auth-surface-hang-test-", {
    agentBrowser: `#!/usr/bin/env bash
set -e
if [[ "$*" == *" eval"* ]]; then
  [[ "$*" == *"eval --stdin"* ]] && cat >/dev/null
  count=0
  [[ -f "${calls}" ]] && count="$(cat "${calls}")"
  count=$((count + 1))
  printf '%s' "$count" > "${calls}"
  if [[ "$count" == "2" ]]; then
    trap 'exit 143' TERM
    sleep 3
  fi
fi
exit 0
`,
    npx: `#!/usr/bin/env bash
set -e
if [[ "$*" == *"mint-prod-qa-session.ts"* ]]; then
  mkdir -p "$QA_SESSION_OUTPUT_DIR"
  printf '%s' '{"session":{"access_token":"fixture"}}' > "$QA_SESSION_OUTPUT_DIR/prod-session.json"
  printf '%s' 'e30=' > "$QA_SESSION_OUTPUT_DIR/prod-session.b64"
fi
exit 0
`,
  });
  const started = Date.now();
  const result = fixture.run("qa-surface-hang-fixture", {
    env: {
      QA_BROWSER_COMMAND_TIMEOUT_MS: "200",
      QA_SURFACE_WAIT_TIMEOUT_MS: "600",
    },
  });
  const elapsed = Date.now() - started;
  assert.ok([1, 124].includes(result.status), `wrapper escaped its deadline after ${elapsed}ms`);
  assert.match(result.stderr, /browser harness.*timed out/i);
});

test("bounded command kills a TERM-ignoring browser process group", () => {
  const started = Date.now();
  const result = spawnSync(
    process.execPath,
    [
      "scripts/lib/bounded-command.mjs",
      "--timeout-ms",
      "150",
      "--",
      "bash",
      "-c",
      "trap '' TERM; (trap '' TERM; while true; do sleep 1; done) & wait",
    ],
    { cwd: repoRoot, encoding: "utf8", timeout: 2_000 },
  );
  assert.equal(result.status, 124);
  assert.ok(Date.now() - started < 1_500);
  assert.match(result.stderr, /timed out after 150ms/i);
});

test("bounded command still kills descendants after the leader exits on TERM", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "qa-process-group-test-"));
  const childPidFile = path.join(directory, "child-pid");
  const result = spawnSync(
    process.execPath,
    [
      "scripts/lib/bounded-command.mjs",
      "--timeout-ms",
      "150",
      "--",
      "bash",
      "-c",
      `(trap '' TERM; while true; do sleep 1; done) & echo $! > '${childPidFile}'; wait`,
    ],
    { cwd: repoRoot, encoding: "utf8", timeout: 2_000 },
  );
  assert.equal(result.status, 124);
  const childPid = Number(fs.readFileSync(childPidFile, "utf8").trim());
  assert.throws(() => process.kill(childPid, 0), { code: "ESRCH" });
});

test("surface helper distinguishes auth failure and redacts diagnostic content", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "qa-surface-auth-test-"));
  const fake = path.join(directory, "agent-browser");
  const lock = path.join(directory, "browser-command-lock");
  const collision = path.join(directory, "browser-command-collision");
  fs.writeFileSync(
    fake,
    `#!/usr/bin/env bash
if ! mkdir "${lock}" 2>/dev/null; then touch "${collision}"; exit 9; fi
trap 'rmdir "${lock}"' EXIT
if [[ "$*" == *" eval "* ]]; then echo 'QA_SURFACE:UNAUTHENTICATED'; exit 0; fi
sleep 0.05
echo 'access_token=must-never-be-printed'
`,
    { mode: 0o700 },
  );
  const result = spawnSync(
    process.execPath,
    ["scripts/lib/wait-for-prod-qa-surface.mjs", "--session", "qa-auth-failure"],
    {
      cwd: repoRoot,
      encoding: "utf8",
      timeout: 3_000,
      env: {
        ...process.env,
        PATH: `${directory}:${process.env.PATH}`,
        QA_BROWSER_COMMAND_TIMEOUT_MS: "1000",
        QA_SURFACE_WAIT_TIMEOUT_MS: "1200",
        QA_SURFACE_POLL_MS: "100",
      },
    },
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /App\/auth failure/);
  assert.match(result.stderr, /visible-state=unauthenticated/);
  const screenshot = result.stderr.match(/screenshot=([^;]+surface\.svg)/)?.[1];
  assert.ok(screenshot && fs.existsSync(screenshot));
  const diagnosticImage = fs.readFileSync(screenshot, "utf8");
  assert.match(diagnosticImage, /State: unauthenticated/);
  assert.doesNotMatch(diagnosticImage, /access_token|must-never-be-printed/);
  assert.doesNotMatch(result.stderr, /access_token|must-never-be-printed/);
  assert.equal(fs.existsSync(collision), false, "diagnostics contended for one browser session");
});

test("surface helper succeeds as soon as Today is visible", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "qa-surface-success-test-"));
  fs.writeFileSync(
    path.join(directory, "agent-browser"),
    "#!/usr/bin/env bash\necho 'QA_SURFACE:TODAY'\n",
    { mode: 0o700 },
  );
  const result = spawnSync(
    process.execPath,
    ["scripts/lib/wait-for-prod-qa-surface.mjs", "--session", "qa-success"],
    {
      cwd: repoRoot,
      encoding: "utf8",
      timeout: 2_000,
      env: { ...process.env, PATH: `${directory}:${process.env.PATH}` },
    },
  );
  assert.equal(result.status, 0);
  assert.equal(result.stderr, "");
});

test("successful wrapper revokes globally and removes token artifacts", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "qa-auth-success-cleanup-state-"));
  const revokeLog = path.join(directory, "revoked");
  const fixture = createWrapperFixture("qa-auth-success-cleanup-test-", {
    agentBrowser: todayBrowser,
    npx: `#!/usr/bin/env bash
set -e
if [[ "$*" == *"mint-prod-qa-session.ts"* ]]; then
  mkdir -p "$QA_SESSION_OUTPUT_DIR"
  printf '%s' '{"session":{"access_token":"fixture"}}' > "$QA_SESSION_OUTPUT_DIR/prod-session.json"
  printf '%s' 'e30=' > "$QA_SESSION_OUTPUT_DIR/prod-session.b64"
fi
if [[ "$*" == *"revoke-prod-qa-session.ts"* ]]; then
  printf '%s' revoked > "${revokeLog}"
fi
exit 0
`,
  });
  const artifactRoot = path.join(repoRoot, "tmp/agent-browser");
  const before = new Set(
    fs.existsSync(artifactRoot)
      ? fs.readdirSync(artifactRoot).filter((name) => name.startsWith("qa-session-"))
      : [],
  );
  const result = fixture.run("qa-success-cleanup");
  const after = fs.readdirSync(artifactRoot).filter(
    (name) => name.startsWith("qa-session-") && !before.has(name),
  );
  assert.equal(result.status, 0);
  assert.match(result.stdout, /dedicated QA session verified/);
  assert.equal(fs.readFileSync(revokeLog, "utf8"), "revoked");
  assert.deepEqual(after, []);
});

test("reload readiness relies on bounded surface probes, not a second network-idle wait", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "qa-auth-network-idle-test-"));
  const bin = path.join(directory, "bin");
  const waitCalls = path.join(directory, "wait-calls");
  fs.mkdirSync(bin);
  fs.writeFileSync(
    path.join(bin, "agent-browser"),
    `#!/usr/bin/env bash
set -e
if [[ "$*" == *"wait --load networkidle"* ]]; then
  count=0
  [[ -f "${waitCalls}" ]] && count="$(cat "${waitCalls}")"
  count=$((count + 1))
  printf '%s' "$count" > "${waitCalls}"
  if [[ "$count" == "2" ]]; then trap 'exit 143' TERM; sleep 3; fi
fi
if [[ "$*" == *"eval --stdin"* ]]; then cat >/dev/null; fi
if [[ "$*" == *"QA_SURFACE:TODAY"* ]]; then echo QA_SURFACE:TODAY; fi
exit 0
`,
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
fi
exit 0
`,
    { mode: 0o700 },
  );
  const envFile = path.join(directory, "fixture.env");
  fs.writeFileSync(envFile, "QA_FIXTURE=1\n", { mode: 0o600 });
  const result = spawnSync(
    "bash",
    ["scripts/ab-auth-prod.sh", "--env-file", envFile, "--session", "qa-network-idle"],
    {
      cwd: repoRoot,
      encoding: "utf8",
      timeout: 5_000,
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        QA_BROWSER_COMMAND_TIMEOUT_MS: "200",
      },
    },
  );
  assert.equal(result.status, 0);
  assert.equal(fs.readFileSync(waitCalls, "utf8"), "1");
});

test("wrapper fails truthfully and retains protected artifacts when revocation fails", () => {
  const fixture = createWrapperFixture("qa-auth-cleanup-test-", {
    agentBrowser: todayBrowser,
    npx: `#!/usr/bin/env bash
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
    env: "QA_FAKE_REVOKE_FAIL=1\n",
  });

  const result = fixture.run("qa-cleanup-fixture");
  assert.equal(result.status, 1);
  assert.match(result.stderr, /revocation failed.*artifacts retained/i);
  const recoveryDirectory = result.stderr.match(/retained at ([^\s.]+(?:\.[^\s.]+)*)/)?.[1];
  assert.ok(recoveryDirectory && fs.existsSync(recoveryDirectory));
  assert.deepEqual(fs.readdirSync(recoveryDirectory).sort(), ["prod-session.b64", "prod-session.json"]);
  fs.rmSync(recoveryDirectory, { recursive: true, force: true });
});

test("wrapper kills a TERM-ignoring revoker within the cleanup deadline", () => {
  const fixture = createWrapperFixture("qa-auth-timeout-test-", {
    agentBrowser: todayBrowser,
    npx: `#!/usr/bin/env bash
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
  });
  const started = Date.now();
  const result = fixture.run("qa-timeout-fixture", {
    timeout: 15_000,
    env: {
      QA_CLEANUP_COMMAND_TIMEOUT_MS: "300",
    },
  });
  const elapsed = Date.now() - started;
  assert.equal(result.status, 1);
  assert.ok(elapsed < 5_000, `cleanup took ${elapsed}ms`);
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
