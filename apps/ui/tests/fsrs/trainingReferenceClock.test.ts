import { randomUUID } from "crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import {
  ensureUserWithSettings,
  insertWord,
  runMigrations,
  withTransaction,
} from "./dbTestUtils";

const databaseUrl =
  process.env.FSRS_TEST_DB_URL ??
  process.env.SUPABASE_DB_URL ??
  process.env.DATABASE_URL;
const describeDb = databaseUrl ? describe : describe.skip;

describeDb("training reference clock seam", () => {
  const pool = new Pool({ connectionString: databaseUrl });

  beforeAll(async () => {
    await runMigrations(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  test("uses the transaction-local instant and rejects malformed overrides", async () => {
    await withTransaction(pool, async (client) => {
      const referenceNow = "2026-03-29T01:02:03.456Z";
      await client.query(
        `select set_config('training.test_reference_now', $1, true)`,
        [referenceNow],
      );

      const { rows } = await client.query(
        `select private.training_reference_now_v1() as reference_now`,
      );
      expect(new Date(rows[0].reference_now).toISOString()).toBe(referenceNow);

      await client.query(
        `select set_config('training.test_reference_now', 'not-a-timestamp', true)`,
      );
      await expect(
        client.query(`select private.training_reference_now_v1()`),
      ).rejects.toThrow("invalid training.test_reference_now");
    });
  });

  test("drives FSRS same-day classification at an exact boundary", async () => {
    await withTransaction(pool, async (client) => {
      const compute = async (referenceNow: string, lastReviewAt: string) => {
        await client.query(
          `select set_config('training.test_reference_now', $1, true)`,
          [referenceNow],
        );
        const { rows } = await client.query(
          `select fsrs6_compute(
             2.0, 5.0, $1::timestamptz, 3::smallint, 0.9, 1, 0,
             fsrs6_parameters()
           ) as result`,
          [lastReviewAt],
        );
        return rows[0].result as { same_day: boolean; elapsed: number };
      };

      await expect(
        compute("2026-03-29T00:00:00Z", "2026-03-28T23:59:59Z"),
      ).resolves.toMatchObject({ same_day: false });
      await expect(
        compute("2026-03-29T00:00:00Z", "2026-03-29T00:00:00Z"),
      ).resolves.toMatchObject({ same_day: true, elapsed: 0 });
    });
  });

  test("drives the real selector across a just-before/at due boundary", async () => {
    const userId = randomUUID();
    await withTransaction(pool, async (client) => {
      await ensureUserWithSettings(client, userId, {
        daily_new_limit: 10,
        daily_review_limit: 10,
      });
      const entryId = await insertWord(client, `clock-seam-${userId}`);
      const { rows: listRows } = await client.query(
        `insert into user_word_lists (
           user_id, language_code, primary_language_code, name
         ) values ($1, 'nl', 'nl', $2)
         returning id`,
        [userId, `Clock seam ${userId}`],
      );
      const listId = listRows[0].id as string;
      await client.query(
        `insert into user_word_list_items (list_id, word_id)
         values ($1, $2)`,
        [listId, entryId],
      );
      await client.query(
        `insert into user_card_status (
           user_id, entry_id, card_type_id, fsrs_enabled,
           fsrs_stability, fsrs_difficulty, fsrs_reps, fsrs_lapses,
           fsrs_last_interval, next_review_at, last_reviewed_at
         ) values (
           $1, $2, 'word-to-definition', true,
           2.0, 5.0, 1, 0, 2.0, $3::timestamptz, $4::timestamptz
         )`,
        [
          userId,
          entryId,
          "2026-03-29T00:00:00Z",
          "2026-03-27T00:00:00Z",
        ],
      );

      const selectDue = async (referenceNow: string) => {
        await client.query(
          `select set_config('training.test_reference_now', $1, true)`,
          [referenceNow],
        );
        const { rows } = await client.query(
           `select entry_id, queue_source
             from private.training_scheduler_candidates_v2(
               $1, ARRAY['word-to-definition']::text[], $2::uuid,
               'user', 'both', 'auto', ARRAY[]::uuid[], ARRAY[]::text[],
               '{}'::jsonb, false, true
             )
             where queue_source = 'review'`,
          [userId, listId],
        );
        return rows;
      };

      await expect(
        selectDue("2026-03-28T23:59:59Z"),
      ).resolves.toEqual([]);
      await expect(
        selectDue("2026-03-29T00:00:00Z"),
      ).resolves.toEqual([
        expect.objectContaining({ entry_id: entryId, queue_source: "review" }),
      ]);
    }, userId);
  });
});
