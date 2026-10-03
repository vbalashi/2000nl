import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { ensureLanguage, ensureUserWithSettings, getDbUrl, runMigrations, withTransaction } from "./dbTestUtils";

const dbUrl = getDbUrl();
const describeIfDb = dbUrl ? describe : describe.skip;

describeIfDb("admin user registry database projection", () => {
  const pool = new Pool({ connectionString: dbUrl });

  beforeAll(async () => { await runMigrations(pool); });
  afterAll(async () => { await pool.end(); });

  test("returns bounded learner facts and counts while excluding operator-only identities", async () => {
    await withTransaction(pool, async (client) => {
      const learnerId = randomUUID();
      const operatorId = randomUUID();
      const allowlistedId = randomUUID();
      const learnerEmail = `needle-${randomUUID()}@example.test`;
      const operatorEmail = `operator-${randomUUID()}@example.test`;
      const allowlistedEmail = `pending-operator-${randomUUID()}@example.test`;

      await ensureUserWithSettings(client, learnerId);
      await ensureUserWithSettings(client, operatorId);
      await ensureUserWithSettings(client, allowlistedId);
      await client.query("delete from user_settings where user_id = any($1::uuid[])", [[operatorId, allowlistedId]]);
      await ensureLanguage(client, "nl");
      await client.query(
        `update auth.users
            set email = case id when $1 then $2 when $3 then $4 when $5 then $6 end,
                created_at = case id when $1 then '2026-10-01T00:00:00Z'::timestamptz else created_at end,
                last_sign_in_at = case id when $1 then '2026-10-02T12:30:00Z'::timestamptz end
          where id = any($7::uuid[])`,
        [learnerId, learnerEmail, operatorId, operatorEmail, allowlistedId, allowlistedEmail, [learnerId, operatorId, allowlistedId]],
      );
      await client.query(
        `insert into admin_operators(email, user_id, is_active, permissions)
         values ($1, $2, false, ARRAY['users.read']::text[]),
                ($3, null, true, ARRAY['users.read']::text[])`,
        [operatorEmail, operatorId, allowlistedEmail],
      );

      const firstListId = (await client.query(
        `insert into user_word_lists(user_id, name) values ($1, 'First list') returning id`,
        [learnerId],
      )).rows[0].id as string;
      const secondListId = (await client.query(
        `insert into user_word_lists(user_id, name) values ($1, 'Second list') returning id`,
        [learnerId],
      )).rows[0].id as string;
      const firstWordId = (await client.query(
        `insert into word_entries(language_code, headword, raw) values ('nl', $1, '{}'::jsonb) returning id`,
        [`word-${randomUUID()}`],
      )).rows[0].id as string;
      const secondWordId = (await client.query(
        `insert into word_entries(language_code, headword, raw) values ('nl', $1, '{}'::jsonb) returning id`,
        [`word-${randomUUID()}`],
      )).rows[0].id as string;
      await client.query(
        `insert into user_word_list_items(list_id, word_id)
         values ($1, $3), ($1, $4), ($2, $3)`,
        [firstListId, secondListId, firstWordId, secondWordId],
      );

      const { rows } = await client.query(
        `select user_id, email, created_at, last_sign_in_at,
                personal_list_count, personal_entry_link_count
           from public.admin_user_registry_page($1, null, 1, 25)`,
        ["needle-"],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        user_id: learnerId,
        email: learnerEmail,
        personal_list_count: 2,
        personal_entry_link_count: 3,
      });
      expect(rows[0].created_at).toEqual(new Date("2026-10-01T00:00:00Z"));
      expect(rows[0].last_sign_in_at).toEqual(new Date("2026-10-02T12:30:00Z"));

      const { rows: excludedOperator } = await client.query(
        `select user_id from public.admin_user_registry_page(null, $1, 1, 1)`,
        [operatorId],
      );
      const { rows: excludedAllowlist } = await client.query(
        `select user_id from public.admin_user_registry_page(null, $1, 1, 1)`,
        [allowlistedId],
      );
      expect(excludedOperator).toEqual([]);
      expect(excludedAllowlist).toEqual([]);
    });
  });

  test.each([true, false])("retains an operator with a learner profile (active=%s)", async active => {
    await withTransaction(pool, async client => {
      const userId = randomUUID();
      const email = `dual-${randomUUID()}@example.test`;
      await ensureUserWithSettings(client, userId);
      await client.query("update auth.users set email=$2 where id=$1", [userId, email]);
      await client.query("insert into admin_operators(email,user_id,is_active,permissions) values($1,$2,$3,ARRAY['users.read']::text[])", [email,userId,active]);
      const result = await client.query("select user_id from public.admin_user_registry_page(null,$1,1,25)", [userId]);
      expect(result.rows).toEqual([{user_id:userId}]);
      const search = await client.query("select user_id from public.admin_user_registry_page($1,null,1,25)", [email]);
      expect(search.rows).toEqual([{user_id:userId}]);
      const profile = await client.query("select user_id from user_settings where user_id=$1", [userId]);
      expect(profile.rows).toEqual([{user_id:userId}]);
    });
  });

  test("returns every learner exactly once across pages, with one lookahead row", async () => {
    await withTransaction(pool, async (client) => {
      const prefix = `pagination-${randomUUID()}`;
      const ids = Array.from({ length: 57 }, () => randomUUID()).sort();
      for (const id of ids) {
        await ensureUserWithSettings(client, id);
        await client.query(
          `update auth.users set email = $2, created_at = '2026-10-01T00:00:00Z' where id = $1`,
          [id, `${prefix}-${id}@example.test`],
        );
      }
      const visible: string[] = [];
      for (let page = 1; page <= 3; page++) {
        const { rows } = await client.query(
          `select user_id from public.admin_user_registry_page($1, null, $2, 25)`,
          [prefix, page],
        );
        expect(rows.length).toBe(page < 3 ? 26 : 7);
        expect(rows.map(row => row.user_id)).toEqual(ids.slice((page - 1) * 25, (page - 1) * 25 + 26));
        visible.push(...rows.slice(0, 25).map(row => row.user_id));
      }
      expect(visible).toEqual(ids);
      const { rows: empty } = await client.query(
        `select user_id from public.admin_user_registry_page($1, null, 4, 25)`, [prefix],
      );
      expect(empty).toEqual([]);
      // An exact full page must not advertise a next page.
      const { rows: exact } = await client.query(
        `select user_id from public.admin_user_registry_page($1, null, 1, 57)`, [prefix],
      );
      expect(exact).toHaveLength(57);
    });
  });

  test("keeps the registry projection executable only by service_role", async () => {
    const { rows } = await pool.query(`
      select has_function_privilege('anon', 'public.admin_user_registry_page(text,uuid,integer,integer)', 'EXECUTE') as anon_can_execute,
             has_function_privilege('authenticated', 'public.admin_user_registry_page(text,uuid,integer,integer)', 'EXECUTE') as authenticated_can_execute,
             has_function_privilege('service_role', 'public.admin_user_registry_page(text,uuid,integer,integer)', 'EXECUTE') as service_role_can_execute
    `);
    expect(rows[0]).toEqual({ anon_can_execute: false, authenticated_can_execute: false, service_role_can_execute: true });
  });
});
