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

  test("get_next_word honors overdue order and daily caps", async () => {
    const userId = randomUUID();
    await withTransaction(pool, async (client) => {
      await ensureUserWithSettings(client, userId, { daily_new_limit: 1, daily_review_limit: 2 });

      const overdueId = await insertWord(client, `fsrs-overdue-${Date.now()}`);
      const newId = await insertWord(client, `fsrs-new-${Date.now() + 1}`);

      await client.query(
        `insert into user_word_status (
          user_id, word_id, mode,
          fsrs_stability, fsrs_difficulty, fsrs_reps, fsrs_lapses,
          fsrs_last_interval, fsrs_last_grade, fsrs_enabled, next_review_at, last_seen_at
        ) values ($1, $2, $3, 1.0, 5.0, 1, 0, 1.0, 3, true, now() - interval '1 day', now() - interval '1 day')`,
        [userId, overdueId, mode]
      );

      const first = await callGetNextWord(client, userId, mode);
      expect(first?.id).toBe(overdueId);
      expect(first?.stats?.source).toBe("review");

      // Hit the review cap for today.
      await client.query(
        `insert into user_review_log (user_id, word_id, mode, grade, review_type, reviewed_at)
         values ($1, $2, $3, 3, 'review', now()), ($1, $2, $3, 3, 'review', now())`,
        [userId, overdueId, mode]
      );

      const second = await callGetNextWord(client, userId, mode);
      expect(second?.id).toBe(newId);
      expect(second?.stats?.source).toBe("new");

      // Hit the new cap as well.
      await client.query(
        `insert into user_review_log (user_id, word_id, mode, grade, review_type, reviewed_at)
         values ($1, $2, $3, 3, 'new', now())`,
        [userId, newId, mode]
      );

      const none = await callGetNextWord(client, userId, mode);
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
