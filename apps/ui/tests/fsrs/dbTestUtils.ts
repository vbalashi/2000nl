import fs from "fs";
import path from "path";
import { Pool, PoolClient } from "pg";

export const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export const getDbUrl = () =>
  process.env.FSRS_TEST_DB_URL || process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;

export async function ensureAuthSchema(pool: Pool) {
  await pool.query(`
    create schema if not exists auth;
    create table if not exists auth.users (
      id uuid primary key,
      email text,
      created_at timestamptz default now()
    );

    -- Supabase compatibility: many migrations reference auth.uid() in RLS policies.
    -- In Supabase, this reads the user id from JWT claims; in tests we just need
    -- the function to exist so migrations compile on plain Postgres.
    create or replace function auth.uid()
    returns uuid
    language sql
    stable
    as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$;
  `);
}

export async function runMigrations(pool: Pool) {
  // Vitest runs files in parallel in CI, but our workflow uses a single shared
  // postgres DB service. Use a DB-level lock + migration table so migrations
  // are applied exactly once and cannot race.
  await pool.query(`select pg_advisory_lock(hashtext('2000nl_fsrs_test_migrations'))`);
  try {
    await ensureAuthSchema(pool);

    await pool.query(`
      create table if not exists public.__fsrs_test_migrations (
        filename text primary key,
        applied_at timestamptz not null default now()
      );
    `);

    const migrationsDir = path.resolve(process.cwd(), "..", "..", "db", "migrations");
    const migrationFiles = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".sql"))
      // bootstrap.sql contains psql meta-commands (\set, \i) and can't be run
      // through the node pg driver.
      .filter((f) => f !== "bootstrap.sql")
      .sort();

    for (const file of migrationFiles) {
      const { rowCount } = await pool.query(
        `select 1 from public.__fsrs_test_migrations where filename = $1`,
        [file]
      );
      if (rowCount && rowCount > 0) continue;

      const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
      await pool.query(sql);
      await pool.query(`insert into public.__fsrs_test_migrations (filename) values ($1)`, [file]);
    }
  } finally {
    await pool.query(`select pg_advisory_unlock(hashtext('2000nl_fsrs_test_migrations'))`);
  }
}

export async function withTransaction<T>(
  pool: Pool,
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("ROLLBACK"); // keep DB clean across tests
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function ensureUserWithSettings(
  client: PoolClient,
  userId: string,
  settings?: { daily_new_limit?: number; daily_review_limit?: number; target_retention?: number }
) {
  await client.query(
    `insert into auth.users (id, email) values ($1, $2)
     on conflict (id) do nothing`,
    [userId, `${userId}@test.local`]
  );

  await client.query(
    `insert into user_settings (user_id, daily_new_limit, daily_review_limit, target_retention, mix_mode)
     values ($1, $2, $3, coalesce($4, 0.9), 'mixed')
     on conflict (user_id) do update
       set daily_new_limit = excluded.daily_new_limit,
           daily_review_limit = excluded.daily_review_limit,
           target_retention = excluded.target_retention`,
    [userId, settings?.daily_new_limit ?? 10, settings?.daily_review_limit ?? 40, settings?.target_retention]
  );
}

export async function ensureLanguage(client: PoolClient, code = "nl") {
  await client.query(
    `insert into languages (code, name) values ($1, $2)
     on conflict (code) do nothing`,
    [code, "Dutch"]
  );
}

export async function insertWord(
  client: PoolClient,
  headword: string,
  opts?: { is_nt2_2000?: boolean }
): Promise<string> {
  await ensureLanguage(client);
  const { rows } = await client.query(
    `insert into word_entries (language_code, headword, part_of_speech, gender, is_nt2_2000, raw)
     values ('nl', $1, 'noun', 'n', coalesce($2, true), '{}'::jsonb)
     returning id`,
    [headword, opts?.is_nt2_2000 ?? true]
  );
  return rows[0].id as string;
}

export async function callGetNextWord(
  client: PoolClient,
  userId: string,
  mode: string,
  exclude: string[] = []
) {
  const { rows } = await client.query(
    `select get_next_word($1, $2, $3::uuid[]) as item`,
    [userId, mode, exclude]
  );
  return rows[0]?.item as any | undefined;
}
