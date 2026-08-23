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

  test("uses the pointer-only index instead of reparsing every trainable raw entry", async () => {
    await withTransaction(pool, async (client) => {
      const { rows: functionRows } = await client.query(
        `select pg_get_functiondef(
           'private.training_scheduler_candidates_v1(uuid,text[],uuid,text,text,text,uuid[],text[],jsonb,boolean)'::regprocedure
         ) as definition`,
      );
      expect(functionRows[0]?.definition).toContain(
        "FROM word_entries pointer_entry",
      );

      await client.query(`set local enable_seqscan = off`);
      const { rows: planRows } = await client.query(
        `explain (format json)
         select entry.id, entry.dictionary_id
         from word_entries entry
         where not exists (
           select 1
           from word_entries pointer_entry
           where pointer_entry.id = entry.id
             and private.is_pointer_only_dictionary_entry_v1(pointer_entry.raw)
         )`,
      );
      expect(JSON.stringify(planRows[0]["QUERY PLAN"])).toContain(
        "word_entries_pointer_only_scheduler_exclusion_v1_idx",
      );
    });
  });

  test("snapshots exact card identities reachable in the scheduler scope", async () => {
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
          plannedReview: 2,
          plannedPractice: 0,
          plannedTotal: 4,
        }),
      );
      const excluded: string[] = [];
      const drained: Array<{ id: string; mode: string; source: string }> = [];
      for (;;) {
        const { rows: selectedRows } = await client.query(
          `select get_next_card(
            $1, ARRAY['word-to-definition'], ARRAY[]::uuid[], $2,
            'user', 'both', 'auto', $3::text[]
          ) as item`,
          [userId, listId, excluded],
        );
        const item = selectedRows[0]?.item;
        if (!item) break;
        drained.push({ id: item.id, mode: item.mode, source: item.stats.source });
        excluded.push(`${item.id}:${item.mode}`);
        await client.query(
          `insert into user_review_log (
            user_id, word_id, mode, grade, review_type, reviewed_at
          ) values ($1, $2, $3, 3, $4, now())`,
          [userId, item.id, item.mode, item.stats.source === "new" ? "new" : "review"],
        );
      }
      expect(drained).toHaveLength(rows[0].plan.plannedTotal);
      expect(drained.filter((item) => item.source === "new")).toHaveLength(2);
      const { rows: volatilityRows } = await client.query(
        `select proc.provolatile
         from pg_proc proc
         join pg_namespace namespace on namespace.oid = proc.pronamespace
         where namespace.nspname = 'private'
           and proc.proname = 'training_scheduler_candidates_v1'`,
      );
      expect(volatilityRows[0].provolatile).toBe("v");
      expect(rows[0].plan.plannedAt).toEqual(expect.any(String));
    }, userId);
  });

  test("uses distinct new words as the multi-mode daily cap unit and preserves diagnostics", async () => {
    const userId = randomUUID();
    await withTransaction(pool, async (client) => {
      await ensureUserWithSettings(client, userId, {
        daily_new_limit: 2,
        daily_review_limit: 0,
      });
      const wordA = await insertWord(client, `plan-multimode-a-${Date.now()}`);
      const wordB = await insertWord(client, `plan-multimode-b-${Date.now()}`);
      const reverse = "definition-to-word";
      await client.query(
        `insert into user_card_status (
          user_id, entry_id, card_type_id, fsrs_enabled, hidden
        ) values ($1, $2, $3, false, false)`,
        [userId, wordB, reverse],
      );
      const { rows: listRows } = await client.query(
        `insert into user_word_lists (user_id, language_code, primary_language_code, name)
         values ($1, 'nl', 'nl', $2) returning id`,
        [userId, `Multi-mode cap ${Date.now()}`],
      );
      const listId = listRows[0].id;
      for (const wordId of [wordA, wordB]) {
        await client.query(`select add_entry_to_user_list($1, $2, $3)`, [userId, listId, wordId]);
      }
      const modes = ["word-to-definition", reverse];
      const randomChoices = new Set<string>();
      for (let attempt = 0; attempt < 24; attempt += 1) {
        const { rows } = await client.query(
          `select get_next_card(
            $1, $2::text[], ARRAY[]::uuid[], $3, 'user', 'both', 'new', ARRAY[]::text[]
          ) as item`,
          [userId, modes, listId],
        );
        randomChoices.add(`${rows[0].item.id}:${rows[0].item.mode}`);
      }
      expect(randomChoices.size).toBeGreaterThan(1);
      expect([...randomChoices]).toEqual(
        expect.arrayContaining([
          expect.stringMatching(new RegExp(`^(${wordA}|${wordB}):`)),
        ]),
      );
      const { rows: planRows } = await client.query(
        `select get_training_session_plan($1, $2::text[], $3, 'user', 'both', '{}') as plan`,
        [userId, modes, listId],
      );
      expect(planRows[0].plan).toEqual(
        expect.objectContaining({ plannedNew: 3, plannedTotal: 3 }),
      );

      const excluded: string[] = [];
      for (;;) {
        const distinctReviewedWords = new Set(
          excluded.map((key) => key.slice(0, key.lastIndexOf(":"))),
        ).size;
        const { rows } = await client.query(
          `select get_next_card(
            $1, $2::text[], ARRAY[]::uuid[], $3, 'user', 'both', 'auto', $4::text[]
          ) as item`,
          [userId, modes, listId, excluded],
        );
        const item = rows[0]?.item;
        if (!item) break;
        expect(item.stats).toEqual(
          expect.objectContaining({
            new_today: distinctReviewedWords,
            daily_new_limit: 2,
            new_pool_size: 1,
            learning_due_count: 0,
            review_pool_size: 0,
          }),
        );
        expect(item.stats).not.toHaveProperty("training_filter");
        expect(Object.keys(item.stats).sort()).toEqual(
          [
            "clicks",
            "daily_new_limit",
            "difficulty",
            "interval",
            "learning_due_count",
            "mode",
            "new_pool_size",
            "new_today",
            "next_review",
            "reason",
            "reps",
            "review_pool_size",
            "source",
            "stability",
          ].sort(),
        );
        excluded.push(`${item.id}:${item.mode}`);
        await client.query(
          `insert into user_review_log (
            user_id, word_id, mode, grade, review_type, reviewed_at
          ) values ($1, $2, $3, 3, 'new', now())`,
          [userId, item.id, item.mode],
        );
      }
      expect(excluded).toHaveLength(planRows[0].plan.plannedTotal);
      expect(excluded).toContain(`${wordA}:word-to-definition`);
      expect(excluded).toContain(`${wordA}:${reverse}`);
      expect(excluded).toContain(`${wordB}:word-to-definition`);
    }, userId);
  });

  test("keeps an unequal-mode new-word cohort stable between plan and exhaustive drain", async () => {
    const userId = randomUUID();
    await withTransaction(pool, async (client) => {
      await ensureUserWithSettings(client, userId, {
        daily_new_limit: 1,
        daily_review_limit: 0,
      });
      const reverse = "definition-to-word";
      const modes = ["word-to-definition", reverse];

      for (let sample = 0; sample < 16; sample += 1) {
        const wordA = await insertWord(client, `cohort-a-${sample}-${Date.now()}`);
        const wordB = await insertWord(client, `cohort-b-${sample}-${Date.now()}`);
        await client.query(
          `insert into user_card_status (
            user_id, entry_id, card_type_id, fsrs_enabled, hidden
          ) values ($1, $2, $3, false, false)`,
          [userId, wordB, reverse],
        );
        const { rows: listRows } = await client.query(
          `insert into user_word_lists (user_id, language_code, primary_language_code, name)
           values ($1, 'nl', 'nl', $2) returning id`,
          [userId, `Cohort ${sample} ${Date.now()}`],
        );
        const listId = listRows[0].id;
        for (const wordId of [wordA, wordB]) {
          await client.query(`select add_entry_to_user_list($1, $2, $3)`, [userId, listId, wordId]);
        }

        const { rows: planRows } = await client.query(
          `select get_training_session_plan(
            $1, $2::text[], $3, 'user', 'both', '{}'
          ) as plan`,
          [userId, modes, listId],
        );
        const excluded: string[] = [];
        for (;;) {
          const { rows } = await client.query(
            `select get_next_card(
              $1, $2::text[], ARRAY[]::uuid[], $3, 'user', 'both', 'auto', $4::text[]
            ) as item`,
            [userId, modes, listId, excluded],
          );
          const item = rows[0]?.item;
          if (!item) break;
          excluded.push(`${item.id}:${item.mode}`);
          await client.query(
            `insert into user_review_log (
              user_id, word_id, mode, grade, review_type, reviewed_at
            ) values ($1, $2, $3, 3, 'new', now())`,
            [userId, item.id, item.mode],
          );
        }
        expect(excluded).toHaveLength(planRows[0].plan.plannedTotal);
        await client.query(`delete from user_review_log where user_id=$1`, [userId]);
      }
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

  test("matches unfiltered selection for exhausted caps, learning, future-due practice, and multi-mode identity", async () => {
    const userId = randomUUID();
    await withTransaction(pool, async (client) => {
      await ensureUserWithSettings(client, userId, {
        daily_new_limit: 0,
        daily_review_limit: 0,
      });
      const learning = await insertWord(client, `plan-learning-${Date.now()}`);
      const future = await insertWord(client, `plan-future-${Date.now()}`);
      const reverse = "definition-to-word";
      await client.query(
        `insert into user_card_status (
          user_id, entry_id, card_type_id, fsrs_enabled, hidden,
          fsrs_last_interval, next_review_at
        ) values
          ($1, $2, 'word-to-definition', true, false, .2, now() - interval '1 minute'),
          ($1, $3, 'word-to-definition', true, false, 2, now() + interval '1 day'),
          ($1, $3, $4, true, false, 2, now() + interval '1 day')`,
        [userId, learning, future, reverse],
      );

      const { rows: learningPlanRows } = await client.query(
        `select get_training_session_plan(
          $1, ARRAY['word-to-definition'], NULL, 'curated', 'both', '{}'
        ) as plan`,
        [userId],
      );
      const { rows: learningSelectionRows } = await client.query(
        `select get_next_card(
          $1, ARRAY['word-to-definition'], ARRAY[]::uuid[], NULL,
          'curated', 'both', 'auto', ARRAY[]::text[]
        ) as item`,
        [userId],
      );
      expect(learningPlanRows[0].plan.plannedTotal).toBe(1);
      expect(learningSelectionRows[0].item).toEqual(
        expect.objectContaining({ id: learning, mode: "word-to-definition" }),
      );

      await client.query(`update user_settings set daily_new_limit = 1 where user_id = $1`, [userId]);
      const { rows: practicePlanRows } = await client.query(
        `select get_training_session_plan(
          $1, ARRAY['word-to-definition', $2], NULL, 'curated', 'review', '{}'
        ) as plan`,
        [userId, reverse],
      );
      expect(practicePlanRows[0].plan).toEqual(
        expect.objectContaining({
          plannedNew: 0,
          plannedReview: 0,
          plannedPractice: 4,
          plannedTotal: 4,
        }),
      );
      const practiceKeys: string[] = [];
      for (;;) {
        const { rows: selectedRows } = await client.query(
          `select get_next_card(
            $1, ARRAY['word-to-definition', $2], ARRAY[]::uuid[], NULL,
            'curated', 'review', 'auto', $3::text[]
          ) as item`,
          [userId, reverse, practiceKeys],
        );
        const item = selectedRows[0]?.item;
        if (!item) break;
        expect(item.stats.source).toBe("practice");
        practiceKeys.push(`${item.id}:${item.mode}`);
      }
      expect(practiceKeys).toHaveLength(practicePlanRows[0].plan.plannedTotal);
      expect(practiceKeys).toContain(`${future}:word-to-definition`);
      expect(practiceKeys).toContain(`${future}:${reverse}`);
    }, userId);
  });

  test("counts filtered future-due practice cards with exact card identities", async () => {
    const userId = randomUUID();
    await withTransaction(pool, async (client) => {
      await ensureUserWithSettings(client, userId, {
        daily_new_limit: 0,
        daily_review_limit: 0,
      });
      const wordId = await insertWord(client, `plan-filtered-future-${Date.now()}`);
      const reverse = "definition-to-word";
      await client.query(
        `insert into user_card_status (
          user_id, entry_id, card_type_id, fsrs_enabled, hidden,
          fsrs_last_interval, next_review_at
        ) values
          ($1, $2, 'word-to-definition', true, false, 2, now() + interval '1 day'),
          ($1, $2, $3, true, false, 2, now() + interval '1 day')`,
        [userId, wordId, reverse],
      );
      await client.query(
        `insert into user_card_action_events (
          user_id, entry_id, card_type_id, action, client_event_id, action_payload_hash
        ) values
          ($1, $2, 'word-to-definition', 'record-view', $3, 'filtered-a'),
          ($1, $2, $4, 'record-view', $5, 'filtered-b')`,
        [userId, wordId, randomUUID(), reverse, randomUUID()],
      );

      const { rows } = await client.query(
        `select get_training_session_plan(
          $1, ARRAY['word-to-definition', $2], NULL, 'curated', 'review',
          jsonb_build_object('dateWindow', 'today', 'timezone', 'UTC')
        ) as plan`,
        [userId, reverse],
      );
      expect(rows[0].plan).toEqual(
        expect.objectContaining({ plannedPractice: 2, plannedTotal: 2 }),
      );
      const trainingFilter = JSON.stringify({
        dateWindow: "today",
        timezone: "UTC",
      });
      const { rows: firstSelection } = await client.query(
        `select get_next_filtered_card(
          $1, ARRAY['word-to-definition', $2], ARRAY[]::uuid[], NULL,
          'curated', 'review', 'auto', ARRAY[]::text[], $3::jsonb
        ) as item`,
        [userId, reverse, trainingFilter],
      );
      expect(firstSelection[0].item).toEqual(
        expect.objectContaining({ id: wordId }),
      );
      expect(firstSelection[0].item.stats).toEqual(
        expect.objectContaining({
          reason: "filtered",
          training_filter: JSON.parse(trainingFilter),
          new_pool_size: 0,
          learning_due_count: 0,
          review_pool_size: 0,
        }),
      );
      const firstKey = `${wordId}:${firstSelection[0].item.mode}`;
      const { rows: secondSelection } = await client.query(
        `select get_next_filtered_card(
          $1, ARRAY['word-to-definition', $2], ARRAY[]::uuid[], NULL,
          'curated', 'review', 'auto', ARRAY[$3]::text[], $4::jsonb
        ) as item`,
        [userId, reverse, firstKey, trainingFilter],
      );
      expect(secondSelection[0].item).toEqual(
        expect.objectContaining({ id: wordId }),
      );
      expect(secondSelection[0].item.mode).not.toBe(firstSelection[0].item.mode);
      const secondKey = `${wordId}:${secondSelection[0].item.mode}`;
      const { rows: exhaustedSelection } = await client.query(
        `select get_next_filtered_card(
          $1, ARRAY['word-to-definition', $2], ARRAY[]::uuid[], NULL,
          'curated', 'review', 'auto', ARRAY[$3, $4]::text[], $5::jsonb
        ) as item`,
        [userId, reverse, firstKey, secondKey, trainingFilter],
      );
      expect(exhaustedSelection[0]?.item).toBeUndefined();
    }, userId);
  });
});
