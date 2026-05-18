import { beforeAll, afterAll, describe, expect, test } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "crypto";
import {
  callGetNextWord,
  ensureUserWithSettings,
  getDbUrl,
  insertWord,
  runMigrations,
  withTransaction,
} from "./dbTestUtils";
import type { PoolClient } from "pg";

const dbUrl = getDbUrl();
const hasDb = Boolean(dbUrl);
const describeIfDb = hasDb ? describe : describe.skip;

const callHandleReview = (
  client: PoolClient,
  userId: string,
  wordId: string,
  mode: string,
  result: string,
  turnId: string | null = null
) =>
  client.query(`select handle_review($1::uuid, $2::uuid, $3::text, $4::text, $5::uuid)`, [
    userId,
    wordId,
    mode,
    result,
    turnId,
  ]);

describeIfDb("FSRS RPC integration", () => {
  const pool = new Pool({ connectionString: dbUrl });
  const mode = "word-to-definition";

  beforeAll(async () => {
    await runMigrations(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  test("handle_review creates then updates card state", async () => {
    const userId = randomUUID();
    await withTransaction(pool, async (client) => {
      const wordId = await insertWord(client, `fsrs-review-${Date.now()}`);

      await ensureUserWithSettings(client, userId, { target_retention: 0.9 });

      await callHandleReview(client, userId, wordId, mode, "success", randomUUID());

      const { rows: first } = await client.query(
        `select fsrs_reps, fsrs_lapses, last_result, fsrs_enabled
         from user_word_status where user_id = $1 and word_id = $2 and mode = $3`,
        [userId, wordId, mode]
      );

      expect(first[0].fsrs_reps).toBe(1);
      expect(first[0].fsrs_lapses).toBe(0);
      expect(first[0].last_result).toBe("success");
      expect(first[0].fsrs_enabled).toBe(true);

      await callHandleReview(client, userId, wordId, mode, "fail", randomUUID());

      const { rows: second } = await client.query(
        `select fsrs_reps, fsrs_lapses, last_result, fsrs_last_grade
         from user_word_status where user_id = $1 and word_id = $2 and mode = $3`,
        [userId, wordId, mode]
      );

      expect(second[0].fsrs_reps).toBe(2);
      expect(second[0].fsrs_lapses).toBe(1);
      expect(second[0].last_result).toBe("fail");
      expect(second[0].fsrs_last_grade).toBe(1);
    }, userId);
  });

  test("handle_click counts as lapse", async () => {
    const userId = randomUUID();
    await withTransaction(pool, async (client) => {
      const wordId = await insertWord(client, `fsrs-click-${Date.now()}`);
      await ensureUserWithSettings(client, userId);

      // Seed with a success so we have prior state.
      await callHandleReview(client, userId, wordId, mode, "success", randomUUID());

      await client.query(`select handle_click($1, $2, $3)`, [userId, wordId, mode]);

      const { rows } = await client.query(
        `select fsrs_reps, fsrs_lapses, fsrs_last_grade, last_result
         from user_word_status where user_id = $1 and word_id = $2 and mode = $3`,
        [userId, wordId, mode]
      );

      expect(rows[0].fsrs_reps).toBe(2);
      expect(rows[0].fsrs_lapses).toBe(1);
      expect(rows[0].fsrs_last_grade).toBe(1);
      expect(rows[0].last_result).toBe("fail");

      const { rows: logRows } = await client.query(
        `select review_type from user_review_log where user_id = $1 and word_id = $2`,
        [userId, wordId]
      );
      expect(logRows.some((r) => r.review_type === "click")).toBe(true);
    }, userId);
  });

  test("dictionary lookup does not mutate FSRS or review logs", async () => {
    const userId = randomUUID();
    await withTransaction(pool, async (client) => {
      await ensureUserWithSettings(client, userId);
      const wordId = await insertWord(client, `fsrs-lookup-${Date.now()}`);

      const { rows } = await client.query(
        `select fetch_dictionary_entry_gated($1) as item`,
        [`missing-${randomUUID()}`],
      );
      // The timestamped query above intentionally should miss; call the real
      // headword too so both miss and hit paths are read-only.
      expect(rows[0]?.item).toEqual([]);

      const { rows: wordRows } = await client.query(
        `select headword from word_entries where id = $1`,
        [wordId],
      );
      const { rows: hitRows } = await client.query(
        `select fetch_dictionary_entry_gated($1) as item`,
        [wordRows[0].headword],
      );
      expect(hitRows[0]?.item?.[0]?.id).toBe(wordId);

      const { rows: statusRows } = await client.query(
        `select count(*)::int as count
         from user_word_status
         where user_id = $1 and word_id = $2`,
        [userId, wordId],
      );
      const { rows: reviewRows } = await client.query(
        `select count(*)::int as count
         from user_review_log
         where user_id = $1 and word_id = $2`,
        [userId, wordId],
      );

      expect(statusRows[0].count).toBe(0);
      expect(reviewRows[0].count).toBe(0);
    }, userId);
  });

  test("get_recent_training_history returns hydrated event and status rows", async () => {
    const userId = randomUUID();
    await withTransaction(pool, async (client) => {
      await ensureUserWithSettings(client, userId);
      const wordId = await insertWord(client, `fsrs-history-${Date.now()}`);

      await client.query(
        `insert into user_word_status (
          user_id, word_id, mode,
          click_count, last_seen_at, fsrs_last_interval, fsrs_reps, fsrs_stability, next_review_at
        ) values ($1, $2, $3, 2, now() - interval '30 minutes', 3.0, 4, 7.5, now() + interval '1 day')`,
        [userId, wordId, mode],
      );
      await client.query(
        `insert into user_events (user_id, word_id, mode, event_type, created_at)
         values ($1, $2, $3, 'review_success', now())`,
        [userId, wordId, mode],
      );

      const { rows } = await client.query(
        `select *
         from get_recent_training_history($1::uuid, now() - interval '1 day', 50)`,
        [userId],
      );

      expect(rows).toHaveLength(1);
      expect(rows[0]).toEqual(
        expect.objectContaining({
          id: wordId,
          headword: expect.stringContaining("fsrs-history-"),
          event_type: "review_success",
          mode,
          click_count: 2,
          fsrs_reps: 4,
          meanings_count: 1,
        }),
      );
      expect(rows[0].raw).toEqual(expect.objectContaining({ meaning_id: 1 }));
    }, userId);
  });

  test("get_card_user_state returns one accessible card state", async () => {
    const userId = randomUUID();
    await withTransaction(pool, async (client) => {
      await ensureUserWithSettings(client, userId);
      const wordId = await insertWord(client, `fsrs-card-state-${Date.now()}`);

      await client.query(
        `insert into user_word_status (
          user_id, word_id, mode,
          click_count, fsrs_last_interval, fsrs_reps, fsrs_stability, next_review_at
        ) values ($1, $2, $3, 1, 2.0, 3, 4.5, now() + interval '1 day')`,
        [userId, wordId, mode],
      );

      const { rows } = await client.query(
        `select get_card_user_state($1::uuid, $2::uuid, $3::text) as state`,
        [userId, wordId, mode],
      );

      expect(rows[0].state).toEqual(
        expect.objectContaining({
          click_count: 1,
          fsrs_last_interval: 2,
          fsrs_reps: 3,
          fsrs_stability: 4.5,
          in_learning: false,
        }),
      );
    }, userId);
  });

  test("get_user_list_membership returns owned list intersection", async () => {
    const userId = randomUUID();
    await withTransaction(pool, async (client) => {
      await ensureUserWithSettings(client, userId);
      const firstWordId = await insertWord(client, `membership-a-${Date.now()}`);
      const secondWordId = await insertWord(client, `membership-b-${Date.now()}`);
      const absentWordId = await insertWord(client, `membership-c-${Date.now()}`);
      const { rows: listRows } = await client.query(
        `insert into user_word_lists (user_id, language_code, primary_language_code, name)
         values ($1, 'nl', 'nl', $2)
         returning id`,
        [userId, `Membership list ${Date.now()}`],
      );
      const listId = listRows[0].id;

      await client.query(`select add_entry_to_user_list($1, $2, $3)`, [
        userId,
        listId,
        firstWordId,
      ]);
      await client.query(`select add_entry_to_user_list($1, $2, $3)`, [
        userId,
        listId,
        secondWordId,
      ]);

      const { rows } = await client.query(
        `select get_user_list_membership($1::uuid, $2::uuid, $3::uuid[]) as ids`,
        [userId, listId, [firstWordId, absentWordId]],
      );

      expect(rows[0].ids).toEqual([firstWordId]);
    }, userId);
  });

  test("dictionary lookup returns curated and user candidates", async () => {
    const userId = randomUUID();
    await withTransaction(pool, async (client) => {
      await ensureUserWithSettings(client, userId);
      const sourceWordId = await insertWord(client, `fsrs-candidates-${Date.now()}`);

      const { rows: copyRows } = await client.query(
        `select copy_entry_to_user_dictionary(
          $1,
          $2,
          NULL,
          '{"translation":{"languageCode":"en","text":"candidate copy"}}'::jsonb
        ) as copied_word_id`,
        [userId, sourceWordId],
      );

      const { rows: wordRows } = await client.query(
        `select headword from word_entries where id = $1`,
        [sourceWordId],
      );
      const { rows } = await client.query(
        `select fetch_dictionary_entry_gated($1) as items`,
        [wordRows[0].headword],
      );

      const ids = rows[0].items.map((item: { id: string }) => item.id);
      expect(ids).toContain(sourceWordId);
      expect(ids).toContain(copyRows[0].copied_word_id);
      expect(rows[0].items[0].id).toBe(copyRows[0].copied_word_id);
    }, userId);
  });

  test("dictionary entry by id lookup is gated by dictionary access", async () => {
    const userId = randomUUID();
    const ownerId = randomUUID();
    await withTransaction(pool, async (client) => {
      await ensureUserWithSettings(client, userId);
      await ensureUserWithSettings(client, ownerId);

      const publicWordId = await insertWord(client, `fsrs-by-id-public-${Date.now()}`);
      const { rows: dictionaryRows } = await client.query(
        `insert into dictionaries (
          language_code, slug, name, kind, visibility, owner_user_id,
          schema_key, schema_version
        )
        values ('nl', $1, 'Private by id dictionary', 'user', 'private', $2, 'user-entry-v1', 1)
        returning id`,
        [`private-by-id-${Date.now()}`, ownerId],
      );
      const { rows: privateRows } = await client.query(
        `insert into word_entries (
          dictionary_id, language_code, headword, part_of_speech, gender,
          is_nt2_2000, raw, meaning_id
        )
        values ($1, 'nl', $2, 'noun', null, false, '{}'::jsonb, 1)
        returning id`,
        [dictionaryRows[0].id, `fsrs-by-id-private-${Date.now()}`],
      );

      const { rows: publicRows } = await client.query(
        `select fetch_dictionary_entry_by_id_gated($1) as item`,
        [publicWordId],
      );
      expect(publicRows[0].item.id).toBe(publicWordId);

      const { rows: privateRowsForOther } = await client.query(
        `select fetch_dictionary_entry_by_id_gated($1) as item`,
        [privateRows[0].id],
      );
      expect(privateRowsForOther[0].item).toBeNull();

      await client.query(`select set_config('request.jwt.claim.sub', $1, true)`, [
        ownerId,
      ]);
      const { rows: privateRowsForOwner } = await client.query(
        `select fetch_dictionary_entry_by_id_gated($1) as item`,
        [privateRows[0].id],
      );
      expect(privateRowsForOwner[0].item.id).toBe(privateRows[0].id);
    }, userId);
  });

  test("start_learning_card enables a card without review-log side effects", async () => {
    const userId = randomUUID();
    await withTransaction(pool, async (client) => {
      await ensureUserWithSettings(client, userId);
      const wordId = await insertWord(client, `fsrs-start-${Date.now()}`);

      await client.query(`select start_learning_card($1, $2, $3)`, [
        userId,
        wordId,
        mode,
      ]);

      const { rows: statusRows } = await client.query(
        `select fsrs_enabled, fsrs_reps, fsrs_lapses, seen_count, hidden, frozen_until
         from user_word_status
         where user_id = $1 and word_id = $2 and mode = $3`,
        [userId, wordId, mode],
      );
      const { rows: reviewRows } = await client.query(
        `select count(*)::int as count
         from user_review_log
         where user_id = $1 and word_id = $2`,
        [userId, wordId],
      );

      expect(statusRows[0]).toEqual(
        expect.objectContaining({
          fsrs_enabled: true,
          fsrs_reps: 0,
          fsrs_lapses: 0,
          seen_count: 1,
          hidden: false,
          frozen_until: null,
        }),
      );
      expect(reviewRows[0].count).toBe(0);
    }, userId);
  });

  test("add_entry_to_user_list adds readable entries idempotently", async () => {
    const userId = randomUUID();
    await withTransaction(pool, async (client) => {
      await ensureUserWithSettings(client, userId);
      const wordId = await insertWord(client, `fsrs-list-${Date.now()}`);
      const { rows: listRows } = await client.query(
        `insert into user_word_lists (user_id, language_code, primary_language_code, name)
         values ($1, 'nl', 'nl', $2)
         returning id`,
        [userId, `List ${Date.now()}`],
      );
      const listId = listRows[0].id;

      await client.query(`select add_entry_to_user_list($1, $2, $3)`, [
        userId,
        listId,
        wordId,
      ]);
      await client.query(`select add_entry_to_user_list($1, $2, $3)`, [
        userId,
        listId,
        wordId,
      ]);

      const { rows } = await client.query(
        `select count(*)::int as count
         from user_word_list_items
         where list_id = $1 and word_id = $2`,
        [listId, wordId],
      );
      expect(rows[0].count).toBe(1);
    }, userId);
  });

  test("remove_entries_from_user_list removes owned list entries only", async () => {
    const ownerId = randomUUID();
    const otherId = randomUUID();
    await withTransaction(pool, async (client) => {
      await ensureUserWithSettings(client, ownerId);
      await ensureUserWithSettings(client, otherId);
      const firstWordId = await insertWord(client, `fsrs-remove-list-${Date.now()}`);
      const secondWordId = await insertWord(client, `fsrs-keep-list-${Date.now()}`);
      const { rows: listRows } = await client.query(
        `insert into user_word_lists (user_id, language_code, primary_language_code, name)
         values ($1, 'nl', 'nl', $2)
         returning id`,
        [ownerId, `Remove list ${Date.now()}`],
      );
      const listId = listRows[0].id;

      await client.query(`select add_entry_to_user_list($1, $2, $3)`, [
        ownerId,
        listId,
        firstWordId,
      ]);
      await client.query(`select add_entry_to_user_list($1, $2, $3)`, [
        ownerId,
        listId,
        secondWordId,
      ]);

      await client.query("savepoint unauthorized_remove");
      await expect(
        client.query(`select remove_entries_from_user_list($1, $2, $3::uuid[])`, [
          otherId,
          listId,
          [firstWordId],
        ]),
      ).rejects.toThrow(/unauthorized/);
      await client.query("rollback to savepoint unauthorized_remove");
      await client.query("release savepoint unauthorized_remove");

      await client.query(`select remove_entries_from_user_list($1, $2, $3::uuid[])`, [
        ownerId,
        listId,
        [firstWordId],
      ]);

      const { rows } = await client.query(
        `select word_id
         from user_word_list_items
         where list_id = $1
         order by word_id`,
        [listId],
      );
      expect(rows.map((row) => row.word_id)).toEqual([secondWordId]);
    }, ownerId);
  });

  test("user word list CRUD actions create and delete owned lists", async () => {
    const ownerId = randomUUID();
    const otherId = randomUUID();
    await withTransaction(pool, async (client) => {
      await ensureUserWithSettings(client, ownerId);
      await ensureUserWithSettings(client, otherId);

      const { rows: createRows } = await client.query(
        `select create_user_word_list($1, $2, $3, 'nl', 'nl') as list`,
        [ownerId, `CRUD list ${Date.now()}`, "Created through RPC"],
      );
      const list = createRows[0].list;
      expect(list).toEqual(
        expect.objectContaining({
          name: expect.stringContaining("CRUD list"),
          description: "Created through RPC",
          language_code: "nl",
          primary_language_code: "nl",
        }),
      );
      expect(list.user_word_list_items[0].count).toBe(0);

      await client.query("savepoint unauthorized_delete_list");
      await expect(
        client.query(`select delete_user_word_list($1, $2)`, [otherId, list.id]),
      ).rejects.toThrow(/unauthorized/);
      await client.query("rollback to savepoint unauthorized_delete_list");
      await client.query("release savepoint unauthorized_delete_list");

      await client.query(`select delete_user_word_list($1, $2)`, [
        ownerId,
        list.id,
      ]);

      const { rows: countRows } = await client.query(
        `select count(*)::int as count
         from user_word_lists
         where id = $1`,
        [list.id],
      );
      expect(countRows[0].count).toBe(0);
    }, ownerId);
  });

  test("update_user_word_list updates owned list metadata", async () => {
    const ownerId = randomUUID();
    const otherId = randomUUID();
    await withTransaction(pool, async (client) => {
      await ensureUserWithSettings(client, ownerId);
      await ensureUserWithSettings(client, otherId);

      const { rows: createRows } = await client.query(
        `select create_user_word_list($1, $2, $3, 'nl', 'nl') as list`,
        [ownerId, `Update list ${Date.now()}`, "Before"],
      );
      const list = createRows[0].list;

      await client.query("savepoint unauthorized_update_list");
      await expect(
        client.query(
          `select update_user_word_list($1, $2, $3, $4, 'nl', 'nl')`,
          [otherId, list.id, "Blocked", "Blocked"],
        ),
      ).rejects.toThrow(/unauthorized/);
      await client.query("rollback to savepoint unauthorized_update_list");
      await client.query("release savepoint unauthorized_update_list");

      const { rows: updateRows } = await client.query(
        `select update_user_word_list($1, $2, $3, $4, 'nl', 'nl') as list`,
        [ownerId, list.id, "Updated list", "After"],
      );

      expect(updateRows[0].list).toEqual(
        expect.objectContaining({
          id: list.id,
          name: "Updated list",
          description: "After",
          language_code: "nl",
          primary_language_code: "nl",
        }),
      );
      expect(updateRows[0].list.user_word_list_items[0].count).toBe(0);
    }, ownerId);
  });

  test("ensure_user_dictionary creates a private editable user dictionary", async () => {
    const userId = randomUUID();
    await withTransaction(pool, async (client) => {
      await ensureUserWithSettings(client, userId);

      const { rows: firstRows } = await client.query(
        `select ensure_user_dictionary($1, 'nl', 'My words') as dictionary_id`,
        [userId],
      );
      const { rows: secondRows } = await client.query(
        `select ensure_user_dictionary($1, 'nl', 'My words') as dictionary_id`,
        [userId],
      );

      expect(firstRows[0].dictionary_id).toBe(secondRows[0].dictionary_id);

      const { rows } = await client.query(
        `select kind, visibility, owner_user_id, is_editable, schema_key, schema_version
         from dictionaries
         where id = $1`,
        [firstRows[0].dictionary_id],
      );

      expect(rows[0]).toEqual(
        expect.objectContaining({
          kind: "user",
          visibility: "private",
          owner_user_id: userId,
          is_editable: true,
          schema_key: "user-entry-v1",
          schema_version: 1,
        }),
      );
    }, userId);
  });

  test("copy_entry_to_user_dictionary creates a user-entry-v1 copy", async () => {
    const userId = randomUUID();
    await withTransaction(pool, async (client) => {
      await ensureUserWithSettings(client, userId);
      const sourceWordId = await insertWord(client, `fsrs-copy-${Date.now()}`);

      const { rows: copyRows } = await client.query(
        `select copy_entry_to_user_dictionary(
          $1,
          $2,
          NULL,
          '{"translation":{"languageCode":"en","text":"copy"}}'::jsonb
        ) as copied_word_id`,
        [userId, sourceWordId],
      );

      const { rows } = await client.query(
        `select
           w.id,
           w.dictionary_id,
           w.is_nt2_2000,
           w.raw,
           d.kind,
           d.visibility,
           d.owner_user_id,
           d.schema_key
         from word_entries w
         join dictionaries d on d.id = w.dictionary_id
         where w.id = $1`,
        [copyRows[0].copied_word_id],
      );

      expect(rows[0]).toEqual(
        expect.objectContaining({
          id: copyRows[0].copied_word_id,
          is_nt2_2000: false,
          kind: "user",
          visibility: "private",
          owner_user_id: userId,
          schema_key: "user-entry-v1",
        }),
      );
      expect(rows[0].raw).toEqual(
        expect.objectContaining({
          headword: expect.stringContaining("fsrs-copy-"),
          languageCode: "nl",
          sourceEntryId: sourceWordId,
          translation: {
            languageCode: "en",
            text: "copy",
          },
        }),
      );
    }, userId);
  });

  test("copy_entry_to_user_dictionary copies source definitions without filler notes", async () => {
    const userId = randomUUID();
    await withTransaction(pool, async (client) => {
      await ensureUserWithSettings(client, userId);
      const { rows: sourceRows } = await client.query(
        `insert into word_entries (
          language_code, headword, part_of_speech, gender, is_nt2_2000, raw
        )
        values ('nl', $1, 'noun', 'n', true, '{"meanings":[{"definition":"source definition"}]}'::jsonb)
        returning id`,
        [`fsrs-copy-definition-${Date.now()}`],
      );

      const { rows: copyRows } = await client.query(
        `select copy_entry_to_user_dictionary($1, $2, NULL, '{}'::jsonb) as copied_word_id`,
        [userId, sourceRows[0].id],
      );

      const { rows } = await client.query(
        `select raw from word_entries where id = $1`,
        [copyRows[0].copied_word_id],
      );

      expect(rows[0].raw).toEqual(
        expect.objectContaining({
          definition: "source definition",
          sourceEntryId: sourceRows[0].id,
        }),
      );
      expect(rows[0].raw.notes).toBeUndefined();
    }, userId);
  });

  test("user dictionary entry CRUD creates updates deletes owned entries", async () => {
    const userId = randomUUID();
    await withTransaction(pool, async (client) => {
      await ensureUserWithSettings(client, userId);

      const { rows: createRows } = await client.query(
        `select create_user_dictionary_entry(
          $1,
          NULL,
          jsonb_build_object(
            'headword', $2::text,
            'languageCode', 'nl',
            'translation', jsonb_build_object('languageCode', 'en', 'text', 'hassle'),
            'example', jsonb_build_object('source', 'Wat een gedoe.')
          )
        ) as word_id`,
        [userId, `fsrs-crud-${Date.now()}`],
      );
      const wordId = createRows[0].word_id;

      const { rows: createdRows } = await client.query(
        `select w.raw, d.kind, d.owner_user_id, d.schema_key
         from word_entries w
         join dictionaries d on d.id = w.dictionary_id
         where w.id = $1`,
        [wordId],
      );
      expect(createdRows[0]).toEqual(
        expect.objectContaining({
          kind: "user",
          owner_user_id: userId,
          schema_key: "user-entry-v1",
        }),
      );
      expect(createdRows[0].raw.translation.text).toBe("hassle");

      await client.query(
        `select update_user_dictionary_entry(
          $1,
          $2,
          jsonb_build_object(
            'headword', $3::text,
            'languageCode', 'nl',
            'definition', 'updated definition',
            'notes', 'updated note'
          )
        )`,
        [userId, wordId, createdRows[0].raw.headword],
      );

      const { rows: lookupRows } = await client.query(
        `select fetch_dictionary_entry_gated($1) as items`,
        [createdRows[0].raw.headword],
      );
      expect(lookupRows[0].items[0].id).toBe(wordId);
      expect(lookupRows[0].items[0].raw.definition).toBe("updated definition");

      await client.query(`select delete_user_dictionary_entry($1, $2)`, [
        userId,
        wordId,
      ]);

      const { rows: deletedRows } = await client.query(
        `select count(*)::int as count from word_entries where id = $1`,
        [wordId],
      );
      expect(deletedRows[0].count).toBe(0);
    }, userId);
  });

  test("user dictionary entry update is blocked for other users", async () => {
    const ownerId = randomUUID();
    const otherId = randomUUID();
    await withTransaction(pool, async (client) => {
      await ensureUserWithSettings(client, ownerId);
      await ensureUserWithSettings(client, otherId);

      await client.query(`select set_config('request.jwt.claim.sub', $1, true)`, [
        ownerId,
      ]);
      const { rows } = await client.query(
        `select create_user_dictionary_entry(
          $1,
          NULL,
          jsonb_build_object(
            'headword', $2::text,
            'languageCode', 'nl',
            'definition', 'owned definition'
          )
        ) as word_id`,
        [ownerId, `fsrs-private-crud-${Date.now()}`],
      );

      await client.query(`select set_config('request.jwt.claim.sub', $1, true)`, [
        otherId,
      ]);
      await expect(
        client.query(
          `select update_user_dictionary_entry(
            $1,
            $2,
            jsonb_build_object(
              'headword', 'blocked',
              'languageCode', 'nl',
              'definition', 'blocked'
            )
          )`,
          [otherId, rows[0].word_id],
        ),
      ).rejects.toThrow(/target_dictionary_not_editable/);
    }, ownerId);
  });

  test("created user dictionary entries can be listed, scheduled, and reviewed", async () => {
    const userId = randomUUID();
    await withTransaction(pool, async (client) => {
      await ensureUserWithSettings(client, userId, {
        daily_new_limit: 10,
        daily_review_limit: 10,
      });

      const headword = `fsrs-user-train-${Date.now()}`;
      const { rows: createRows } = await client.query(
        `select create_user_dictionary_entry(
          $1,
          NULL,
          jsonb_build_object(
            'headword', $2::text,
            'languageCode', 'nl',
            'translation', jsonb_build_object('languageCode', 'en', 'text', 'trainable user entry'),
            'example', jsonb_build_object('source', 'Dit is een eigen woord.')
          )
        ) as word_id`,
        [userId, headword],
      );
      const wordId = createRows[0].word_id;

      const { rows: listRows } = await client.query(
        `insert into user_word_lists (user_id, language_code, primary_language_code, name)
         values ($1, 'nl', 'nl', $2)
         returning id`,
        [userId, `Training list ${Date.now()}`],
      );
      const listId = listRows[0].id;
      await client.query(`select add_entry_to_user_list($1, $2, $3)`, [
        userId,
        listId,
        wordId,
      ]);

      const { rows: listFetchRows } = await client.query(
        `select fetch_words_for_list_gated(
          $1::uuid,
          'user',
          NULL,
          NULL,
          NULL,
          NULL,
          NULL,
          1,
          20
        ) as result`,
        [listId],
      );
      expect(listFetchRows[0].result.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: wordId,
            headword,
            raw: expect.objectContaining({
              translation: expect.objectContaining({
                text: "trainable user entry",
              }),
            }),
          }),
        ]),
      );

      const { rows: nextRows } = await client.query(
        `select get_next_word(
          $1::uuid,
          ARRAY[$2]::text[],
          ARRAY[]::uuid[],
          $3::uuid,
          'user',
          'both',
          'new',
          ARRAY[]::text[]
        ) as item`,
        [userId, mode, listId],
      );

      expect(nextRows[0]?.item).toEqual(
        expect.objectContaining({
          id: wordId,
          headword,
          mode,
          raw: expect.objectContaining({
            translation: expect.objectContaining({
              text: "trainable user entry",
            }),
          }),
          stats: expect.objectContaining({
            source: "new",
          }),
        }),
      );

      await callHandleReview(client, userId, wordId, mode, "success", randomUUID());

      const { rows: statusRows } = await client.query(
        `select fsrs_reps, last_result, fsrs_enabled
         from user_word_status
         where user_id = $1 and word_id = $2 and mode = $3`,
        [userId, wordId, mode],
      );
      expect(statusRows[0]).toEqual(
        expect.objectContaining({
          fsrs_reps: 1,
          last_result: "success",
          fsrs_enabled: true,
        }),
      );
    }, userId);
  });

  test("get_next_word honors overdue order and daily caps", async () => {
    const userId = randomUUID();
    await withTransaction(pool, async (client) => {
      await ensureUserWithSettings(client, userId, { daily_new_limit: 1, daily_review_limit: 2 });

      const overdueId = await insertWord(client, `fsrs-overdue-${Date.now()}`);
      const newId = await insertWord(client, `fsrs-new-${Date.now() + 1}`);
      const { rows: listRows } = await client.query(
        `insert into user_word_lists (user_id, language_code, primary_language_code, name)
         values ($1, 'nl', 'nl', $2)
         returning id`,
        [userId, `Scheduler list ${Date.now()}`],
      );
      const listId = listRows[0].id;
      await client.query(`select add_entry_to_user_list($1, $2, $3)`, [
        userId,
        listId,
        overdueId,
      ]);
      await client.query(`select add_entry_to_user_list($1, $2, $3)`, [
        userId,
        listId,
        newId,
      ]);

      const getNextFromList = async () => {
        const { rows } = await client.query(
          `select get_next_word(
            $1::uuid,
            ARRAY[$2]::text[],
            ARRAY[]::uuid[],
            $3::uuid,
            'user',
            'both',
            'auto',
            ARRAY[]::text[]
          ) as item`,
          [userId, mode, listId],
        );
        return rows[0]?.item as any | undefined;
      };

      await client.query(
        `insert into user_word_status (
          user_id, word_id, mode,
          fsrs_stability, fsrs_difficulty, fsrs_reps, fsrs_lapses,
          fsrs_last_interval, fsrs_last_grade, fsrs_enabled, next_review_at, last_seen_at
        ) values ($1, $2, $3, 1.0, 5.0, 1, 0, 1.0, 3, true, now() - interval '1 day', now() - interval '1 day')`,
        [userId, overdueId, mode]
      );

      const first = await getNextFromList();
      expect(first?.id).toBe(overdueId);
      expect(first?.stats?.source).toBe("review");

      // Hit the review cap for today.
      await client.query(
        `insert into user_review_log (user_id, word_id, mode, grade, review_type, reviewed_at)
         values ($1, $2, $3, 3, 'review', now()), ($1, $2, $3, 3, 'review', now())`,
        [userId, overdueId, mode]
      );

      const second = await getNextFromList();
      expect(second?.id).toBe(newId);
      expect(second?.stats?.source).toBe("new");

      // Hit the new cap as well.
      await client.query(
        `insert into user_review_log (user_id, word_id, mode, grade, review_type, reviewed_at)
         values ($1, $2, $3, 3, 'new', now())`,
        [userId, newId, mode]
      );

      const none = await getNextFromList();
      expect(none).toBeUndefined();
    }, userId);
  });

  test("get_next_word excludes reviewed cards by entry and mode", async () => {
    const userId = randomUUID();
    await withTransaction(pool, async (client) => {
      await ensureUserWithSettings(client, userId, {
        daily_new_limit: 0,
        daily_review_limit: 10,
      });

      const wordId = await insertWord(client, `fsrs-card-key-${Date.now()}`);
      const reverseMode = "definition-to-word";

      await client.query(
        `insert into user_word_status (
          user_id, word_id, mode,
          fsrs_stability, fsrs_difficulty, fsrs_reps, fsrs_lapses,
          fsrs_last_interval, fsrs_last_grade, fsrs_enabled, next_review_at, last_seen_at
        ) values
          ($1, $2, $3, 1.0, 5.0, 1, 0, 1.0, 3, true, now() - interval '2 days', now() - interval '2 days'),
          ($1, $2, $4, 1.0, 5.0, 1, 0, 1.0, 3, true, now() - interval '1 day', now() - interval '1 day')`,
        [userId, wordId, mode, reverseMode],
      );

      const { rows } = await client.query(
        `select get_next_word(
          $1::uuid,
          $2::text[],
          ARRAY[]::uuid[],
          NULL::uuid,
          'curated',
          'review',
          'review',
          $3::text[]
        ) as item`,
        [userId, [mode, reverseMode], [`${wordId}:${mode}`]],
      );

      expect(rows[0]?.item?.id).toBe(wordId);
      expect(rows[0]?.item?.mode).toBe(reverseMode);
    }, userId);
  });

  test("get_next_word skips dictionaries the user cannot read", async () => {
    const userId = randomUUID();
    const ownerId = randomUUID();
    await withTransaction(pool, async (client) => {
      await ensureUserWithSettings(client, userId, {
        daily_new_limit: 0,
        daily_review_limit: 10,
      });
      await ensureUserWithSettings(client, ownerId);

      const { rows: dictionaryRows } = await client.query(
        `insert into dictionaries (
          language_code, slug, name, kind, visibility, owner_user_id,
          schema_key, schema_version
        )
        values ('nl', $1, 'Private test dictionary', 'user', 'private', $2, 'nl-vandale-v1', 1)
        returning id`,
        [`private-${Date.now()}`, ownerId],
      );
      const privateDictionaryId = dictionaryRows[0].id;

      const publicWordId = await insertWord(client, `fsrs-public-${Date.now()}`);
      const { rows: privateRows } = await client.query(
        `insert into word_entries (
          dictionary_id, language_code, headword, part_of_speech, gender,
          is_nt2_2000, raw, meaning_id
        )
        values ($1, 'nl', $2, 'noun', 'n', true, '{}'::jsonb, 1)
        returning id`,
        [privateDictionaryId, `fsrs-private-${Date.now()}`],
      );
      const privateWordId = privateRows[0].id;

      await client.query(
        `insert into user_word_status (
          user_id, word_id, mode,
          fsrs_stability, fsrs_difficulty, fsrs_reps, fsrs_lapses,
          fsrs_last_interval, fsrs_last_grade, fsrs_enabled, next_review_at, last_seen_at
        ) values
          ($1, $2, $4, 1.0, 5.0, 1, 0, 1.0, 3, true, now() - interval '2 days', now() - interval '2 days'),
          ($1, $3, $4, 1.0, 5.0, 1, 0, 1.0, 3, true, now() - interval '1 day', now() - interval '1 day')`,
        [userId, privateWordId, publicWordId, mode],
      );

      const next = await callGetNextWord(client, userId, mode);
      expect(next?.id).toBe(publicWordId);
      expect(next?.id).not.toBe(privateWordId);
    }, userId);
  });
});

if (!hasDb) {
  describe("FSRS RPC integration (skipped)", () => {
    test("skips without DB URL", () => {
      expect(getDbUrl()).toBeFalsy();
    });
  });
}
