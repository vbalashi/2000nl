import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";

const repoRoot = path.resolve(import.meta.dirname, "../..");
const runner = path.join(repoRoot, "db/scripts/deploy_db_contract.mjs");
const baseDatabaseUrl = process.env.PRE_SWITCH_PROBE_INTEGRATION_DATABASE_URL;
const containerImage = process.env.DB_CONTRACT_INTEGRATION_PSQL_CONTAINER_IMAGE;
const containerNetwork = process.env.DB_CONTRACT_INTEGRATION_PSQL_CONTAINER_NETWORK ?? "bridge";
const containerDatabaseHost = process.env.DB_CONTRACT_INTEGRATION_PSQL_HOST;
const qaUserId = "23800000-0000-0000-0000-000000000001";
const appCommit = "2380000000000000000000000000000000000000";

function postgresEnvironment(urlString) {
  const url = new URL(urlString);
  return {
    ...process.env,
    PGHOST: url.hostname,
    PGPORT: url.port || "5432",
    PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGSSLMODE: url.searchParams.get("sslmode") ?? "disable",
  };
}

function psql(urlString, sql) {
  return spawnSync("psql", ["-X", "--no-psqlrc", "-At", "--set=ON_ERROR_STOP=1"], {
    input: sql,
    encoding: "utf8",
    env: postgresEnvironment(urlString),
  });
}

function apply(databaseUrl) {
  const clientArgs = containerImage
    ? [
        "--psql-container-image",
        containerImage,
        "--psql-container-network",
        containerNetwork,
      ]
    : [];
  return spawnSync(
    process.execPath,
    [
      runner,
      "apply",
      "--repo-root",
      repoRoot,
      ...clientArgs,
      "--database-url-env",
      "PRE_SWITCH_PROBE_TARGET_URL",
      "--app-commit",
      appCommit,
    ],
    {
      encoding: "utf8",
      env: { ...process.env, PRE_SWITCH_PROBE_TARGET_URL: databaseUrl },
    },
  );
}

function learnerSnapshot(databaseUrl) {
  const result = psql(
    databaseUrl,
    `SELECT concat_ws('|',
      (SELECT count(*) FROM public.user_card_status WHERE user_id = '${qaUserId}'),
      (SELECT count(*) FROM public.user_review_log WHERE user_id = '${qaUserId}'),
      (SELECT count(*) FROM public.user_card_known_marks WHERE user_id = '${qaUserId}'),
      (SELECT count(*) FROM public.user_card_action_events WHERE user_id = '${qaUserId}'),
      (SELECT count(*) FROM public.feedback_items WHERE reporter_user_id = '${qaUserId}'),
      (SELECT count(*) FROM public.diagnostic_report_receipts WHERE reporter_user_id = '${qaUserId}')
    );\n`,
  );
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

test(
  "the exact production-shaped probe uses only the QA identity and preserves learner state",
  { skip: !baseDatabaseUrl },
  () => {
    const localTarget = new URL(baseDatabaseUrl);
    if (
      !["127.0.0.1", "localhost", "::1"].includes(localTarget.hostname) ||
      !/(contract_test|issue238)/i.test(localTarget.pathname)
    ) {
      throw new Error("Pre-switch probe integration accepts only a scoped loopback database");
    }

    const seed = psql(
      baseDatabaseUrl,
      `INSERT INTO auth.users (id, email)
       VALUES ('${qaUserId}', 'test@2000nl.test')
       ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;
       DO $$
       BEGIN
         IF (SELECT count(*) FROM auth.users WHERE email = 'test@2000nl.test') <> 1
            OR NOT EXISTS (
              SELECT 1 FROM auth.users
              WHERE id = '${qaUserId}' AND email = 'test@2000nl.test'
            ) THEN
           RAISE EXCEPTION 'integration QA identity mismatch';
         END IF;
       END $$;\n`,
    );
    assert.equal(seed.status, 0, seed.stderr);

    const before = learnerSnapshot(baseDatabaseUrl);
    const containerTarget = new URL(baseDatabaseUrl);
    if (containerDatabaseHost) containerTarget.hostname = containerDatabaseHost;

    const first = apply(containerTarget.toString());
    assert.equal(first.status, 0, first.stderr);
    assert.match(first.stdout, /pre-switch-read-probe passed/);
    assert.match(first.stdout, /compatible 2000nl-db-126/);

    const replay = apply(containerTarget.toString());
    assert.equal(replay.status, 0, replay.stderr);
    assert.match(replay.stdout, /no-op 126/);
    assert.match(replay.stdout, /pre-switch-read-probe passed/);
    assert.match(replay.stdout, /compatible 2000nl-db-126/);

    assert.equal(learnerSnapshot(baseDatabaseUrl), before);
  },
);
