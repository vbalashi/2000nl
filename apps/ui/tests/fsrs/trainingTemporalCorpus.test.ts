import { randomUUID } from "crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import {
  ensureUserWithSettings,
  getDbUrl,
  insertWord,
  runMigrations,
  withTransaction,
} from "./dbTestUtils";

const databaseUrl = getDbUrl();
const describeDb = databaseUrl ? describe : describe.skip;

describeDb("training temporal corpus", () => {
  const pool = new Pool({ connectionString: databaseUrl });

  beforeAll(async () => {
    await runMigrations(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  test("keeps FSRS elapsed time numeric while same-day stays calendar-based", async () => {
    await withTransaction(pool, async (client) => {
      const referenceNow = "2026-04-10T12:00:00Z";
      const corpus = [
        {
          name: "just under half a day",
          lastReviewAt: "2026-04-10T00:00:00.0864Z",
          elapsedDays: 0.499999,
          sameDay: true,
        },
        {
          name: "exactly half a day",
          lastReviewAt: "2026-04-10T00:00:00Z",
          elapsedDays: 0.5,
          sameDay: true,
        },
        {
          name: "just over half a day across midnight",
          lastReviewAt: "2026-04-09T23:59:59.9136Z",
          elapsedDays: 0.500001,
          sameDay: false,
        },
        {
          name: "one day",
          lastReviewAt: "2026-04-09T12:00:00Z",
          elapsedDays: 1,
          sameDay: false,
        },
        {
          name: "three days",
          lastReviewAt: "2026-04-07T12:00:00Z",
          elapsedDays: 3,
          sameDay: false,
        },
        {
          name: "seven days",
          lastReviewAt: "2026-04-03T12:00:00Z",
          elapsedDays: 7,
          sameDay: false,
        },
      ];

      for (const item of corpus) {
        await client.query(
          `select set_config('training.test_reference_now', $1, true)`,
          [referenceNow],
        );
        const { rows } = await client.query(
          `select fsrs6_compute(
             2.0, 5.0, $1::timestamptz, 3::smallint, 0.9, 1, 0,
             fsrs6_parameters()
           ) as result`,
          [item.lastReviewAt],
        );
        const result = rows[0].result as {
          elapsed: number;
          same_day: boolean;
        };

        expect(result, item.name).toMatchObject({
          elapsed: item.elapsedDays,
          same_day: item.sameDay,
        });
      }
    });
  });

  test("selects review cards exactly when 1, 3, and 7-day intervals are due", async () => {
    const userId = randomUUID();
    const referenceNow = "2026-04-10T12:00:00Z";

    await withTransaction(
      pool,
      async (client) => {
        await ensureUserWithSettings(client, userId, {
          daily_new_limit: 10,
          daily_review_limit: 10,
        });

        const { rows: listRows } = await client.query(
          `insert into user_word_lists (
             user_id, language_code, primary_language_code, name
           ) values ($1, 'nl', 'nl', $2)
           returning id`,
          [userId, `Temporal corpus ${userId}`],
        );
        const listId = listRows[0].id as string;
        const cards = [1, 3, 7].map((gapDays) => ({
          gapDays,
          entryId: "",
        }));

        for (const card of cards) {
          card.entryId = await insertWord(
            client,
            `temporal-review-${card.gapDays}-${userId}`,
            { is_nt2_2000: true },
          );
          await client.query(
            `insert into user_word_list_items (list_id, word_id)
             values ($1, $2)`,
            [listId, card.entryId],
          );
          await client.query(
            `insert into user_card_status (
               user_id, entry_id, card_type_id, fsrs_enabled,
               fsrs_stability, fsrs_difficulty, fsrs_reps, fsrs_lapses,
               fsrs_last_interval, next_review_at, last_reviewed_at
             ) values (
               $1, $2, 'word-to-definition', true,
               2.0, 5.0, 2, 0, $3::numeric,
               $4::timestamptz,
               $4::timestamptz - ($3::numeric * interval '1 day')
             )`,
            [userId, card.entryId, card.gapDays, referenceNow],
          );
        }

        const selectReview = async (at: string) => {
          await client.query(
            `select set_config('training.test_reference_now', $1, true)`,
            [at],
          );
          const { rows } = await client.query(
            `select entry_id, queue_source
               from private.training_scheduler_candidates_v2(
                 $1, ARRAY['word-to-definition']::text[], $2::uuid,
                 'user', 'both', 'auto', ARRAY[]::uuid[], ARRAY[]::text[],
                 '{}'::jsonb, false, false
               )
              where queue_source = 'review'
                and entry_id = any($3::uuid[])
              order by entry_id`,
            [userId, listId, cards.map((card) => card.entryId)],
          );
          return rows.map((row) => row.entry_id as string);
        };

        await expect(
          selectReview("2026-04-10T11:59:59.999999Z"),
        ).resolves.toEqual([]);
        await expect(selectReview(referenceNow)).resolves.toEqual(
          cards.map((card) => card.entryId).sort(),
        );
      },
      userId,
    );
  });

  test("keeps the 04:00 study-day boundary correct across Amsterdam DST", async () => {
    await withTransaction(pool, async (client) => {
      const { rows } = await client.query(`
        select
          private.training_study_day_date_v1(
            '2026-03-29T01:59:59Z'::timestamptz,
            'Europe/Amsterdam'
          )::text as spring_before,
          private.training_study_day_date_v1(
            '2026-03-29T02:00:00Z'::timestamptz,
            'Europe/Amsterdam'
          )::text as spring_at,
          private.training_study_day_date_v1(
            '2026-10-25T02:59:59Z'::timestamptz,
            'Europe/Amsterdam'
          )::text as autumn_before,
          private.training_study_day_date_v1(
            '2026-10-25T03:00:00Z'::timestamptz,
            'Europe/Amsterdam'
          )::text as autumn_at
      `);

      expect(rows[0]).toEqual({
        spring_before: "2026-03-28",
        spring_at: "2026-03-29",
        autumn_before: "2026-10-24",
        autumn_at: "2026-10-25",
      });
    });
  });
});
