import { randomUUID } from "node:crypto";
import { Pool } from "pg";
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
const cardTypeId = "word-to-definition";

describeIfDb("FSRS New/Review lapse classification", () => {
  const pool = new Pool({ connectionString: dbUrl });

  beforeAll(async () => {
    await runMigrations(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  test("classifies the first Again as New and records one initial lapse", async () => {
    const userId = randomUUID();

    await withTransaction(pool, async (client) => {
      await ensureUserWithSettings(client, userId);
      const entryId = await insertWord(client, `classification-new-${userId}`);

      await client.query(
        `select handle_card_review($1::uuid, $2::uuid, $3::text, 'fail', $4::uuid)`,
        [userId, entryId, cardTypeId, randomUUID()],
      );

      const { rows: statusRows } = await client.query(
        `select fsrs_reps, fsrs_lapses, fsrs_last_grade, last_result,
                fsrs_stability::float8 as fsrs_stability,
                fsrs_difficulty::float8 as fsrs_difficulty
           from user_card_status
          where user_id = $1 and entry_id = $2 and card_type_id = $3`,
        [userId, entryId, cardTypeId],
      );
      expect(statusRows).toEqual([
        expect.objectContaining({
          fsrs_reps: 1,
          fsrs_lapses: 1,
          fsrs_last_grade: 1,
          last_result: "fail",
          fsrs_stability: expect.any(Number),
          fsrs_difficulty: expect.any(Number),
        }),
      ]);

      const { rows: logRows } = await client.query(
        `select grade, review_type, metadata
           from user_review_log
          where user_id = $1 and word_id = $2 and mode = $3`,
        [userId, entryId, cardTypeId],
      );
      expect(logRows).toHaveLength(1);
      expect(logRows[0]).toEqual(
        expect.objectContaining({
          grade: 1,
          review_type: "new",
          metadata: expect.objectContaining({ same_day: false }),
        }),
      );
    }, userId);
  });

  test("classifies Again after existing memory as Review and increments lapse", async () => {
    const userId = randomUUID();

    await withTransaction(pool, async (client) => {
      await ensureUserWithSettings(client, userId);
      const entryId = await insertWord(client, `classification-review-${userId}`);

      await client.query(
        `select handle_card_review($1::uuid, $2::uuid, $3::text, 'success', $4::uuid)`,
        [userId, entryId, cardTypeId, randomUUID()],
      );
      const { rows: initialStatusRows } = await client.query(
        `select fsrs_reps, fsrs_lapses,
                fsrs_stability::float8 as fsrs_stability,
                fsrs_difficulty::float8 as fsrs_difficulty
           from user_card_status
          where user_id = $1 and entry_id = $2 and card_type_id = $3`,
        [userId, entryId, cardTypeId],
      );
      expect(initialStatusRows).toHaveLength(1);
      const initialStatus = initialStatusRows[0];
      expect(initialStatus).toEqual(
        expect.objectContaining({
          fsrs_reps: 1,
          fsrs_lapses: 0,
          fsrs_stability: expect.any(Number),
          fsrs_difficulty: expect.any(Number),
        }),
      );
      await client.query(
        `update user_card_status
            set last_reviewed_at = now() - interval '1 day',
                next_review_at = now() - interval '1 day'
          where user_id = $1 and entry_id = $2 and card_type_id = $3`,
        [userId, entryId, cardTypeId],
      );
      await client.query(
        `select handle_card_review($1::uuid, $2::uuid, $3::text, 'fail', $4::uuid)`,
        [userId, entryId, cardTypeId, randomUUID()],
      );

      const { rows: statusRows } = await client.query(
        `select fsrs_reps, fsrs_lapses, fsrs_last_grade, last_result,
                fsrs_stability::float8 as fsrs_stability,
                fsrs_difficulty::float8 as fsrs_difficulty
           from user_card_status
          where user_id = $1 and entry_id = $2 and card_type_id = $3`,
        [userId, entryId, cardTypeId],
      );
      expect(statusRows).toEqual([
        expect.objectContaining({
          fsrs_reps: 2,
          fsrs_lapses: 1,
          fsrs_last_grade: 1,
          last_result: "fail",
          fsrs_stability: expect.any(Number),
          fsrs_difficulty: expect.any(Number),
        }),
      ]);
      expect(statusRows[0].fsrs_reps).toBe(initialStatus.fsrs_reps + 1);
      expect(statusRows[0].fsrs_lapses).toBe(initialStatus.fsrs_lapses + 1);

      const { rows: logRows } = await client.query(
        `select grade, review_type, metadata
          from user_review_log
          where user_id = $1 and word_id = $2 and mode = $3
          order by reviewed_at asc, id asc`,
        [userId, entryId, cardTypeId],
      );
      expect(logRows).toHaveLength(2);
      expect(logRows.map((row) => row.review_type).sort()).toEqual(["new", "review"]);
      const reviewRow = logRows.find((row) => row.review_type === "review");
      expect(reviewRow).toEqual(
        expect.objectContaining({
          grade: 1,
          metadata: expect.objectContaining({ same_day: false }),
        }),
      );
    }, userId);
  });
});
