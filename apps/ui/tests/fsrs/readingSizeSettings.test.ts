import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { randomUUID } from "crypto";
import { Pool, type PoolClient } from "pg";
import { getDbUrl, runMigrations, withTransaction } from "./dbTestUtils";

const databaseUrl = getDbUrl();
const describeDb = databaseUrl ? describe : describe.skip;

async function assumeAuthenticatedIfSupported(client: PoolClient, userId: string) {
  const { rows } = await client.query(
    `select has_table_privilege('authenticated', 'public.user_settings', 'UPDATE') as can_update`,
  );
  if (!rows[0]?.can_update) return false;

  await client.query(`set local role authenticated`);
  await client.query(`select set_config('request.jwt.claim.sub', $1, true)`, [userId]);
  return true;
}

describeDb("reading-size user settings storage", () => {
  const pool = new Pool({ connectionString: databaseUrl });

  beforeAll(async () => {
    await runMigrations(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  test("defaults both profiles to normal and permits independent RLS updates", async () => {
    const userId = randomUUID();
    const otherUserId = randomUUID();

    await withTransaction(
      pool,
      async (client) => {
        await client.query(
          `insert into auth.users (id, email) values ($1, $2), ($3, $4)`,
          [userId, `${userId}@test.local`, otherUserId, `${otherUserId}@test.local`],
        );
        const { rows: policies } = await client.query(
          `select cmd, qual, with_check
             from pg_policies
            where schemaname = 'public'
              and tablename = 'user_settings'
              and policyname = 'user_settings_update_self'`,
        );
        expect(policies).toHaveLength(1);
        expect(policies[0].qual).toContain("auth.uid()");
        expect(policies[0].with_check).toContain("auth.uid()");
        const usesRlsRole = await assumeAuthenticatedIfSupported(client, userId);
        await client.query(
          `update user_settings
           set preferences = '{"onboarding":"complete"}'::jsonb
           where user_id = $1`,
          [userId],
        );

        const { rows: defaults } = await client.query(
          `select reading_size_phone, reading_size_desktop, preferences
           from user_settings where user_id = $1`,
          [userId],
        );
        expect(defaults[0]).toEqual({
          reading_size_phone: "normal",
          reading_size_desktop: "normal",
          preferences: { onboarding: "complete" },
        });

        await client.query(
          `update user_settings set reading_size_phone = $2 where user_id = $1`,
          [userId, "large"],
        );
        const { rows: phoneUpdate } = await client.query(
          `select reading_size_phone, reading_size_desktop, preferences
           from user_settings where user_id = $1`,
          [userId],
        );
        expect(phoneUpdate[0]).toEqual({
          reading_size_phone: "large",
          reading_size_desktop: "normal",
          preferences: { onboarding: "complete" },
        });

        await client.query(
          `update user_settings set reading_size_desktop = $2 where user_id = $1`,
          [userId, "largest"],
        );
        const { rows: desktopUpdate } = await client.query(
          `select reading_size_phone, reading_size_desktop, preferences
           from user_settings where user_id = $1`,
          [userId],
        );
        expect(desktopUpdate[0]).toEqual({
          reading_size_phone: "large",
          reading_size_desktop: "largest",
          preferences: { onboarding: "complete" },
        });

        if (usesRlsRole) {
          const { rowCount: otherUserUpdateCount } = await client.query(
            `update user_settings set reading_size_phone = 'largest' where user_id = $1`,
            [otherUserId],
          );
          expect(otherUserUpdateCount).toBe(0);
        }
      },
      userId,
    );
  });

  test("rejects values outside the bounded reading-size contract", async () => {
    const userId = randomUUID();

    await withTransaction(
      pool,
      async (client) => {
        await client.query(
          `insert into auth.users (id, email) values ($1, $2)`,
          [userId, `${userId}@test.local`],
        );
        await assumeAuthenticatedIfSupported(client, userId);

        await expect(
          client.query(
            `update user_settings set reading_size_phone = $2 where user_id = $1`,
            [userId, "huge"],
          ),
        ).rejects.toThrow(/reading_size_phone/);
      },
      userId,
    );
  });

  test("preserves the other profile when phone and desktop saves race", async () => {
    const userId = randomUUID();
    const phoneClient = await pool.connect();
    const desktopClient = await pool.connect();

    try {
      await pool.query(
        `insert into auth.users (id, email) values ($1, $2)`,
        [userId, `${userId}@test.local`],
      );
      await pool.query(
        `update user_settings set preferences = '{"theme":"dark"}'::jsonb where user_id = $1`,
        [userId],
      );

      const save = async (client: typeof phoneClient, column: string, value: string) => {
        await client.query("begin");
        await assumeAuthenticatedIfSupported(client, userId);
        await client.query(
          `insert into user_settings (user_id, ${column}) values ($1, $2)
           on conflict (user_id) do update set ${column} = excluded.${column}`,
          [userId, value],
        );
        await client.query("commit");
      };

      await Promise.all([
        save(phoneClient, "reading_size_phone", "large"),
        save(desktopClient, "reading_size_desktop", "largest"),
      ]);

      const { rows } = await pool.query(
        `select reading_size_phone, reading_size_desktop, preferences
         from user_settings where user_id = $1`,
        [userId],
      );
      expect(rows[0]).toEqual({
        reading_size_phone: "large",
        reading_size_desktop: "largest",
        preferences: { theme: "dark" },
      });
    } finally {
      await phoneClient.query("rollback").catch(() => undefined);
      await desktopClient.query("rollback").catch(() => undefined);
      phoneClient.release();
      desktopClient.release();
      await pool.query(`delete from auth.users where id = $1`, [userId]);
    }
  });
});
