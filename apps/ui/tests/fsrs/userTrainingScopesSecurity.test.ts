import { randomUUID } from "crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import {
  ensureUserWithSettings,
  getDbUrl,
  withTransaction,
  runMigrations,
} from "./dbTestUtils";

const databaseUrl = getDbUrl();
const describeDb = databaseUrl ? describe : describe.skip;

describeDb("user Training scope database boundary", () => {
  const pool = new Pool({ connectionString: databaseUrl });

  beforeAll(async () => {
    await runMigrations(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  test("denies direct client table privileges and preserves owner-scoped RPCs", async () => {
    const { rows } = await pool.query(
      `select c.relrowsecurity,
              c.relforcerowsecurity,
              exists (
                select 1 from pg_policy p where p.polrelid = c.oid
              ) as has_direct_policy,
              has_table_privilege('anon', c.oid, 'select') as anon_select,
              has_table_privilege('anon', c.oid, 'insert') as anon_insert,
              has_table_privilege('anon', c.oid, 'update') as anon_update,
              has_table_privilege('anon', c.oid, 'delete') as anon_delete,
              has_table_privilege('authenticated', c.oid, 'select') as authenticated_select,
              has_table_privilege('authenticated', c.oid, 'insert') as authenticated_insert,
              has_table_privilege('authenticated', c.oid, 'update') as authenticated_update,
              has_table_privilege('authenticated', c.oid, 'delete') as authenticated_delete,
              exists (
                select 1
                  from pg_attribute a
                 where a.attrelid = c.oid
                   and a.attnum > 0
                   and not a.attisdropped
                   and (
                     has_column_privilege('anon', c.oid, a.attname, 'select')
                     or has_column_privilege('anon', c.oid, a.attname, 'insert')
                     or has_column_privilege('anon', c.oid, a.attname, 'update')
                     or has_column_privilege('anon', c.oid, a.attname, 'references')
                     or has_column_privilege('authenticated', c.oid, a.attname, 'select')
                     or has_column_privilege('authenticated', c.oid, a.attname, 'insert')
                     or has_column_privilege('authenticated', c.oid, a.attname, 'update')
                     or has_column_privilege('authenticated', c.oid, a.attname, 'references')
                   )
              ) as has_client_column_privilege,
              has_function_privilege(
                'authenticated',
                'public.get_active_training_scope(uuid,text)',
                'execute'
              ) as authenticated_get_rpc,
              has_function_privilege(
                'authenticated',
                'public.update_active_training_scope(uuid,text,uuid,text,text,text,text[],integer)',
                'execute'
              ) as authenticated_update_rpc,
              has_function_privilege(
                'anon',
                'public.get_active_training_scope(uuid,text)',
                'execute'
              ) as anon_get_rpc,
              has_function_privilege(
                'anon',
                'public.update_active_training_scope(uuid,text,uuid,text,text,text,text[],integer)',
                'execute'
              ) as anon_update_rpc
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relname = 'user_training_scopes'`,
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      relrowsecurity: true,
      relforcerowsecurity: false,
      has_direct_policy: false,
      anon_select: false,
      anon_insert: false,
      anon_update: false,
      anon_delete: false,
      authenticated_select: false,
      authenticated_insert: false,
      authenticated_update: false,
      authenticated_delete: false,
      has_client_column_privilege: false,
      authenticated_get_rpc: true,
      authenticated_update_rpc: true,
      anon_get_rpc: false,
      anon_update_rpc: false,
    });

    const userId = randomUUID();
    const otherUserId = randomUUID();

    await withTransaction(pool, async (client) => {
      await ensureUserWithSettings(client, userId);
      await ensureUserWithSettings(client, otherUserId);
      await client.query(
        `insert into public.user_training_scopes (
           user_id, language_code, card_filter, new_review_ratio
         ) values ($1, 'nl', 'review', 5)`,
        [otherUserId],
      );
      await client.query(
        `select set_config('request.jwt.claim.sub', $1, true)`,
        [userId],
      );
      await client.query(`set local role authenticated`);

      const ownUpdate = await client.query(
        `select public.update_active_training_scope(
           $1::uuid, 'nl', null, null, null, 'new', null, 3
         ) as scope`,
        [userId],
      );
      expect(ownUpdate.rows[0].scope).toMatchObject({
        language_code: "nl",
        card_filter: "new",
        new_review_ratio: 3,
        has_saved_scope: true,
      });

      const ownRead = await client.query(
        `select public.get_active_training_scope($1::uuid, 'nl') as scope`,
        [userId],
      );
      expect(ownRead.rows[0].scope).toMatchObject({
        card_filter: "new",
        new_review_ratio: 3,
      });

      await client.query(`savepoint cross_user_read`);
      await expect(
        client.query(
          `select public.get_active_training_scope($1::uuid, 'nl')`,
          [otherUserId],
        ),
      ).rejects.toThrow(/user_id does not match authenticated user/);
      await client.query(`rollback to savepoint cross_user_read`);

      await client.query(`savepoint cross_user_update`);
      await expect(
        client.query(
          `select public.update_active_training_scope(
             $1::uuid, 'nl', null, null, null, 'new', null, 1
           )`,
          [otherUserId],
        ),
      ).rejects.toThrow(/user_id does not match authenticated user/);
      await client.query(`rollback to savepoint cross_user_update`);

      await client.query(`reset role`);
      const otherScope = await client.query(
        `select card_filter, new_review_ratio
           from public.user_training_scopes
          where user_id = $1 and language_code = 'nl'`,
        [otherUserId],
      );
      expect(otherScope.rows).toEqual([
        { card_filter: "review", new_review_ratio: 5 },
      ]);
    });
  });
});
