#!/usr/bin/env node

import process from "node:process";

function parseArgs(argv) {
  const parsed = { port: "3100", mode: "", workRef: "", expectedCommit: "" };
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!value) throw new Error(`Missing value for ${key}`);
    if (key === "--port") parsed.port = value;
    else if (key === "--mode") parsed.mode = value;
    else if (key === "--work-ref") parsed.workRef = value;
    else if (key === "--expected-commit") parsed.expectedCommit = value;
    else throw new Error(`Unknown argument: ${key}`);
  }
  if (!parsed.mode || !parsed.workRef || !parsed.expectedCommit) {
    throw new Error("--mode, --work-ref and --expected-commit are required");
  }
  return parsed;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  let response;
  try {
    response = await fetch(`http://127.0.0.1:${options.port}/api/health`, {
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
  if (
    payload?.commit !== options.expectedCommit ||
    source?.mode !== options.mode ||
    source?.workRef !== options.workRef ||
    source?.commit !== options.expectedCommit
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
