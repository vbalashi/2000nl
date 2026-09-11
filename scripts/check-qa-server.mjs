#!/usr/bin/env node

import process from "node:process";

function parseArgs(argv) {
  const parsed = {
    port: "3100",
    mode: "",
    workRef: "",
    expectedCommit: "",
    expectedCheckoutPath: "",
    expectedDirty: "",
  };
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!value) throw new Error(`Missing value for ${key}`);
    if (key === "--port") parsed.port = value;
    else if (key === "--mode") parsed.mode = value;
    else if (key === "--work-ref") parsed.workRef = value;
    else if (key === "--expected-commit") parsed.expectedCommit = value;
    else if (key === "--expected-checkout-path") parsed.expectedCheckoutPath = value;
    else if (key === "--expected-dirty") parsed.expectedDirty = value;
    else throw new Error(`Unknown argument: ${key}`);
  }
  if (
    !parsed.mode ||
    !parsed.workRef ||
    !parsed.expectedCommit ||
    !parsed.expectedCheckoutPath ||
    !["true", "false"].includes(parsed.expectedDirty)
  ) {
    throw new Error(
      "--mode, --work-ref, --expected-commit, --expected-checkout-path and --expected-dirty are required",
    );
  }
  return parsed;
}

function hasHealthyLocalQaContract(payload) {
  const checks = payload?.checks;
  return (
    payload?.status === "ok" &&
    payload?.database?.target === "local" &&
    checks?.platformRpcContract?.status === "ok" &&
    checks?.dictionarySearchIndex?.status === "ok" &&
    checks?.databaseContract?.status === "ok" &&
    checks?.databaseContract?.details?.compatible === true
  );
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  let response;
  try {
    response = await fetch(`http://127.0.0.1:${options.port}/api/health?deep=1`, {
      cache: "no-store",
      signal: AbortSignal.timeout(1000),
    });
  } catch (error) {
    if (error?.cause?.code === "ECONNREFUSED") {
      process.exitCode = 2;
      return;
    }
    throw new Error("Existing QA port did not return a health response.");
  }

  if (!response.ok) {
    throw new Error(`Existing QA port returned HTTP ${response.status}.`);
  }
  const payload = await response.json();
  const source = payload?.qaSource;
  if (!hasHealthyLocalQaContract(payload)) {
    throw new Error("Existing QA server does not satisfy the local deep-health contract.");
  }
  if (options.expectedDirty === "true" || source?.dirty !== false) {
    throw new Error("Existing QA server is a dirty preview and cannot be reused safely.");
  }
  if (
    payload?.commit !== options.expectedCommit ||
    source?.mode !== options.mode ||
    source?.workRef !== options.workRef ||
    source?.commit !== options.expectedCommit ||
    source?.checkoutPath !== options.expectedCheckoutPath
  ) {
    throw new Error(
      `Existing QA server source does not match requested ${options.mode}/${options.workRef}/${options.expectedCommit}.`,
    );
  }
  process.stdout.write(
    `Existing QA server matches ${options.mode}/${options.workRef}/${options.expectedCommit}.\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
