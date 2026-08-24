#!/usr/bin/env node

import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

function killProcessGroup(child, signal) {
  if (!child.pid) return;
  try {
    process.kill(-child.pid, signal);
  } catch (error) {
    if (error?.code === "EPERM") {
      child.kill(signal);
    } else if (error?.code !== "ESRCH") {
      throw error;
    }
  }
}

export function runBounded(command, args, options = {}) {
  const timeoutMs = options.timeoutMs ?? 15_000;
  const killGraceMs = options.killGraceMs ?? 250;
  const capture = options.capture ?? false;
  const maxOutputBytes = options.maxOutputBytes ?? 32_768;

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      detached: process.platform !== "win32",
      stdio: capture ? ["pipe", "pipe", "pipe"] : "inherit",
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let killTimer;
    let killEscalated = false;
    let closeResult;
    let settled = false;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(result);
    };

    const append = (current, chunk) =>
      `${current}${chunk.toString("utf8")}`.slice(-maxOutputBytes);
    if (capture) {
      child.stdout.on("data", (chunk) => { stdout = append(stdout, chunk); });
      child.stderr.on("data", (chunk) => { stderr = append(stderr, chunk); });
      if (options.input) child.stdin.end(options.input);
      else child.stdin.end();
    }

    const timeout = setTimeout(() => {
      timedOut = true;
      killProcessGroup(child, "SIGTERM");
      killTimer = setTimeout(() => {
        killEscalated = true;
        killProcessGroup(child, "SIGKILL");
        if (closeResult) setTimeout(() => finish(closeResult), 25);
      }, killGraceMs);
    }, timeoutMs);
    timeout.unref();

    child.once("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      clearTimeout(killTimer);
      reject(error);
    });
    child.once("close", (code, signal) => {
      const result = {
        code: timedOut ? 124 : (code ?? 1),
        signal,
        timedOut,
        stdout,
        stderr,
      };
      if (timedOut && !killEscalated) {
        // The leader may obey TERM while a descendant ignores it. Preserve the
        // scheduled group-wide KILL before allowing this wrapper to exit.
        closeResult = result;
        return;
      }
      finish(result);
    });
  });
}

async function main(argv) {
  const separator = argv.indexOf("--");
  if (separator < 2 || argv[0] !== "--timeout-ms") {
    console.error("Usage: bounded-command.mjs --timeout-ms <milliseconds> -- <command> [args...]");
    return 2;
  }
  const timeoutMs = Number(argv[1]);
  const [command, ...args] = argv.slice(separator + 1);
  if (!command || !Number.isInteger(timeoutMs) || timeoutMs < 1) return 2;
  const result = await runBounded(command, args, { timeoutMs });
  if (result.timedOut) console.error(`Browser command timed out after ${timeoutMs}ms.`);
  return result.code;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2));
}
