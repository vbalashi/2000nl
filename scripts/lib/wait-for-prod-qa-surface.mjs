#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runBounded } from "./bounded-command.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const browserLauncher = path.join(repoRoot, "scripts/lib/run-sanitized-agent-browser.sh");
const expectedOrigin = "https://2000.dilum.io";
export const surfaceProbeExpression = `(() => {
  const text = (document.body?.innerText || "").toLocaleLowerCase();
  const today = ["training · vandaag", "training · today", "тренировка · сегодня"]
    .some((label) => text.includes(label));
  if (today) return "QA_SURFACE:TODAY";
  const authKey = Object.keys(localStorage).find((key) => key.startsWith("sb-") && key.endsWith("-auth-token"));
  const login = /magic link|sign in|log in|inloggen|войти/i.test(text);
  if (login || !authKey) return "QA_SURFACE:UNAUTHENTICATED";
  return document.body ? "QA_SURFACE:AUTHENTICATED_OTHER" : "QA_SURFACE:LOADING";
})()`;

function boundedEnvMs(name, fallback, maximum) {
  const value = Number(process.env[name] ?? fallback);
  return Number.isInteger(value) && value >= 100 ? Math.min(value, maximum) : fallback;
}

function countSummary(output) {
  const lines = output.split(/\r?\n/).filter(Boolean).length;
  return lines === 0 ? "none" : `${lines} record(s)`;
}

function diagnosticSummary(result) {
  if (result.timedOut) return "unavailable(timeout)";
  if (result.code !== 0) return "unavailable(command-failed)";
  return countSummary(result.stdout);
}

async function browser(session, args, timeoutMs) {
  return runBounded("bash", [browserLauncher, "--session", session, ...args], {
    cwd: repoRoot,
    env: process.env,
    timeoutMs,
    capture: true,
    maxOutputBytes: 65_536,
  });
}

async function collectDiagnostics(session, lastClass, commandTimeoutMs) {
  const directory = path.join(repoRoot, "tmp/agent-browser", `qa-diagnostics-${Date.now()}`);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const screenshot = path.join(directory, "surface.png");
  const deadline = Date.now() + 8_000;
  const diagnostic = async (args) => {
    const remaining = deadline - Date.now();
    if (remaining < 100) return { code: 124, stdout: "", stderr: "", timedOut: true };
    return browser(session, args, Math.min(commandTimeoutMs, remaining));
  };
  // The agent-browser daemon owns one active page per session. Keep diagnostics
  // sequential so evidence collection cannot contend with itself and wedge cleanup.
  const url = await diagnostic(["get", "url"]);
  const consoleResult = await diagnostic(["console"]);
  const errors = await diagnostic(["errors"]);
  const network = await diagnostic(["network", "requests"]);
  // Screenshot is last: some browser/daemon failures can wedge that command,
  // and textual classifications must remain available even when capture is not.
  const shot = await diagnostic(["screenshot", screenshot]);
  const currentUrl = url.stdout.match(/https?:\/\/[^\s"']+/)?.[0];
  let safeUrl = "unavailable";
  if (currentUrl) {
    try {
      const parsed = new URL(currentUrl);
      safeUrl = parsed.origin === expectedOrigin ? `${parsed.origin}${parsed.pathname}` : "unexpected-origin";
    } catch {}
  }
  const screenshotSummary = shot.code === 0 && fs.existsSync(screenshot)
    ? screenshot
    : (shot.timedOut ? "unavailable(timeout)" : "unavailable(command-failed)");
  console.error(`QA diagnostics: url=${safeUrl}; visible-state=${lastClass}; console=${diagnosticSummary(consoleResult)}; page-errors=${diagnosticSummary(errors)}; network=${diagnosticSummary(network)}; screenshot=${screenshotSummary}.`);
}

async function main() {
  const sessionIndex = process.argv.indexOf("--session");
  const session = sessionIndex >= 0 ? process.argv[sessionIndex + 1] : "";
  if (!session) {
    console.error("Missing --session.");
    return 2;
  }
  const commandTimeoutMs = boundedEnvMs("QA_BROWSER_COMMAND_TIMEOUT_MS", 15_000, 15_000);
  const surfaceTimeoutMs = boundedEnvMs("QA_SURFACE_WAIT_TIMEOUT_MS", 30_000, 30_000);
  const pollMs = boundedEnvMs("QA_SURFACE_POLL_MS", 1_000, 1_000);
  const probeBudgetMs = Math.min(commandTimeoutMs, 2_000);
  const deadline = Date.now() + surfaceTimeoutMs;
  let lastClass = "loading";

  while (deadline - Date.now() >= probeBudgetMs) {
    const result = await browser(session, ["eval", surfaceProbeExpression], probeBudgetMs);
    if (result.timedOut || result.code !== 0) {
      console.error(result.timedOut
        ? "Browser harness failure: surface probe timed out."
        : "Browser harness failure: surface probe command failed.");
      await collectDiagnostics(session, "browser-harness-unavailable", Math.min(commandTimeoutMs, 2_000));
      return 1;
    }
    if (result.stdout.includes("QA_SURFACE:TODAY")) return 0;
    if (result.stdout.includes("QA_SURFACE:UNAUTHENTICATED")) lastClass = "unauthenticated";
    else if (result.stdout.includes("QA_SURFACE:AUTHENTICATED_OTHER")) lastClass = "authenticated-without-today";
    else lastClass = "loading-or-unclassified";
    await new Promise((resolve) => setTimeout(resolve, Math.min(pollMs, Math.max(0, deadline - Date.now()))));
  }

  console.error(lastClass === "unauthenticated"
    ? "App/auth failure: the dedicated QA session did not reach an authenticated surface."
    : "App surface failure: authentication was present but Today did not become visible.");
  await collectDiagnostics(session, lastClass, Math.min(commandTimeoutMs, 2_000));
  return 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main();
}
