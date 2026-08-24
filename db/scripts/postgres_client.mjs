import { spawnSync } from "node:child_process";
import process from "node:process";

const pinnedImagePattern = /^[a-z0-9][a-z0-9./_-]*@sha256:[0-9a-f]{64}$/i;
const requiredPsqlMajor = 17;

function clientError(message, exitCode = 1) {
  const error = new Error(message);
  error.exitCode = exitCode;
  return error;
}

function validateClientOptions(options) {
  if (options.psqlContainerImage && !pinnedImagePattern.test(options.psqlContainerImage)) {
    throw clientError("PostgreSQL client container image must be digest-pinned");
  }
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.:-]*$/.test(options.psqlContainerNetwork)) {
    throw clientError("Invalid PostgreSQL client container network");
  }
}

function containerBaseArgs(options, network, pullPolicy) {
  return [
    "run",
    "--rm",
    `--pull=${pullPolicy}`,
    "--network",
    network,
    "--read-only",
    "--cap-drop=ALL",
    "--security-opt",
    "no-new-privileges:true",
    options.psqlContainerImage,
  ];
}

export function spawnPostgresClient(
  options,
  psqlArgs,
  spawnOptions,
  { preflight = false } = {},
) {
  if (!options.psqlContainerImage) {
    return spawnSync(options.psqlBin, psqlArgs, spawnOptions);
  }

  const base = containerBaseArgs(
    options,
    preflight ? "none" : options.psqlContainerNetwork,
    preflight ? "missing" : "never",
  );
  if (preflight) {
    return spawnSync(
      options.containerRuntimeBin,
      [...base, "psql", ...psqlArgs],
      spawnOptions,
    );
  }

  base.splice(base.length - 1, 0, "--interactive");
  for (const name of [
    "PGHOST",
    "PGPORT",
    "PGDATABASE",
    "PGUSER",
    "PGPASSWORD",
    "PGSSLMODE",
    "PGCONNECT_TIMEOUT",
  ]) {
    base.splice(base.length - 1, 0, "--env", name);
  }
  return spawnSync(
    options.containerRuntimeBin,
    [...base, "psql", ...psqlArgs],
    spawnOptions,
  );
}

export function preflightPostgresClient(options, redact) {
  validateClientOptions(options);
  const preflightEnv = { ...process.env };
  for (const name of [
    "SUPABASE_DB_URL",
    "DATABASE_URL",
    options.databaseUrlEnv,
    "PGHOST",
    "PGPORT",
    "PGDATABASE",
    "PGUSER",
    "PGPASSWORD",
    "PGSSLMODE",
  ]) {
    delete preflightEnv[name];
  }
  const result = spawnPostgresClient(
    options,
    ["--version"],
    {
      encoding: "utf8",
      env: preflightEnv,
      maxBuffer: 1024 * 1024,
      timeout: 5 * 60 * 1000,
    },
    { preflight: true },
  );
  if (result.error) {
    throw clientError(`PostgreSQL client runtime unavailable: ${result.error.message}`);
  }
  if (result.signal) {
    throw clientError(`PostgreSQL client preflight stopped by ${result.signal}`);
  }
  const safeOutput = redact(`${result.stdout ?? ""}${result.stderr ?? ""}`);
  if (result.status !== 0) {
    throw clientError(
      `PostgreSQL client unusable${safeOutput.trim() ? `: ${safeOutput.trim()}` : ""}`,
      result.status ?? 1,
    );
  }
  const versionPattern = new RegExp(`psql \\(PostgreSQL\\) ${requiredPsqlMajor}\\.`);
  if (!versionPattern.test(result.stdout ?? "")) {
    throw clientError(
      `DB contract requires PostgreSQL client major ${requiredPsqlMajor}`,
    );
  }
  process.stdout.write(
    `db-contract-gate: client-ready PostgreSQL ${requiredPsqlMajor}${
      options.psqlContainerImage ? " container" : " native"
    }\n`,
  );
}
