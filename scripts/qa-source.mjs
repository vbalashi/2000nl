#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import { inspectQaSource, sourceEnvironment } from "./lib/qa-source.mjs";

function parseArgs(argv) {
  const parsed = {
    command: "verify",
    repoRoot: path.resolve(import.meta.dirname, ".."),
    mode: "canonical",
    workRef: "",
    expectedCommit: "",
    format: "json",
    fetchCanonical: true,
  };
  let index = 0;
  if (argv[0] && !argv[0].startsWith("--")) {
    parsed.command = argv[0];
    index = 1;
  }
  for (; index < argv.length; index += 1) {
    const key = argv[index];
    if (key === "--no-fetch") {
      parsed.fetchCanonical = false;
      continue;
    }
    const value = argv[index + 1];
    if (!value) throw new Error(`Missing value for ${key}`);
    if (key === "--repo-root") parsed.repoRoot = path.resolve(value);
    else if (key === "--mode") parsed.mode = value;
    else if (key === "--work-ref") parsed.workRef = value;
    else if (key === "--expected-commit") parsed.expectedCommit = value;
    else if (key === "--format") parsed.format = value;
    else throw new Error(`Unknown argument: ${key}`);
    index += 1;
  }
  if (parsed.command !== "verify") {
    throw new Error(`Unknown command: ${parsed.command}`);
  }
  if (!['json', 'env'].includes(parsed.format)) {
    throw new Error(`Unknown output format: ${parsed.format}`);
  }
  return parsed;
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

try {
  const options = parseArgs(process.argv.slice(2));
  const source = inspectQaSource(options);
  if (options.format === "json") {
    process.stdout.write(`${JSON.stringify(source, null, 2)}\n`);
  } else {
    for (const [key, value] of Object.entries(sourceEnvironment(source))) {
      process.stdout.write(`export ${key}=${shellQuote(value)}\n`);
    }
  }
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
