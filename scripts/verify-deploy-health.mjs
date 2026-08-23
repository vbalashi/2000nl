#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const repoRoot = path.resolve(import.meta.dirname, "..");

function options(argv) {
  const parsed = {
    url: "https://2000.dilum.io/api/health?deep=1",
    expectedCommit: "",
    attempts: 20,
    intervalMs: 3000,
  };
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!value) throw new Error(`Missing value for ${key}`);
    if (key === "--url") parsed.url = value;
    else if (key === "--expected-commit") parsed.expectedCommit = value;
    else if (key === "--attempts") parsed.attempts = Number.parseInt(value, 10);
    else if (key === "--interval-ms") parsed.intervalMs = Number.parseInt(value, 10);
    else throw new Error(`Unknown argument: ${key}`);
  }
  if (!/^[0-9a-f]{40}$/.test(parsed.expectedCommit)) {
    throw new Error("--expected-commit must be an exact 40-character SHA");
  }
  if (!Number.isSafeInteger(parsed.attempts) || parsed.attempts < 1 || parsed.attempts > 60) {
    throw new Error("--attempts must be between 1 and 60");
  }
  if (!Number.isSafeInteger(parsed.intervalMs) || parsed.intervalMs < 0 || parsed.intervalMs > 10000) {
    throw new Error("--interval-ms must be between 0 and 10000");
  }
  return parsed;
}

const wait = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

function compatible(payload, expectedCommit, contract) {
  const expectedMigration = contract.migrations.at(-1)?.migrationId;
  const signal = payload?.checks?.databaseContract;
  return (
    payload?.status === "ok" &&
    payload?.commit === expectedCommit &&
    signal?.status === "ok" &&
    signal?.details?.expected === contract.contractId &&
    signal?.details?.actual === contract.contractId &&
    signal?.details?.expectedMigration === expectedMigration &&
    signal?.details?.actualMigration === expectedMigration &&
    signal?.details?.compatible === true
  );
}

async function main() {
  const parsed = options(process.argv.slice(2));
  const contract = JSON.parse(
    await readFile(
      path.join(repoRoot, "packages/shared/deployment/db-contract.json"),
      "utf8",
    ),
  );
  let lastReason = "health endpoint did not respond";

  for (let attempt = 1; attempt <= parsed.attempts; attempt += 1) {
    try {
      const response = await fetch(parsed.url, {
        cache: "no-store",
        signal: AbortSignal.timeout(5000),
      });
      const payload = response.ok ? await response.json() : null;
      if (response.ok && compatible(payload, parsed.expectedCommit, contract)) {
        process.stdout.write(
          `deploy-health: compatible commit=${parsed.expectedCommit.slice(0, 12)} contract=${contract.contractId}\n`,
        );
        return;
      }
      lastReason = `incompatible response (http ${response.status})`;
    } catch (error) {
      lastReason = error instanceof Error && error.name === "TimeoutError"
        ? "health request timed out"
        : "health request failed";
    }
    if (attempt < parsed.attempts) await wait(parsed.intervalMs);
  }
  throw new Error(lastReason);
}

main().catch((error) => {
  process.stderr.write(`deploy-health: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
