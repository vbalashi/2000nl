#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawnPostgresClient, preflightPostgresClient } from "./postgres_client.mjs";

const repoRoot = path.resolve(import.meta.dirname, "../..");

function parseArgs(argv) {
  const options = {
    repoRoot,
    psqlBin: "psql",
    psqlContainerImage: "",
    psqlContainerNetwork: "bridge",
    containerRuntimeBin: "docker",
    databaseUrlEnv: "SUPABASE_DB_URL",
    envFile: "",
    samples: 5,
    statementTimeoutMs: 10_000,
  };
  for (let index = 0; index < argv.length; index += 2) {
    const arg = argv[index];
    const value = argv[index + 1];
    if (!value) throw new Error(`Missing value for ${arg}`);
    if (arg === "--repo-root") options.repoRoot = path.resolve(value);
    else if (arg === "--psql-bin") options.psqlBin = value;
    else if (arg === "--psql-container-image") options.psqlContainerImage = value;
    else if (arg === "--psql-container-network") options.psqlContainerNetwork = value;
    else if (arg === "--container-runtime-bin") options.containerRuntimeBin = value;
    else if (arg === "--database-url-env") options.databaseUrlEnv = value;
    else if (arg === "--env-file") options.envFile = value;
    else if (arg === "--samples") options.samples = Number.parseInt(value, 10);
    else if (arg === "--statement-timeout-ms") options.statementTimeoutMs = Number.parseInt(value, 10);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!Number.isSafeInteger(options.samples) || options.samples < 1 || options.samples > 10) {
    throw new Error("--samples must be between 1 and 10");
  }
  if (
    !Number.isSafeInteger(options.statementTimeoutMs) ||
    options.statementTimeoutMs < 2_001 ||
    options.statementTimeoutMs > 60_000
  ) {
    throw new Error("--statement-timeout-ms must be between 2001 and 60000");
  }
  return options;
}

function databaseEnvironment(urlString) {
  const url = new URL(urlString);
  if (!["postgres:", "postgresql:"].includes(url.protocol)) {
    throw new Error("Database URL must use postgres or postgresql");
  }
  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!url.hostname || !database || !url.username) {
    throw new Error("Database URL is missing host, database, or user");
  }
  return {
    PGHOST: url.hostname,
    PGPORT: url.port || "5432",
    PGDATABASE: database,
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGSSLMODE: url.searchParams.get("sslmode") ?? "require",
  };
}

async function databaseUrl(options) {
  const direct = process.env[options.databaseUrlEnv] ??
    (options.databaseUrlEnv === "SUPABASE_DB_URL" ? process.env.DATABASE_URL : undefined);
  if (direct) return direct;
  if (!options.envFile) throw new Error(`Missing database URL in ${options.databaseUrlEnv}`);
  const source = await readFile(path.resolve(options.repoRoot, options.envFile), "utf8");
  const values = new Map();
  for (const line of source.split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values.set(match[1], value);
  }
  const fromFile = values.get(options.databaseUrlEnv) ??
    (options.databaseUrlEnv === "SUPABASE_DB_URL" ? values.get("DATABASE_URL") : undefined);
  if (!fromFile) throw new Error(`Missing database URL in ${options.envFile}`);
  return fromFile;
}

function diagnosticSql(options) {
  const samples = [];
  for (let sample = 1; sample <= options.samples; sample += 1) {
    samples.push(`
\\echo scheduler-readiness-sample-${sample}
DISCARD PLANS;
BEGIN READ ONLY;
SET LOCAL statement_timeout = '${options.statementTimeoutMs}ms';
DO $qa_identity$
DECLARE qa_user_id uuid;
BEGIN
  SELECT id INTO qa_user_id FROM auth.users
  WHERE email = 'test@2000nl.test';
  IF qa_user_id IS NULL THEN
    RAISE EXCEPTION 'scheduler-readiness-diagnostic: qa identity missing';
  END IF;
  PERFORM set_config('request.jwt.claim.sub', qa_user_id::text, true);
END
$qa_identity$;
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
SELECT public.get_training_session_plan(
  (SELECT id FROM auth.users WHERE email = 'test@2000nl.test'),
  ARRAY['word-to-definition']::text[],
  NULL,
  'curated',
  'both',
  '{}'::jsonb
);
COMMIT;
`);
  }
  return `\\set ON_ERROR_STOP on
\\set QUIET on
${samples.join("\\n")}`;
}

function redact(message) {
  return message
    .replaceAll(/postgres(?:ql)?:\/\/[^\s'"<>]+/gi, "[redacted-db-url]")
    .replaceAll(/(password|token|secret|key)=([^\s]+)/gi, "$1=[redacted]")
    .replaceAll(/[A-Za-z0-9_-]{80,}/g, "[redacted-token]");
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.psqlContainerImage) preflightPostgresClient(options, redact);
  const url = await databaseUrl(options);
  const childEnv = { ...process.env, ...databaseEnvironment(url), PGCONNECT_TIMEOUT: "10" };
  delete childEnv.SUPABASE_DB_URL;
  delete childEnv.DATABASE_URL;
  const result = spawnPostgresClient(
    options,
    ["-X", "--no-psqlrc", "--tuples-only", "--no-align", "--set=ON_ERROR_STOP=1"],
    {
      input: diagnosticSql(options),
      encoding: "utf8",
      env: childEnv,
      maxBuffer: 4 * 1024 * 1024,
      timeout: 15 * 60 * 1000,
    },
  );
  const output = redact(`${result.stdout ?? ""}${result.stderr ?? ""}`);
  if (output.trim()) process.stdout.write(output);
  if (result.error) throw new Error(`PostgreSQL client runtime failed: ${result.error.message}`);
  if (result.signal) throw new Error(`psql stopped by ${result.signal}`);
  if (result.status !== 0) process.exitCode = result.status ?? 1;
}

main().catch((error) => {
  process.stderr.write(`scheduler-readiness-diagnostic: ${redact(error instanceof Error ? error.message : String(error))}\n`);
  process.exitCode = 1;
});
