#!/usr/bin/env node

import process from "node:process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { spawnPostgresClient } from "./postgres_client.mjs";
import { databaseEnvironment, databaseUrl } from "./scheduler_readiness_diagnostic.mjs";

function parseArgs(argv) {
  const options = {
    repoRoot: process.cwd(),
    psqlBin: "psql",
    psqlContainerImage: "",
    psqlContainerNetwork: "bridge",
    containerRuntimeBin: "docker",
    databaseUrlEnv: "SUPABASE_DB_URL",
    envFile: "",
    durationMs: 20_000,
    intervalMs: 250,
    statementTimeoutMs: 2_001,
  };
  for (let index = 0; index < argv.length; index += 2) {
    const arg = argv[index];
    const value = argv[index + 1];
    if (!value) throw new Error(`Missing value for ${arg}`);
    if (arg === "--repo-root") options.repoRoot = value;
    else if (arg === "--psql-bin") options.psqlBin = value;
    else if (arg === "--psql-container-image") options.psqlContainerImage = value;
    else if (arg === "--psql-container-network") options.psqlContainerNetwork = value;
    else if (arg === "--container-runtime-bin") options.containerRuntimeBin = value;
    else if (arg === "--database-url-env") options.databaseUrlEnv = value;
    else if (arg === "--env-file") options.envFile = value;
    else if (arg === "--duration-ms") options.durationMs = Number.parseInt(value, 10);
    else if (arg === "--interval-ms") options.intervalMs = Number.parseInt(value, 10);
    else if (arg === "--statement-timeout-ms") options.statementTimeoutMs = Number.parseInt(value, 10);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!Number.isSafeInteger(options.durationMs) || options.durationMs < 1_000 || options.durationMs > 120_000) {
    throw new Error("--duration-ms must be between 1000 and 120000");
  }
  if (!Number.isSafeInteger(options.intervalMs) || options.intervalMs < 100 || options.intervalMs > 10_000) {
    throw new Error("--interval-ms must be between 100 and 10000");
  }
  if (!Number.isSafeInteger(options.statementTimeoutMs) || options.statementTimeoutMs < 2_001 || options.statementTimeoutMs > 60_000) {
    throw new Error("--statement-timeout-ms must be between 2001 and 60000");
  }
  return options;
}

export function activitySql(statementTimeoutMs) {
  return `\\set ON_ERROR_STOP on
\\set QUIET on
BEGIN READ ONLY;
SET LOCAL statement_timeout = '${statementTimeoutMs}ms';
SELECT 'scheduler_activity=' || COALESCE(jsonb_agg(jsonb_build_object(
  'pid', pid,
  'backendStart', backend_start,
  'queryStart', query_start,
  'state', state,
  'waitEventType', wait_event_type,
  'waitEvent', wait_event,
  'queryClass', CASE
    WHEN query ILIKE '%get_training_session_plan%' THEN 'session-plan'
    WHEN query ILIKE '%get_next_filtered_card%' THEN 'filtered-card'
    WHEN query ILIKE '%get_next_card%' THEN 'next-card'
    WHEN query ILIKE '%training_scheduler_candidates_v2%' THEN 'candidate'
    ELSE 'other'
  END
) ORDER BY pid) FILTER (WHERE pid <> pg_backend_pid()), '[]'::jsonb)::text
FROM pg_stat_activity
WHERE datname = current_database()
  AND pid <> pg_backend_pid()
  AND state = 'active';
COMMIT;
`;
}

function redact(message) {
  return message
    .replaceAll(/postgres(?:ql)?:\/\/[^\s'"<>]+/gi, "[redacted-db-url]")
    .replaceAll(/(password|token|secret|key)=([^\s]+)/gi, "$1=[redacted]")
    .replaceAll(/[A-Za-z0-9_-]{80,}/g, "[redacted-token]");
}

function sample(options, childEnv) {
  const result = spawnPostgresClient(
    options,
    ["-X", "--no-psqlrc", "--tuples-only", "--no-align", "--set=ON_ERROR_STOP=1"],
    {
      input: activitySql(options.statementTimeoutMs),
      encoding: "utf8",
      env: childEnv,
      maxBuffer: 2 * 1024 * 1024,
      timeout: 60_000,
    },
  );
  const output = redact(`${result.stdout ?? ""}${result.stderr ?? ""}`).trim();
  if (result.error) throw new Error(`activity sampler runtime failed: ${result.error.message}`);
  if (result.signal) throw new Error(`activity sampler stopped by ${result.signal}`);
  if (result.status !== 0) throw new Error(`activity sampler failed${output ? `: ${output}` : ""}`);
  const line = output.split(/\r?\n/).find((value) => value.startsWith("scheduler_activity="));
  if (!line) throw new Error("activity sampler returned no scheduler_activity row");
  return JSON.parse(line.slice("scheduler_activity=".length));
}

export async function collectActivity(options, childEnv, now = () => new Date().toISOString()) {
  const deadline = Date.now() + options.durationMs;
  let sampleNumber = 0;
  while (Date.now() < deadline) {
    sampleNumber += 1;
    const observedAt = now();
    const activities = sample(options, childEnv);
    process.stdout.write(`scheduler-activity-sample-${sampleNumber} observed_at=${observedAt} active=${JSON.stringify(activities)}\n`);
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    await new Promise((resolve) => setTimeout(resolve, Math.min(options.intervalMs, remaining)));
  }
  return sampleNumber;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const url = await databaseUrl(options);
  const childEnv = { ...process.env, ...databaseEnvironment(url), PGCONNECT_TIMEOUT: "10" };
  delete childEnv.SUPABASE_DB_URL;
  delete childEnv.DATABASE_URL;
  await collectActivity(options, childEnv);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    process.stderr.write(`scheduler-activity-sampler: ${redact(error instanceof Error ? error.message : String(error))}\n`);
    process.exitCode = 1;
  });
}
