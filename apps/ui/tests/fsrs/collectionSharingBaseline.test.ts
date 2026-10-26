import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import {
  ensureUserWithSettings,
  getDbUrl,
  insertWord,
  runMigrations,
  withTransaction,
} from "./dbTestUtils";

const dbUrl = getDbUrl();
const describeIfDb = dbUrl ? describe : describe.skip;

async function asUser(client: PoolClient, userId: string) {
  await client.query("select set_config('request.jwt.claim.sub', $1, true)", [
    userId,
  ]);
  await client.query("set local role authenticated");
  expect((await client.query("select current_user as role")).rows[0].role).toBe(
    "authenticated",
  );
}

async function rejectsWithoutAborting(
  client: PoolClient,
  sql: string,
  params: unknown[],
  error: RegExp,
) {
  await client.query("savepoint expected_rejection");
  await expect(client.query(sql, params)).rejects.toThrow(error);
  await client.query("rollback to savepoint expected_rejection");
  await client.query("release savepoint expected_rejection");
}

async function createList(
  client: PoolClient,
  userId: string,
  name = randomUUID(),
) {
  return (
    await client.query(
      "select create_user_word_list($1, $2, 'Baseline collection', 'nl', 'nl') as list",
      [userId, name],
    )
  ).rows[0].list;
}

// Observe persisted learning data as the fixture administrator, never as the
// caller of the operation under test. Full rows detect updates as well as inserts.
async function learningSnapshot(client: PoolClient, userIds: string[]) {
  await client.query("reset role");
  const tables = [
    "public.user_card_status",
    "public.user_review_log",
    "public.user_card_known_marks",
    "public.user_card_action_events",
    "private.training_pair_exclusions",
    "private.training_pair_exclusion_events",
    "private.training_headword_exclusions",
    "private.training_headword_exclusion_events",
  ];
  const snapshot: Record<string, unknown> = {};
  for (const table of tables) {
    snapshot[table] = (
      await client.query(
        `select to_jsonb(t) as row from ${table} t where user_id = any($1::uuid[])
       order by to_jsonb(t)::text`,
        [userIds],
      )
    ).rows;
  }
  return snapshot;
}

describeIfDb("#684 existing collection and copy baseline", () => {
  const pool = new Pool({ connectionString: dbUrl });
  beforeAll(async () => {
    await runMigrations(pool);
  });
  afterAll(async () => {
    await pool.end();
  });

  test("authenticated CRUD and membership enforce owner isolation at RPC and RLS seams", async () => {
    const owner = randomUUID();
    const outsider = randomUUID();
    await withTransaction(
      pool,
      async (client) => {
        await ensureUserWithSettings(client, owner);
        await ensureUserWithSettings(client, outsider);
        const entry = await insertWord(client, `baseline-rls-${randomUUID()}`);
        // Disposable-transaction fixture only: plain Postgres lacks Supabase's
        // default Data API table grants. This tests RLS, not production privileges.
        await client.query("grant usage on schema auth to authenticated");
        await client.query(
          "grant select, insert, update, delete on user_word_lists, user_word_list_items to authenticated",
        );
        await asUser(client, owner);
        const list = await createList(client, owner);
        await client.query("select add_entry_to_user_list($1, $2, $3)", [
          owner,
          list.id,
          entry,
        ]);
        const updated = (
          await client.query(
            "select update_user_word_list($1, $2, 'Renamed baseline', 'Updated') as list",
            [owner, list.id],
          )
        ).rows[0].list;
        expect(updated).toMatchObject({
          id: list.id,
          name: "Renamed baseline",
          description: "Updated",
        });
        expect(updated.user_word_list_items).toEqual([{ count: 1 }]);
        expect(
          (
            await client.query("select id from user_word_lists where id=$1", [
              list.id,
            ])
          ).rows,
        ).toEqual([{ id: list.id }]);
        expect(
          (
            await client.query(
              "select word_id from user_word_list_items where list_id=$1",
              [list.id],
            )
          ).rows,
        ).toEqual([{ word_id: entry }]);

        await asUser(client, outsider);
        expect(
          (
            await client.query("select * from user_word_lists where id=$1", [
              list.id,
            ])
          ).rows,
        ).toEqual([]);
        expect(
          (
            await client.query(
              "select * from user_word_list_items where list_id=$1",
              [list.id],
            )
          ).rows,
        ).toEqual([]);
        expect(
          (
            await client.query(
              "update user_word_lists set name='Stolen' where id=$1 returning id",
              [list.id],
            )
          ).rows,
        ).toEqual([]);
        expect(
          (
            await client.query(
              "delete from user_word_list_items where list_id=$1 returning word_id",
              [list.id],
            )
          ).rows,
        ).toEqual([]);
        expect(
          (
            await client.query(
              "delete from user_word_lists where id=$1 returning id",
              [list.id],
            )
          ).rows,
        ).toEqual([]);
        await rejectsWithoutAborting(
          client,
          "insert into user_word_list_items(list_id,word_id) values($1,$2)",
          [list.id, entry],
          /row-level security/,
        );
        await rejectsWithoutAborting(
          client,
          "select create_user_word_list($1,'Forged owner')",
          [owner],
          /unauthorized/,
        );
        await rejectsWithoutAborting(
          client,
          "select update_user_word_list($1,$2,'Stolen')",
          [outsider, list.id],
          /list_not_found/,
        );
        await rejectsWithoutAborting(
          client,
          "select add_entry_to_user_list($1,$2,$3)",
          [outsider, list.id, entry],
          /list_not_found/,
        );
        await rejectsWithoutAborting(
          client,
          "select remove_entries_from_user_list($1,$2,$3::uuid[])",
          [outsider, list.id, [entry]],
          /list_not_found/,
        );
        await rejectsWithoutAborting(
          client,
          "select delete_user_word_list($1,$2)",
          [outsider, list.id],
          /list_not_found/,
        );
        await rejectsWithoutAborting(
          client,
          "select get_user_list_membership($1,$2,$3::uuid[])",
          [outsider, list.id, [entry]],
          /user_list_not_found/,
        );
        expect(
          (
            await client.query(
              "select get_word_list_summary($1,$2,'user') as list",
              [outsider, list.id],
            )
          ).rows[0].list,
        ).toBeNull();
        expect(
          (
            await client.query(
              "select get_available_word_lists($1,'nl','user') as lists",
              [outsider],
            )
          ).rows[0].lists,
        ).toEqual([]);

        await asUser(client, owner);
        await client.query("select delete_user_word_list($1,$2)", [
          owner,
          list.id,
        ]);
        expect(
          (
            await client.query(
              "select * from user_word_list_items where list_id=$1",
              [list.id],
            )
          ).rows,
        ).toEqual([]);
        expect(
          (
            await client.query(
              "select get_word_list_summary($1,$2,'user') as list",
              [owner, list.id],
            )
          ).rows[0].list,
        ).toBeNull();
        await client.query("reset role");
        expect(
          (
            await client.query("select id from word_entries where id=$1", [
              entry,
            ])
          ).rows,
        ).toEqual([{ id: entry }]);
      },
      owner,
    );
  });

  test("mixed dictionary references remain exact and collection reads/membership changes preserve learning", async () => {
    const owner = randomUUID();
    await withTransaction(
      pool,
      async (client) => {
        await ensureUserWithSettings(client, owner);
        const common = await insertWord(
          client,
          `baseline-common-${randomUUID()}`,
        );
        await client.query(
          "select handle_card_review($1,$2,'word-to-definition','success',$3)",
          [owner, common, randomUUID()],
        );
        const before = await learningSnapshot(client, [owner]);
        await asUser(client, owner);
        const authored = (
          await client.query(
            "select create_user_dictionary_entry($1,null,$2::jsonb) as id",
            [
              owner,
              JSON.stringify({
                headword: `baseline-authored-${randomUUID()}`,
                languageCode: "nl",
                definition: "Authored definition",
              }),
            ],
          )
        ).rows[0].id;
        const list = await createList(client, owner);
        for (const entry of [common, authored, common]) {
          await client.query("select add_entry_to_user_list($1,$2,$3)", [
            owner,
            list.id,
            entry,
          ]);
        }
        const entries = [common, authored].sort();
        expect(
          (
            await client.query(
              "select get_user_list_membership($1,$2,$3::uuid[]) as ids",
              [owner, list.id, entries],
            )
          ).rows[0].ids,
        ).toEqual(entries);
        const summary = (
          await client.query(
            "select get_word_list_summary($1,$2,'user') as list",
            [owner, list.id],
          )
        ).rows[0].list;
        expect(summary.user_word_list_items).toEqual([{ count: 2 }]);
        const catalog = (
          await client.query(
            "select get_available_word_lists($1,'nl','user') as lists",
            [owner],
          )
        ).rows[0].lists;
        expect(
          catalog.find((item: { id: string }) => item.id === list.id)
            .user_word_list_items,
        ).toEqual([
          { count: 2, available_count: 2, unavailable_source_count: 0 },
        ]);
        const memberships = (
          await client.query(
            "select get_user_list_memberships_for_entries($1,$2::uuid[]) as items",
            [owner, entries],
          )
        ).rows[0].items;
        expect(memberships).toHaveLength(2);
        for (const entry of entries) {
          expect(
            memberships.find(
              (item: { entry_id: string }) => item.entry_id === entry,
            ).lists,
          ).toContainEqual(
            expect.objectContaining({
              id: list.id,
              kind: "user",
              editable: true,
              item_count: 2,
            }),
          );
          expect(
            (
              await client.query(
                "select fetch_dictionary_entry_by_id_gated($1) as entry",
                [entry],
              )
            ).rows[0].entry.id,
          ).toBe(entry);
        }
        expect(await learningSnapshot(client, [owner])).toEqual(before);
        await asUser(client, owner);
        await client.query(
          "select remove_entries_from_user_list($1,$2,$3::uuid[])",
          [owner, list.id, [common]],
        );
        expect(
          (
            await client.query(
              "select get_user_list_membership($1,$2,$3::uuid[]) as ids",
              [owner, list.id, entries],
            )
          ).rows[0].ids,
        ).toEqual([authored]);
        await client.query("select delete_user_word_list($1,$2)", [
          owner,
          list.id,
        ]);
        expect(await learningSnapshot(client, [owner])).toEqual(before);
        const stored = (
          await client.query(
            "select id,dictionary_id from word_entries where id=any($1::uuid[])",
            [entries],
          )
        ).rows;
        expect(stored).toHaveLength(2);
        expect(new Set(stored.map((item) => item.dictionary_id)).size).toBe(2);
      },
      owner,
    );
  });

  test("a supported copy has a new owned identity, no filler note or progress, and no live content link", async () => {
    const copier = randomUUID();
    const learner = randomUUID();
    await withTransaction(
      pool,
      async (client) => {
        await ensureUserWithSettings(client, copier);
        await ensureUserWithSettings(client, learner);
        const source = await insertWord(
          client,
          `baseline-copy-${randomUUID()}`,
        );
        await client.query(
          "update word_entries set raw=$2::jsonb where id=$1",
          [
            source,
            JSON.stringify({
              meanings: [{ definition: "Original definition" }],
            }),
          ],
        );
        for (const user of [copier, learner]) {
          await client.query(
            "select set_config('request.jwt.claim.sub',$1,true)",
            [user],
          );
          await client.query(
            "select handle_card_review($1,$2,'word-to-definition','success',$3)",
            [user, source, randomUUID()],
          );
        }
        const before = await learningSnapshot(client, [copier, learner]);
        await asUser(client, copier);
        const copied = (
          await client.query(
            "select copy_entry_to_user_dictionary($1,$2,null,'{}'::jsonb) as id",
            [copier, source],
          )
        ).rows[0].id;
        expect(copied).not.toBe(source);
        const detail = (
          await client.query(
            "select fetch_dictionary_entry_by_id_gated($1) as entry",
            [copied],
          )
        ).rows[0].entry;
        expect(detail.raw).toMatchObject({
          definition: "Original definition",
          sourceEntryId: source,
          languageCode: "nl",
        });
        expect(detail.raw).not.toHaveProperty("notes");
        expect(detail.dictionary_kind).toBe("user");
        expect(await learningSnapshot(client, [copier, learner])).toEqual(
          before,
        );
        expect(
          (
            await client.query(
              "select owner_user_id, kind, schema_key, is_editable from dictionaries where id=$1",
              [detail.dictionary_id],
            )
          ).rows[0],
        ).toMatchObject({
          owner_user_id: copier,
          kind: "user",
          schema_key: "user-entry-v1",
          is_editable: true,
        });
        expect(
          (
            await client.query(
              "select * from user_card_status where entry_id=$1",
              [copied],
            )
          ).rows,
        ).toEqual([]);
        await client.query(
          "update word_entries set raw=$2::jsonb where id=$1",
          [
            source,
            JSON.stringify({ meanings: [{ definition: "Source changed" }] }),
          ],
        );
        await asUser(client, copier);
        expect(
          (
            await client.query(
              "select fetch_dictionary_entry_by_id_gated($1) as entry",
              [copied],
            )
          ).rows[0].entry.raw.definition,
        ).toBe("Original definition");
        await asUser(client, learner);
        expect(
          (
            await client.query(
              "select fetch_dictionary_entry_by_id_gated($1) as entry",
              [copied],
            )
          ).rows[0].entry,
        ).toBeNull();
      },
      copier,
    );
  });

  test("copy rejects contentless and inaccessible sources instead of inventing note content", async () => {
    const copier = randomUUID();
    const owner = randomUUID();
    await withTransaction(
      pool,
      async (client) => {
        await ensureUserWithSettings(client, copier);
        await ensureUserWithSettings(client, owner);
        const empty = await insertWord(
          client,
          `baseline-empty-${randomUUID()}`,
        );
        await asUser(client, owner);
        const privateEntry = (
          await client.query(
            "select create_user_dictionary_entry($1,null,$2::jsonb) as id",
            [
              owner,
              JSON.stringify({
                headword: `baseline-private-${randomUUID()}`,
                languageCode: "nl",
                definition: "Private definition",
              }),
            ],
          )
        ).rows[0].id;
        await asUser(client, copier);
        const list = await createList(client, copier);
        await rejectsWithoutAborting(
          client,
          "select copy_entry_to_user_dictionary($1,$2,null,'{}'::jsonb)",
          [copier, empty],
          /invalid_user_entry/,
        );
        await rejectsWithoutAborting(
          client,
          "select copy_entry_to_user_dictionary($1,$2,null,'{}'::jsonb)",
          [copier, privateEntry],
          /entry_not_accessible/,
        );
        await rejectsWithoutAborting(
          client,
          "select add_entry_to_user_list($1,$2,$3)",
          [copier, list.id, privateEntry],
          /entry_not_accessible/,
        );
        expect(
          (
            await client.query(
              "select get_word_list_summary($1,$2,'user') as list",
              [copier, list.id],
            )
          ).rows[0].list.user_word_list_items,
        ).toEqual([{ count: 0 }]);
        await client.query("reset role");
        expect(
          (
            await client.query(
              "select w.id from word_entries w join dictionaries d on d.id=w.dictionary_id where d.owner_user_id=$1",
              [copier],
            )
          ).rows,
        ).toEqual([]);
      },
      copier,
    );
  });
});
