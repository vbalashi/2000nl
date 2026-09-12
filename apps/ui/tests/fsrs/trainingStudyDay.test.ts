import { Pool } from "pg";
import { randomUUID } from "crypto";
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

describeDb("local training study day", () => {
  const pool = new Pool({ connectionString: databaseUrl });

  beforeAll(async () => {
    await runMigrations(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  test("rolls over at 04:00 in the learner timezone", async () => {
    await withTransaction(pool, async (client) => {
      const { rows } = await client.query(`
        SELECT
          private.training_study_day_date_v1(
            '2026-01-15T02:59:59Z'::timestamptz,
            'Europe/Amsterdam'
          )::text AS amsterdam_before,
          private.training_study_day_date_v1(
            '2026-01-15T03:00:00Z'::timestamptz,
            'Europe/Amsterdam'
          )::text AS amsterdam_after,
          private.training_study_day_date_v1(
            '2026-01-15T08:59:59Z'::timestamptz,
            'America/New_York'
          )::text AS new_york_before,
          private.training_study_day_date_v1(
            '2026-01-15T09:00:00Z'::timestamptz,
            'America/New_York'
          )::text AS new_york_after
      `);

      expect(rows[0]).toEqual({
        amsterdam_before: "2026-01-14",
        amsterdam_after: "2026-01-15",
        new_york_before: "2026-01-14",
        new_york_after: "2026-01-15",
      });
    });
  });

  test("keeps the local study-day window DST-safe", async () => {
    await withTransaction(pool, async (client) => {
      const { rows } = await client.query(`
        SELECT
          spring.study_date::text AS spring_date,
          EXTRACT(EPOCH FROM (spring.end_at - spring.start_at)) / 3600 AS spring_hours,
          autumn.study_date::text AS autumn_date,
          EXTRACT(EPOCH FROM (autumn.end_at - autumn.start_at)) / 3600 AS autumn_hours
        FROM private.training_study_day_bounds_v1(
          '2026-03-29T01:30:00Z'::timestamptz,
          'Europe/Amsterdam'
        ) spring
        CROSS JOIN private.training_study_day_bounds_v1(
          '2026-10-25T02:30:00Z'::timestamptz,
          'Europe/Amsterdam'
        ) autumn
      `);

      expect(rows[0]).toMatchObject({
        spring_date: "2026-03-28",
        autumn_date: "2026-10-24",
      });
      expect(Number(rows[0].spring_hours)).toBe(23);
      expect(Number(rows[0].autumn_hours)).toBe(25);
    });
  });

  test("attributes public stats to the selected local study day", async () => {
    const userId = randomUUID();
    await withTransaction(pool, async (client) => {
      await ensureUserWithSettings(client, userId);
      await client.query(
        `update user_settings
         set training_schedule_timezone = 'Europe/Amsterdam'
         where user_id = $1`,
        [userId],
      );
      const beforeEntryId = await insertWord(
        client,
        `study-day-before-${randomUUID()}`,
      );
      const currentEntryId = await insertWord(
        client,
        `study-day-current-${randomUUID()}`,
      );

      await client.query(
        `with bounds as (
           select *
           from private.training_study_day_bounds_v1(
             clock_timestamp(), 'Europe/Amsterdam'
           )
         )
         insert into user_card_action_events (
           user_id, entry_id, card_type_id, action,
           action_payload_hash, created_at
         )
         select $1::uuid, $2::uuid, 'word-to-definition', 'start-learning',
           'study-day-before', bounds.start_at - interval '1 second'
         from bounds
         union all
         select $1::uuid, $3::uuid, 'word-to-definition', 'start-learning',
           'study-day-current',
           least(bounds.start_at + interval '1 hour',
                 clock_timestamp() - interval '1 second')
         from bounds`,
        [userId, beforeEntryId, currentEntryId],
      );
      await client.query(
        `with bounds as (
           select *
           from private.training_study_day_bounds_v1(
             clock_timestamp(), 'Europe/Amsterdam'
           )
         )
         insert into user_review_log (
           user_id, word_id, mode, grade, review_type,
           reviewed_at, interval_after
         )
         select $1::uuid, $2::uuid, 'word-to-definition', 1, 'review',
           least(bounds.start_at + interval '1 hour',
                 clock_timestamp() - interval '1 second'), 0.0
         from bounds`,
        [userId, currentEntryId],
      );

      const { rows } = await client.query(
        `select public.get_detailed_training_stats(
           $1, ARRAY['word-to-definition']::text[], NULL::uuid,
           'curated', 'Europe/Amsterdam'
         ) as stats`,
        [userId],
      );

      expect(rows[0].stats).toMatchObject({
        newWordsToday: 1,
        newCardsToday: 1,
        learningStartedToday: 1,
        reviewWordsDone: 1,
        reviewCardsDone: 1,
      });
    }, userId);
  });
});
