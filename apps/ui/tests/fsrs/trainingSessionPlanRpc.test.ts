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

describeDb("authoritative training session plan RPC", () => {
  const pool = new Pool({ connectionString: databaseUrl });

  beforeAll(async () => {
    await runMigrations(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  test("snapshots bounded new and due work for the exact scheduler scope", async () => {
    const userId = randomUUID();
    await withTransaction(pool, async (client) => {
      await ensureUserWithSettings(client, userId, {
        daily_new_limit: 2,
        daily_review_limit: 1,
      });
      const newA = await insertWord(client, `session-plan-new-a-${Date.now()}`);
      const newB = await insertWord(client, `session-plan-new-b-${Date.now()}`);
      const newC = await insertWord(client, `session-plan-new-c-${Date.now()}`);
      const dueA = await insertWord(client, `session-plan-due-a-${Date.now()}`);
      const dueB = await insertWord(client, `session-plan-due-b-${Date.now()}`);
      const { rows: listRows } = await client.query(
        `insert into user_word_lists (user_id, language_code, primary_language_code, name)
         values ($1, 'nl', 'nl', $2)
         returning id`,
        [userId, `Session plan ${Date.now()}`],
      );
      const listId = listRows[0].id;
      for (const wordId of [newA, newB, newC, dueA, dueB]) {
        await client.query(`select add_entry_to_user_list($1, $2, $3)`, [
          userId,
          listId,
          wordId,
        ]);
      }
      await client.query(
        `insert into user_card_status (
          user_id, entry_id, card_type_id,
          fsrs_stability, fsrs_difficulty, fsrs_reps, fsrs_lapses,
          fsrs_last_interval, fsrs_last_grade, fsrs_enabled,
          next_review_at, last_seen_at
        ) values
          ($1, $2, 'word-to-definition', 2, 5, 2, 0, 2, 3, true, now() - interval '2 days', now()),
          ($1, $3, 'word-to-definition', .2, 5, 1, 0, .2, 2, true, now() - interval '1 day', now())`,
        [userId, dueA, dueB],
      );

      const { rows } = await client.query(
        `select get_training_session_plan(
          $1::uuid,
          ARRAY['word-to-definition']::text[],
          $2::uuid,
          'user',
          'both',
          '{}'::jsonb
        ) as plan`,
        [userId, listId],
      );

      expect(rows[0].plan).toEqual(
        expect.objectContaining({
          plannedNew: 2,
          plannedReview: 1,
          plannedTotal: 3,
        }),
      );
      expect(rows[0].plan.plannedAt).toEqual(expect.any(String));
    }, userId);
  });

  test("excludes known, pointer-only, and hidden candidates", async () => {
    const userId = randomUUID();
    await withTransaction(pool, async (client) => {
      await ensureUserWithSettings(client, userId, {
        daily_new_limit: 10,
        daily_review_limit: 10,
      });
      const trainable = await insertWord(client, `session-plan-trainable-${Date.now()}`);
      const pointer = await insertWord(client, `session-plan-pointer-${Date.now()}`);
      const known = await insertWord(client, `session-plan-known-${Date.now()}`);
      const hidden = await insertWord(client, `session-plan-hidden-${Date.now()}`);
      await client.query(
        `update word_entries
         set raw = jsonb_build_object('cross_reference', 'target-', 'meanings', '[]'::jsonb)
         where id = $1`,
        [pointer],
      );
      await client.query(
        `insert into user_card_status (
          user_id, entry_id, card_type_id, fsrs_enabled, hidden, next_review_at
        ) values ($1, $2, 'word-to-definition', true, true, now() - interval '1 day')`,
        [userId, hidden],
      );
      const { rows: eventRows } = await client.query(
        `insert into user_card_action_events (
          user_id, entry_id, card_type_id, action, client_event_id, action_payload_hash
        ) values ($1, $2, 'word-to-definition', 'mark-known', $3, $4)
        returning id`,
        [userId, known, randomUUID(), `known-${known}`],
      );
      await client.query(
        `insert into user_card_known_marks (
          user_id, entry_id, card_type_id, mark_event_id
        ) values ($1, $2, 'word-to-definition', $3)`,
        [userId, known, eventRows[0].id],
      );
      const { rows: listRows } = await client.query(
        `insert into user_word_lists (user_id, language_code, primary_language_code, name)
         values ($1, 'nl', 'nl', $2) returning id`,
        [userId, `Session exclusions ${Date.now()}`],
      );
      const listId = listRows[0].id;
      for (const wordId of [trainable, pointer, known, hidden]) {
        await client.query(`select add_entry_to_user_list($1, $2, $3)`, [userId, listId, wordId]);
      }

      const { rows } = await client.query(
        `select get_training_session_plan(
          $1::uuid,
          ARRAY['word-to-definition']::text[],
          $2::uuid,
          'user',
          'both',
          '{}'::jsonb
        ) as plan`,
        [userId, listId],
      );

      expect(rows[0].plan).toEqual(
        expect.objectContaining({ plannedNew: 1, plannedReview: 0, plannedTotal: 1 }),
      );
    }, userId);
  });

  test("uses the same source filter boundary as filtered card selection", async () => {
    const userId = randomUUID();
    await withTransaction(pool, async (client) => {
      await ensureUserWithSettings(client, userId, {
        daily_new_limit: 10,
        daily_review_limit: 10,
      });
      const matching = await insertWord(client, `session-plan-source-a-${Date.now()}`);
      const other = await insertWord(client, `session-plan-source-b-${Date.now()}`);
      await client.query(
        `insert into user_card_status (
          user_id, entry_id, card_type_id, fsrs_enabled, hidden, next_review_at
        ) values
          ($1, $2, 'word-to-definition', true, false, now() - interval '1 day'),
          ($1, $3, 'word-to-definition', true, false, now() - interval '1 day')`,
        [userId, matching, other],
      );
      const { rows: sourceRows } = await client.query(
        `insert into learning_sources (
          source_identity_key, kind, provider, external_id, canonical_url,
          title, language_code, metadata
        ) values
          ($1, 'youtube_video', 'youtube', 'video-a',
           'https://www.youtube.com/watch?v=video-a', 'Video A', 'nl', '{}'::jsonb),
          ($2, 'youtube_video', 'youtube', 'video-b',
           'https://www.youtube.com/watch?v=video-b', 'Video B', 'nl', '{}'::jsonb)
        returning id, external_id`,
        [`session-source-a-${Date.now()}`, `session-source-b-${Date.now()}`],
      );
      const sourceA = sourceRows.find((row) => row.external_id === "video-a").id;
      const sourceB = sourceRows.find((row) => row.external_id === "video-b").id;
      await client.query(
        `insert into user_card_action_events (
          user_id, entry_id, card_type_id, action, client_event_id,
          source_id, action_payload_hash
        ) values
          ($1, $2, 'word-to-definition', 'record-view', $4, $5, 'source-a'),
          ($1, $3, 'word-to-definition', 'record-view', $6, $7, 'source-b')`,
        [userId, matching, other, randomUUID(), sourceA, randomUUID(), sourceB],
      );

      const { rows } = await client.query(
        `select get_training_session_plan(
          $1::uuid,
          ARRAY['word-to-definition']::text[],
          NULL::uuid,
          'curated',
          'review',
          jsonb_build_object('sourceId', $2::text)
        ) as plan`,
        [userId, sourceA],
      );

      expect(rows[0].plan).toEqual(
        expect.objectContaining({ plannedNew: 0, plannedReview: 1, plannedTotal: 1 }),
      );
    }, userId);
  });
});
