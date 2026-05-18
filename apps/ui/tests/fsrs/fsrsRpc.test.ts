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
      expect(rows[0]?.item).toBeNull();

      const { rows: wordRows } = await client.query(
        `select headword from word_entries where id = $1`,
        [wordId],
      );
      const { rows: hitRows } = await client.query(
        `select fetch_dictionary_entry_gated($1) as item`,
        [wordRows[0].headword],
      );
      expect(hitRows[0]?.item?.id).toBe(wordId);

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
