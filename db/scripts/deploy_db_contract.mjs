#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {
  preflightPostgresClient,
  spawnPostgresClient,
} from "./postgres_client.mjs";

const defaultManifest = "packages/shared/deployment/db-contract.json";
const sha256Pattern = /^[0-9a-f]{64}$/;
const commitPattern = /^[0-9a-f]{40}$/;

function parseArgs(argv) {
  const options = {
    command: argv[0] ?? "apply",
    repoRoot: path.resolve(import.meta.dirname, "../.."),
    manifestPath: defaultManifest,
    psqlBin: "psql",
    psqlContainerImage: "",
    psqlContainerNetwork: "bridge",
    containerRuntimeBin: "docker",
    databaseUrlEnv: "SUPABASE_DB_URL",
    envFile: "",
    appCommit: process.env.DEPLOY_APP_COMMIT ?? process.env.GITHUB_SHA ?? "",
  };
  for (let index = 1; index < argv.length; index += 2) {
    const arg = argv[index];
    const value = argv[index + 1];
    if (!value) throw new Error(`Missing value for ${arg}`);
    if (arg === "--repo-root") options.repoRoot = path.resolve(value);
    else if (arg === "--manifest") options.manifestPath = value;
    else if (arg === "--psql-bin") options.psqlBin = value;
    else if (arg === "--psql-container-image") options.psqlContainerImage = value;
    else if (arg === "--psql-container-network") options.psqlContainerNetwork = value;
    else if (arg === "--container-runtime-bin") options.containerRuntimeBin = value;
    else if (arg === "--database-url-env") options.databaseUrlEnv = value;
    else if (arg === "--env-file") options.envFile = value;
    else if (arg === "--app-commit") options.appCommit = value;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

function insideRepo(repoRoot, relativePath) {
  if (typeof relativePath !== "string" || relativePath.length === 0) {
    throw new Error("Contract path must be a non-empty string");
  }
  const absolute = path.resolve(repoRoot, relativePath);
  const relative = path.relative(repoRoot, absolute);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Contract path escapes the repository: ${relativePath}`);
  }
  return absolute;
}

async function readManifest(repoRoot, manifestPath) {
  const source = await readFile(insideRepo(repoRoot, manifestPath), "utf8");
  const manifest = JSON.parse(source);
  if (manifest.schemaVersion !== 1) throw new Error("Unsupported DB contract schemaVersion");
  if (!/^[a-z0-9][a-z0-9-]{2,63}$/.test(manifest.contractId ?? "")) {
    throw new Error("Invalid DB contractId");
  }
  if (!Number.isSafeInteger(manifest.baseline?.migrationId)) {
    throw new Error("Invalid DB contract baseline migrationId");
  }
  insideRepo(repoRoot, manifest.baseline.probe);
  insideRepo(repoRoot, manifest.postflightProbe);
  if (
    typeof manifest.ledger?.file !== "string" ||
    !sha256Pattern.test(manifest.ledger?.sha256 ?? "")
  ) {
    throw new Error("Invalid deployment ledger migration contract");
  }
  insideRepo(repoRoot, manifest.ledger.file);
  if (!Array.isArray(manifest.migrations) || manifest.migrations.length === 0) {
    throw new Error("DB contract must contain managed migrations");
  }
  if (
    !["hold", "enabled"].includes(manifest.rollout?.status) ||
    !Number.isSafeInteger(manifest.rollout?.requiredMigrationId) ||
    !Number.isSafeInteger(manifest.rollout?.coordinationIssue)
  ) {
    throw new Error("Invalid DB contract rollout gate");
  }
  let previous = manifest.baseline.migrationId;
  for (const migration of manifest.migrations) {
    if (!Number.isSafeInteger(migration.migrationId) || migration.migrationId !== previous + 1) {
      throw new Error("Managed DB migrations must be contiguous and ordered");
    }
    if (!migration.file.startsWith(`db/migrations/${migration.migrationId}_`)) {
      throw new Error(`Migration ${migration.migrationId} filename does not match its id`);
    }
    if (!sha256Pattern.test(migration.sha256 ?? "")) {
      throw new Error(`Migration ${migration.migrationId} has an invalid sha256`);
    }
    insideRepo(repoRoot, migration.file);
    previous = migration.migrationId;
  }
  if (
    manifest.rollout.status === "enabled" &&
    previous < manifest.rollout.requiredMigrationId
  ) {
    throw new Error(
      `DB rollout cannot be enabled before migration ${manifest.rollout.requiredMigrationId}`,
    );
  }
  return manifest;
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function stripTransactionWrapper(source, migrationId) {
  const lines = source.replaceAll("\r\n", "\n").split("\n");
  const begins = [];
  const commits = [];
  for (let index = 0; index < lines.length; index += 1) {
    const normalized = lines[index].trim().toUpperCase();
    if (normalized === "BEGIN;") begins.push(index);
    if (normalized === "COMMIT;") commits.push(index);
  }
  if (begins.length !== 1 || commits.length !== 1 || begins[0] >= commits[0]) {
    throw new Error(
      `Migration ${migrationId} must have exactly one standalone BEGIN/COMMIT wrapper`,
    );
  }
  if (lines.slice(commits[0] + 1).some((line) => line.trim() !== "")) {
    throw new Error(`Migration ${migrationId} contains content after COMMIT`);
  }
  return [...lines.slice(0, begins[0]), ...lines.slice(begins[0] + 1, commits[0])].join(
    "\n",
  );
}

async function verifiedMigrations(repoRoot, manifest) {
  const verified = [];
  for (const migration of manifest.migrations) {
    const source = await readFile(insideRepo(repoRoot, migration.file), "utf8");
    const actual = createHash("sha256").update(source).digest("hex");
    if (actual !== migration.sha256) {
      throw new Error(`Migration ${migration.migrationId} checksum does not match the contract`);
    }
    verified.push({
      ...migration,
      body: stripTransactionWrapper(source, migration.migrationId),
    });
  }
  return verified;
}

async function buildDeploymentSql(repoRoot, manifest, appCommit) {
  if (!commitPattern.test(appCommit)) {
    throw new Error("--app-commit must be the exact 40-character commit SHA");
  }
  const baseline = await readFile(insideRepo(repoRoot, manifest.baseline.probe), "utf8");
  const postflight = await readFile(insideRepo(repoRoot, manifest.postflightProbe), "utf8");
  const ledgerSource = await readFile(insideRepo(repoRoot, manifest.ledger.file), "utf8");
  const ledgerChecksum = createHash("sha256").update(ledgerSource).digest("hex");
  if (ledgerChecksum !== manifest.ledger.sha256) {
    throw new Error("Deployment ledger migration checksum does not match the contract");
  }
  const ledgerBody = stripTransactionWrapper(ledgerSource, "ledger-v1");
  const migrations = await verifiedMigrations(repoRoot, manifest);
  const expected = migrations.at(-1).migrationId;
  const ids = migrations.map(({ migrationId }) => migrationId).join(", ");
  const checksumCases = migrations
    .map(({ migrationId, sha256 }) => `WHEN ${migrationId} THEN ${sqlLiteral(sha256)}`)
    .join("\n        ");
  const migrationSql = migrations
    .map(
      ({ migrationId, file, sha256, body }) => `
SELECT NOT EXISTS (
  SELECT 1 FROM public.app_db_contract_migrations WHERE migration_id = ${migrationId}
) AS apply_migration_${migrationId} \\gset
\\if :apply_migration_${migrationId}
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '10min';
${body}
INSERT INTO public.app_db_contract_migrations(
  migration_id, filename, checksum_sha256, contract_id, app_commit
) VALUES (
  ${migrationId}, ${sqlLiteral(file)}, ${sqlLiteral(sha256)},
  ${sqlLiteral(manifest.contractId)}, ${sqlLiteral(appCommit)}
);
INSERT INTO public.app_db_contract_state(singleton, contract_id, migration_id, app_commit)
VALUES (true, ${sqlLiteral(manifest.contractId)}, ${migrationId}, ${sqlLiteral(appCommit)})
ON CONFLICT (singleton) DO UPDATE SET
  contract_id = EXCLUDED.contract_id,
  migration_id = EXCLUDED.migration_id,
  app_commit = EXCLUDED.app_commit,
  verified_at = clock_timestamp();
COMMIT;
\\echo db-contract-gate: applied ${migrationId}
\\else
\\echo db-contract-gate: no-op ${migrationId}
\\endif
`,
    )
    .join("\n");

  return `\\set ON_ERROR_STOP on
\\set QUIET on
SELECT pg_try_advisory_lock(hashtext('2000nl_deploy_db_contract_v1')) AS contract_lock_acquired \\gset
\\if :contract_lock_acquired
\\else
\\echo db-contract-gate: lock-busy
\\quit 73
\\endif

-- A database older than the declared managed baseline is never modified.
BEGIN READ ONLY;
${baseline}
COMMIT;

BEGIN;
${ledgerBody}
COMMIT;

DO $contract_validation$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.app_db_contract_migrations WHERE migration_id > ${expected}
  ) THEN
    RAISE EXCEPTION 'db-contract-gate: database is newer than application contract ${expected}';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.app_db_contract_migrations
    WHERE migration_id IN (${ids})
      AND checksum_sha256 IS DISTINCT FROM CASE migration_id
        ${checksumCases}
      END
  ) THEN
    RAISE EXCEPTION 'db-contract-gate: migration checksum drift';
  END IF;
END
$contract_validation$;

${migrationSql}

-- Exact RPC, grant, index/plan, and application compatibility contract.
${postflight}

DO $contract_state$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.app_db_contract_state
    WHERE singleton AND contract_id = ${sqlLiteral(manifest.contractId)}
      AND migration_id = ${expected}
  ) THEN
    RAISE EXCEPTION 'db-contract-gate: incompatible state after postflight';
  END IF;
END
$contract_state$;
\\echo db-contract-gate: compatible ${manifest.contractId}
SELECT pg_advisory_unlock(hashtext('2000nl_deploy_db_contract_v1')) \\g /dev/null
`;
}

function databaseEnvironment(urlString) {
  let url;
  try {
    url = new URL(urlString);
  } catch {
    throw new Error("Database URL is invalid");
  }
  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
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

function redact(message) {
  return message
    .replaceAll(/postgres(?:ql)?:\/\/[^\s'"<>]+/gi, "[redacted-db-url]")
    .replaceAll(/(password|token|secret|key)=([^\s]+)/gi, "$1=[redacted]")
    .replaceAll(/[A-Za-z0-9_-]{80,}/g, "[redacted-token]")
    .slice(-4000);
}

async function databaseUrl(options) {
  const direct = process.env[options.databaseUrlEnv] ??
    (options.databaseUrlEnv === "SUPABASE_DB_URL" ? process.env.DATABASE_URL : undefined);
  if (direct) return direct;
  if (!options.envFile) {
    throw new Error(`Missing database URL in ${options.databaseUrlEnv}`);
  }
  const source = await readFile(insideRepo(options.repoRoot, options.envFile), "utf8");
  const values = new Map();
  for (const line of source.split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values.set(match[1], value);
  }
  const fromFile = values.get(options.databaseUrlEnv) ??
    (options.databaseUrlEnv === "SUPABASE_DB_URL" ? values.get("DATABASE_URL") : undefined);
  if (!fromFile) throw new Error(`Missing database URL in ${options.envFile}`);
  return fromFile;
}

function runPsql(options, sql, url) {
  const childEnv = {
    ...process.env,
    ...databaseEnvironment(url),
    PGCONNECT_TIMEOUT: "10",
  };
  delete childEnv.SUPABASE_DB_URL;
  delete childEnv.DATABASE_URL;
  if (options.databaseUrlEnv !== "SUPABASE_DB_URL" && options.databaseUrlEnv !== "DATABASE_URL") {
    delete childEnv[options.databaseUrlEnv];
  }
  const result = spawnPostgresClient(
    options,
    ["-X", "--no-psqlrc", "--quiet", "--set=ON_ERROR_STOP=1"],
    {
      input: sql,
      encoding: "utf8",
      env: childEnv,
      maxBuffer: 1024 * 1024,
      timeout: 15 * 60 * 1000,
    },
  );
  const safeOutput = redact(`${result.stdout ?? ""}${result.stderr ?? ""}`);
  if (safeOutput.trim()) process[result.status === 0 ? "stdout" : "stderr"].write(safeOutput);
  if (result.error) throw new Error(`PostgreSQL client runtime failed: ${result.error.message}`);
  if (result.signal) throw new Error(`psql stopped by ${result.signal}`);
  if (result.status !== 0) process.exitCode = result.status ?? 1;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const manifest = await readManifest(options.repoRoot, options.manifestPath);
  const expectedMigration = manifest.migrations.at(-1).migrationId;
  if (options.command === "expected") {
    process.stdout.write(`${manifest.contractId} ${expectedMigration}\n`);
    return;
  }
  if (options.command === "rollout-status") {
    process.stdout.write(
      `${manifest.rollout.status} ${manifest.rollout.requiredMigrationId} ${manifest.rollout.coordinationIssue}\n`,
    );
    return;
  }
  if (options.command === "client-preflight") {
    preflightPostgresClient(options, redact);
    return;
  }
  if (options.command === "validate") {
    await buildDeploymentSql(options.repoRoot, manifest, "0000000000000000000000000000000000000000");
    process.stdout.write(`db-contract-gate: valid ${manifest.contractId}\n`);
    return;
  }
  if (options.command !== "apply") throw new Error(`Unknown command: ${options.command}`);
  if (manifest.rollout.status !== "enabled") {
    process.stderr.write(
      `db-contract-gate: rollout held for issue #${manifest.rollout.coordinationIssue} until migration ${manifest.rollout.requiredMigrationId}\n`,
    );
    process.exitCode = 78;
    return;
  }
  if (options.psqlContainerImage) preflightPostgresClient(options, redact);
  const sql = await buildDeploymentSql(options.repoRoot, manifest, options.appCommit);
  runPsql(options, sql, await databaseUrl(options));
}

main().catch((error) => {
  process.stderr.write(
    `db-contract-gate: ${redact(error instanceof Error ? error.message : String(error))}\n`,
  );
  process.exitCode = process.exitCode || error?.exitCode || 1;
});
