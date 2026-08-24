#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
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
  let sessionValid = false;
  try {
    const stored = authKey ? JSON.parse(localStorage.getItem(authKey) || "null") : null;
    const expiresAt = Number(stored?.expires_at || 0);
    sessionValid = Boolean(stored?.access_token && expiresAt * 1000 > Date.now());
  } catch {}
  const authForm = Boolean(document.querySelector('input[type="email"], input[autocomplete="one-time-code"]'));
  const login = /magic link|sign in|log in|inloggen|войти/i.test(text);
  if (authForm || login || !sessionValid) return "QA_SURFACE:UNAUTHENTICATED";
  const authenticatedShell = Boolean(document.querySelector('nav[aria-label="Primary"]'));
  return authenticatedShell ? "QA_SURFACE:AUTHENTICATED_OTHER" : "QA_SURFACE:AUTH_UNCONFIRMED";
})()`;

export function safeDiagnosticDataUrl(lastClass, panelId) {
  const safeClass = [
    "unauthenticated",
    "authenticated-without-today",
    "authentication-unconfirmed",
    "browser-harness-unavailable",
    "loading-or-unclassified",
  ].includes(lastClass) ? lastClass : "unclassified";
  const html = `<!doctype html><meta charset="utf-8"><title>2000NL QA diagnostic</title>
<style>html,body{margin:0;width:100%;height:100%;background:#0f172a}#${panelId}{box-sizing:border-box;width:100vw;height:100vh;display:grid;place-items:center;padding:48px;background:#0f172a;color:#e2e8f0;font:600 24px system-ui;white-space:pre-line}</style>
<div id="${panelId}" role="img" aria-label="2000NL safe QA diagnostic">2000NL QA diagnostic\nState: ${safeClass}\nURL: https://2000.dilum.io/</div>`;
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

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
  // The screenshot runs in a one-use session containing only a generated safe
  // data document. Production pixels are never present in this browser target,
  // so selector resolution and capture cannot race production navigation.
  const diagnosticId = randomUUID();
  const diagnosticSession = `qa-diagnostic-${diagnosticId}`;
  const panelId = `qa-safe-diagnostic-${diagnosticId}`;
  const safeDocument = safeDiagnosticDataUrl(lastClass, panelId);
  const opened = await browser(
    diagnosticSession,
    ["open", safeDocument],
    Math.min(commandTimeoutMs, 2_000),
  );
  const shot = opened.code === 0
    ? await browser(
        diagnosticSession,
        ["screenshot", `#${panelId}`, screenshot],
        Math.min(commandTimeoutMs, 2_000),
      )
    : { code: 1, stdout: "", stderr: "", timedOut: opened.timedOut };
  await browser(diagnosticSession, ["close"], Math.min(commandTimeoutMs, 1_000));
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
    : (opened.code !== 0
        ? "unavailable(privacy-gate-failed)"
        : (shot.timedOut ? "unavailable(timeout)" : "unavailable(command-failed)"));
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
    else if (result.stdout.includes("QA_SURFACE:AUTH_UNCONFIRMED")) lastClass = "authentication-unconfirmed";
    else lastClass = "loading-or-unclassified";
    await new Promise((resolve) => setTimeout(resolve, Math.min(pollMs, Math.max(0, deadline - Date.now()))));
  }

  console.error(lastClass === "authenticated-without-today"
    ? "App surface failure: authentication was visible but Today did not become visible."
    : "App/auth failure: the dedicated QA session did not reach a visibly authenticated surface.");
  await collectDiagnostics(session, lastClass, Math.min(commandTimeoutMs, 2_000));
  return 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main();
}
