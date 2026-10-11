#!/usr/bin/env node
import { spawnSync } from "node:child_process";

function docker(args, capture = false) {
  const result = spawnSync("docker", args, {
    encoding: "utf8",
    stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
  });
  if (result.error || result.status !== 0) throw new Error("translation worker compose operation failed");
  return result.stdout;
}
try {
  // Resolved Compose config contains secrets: inspect only in memory, never log.
  const config = JSON.parse(docker(["compose", "config", "--format", "json"], true));
  const enabled = String(config.services.ui.environment.DICTIONARY_TRANSLATION_JOBS_ENABLED) === "true";
  if (enabled) {
    docker(["compose", "--profile", "translation-jobs", "up", "-d", "--no-build", "--wait", "--wait-timeout", "90", "translation-worker"]);
  } else {
    docker(["compose", "--profile", "translation-jobs", "stop", "translation-worker"]);
  }
  process.stdout.write(`translation-worker: ${enabled ? "healthy" : "disabled"}\n`);
} catch {
  process.stderr.write("translation-worker: startup/health check failed\n");
  process.exitCode = 1;
}
