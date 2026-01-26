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

const dbUrl = getDbUrl();
const hasDb = Boolean(dbUrl);
const describeIfDb = hasDb ? describe : describe.skip;

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

      await client.query(`select handle_review($1, $2, $3, $4)`, [
        userId,
        wordId,
        mode,
        "success",
      ]);

      const { rows: first } = await client.query(
        `select fsrs_reps, fsrs_lapses, last_result, fsrs_enabled
         from user_word_status where user_id = $1 and word_id = $2 and mode = $3`,
        [userId, wordId, mode]
      );

      expect(first[0].fsrs_reps).toBe(1);
      expect(first[0].fsrs_lapses).toBe(0);
      expect(first[0].last_result).toBe("success");
      expect(first[0].fsrs_enabled).toBe(true);

      await client.query(`select handle_review($1, $2, $3, $4)`, [
        userId,
        wordId,
        mode,
        "fail",
      ]);

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
      await client.query(`select handle_review($1, $2, $3, $4)`, [
        userId,
        wordId,
        mode,
        "success",
      ]);

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

      // DEBUG: Check what words exist for this user
      const { rows: debugWords } = await client.query(
        `select w.id, w.headword, s.next_review_at, s.fsrs_reps, s.mode
         from word_entries w
         left join user_word_status s on s.word_id = w.id and s.user_id = $1
         where w.is_nt2_2000 = true
         order by s.next_review_at asc nulls last`,
        [userId]
      );
      console.log('DEBUG: All NT2 words for user:', JSON.stringify(debugWords, null, 2));
      console.log('DEBUG: Expected overdueId:', overdueId);
      console.log('DEBUG: UserId:', userId);

      const first = await callGetNextWord(client, userId, mode);
      console.log('DEBUG: First result:', JSON.stringify(first, null, 2));
      expect(first?.id).toBe(overdueId);
      expect(first?.stats?.source).toBe("review");

      // Hit the review cap for today.
      await client.query(
        `insert into user_review_log (user_id, word_id, mode, grade, review_type, reviewed_at)
         values ($1, $2, $3, 3, 'review', now()), ($1, $2, $3, 3, 'review', now())`,
        [userId, overdueId, mode]
      );

      // DEBUG: Check review count
      const { rows: reviewCount } = await client.query(
        `select count(*) as cnt from user_review_log
         where user_id = $1 and mode = $2 and review_type = 'review' and reviewed_at::date = current_date`,
        [userId, mode]
      );
      console.log('DEBUG: Review count today:', reviewCount[0].cnt, '/ limit:', 2);
      console.log('DEBUG: Expected newId:', newId);

      const second = await callGetNextWord(client, userId, mode);
      console.log('DEBUG: Second result:', JSON.stringify(second, null, 2));
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
});

if (!hasDb) {
  describe("FSRS RPC integration (skipped)", () => {
    test("skips without DB URL", () => {
      expect(getDbUrl()).toBeFalsy();
    });
  });
}
