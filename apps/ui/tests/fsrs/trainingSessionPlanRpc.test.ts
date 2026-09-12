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
           'private.training_scheduler_candidates_v2(uuid,text[],uuid,text,text,text,uuid[],text[],jsonb,boolean,boolean)'::regprocedure
         ) as definition`,
      );
      expect(functionRows[0]?.definition).toContain(
        "FROM word_entries pointer_entry",
      );
      expect(functionRows[0]?.definition).toContain(
        "FROM private.default_training_scope_entries_v1 scope_entry",
      );
      expect(functionRows[0]?.definition).toContain(
        "today_new_words AS MATERIALIZED",
      );
      expect(functionRows[0]?.definition).toContain(
        "known_cards AS MATERIALIZED",
      );
      expect(functionRows[0]?.definition).toContain(
        "learner_status AS MATERIALIZED",
      );

      const { rows: siblingIndexRows } = await client.query(
        `select pg_get_indexdef(
           'public.word_entries_training_sibling_count_v1_idx'::regclass
         ) as definition`,
      );
      expect(siblingIndexRows[0]?.definition).toContain(
        "(dictionary_id, language_code, headword)",
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

  test("resolves readable dictionaries set-wise before building scheduler scope", async () => {
    await withTransaction(pool, async (client) => {
      const { rows } = await client.query(
        `select pg_get_functiondef(
           'private.training_scheduler_candidates_v2(uuid,text[],uuid,text,text,text,uuid[],text[],jsonb,boolean,boolean)'::regprocedure
         ) as definition`,
      );
      expect(rows[0].definition).toContain("readable_dictionaries AS MATERIALIZED");
      expect(rows[0].definition).toContain(
        "LEFT JOIN readable_dictionaries readable_dictionary",
      );
      expect(rows[0].definition.match(/can_access_dictionary\(/g)).toHaveLength(1);
    });
  });

  test("keeps direct public selection on the shared selector without private v1 compatibility functions", async () => {
    await withTransaction(pool, async (client) => {
      const { rows } = await client.query(
        `select
           to_regprocedure(
             'private.training_scheduler_candidates_v1(uuid,text[],uuid,text,text,text,uuid[],text[],jsonb,boolean)'
           ) as direct_v1,
           to_regprocedure(
             'private.training_scheduler_candidates_v1(uuid,text[],uuid,text,text,text,uuid[],text[],jsonb,boolean,boolean)'
           ) as practice_v1,
           pg_get_functiondef(
             'public.get_next_filtered_card(uuid,text[],uuid[],uuid,text,text,text,text[],jsonb,boolean)'::regprocedure
           ) as definition`,
      );
      expect(rows[0]?.direct_v1).toBeNull();
      expect(rows[0]?.practice_v1).toBeNull();
      expect(rows[0]?.definition).toContain(
        "private.training_scheduler_candidates_v2",
      );
      expect(rows[0]?.definition).not.toContain(
        "readable_dictionaries AS MATERIALIZED",
      );
    });
  });

  test("bounds finite sessions and excludes future practice cards", async () => {
    const userId = randomUUID();
    await withTransaction(pool, async (client) => {
      await ensureUserWithSettings(client, userId, {
        daily_new_limit: 20,
        daily_review_limit: 20,
      });
      for (let index = 0; index < 12; index += 1) {
        await insertWord(client, `finite-session-${userId}-${index}`);
      }

      const callPlan = async (size: string) => {
        const { rows } = await client.query(
          `select get_training_session_plan(
            $1, ARRAY['word-to-definition'], NULL, 'curated', 'both', '{}', $2
          ) as plan`,
          [userId, size],
        );
        return rows[0].plan;
      };

      expect(await callPlan("5")).toEqual(
        expect.objectContaining({
          plannedNew: 5,
          plannedReview: 0,
          plannedPractice: 0,
          plannedTotal: 5,
        }),
      );
      expect(await callPlan("10")).toEqual(
        expect.objectContaining({
          plannedNew: 10,
          plannedReview: 0,
          plannedPractice: 0,
          plannedTotal: 10,
        }),
      );
      expect(await callPlan("all-due-today")).toEqual(
        expect.objectContaining({ plannedPractice: 0 }),
      );
      expect((await callPlan("all-due-today")).plannedTotal).toBeGreaterThanOrEqual(12);

      const { rows: selectionRows } = await client.query(
        `select get_next_card(
          $1, ARRAY['word-to-definition'], ARRAY[]::uuid[], NULL,
          'curated', 'both', 'new', ARRAY[]::text[], false
        ) as item`,
        [userId],
      );
      expect(selectionRows[0]?.item?.stats?.source).not.toBe("practice");
    }, userId);
  });

  test("does not let a daily new limit shorten a requested finite session", async () => {
    const userId = randomUUID();
    await withTransaction(pool, async (client) => {
      await ensureUserWithSettings(client, userId, {
        daily_new_limit: 1,
        daily_review_limit: 1,
      });
      for (let index = 0; index < 5; index += 1) {
        await insertWord(client, `session-budget-new-${userId}-${index}`);
      }

      const { rows } = await client.query(
        `select start_training_session(
          $1::uuid,
          ARRAY['word-to-definition']::text[],
          NULL::uuid,
          'curated',
          'both',
          '{}'::jsonb,
          '5'
        ) as session`,
        [userId],
      );

      expect(rows[0].session).toEqual(
        expect.objectContaining({
          sessionSize: '5',
          plannedNew: 5,
          plannedReview: 0,
          plannedTotal: 5,
        }),
      );
    }, userId);
  });

  test("selects only renderable ordinary directions before latching a session", async () => {
    const userId = randomUUID();
    await withTransaction(pool, async (client) => {
      await ensureUserWithSettings(client, userId, {
        daily_new_limit: 20,
        daily_review_limit: 20,
      });

      const insertMeaning = async (
        headword: string,
        raw: Record<string, unknown>,
      ) => {
        const { rows } = await client.query(
          `insert into word_entries (
             language_code, headword, meaning_id, part_of_speech, gender,
             is_nt2_2000, raw
           ) values ('nl', $1, 2, 'noun', 'n', true, $2::jsonb)
           returning id`,
          [headword, JSON.stringify(raw)],
        );
        return rows[0].id as string;
      };

      const sparseOrdinary = await insertMeaning(`sparse-${userId}`, {
        meanings: [{ definition: "ordinary definition", examples: [], idioms: [] }],
      });
      const contextualOrdinary = await insertMeaning(`contextual-${userId}`, {
        meanings: [{
          definition: "ordinary definition with context",
          examples: [{ source: "an owned ordinary example" }],
          idioms: [],
        }],
      });
      const idiomOnly = await insertMeaning(`legacy-idiom-${userId}`, {
        meanings: [{
          examples: [],
          idioms: [{ expression: "legacy idiom", explanation: "legacy explanation" }],
        }],
      });
      const reconcileContent = async (
        entryId: string,
        nodes: Array<Record<string, string>>,
      ) => {
        await client.query(
          `select private.reconcile_platform_v2_content_nodes(
             $1::uuid, $2::text, $3::jsonb
           )`,
          [entryId, `renderable-directions-${entryId}`, JSON.stringify(nodes)],
        );
      };
      await reconcileContent(sparseOrdinary, [{
        inputKey: "definition",
        kind: "definition",
        sourcePath: "raw.meanings[0].definition",
        sourceNativeKey: "definition",
        sourceTextFingerprint: "sparse-definition",
        sourceText: "ordinary definition",
      }]);
      await reconcileContent(contextualOrdinary, [
        {
          inputKey: "definition",
          kind: "definition",
          sourcePath: "raw.meanings[0].definition",
          sourceNativeKey: "definition",
          sourceTextFingerprint: "contextual-definition",
          sourceText: "ordinary definition with context",
        },
        {
          inputKey: "example",
          kind: "example",
          sourcePath: "raw.meanings[0].examples[0]",
          sourceNativeKey: "example",
          sourceTextFingerprint: "contextual-example",
          sourceText: "an owned ordinary example",
        },
      ]);
      await reconcileContent(idiomOnly, [
        {
          inputKey: "idiom",
          kind: "idiom",
          sourcePath: "raw.meanings[0].idioms[0]",
          sourceNativeKey: "idiom",
          sourceTextFingerprint: "legacy-idiom",
          sourceText: "legacy idiom",
        },
        {
          inputKey: "idiom-explanation",
          kind: "idiom-explanation",
          sourcePath: "raw.meanings[0].idioms[0].explanation",
          sourceNativeKey: "idiom-explanation",
          sourceTextFingerprint: "legacy-explanation",
          parentInputKey: "idiom",
          sourceText: "legacy explanation",
        },
      ]);
      const { rows: listRows } = await client.query(
        `insert into user_word_lists (user_id, language_code, primary_language_code, name)
         values ($1, 'nl', 'nl', $2)
         returning id`,
        [userId, `Renderable directions ${userId}`],
      );
      const listId = listRows[0].id as string;
      for (const entryId of [sparseOrdinary, contextualOrdinary, idiomOnly]) {
        await client.query(`select add_entry_to_user_list($1, $2, $3)`, [
          userId,
          listId,
          entryId,
        ]);
      }
      const { rows: eligibilityRows } = await client.query(
        `select entry.id as entry_id, private.training_ordinary_direct_recall_renderable_v1(
           entry.id, entry.meaning_id, 'word-to-definition'
         ) as renderable
         from word_entries entry
         where id = any($1::uuid[])
         order by entry_id`,
        [[sparseOrdinary, contextualOrdinary, idiomOnly]],
      );
      expect(eligibilityRows).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ entry_id: sparseOrdinary, renderable: false }),
          expect.objectContaining({ entry_id: contextualOrdinary, renderable: true }),
          expect.objectContaining({ entry_id: idiomOnly, renderable: true }),
        ]),
      );

      const plan = async (modes: string[]) => {
        const { rows } = await client.query(
          `select start_training_session(
             $1::uuid, $2::text[], $3::uuid, 'user', 'new', '{}'::jsonb, '10'
           ) as session`,
          [userId, modes, listId],
        );
        return rows[0].session;
      };

      const directOnly = await plan(["word-to-definition"]);
      expect(directOnly.plannedTotal).toBe(2);

      const { rows: directMembers } = await client.query(
        `select entry_id from training_session_members
         where session_id = $1 order by ordinal`,
        [directOnly.sessionId],
      );
      expect(directMembers.map((row) => row.entry_id)).toEqual(
        expect.arrayContaining([contextualOrdinary, idiomOnly]),
      );
      expect(directMembers.map((row) => row.entry_id)).not.toContain(sparseOrdinary);

      const reverseOnly = await plan(["definition-to-word"]);
      const { rows: reverseMembers } = await client.query(
        `select entry_id, card_type_id from training_session_members
         where session_id = $1 order by ordinal`,
        [reverseOnly.sessionId],
      );
      expect(reverseMembers).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            entry_id: sparseOrdinary,
            card_type_id: "definition-to-word",
          }),
        ]),
      );

      await reconcileContent(sparseOrdinary, [
        {
          inputKey: "definition",
          kind: "definition",
          sourcePath: "raw.meanings[0].definition",
          sourceNativeKey: "definition",
          sourceTextFingerprint: "sparse-definition",
          sourceText: "ordinary definition",
        },
        {
          inputKey: "example",
          kind: "example",
          sourcePath: "raw.meanings[0].examples[0]",
          sourceNativeKey: "example",
          sourceTextFingerprint: "sparse-repaired-example",
          sourceText: "a repaired owned ordinary example",
        },
      ]);
      const directAfterRepair = await plan(["word-to-definition"]);
      const { rows: repairedMembers } = await client.query(
        `select entry_id from training_session_members
         where session_id = $1 order by ordinal`,
        [directAfterRepair.sessionId],
      );
      expect(repairedMembers.map((row) => row.entry_id)).toContain(sparseOrdinary);
    }, userId);
  });

  test("keeps the requested action budget distinct from a scarce soft-mixed pool", async () => {
    const userId = randomUUID();
    await withTransaction(pool, async (client) => {
      await ensureUserWithSettings(client, userId, {
        daily_new_limit: 1,
        daily_review_limit: 1,
        new_review_ratio: 5,
      });
      for (let index = 0; index < 3; index += 1) {
        const entryId = await insertWord(client, `session-scarce-review-${userId}-${index}`);
        await client.query(
          `insert into user_card_status (
             user_id, entry_id, card_type_id, fsrs_stability, fsrs_difficulty,
             fsrs_reps, fsrs_lapses, fsrs_last_interval, fsrs_last_grade,
             fsrs_enabled, next_review_at, last_seen_at
           ) values ($1, $2, 'word-to-definition', 2, 5, 2, 0, 2, 3, true,
                     now() - interval '1 day', now())`,
          [userId, entryId],
        );
      }

      const { rows: startRows } = await client.query(
        `select start_training_session(
           $1::uuid, ARRAY['word-to-definition']::text[], NULL::uuid,
           'curated', 'both', '{}'::jsonb, '5'
         ) as session`,
        [userId],
      );
      expect(startRows[0].session).toEqual(
        expect.objectContaining({
          requestedTotal: 5,
          plannedNew: 0,
          plannedReview: 3,
          plannedTotal: 3,
        }),
      );
      const { rows: snapshotRows } = await client.query(
        `select get_training_session_snapshot($1::uuid, $2::uuid) as snapshot`,
        [userId, startRows[0].session.sessionId],
      );
      expect(snapshotRows[0].snapshot.members.map(
        (member: { queueSource: string }) => member.queueSource,
      )).toEqual(['review', 'review', 'review']);

      const { rows: newOnlyRows } = await client.query(
        `select get_training_session_plan(
           $1::uuid, ARRAY['word-to-definition']::text[], NULL::uuid,
           'curated', 'new', '{}'::jsonb, '5'
         ) as plan`,
        [userId],
      );
      expect(newOnlyRows[0].plan).toEqual(expect.objectContaining({
        requestedTotal: 5,
        plannedTotal: 0,
      }));
    }, userId);
  });

  test("latches the configured new-to-review order on the server", async () => {
    const userId = randomUUID();
    await withTransaction(pool, async (client) => {
      await ensureUserWithSettings(client, userId, {
        daily_new_limit: 1,
        daily_review_limit: 1,
        new_review_ratio: 5,
      });
      const newEntryIds = await Promise.all(
        Array.from({ length: 2 }, (_, index) =>
          insertWord(client, `session-ratio-new-${userId}-${index}`),
        ),
      );
      const reviewEntryIds = await Promise.all(
        Array.from({ length: 8 }, (_, index) =>
          insertWord(client, `session-ratio-review-${userId}-${index}`),
        ),
      );
      for (const entryId of reviewEntryIds) {
        await client.query(
          `insert into user_card_status (
             user_id, entry_id, card_type_id, fsrs_stability, fsrs_difficulty,
             fsrs_reps, fsrs_lapses, fsrs_last_interval, fsrs_last_grade,
             fsrs_enabled, next_review_at, last_seen_at
           ) values ($1, $2, 'word-to-definition', 2, 5, 2, 0, 2, 3, true,
                     now() - interval '1 day', now())`,
          [userId, entryId],
        );
      }

      const { rows: startRows } = await client.query(
        `select start_training_session(
           $1::uuid,
           ARRAY['word-to-definition']::text[],
           NULL::uuid,
           'curated',
           'both',
           '{}'::jsonb,
           '10'
         ) as session`,
        [userId],
      );
      const started = startRows[0].session;
      expect(started).toEqual(
        expect.objectContaining({ plannedNew: 2, plannedReview: 8, plannedTotal: 10 }),
      );

      const { rows: snapshotRows } = await client.query(
        `select get_training_session_snapshot($1::uuid, $2::uuid) as snapshot`,
        [userId, started.sessionId],
      );
      expect(
        snapshotRows[0].snapshot.members.map(
          (member: { queueSource: string }) => member.queueSource,
        ),
      ).toEqual([
        'new',
        'review',
        'review',
        'review',
        'review',
        'review',
        'new',
        'review',
        'review',
        'review',
      ]);
      expect(new Set(newEntryIds)).toHaveLength(2);
    }, userId);
  });

  test("stops a fifty-exercise mixed session at its total budget", async () => {
    const userId = randomUUID();
    await withTransaction(pool, async (client) => {
      await ensureUserWithSettings(client, userId, {
        daily_new_limit: 1,
        daily_review_limit: 1,
        new_review_ratio: 5,
      });
      for (let index = 0; index < 9; index += 1) {
        await insertWord(client, `session-fifty-new-${userId}-${index}`);
      }
      for (let index = 0; index < 41; index += 1) {
        const entryId = await insertWord(client, `session-fifty-review-${userId}-${index}`);
        await client.query(
          `insert into user_card_status (
             user_id, entry_id, card_type_id, fsrs_stability, fsrs_difficulty,
             fsrs_reps, fsrs_lapses, fsrs_last_interval, fsrs_last_grade,
             fsrs_enabled, next_review_at, last_seen_at
           ) values ($1, $2, 'word-to-definition', 2, 5, 2, 0, 2, 3, true,
                     now() - interval '1 day', now())`,
          [userId, entryId],
        );
      }

      const { rows: startRows } = await client.query(
        `select start_training_session(
           $1::uuid, ARRAY['word-to-definition']::text[], NULL::uuid,
           'curated', 'both', '{}'::jsonb, '50'
         ) as session`,
        [userId],
      );
      expect(startRows[0].session).toEqual(
        expect.objectContaining({
          sessionSize: '50',
          requestedTotal: 50,
          plannedNew: 9,
          plannedReview: 41,
          plannedTotal: 50,
        }),
      );
      const { rows: snapshotRows } = await client.query(
        `select get_training_session_snapshot($1::uuid, $2::uuid) as snapshot`,
        [userId, startRows[0].session.sessionId],
      );
      const sources = snapshotRows[0].snapshot.members.map(
        (member: { queueSource: string }) => member.queueSource,
      );
      expect(sources).toHaveLength(50);
      expect(sources.filter((source: string) => source === 'new')).toHaveLength(9);
      expect(sources.filter((source: string) => source === 'review')).toHaveLength(41);
      for (let index = 0; index < 48; index += 6) {
        expect(sources.slice(index, index + 6)).toEqual([
          'new', 'review', 'review', 'review', 'review', 'review',
        ]);
      }
      expect(sources.slice(48)).toEqual(['new', 'review']);
    }, userId);
  });

  test("latches finite membership even when the scheduler input changes", async () => {
    const userId = randomUUID();
    await withTransaction(pool, async (client) => {
      await ensureUserWithSettings(client, userId, {
        daily_new_limit: 20,
        daily_review_limit: 20,
      });
      const wordIds: string[] = [];
      for (let index = 0; index < 8; index += 1) {
        wordIds.push(await insertWord(client, `latched-session-${userId}-${index}`));
      }

      const { rows: startRows } = await client.query(
        `select start_training_session(
          $1::uuid,
          ARRAY['word-to-definition']::text[],
          NULL::uuid,
          'curated',
          'both',
          '{}'::jsonb,
          '5'
        ) as session`,
        [userId],
      );
      const started = startRows[0]?.session;
      expect(started).toEqual(
        expect.objectContaining({
          sessionSize: "5",
          plannedTotal: 5,
        }),
      );

      const { rows: beforeRows } = await client.query(
        `select get_training_session_snapshot($1::uuid, $2::uuid) as snapshot`,
        [userId, started.sessionId],
      );
      const before = beforeRows[0]?.snapshot;
      expect(before.members).toHaveLength(5);
      const beforeKeys = before.members.map(
        (member: { entryId: string; cardTypeId: string }) =>
          `${member.entryId}:${member.cardTypeId}`,
      );

      // Make the live scheduler input different after the session starts. The
      // session snapshot must not be rebuilt from this changed queue.
      await client.query(
        `insert into user_card_status (
          user_id, entry_id, card_type_id, fsrs_stability, fsrs_difficulty,
          fsrs_reps, fsrs_lapses, fsrs_last_interval, fsrs_last_grade,
          fsrs_enabled, next_review_at, last_seen_at
        ) values ($1, $2, 'word-to-definition', 2, 5, 2, 0, 2, 3, true,
                  now() - interval '1 day', now())`,
        [userId, wordIds[0]],
      );
      await insertWord(client, `latched-session-added-after-${userId}`);

      const { rows: afterRows } = await client.query(
        `select get_training_session_snapshot($1::uuid, $2::uuid) as snapshot`,
        [userId, started.sessionId],
      );
      const after = afterRows[0]?.snapshot;
      expect(after.plannedTotal).toBe(5);
      expect(after.members).toHaveLength(5);
      expect(
        after.members.map(
          (member: { entryId: string; cardTypeId: string }) =>
            `${member.entryId}:${member.cardTypeId}`,
        ),
      ).toEqual(beforeKeys);
    }, userId);
  });

  test("selects the first unconsumed member and consumes it idempotently", async () => {
    const userId = randomUUID();
    await withTransaction(pool, async (client) => {
      await ensureUserWithSettings(client, userId, {
        daily_new_limit: 20,
        daily_review_limit: 20,
      });
      for (let index = 0; index < 3; index += 1) {
        await insertWord(client, `session-selection-${userId}-${index}`);
      }

      const { rows: startRows } = await client.query(
        `select start_training_session(
          $1::uuid,
          ARRAY['word-to-definition']::text[],
          NULL::uuid,
          'curated',
          'both',
          '{}'::jsonb,
          '5'
        ) as session`,
        [userId],
      );
      const started = startRows[0].session;
      const sessionId = started.sessionId as string;

      const { rows: firstRows } = await client.query(
        `select get_next_training_session_card($1::uuid, $2::uuid) as card`,
        [userId, sessionId],
      );
      const first = firstRows[0].card;
      expect(first.trainingSessionId).toBe(sessionId);
      expect(first.trainingSessionOrdinal).toBe(1);

      const { rows: excludedRows } = await client.query(
        `select get_next_training_session_card(
          $1::uuid, $2::uuid, $3::text[]
        ) as card`,
        [userId, sessionId, [`${first.id}:${first.mode}`]],
      );
      expect(excludedRows[0].card.id).not.toBe(first.id);
      expect(excludedRows[0].card.trainingSessionOrdinal).toBe(2);

      const { rows: members } = await client.query(
        `select entry_id as "entryId", card_type_id as "cardTypeId"
         from training_session_members
         where session_id = $1
         order by ordinal`,
        [sessionId],
      );
      const secondMember = members[1];
      const { rows: outOfOrderRows } = await client.query(
        `select private.consume_training_session_member(
          $1::uuid, $2::uuid, $3::uuid, $4::text
        ) as result`,
        [userId, sessionId, secondMember.entryId, secondMember.cardTypeId],
      );
      expect(outOfOrderRows[0].result).toEqual(
        expect.objectContaining({
          status: "out-of-order",
          ordinal: 2,
          expectedOrdinal: 1,
        }),
      );

      const { rows: consumedRows } = await client.query(
        `select private.consume_training_session_member(
          $1::uuid, $2::uuid, $3::uuid, $4::text
        ) as result`,
        [userId, sessionId, first.id, first.mode],
      );
      expect(consumedRows[0].result).toEqual(
        expect.objectContaining({
          status: "consumed",
          remaining: started.plannedTotal - 1,
        }),
      );

      const { rows: duplicateRows } = await client.query(
        `select private.consume_training_session_member(
          $1::uuid, $2::uuid, $3::uuid, $4::text
        ) as result`,
        [userId, sessionId, first.id, first.mode],
      );
      expect(duplicateRows[0].result).toEqual(
        expect.objectContaining({ status: "duplicate", ordinal: 1 }),
      );

      const { rows: secondRows } = await client.query(
        `select get_next_training_session_card($1::uuid, $2::uuid) as card`,
        [userId, sessionId],
      );
      expect(secondRows[0].card.id).not.toBe(first.id);
      expect(secondRows[0].card.trainingSessionOrdinal).toBe(2);
    }, userId);
  });

  test("drains exactly five latched members despite queue mutation and selector retries", async () => {
    const userId = randomUUID();
    await withTransaction(pool, async (client) => {
      await ensureUserWithSettings(client, userId, {
        daily_new_limit: 50,
        daily_review_limit: 50,
      });
      const initialEntryIds: string[] = [];
      for (let index = 0; index < 5; index += 1) {
        initialEntryIds.push(
          await insertWord(client, `immutable-session-${userId}-${index}`),
        );
      }
      const { rows: listRows } = await client.query(
        `insert into user_word_lists (user_id, language_code, primary_language_code, name)
         values ($1, 'nl', 'nl', $2)
         returning id`,
        [userId, `Immutable session ${userId}`],
      );
      const listId = listRows[0].id as string;
      for (const entryId of initialEntryIds) {
        await client.query(`select add_entry_to_user_list($1, $2, $3)`, [
          userId,
          listId,
          entryId,
        ]);
      }

      const { rows: startRows } = await client.query(
        `select start_training_session(
          $1::uuid,
          ARRAY['word-to-definition']::text[],
          $2::uuid,
          'user',
          'both',
          '{}'::jsonb,
          '5'
        ) as session`,
        [userId, listId],
      );
      const started = startRows[0].session;
      const sessionId = started.sessionId as string;
      expect(started.plannedTotal).toBe(5);

      const { rows: snapshotRows } = await client.query(
        `select get_training_session_snapshot($1::uuid, $2::uuid) as snapshot`,
        [userId, sessionId],
      );
      const snapshot = snapshotRows[0].snapshot;
      const latchedKeys = new Set(
        snapshot.members.map(
          (member: { entryId: string; cardTypeId: string }) =>
            `${member.entryId}:${member.cardTypeId}`,
        ),
      );
      expect(latchedKeys.size).toBe(5);
      expect(snapshot.members.map((member: { entryId: string }) => member.entryId)).toEqual(
        expect.arrayContaining(initialEntryIds),
      );

      // Add fresh scheduler candidates after the session starts. They must not
      // enter this session, even when the browser asks for the same member
      // again while a network/render retry is in flight.
      for (let index = 0; index < 8; index += 1) {
        const entryId = await insertWord(client, `post-start-queue-${userId}-${index}`);
        await client.query(`select add_entry_to_user_list($1, $2, $3)`, [
          userId,
          listId,
          entryId,
        ]);
      }

      const consumedKeys: string[] = [];
      await client.query(
        `select set_config('request.jwt.claim.role', 'service_role', true)`,
      );
      for (let ordinal = 1; ordinal <= 5; ordinal += 1) {
        const { rows: firstRows } = await client.query(
          `select get_next_training_session_card(
            $1::uuid, $2::uuid, $3::text[]
          ) as card`,
          [userId, sessionId, []],
        );
        const first = firstRows[0]?.card;
        expect(first).toEqual(
          expect.objectContaining({
            trainingSessionId: sessionId,
            trainingSessionOrdinal: ordinal,
          }),
        );
        const key = `${first.id}:${first.mode}`;
        expect(latchedKeys.has(key)).toBe(true);

        const { rows: retryRows } = await client.query(
          `select get_next_training_session_card(
            $1::uuid, $2::uuid, $3::text[]
          ) as card`,
          [userId, sessionId, []],
        );
        expect(retryRows[0].card).toEqual(first);

        const actionEventId = randomUUID();
        const { rows: consumeRows } = await client.query(
          `select perform_platform_v2_card_action_as_principal(
            $1::uuid, 'start-learning', $2::uuid, $3::text, $4::text,
            null, null, null, $5::uuid, null, 'first_party', null, $6::uuid
          ) as result`,
          [userId, first.id, first.mode, first.stateRevision, actionEventId, sessionId],
        );
        expect(consumeRows[0].result).toEqual(
          expect.objectContaining({
            status: "accepted",
            actionId: "start-learning",
          }),
        );
        consumedKeys.push(key);

        const { rows: duplicateRows } = await client.query(
          `select perform_platform_v2_card_action_as_principal(
            $1::uuid, 'start-learning', $2::uuid, $3::text, $4::text,
            null, null, null, $5::uuid, null, 'first_party', null, $6::uuid
          ) as result`,
          [userId, first.id, first.mode, first.stateRevision, actionEventId, sessionId],
        );
        expect(duplicateRows[0].result).toEqual(
          expect.objectContaining({ status: "duplicate", actionId: "start-learning" }),
        );
      }

      expect(new Set(consumedKeys).size).toBe(5);
      const { rows: exhaustedRows } = await client.query(
        `select get_next_training_session_card($1::uuid, $2::uuid) as card`,
        [userId, sessionId],
      );
      expect(exhaustedRows[0]?.card).toBeUndefined();

      const { rows: completionRows } = await client.query(
        `select completed_at, planned_total,
                (select count(*) from training_session_members member
                 where member.session_id = session.id and member.consumed_at is not null) as consumed
           from training_sessions session
          where session.id = $1`,
        [sessionId],
      );
      expect(completionRows[0]).toEqual(
        expect.objectContaining({
          planned_total: 5,
          consumed: "5",
          completed_at: expect.any(Date),
        }),
      );
    }, userId);
  });

  test("records exhaustion when no renderable replacement can preserve the requested session", async () => {
    const userId = randomUUID();
    await withTransaction(pool, async (client) => {
      await ensureUserWithSettings(client, userId, {
        daily_new_limit: 20,
        daily_review_limit: 20,
      });
      const wordIds: string[] = [];
      for (let index = 0; index < 5; index += 1) {
        const { rows: dictionaryRows } = await client.query(
          `insert into dictionaries (
           language_code, slug, name, kind, visibility, owner_user_id,
             minimum_subscription_tier, schema_key, schema_version
           ) values (
             'nl', $1, 'Unavailable member fixture', 'curated', 'private', null,
             'free', 'nl-vandale-v1', 1
           )
           returning id`,
          [`unavailable-member-${userId}-${index}`],
        );
        const dictionaryId = dictionaryRows[0].id as string;
        await client.query(
          `insert into dictionary_entitlements (
             dictionary_id, subject_type, subject_key, permission
           ) values ($1, 'user', $2, 'read')`,
          [dictionaryId, userId],
        );
        const { rows } = await client.query(
          `insert into word_entries (
             dictionary_id, language_code, headword, part_of_speech,
             is_nt2_2000, raw
           ) values ($1, 'nl', $2, 'noun', true, '{}'::jsonb)
           returning id`,
          [dictionaryId, `unavailable-member-${userId}-${index}`],
        );
        wordIds.push(rows[0].id as string);
      }

      const { rows: startRows } = await client.query(
        `insert into training_sessions (
           user_id, session_size, card_type_ids, list_type, card_filter,
           training_filter, planned_new, planned_review, planned_total
         ) values (
           $1, '5', ARRAY['word-to-definition']::text[], 'curated', 'both',
           '{}'::jsonb, 5, 0, 5
         )
         returning id`,
        [userId],
      );
      const sessionId = startRows[0].id as string;
      await client.query(
        `insert into training_session_members (
           session_id, ordinal, entry_id, card_type_id, queue_source
         )
         select $1, row_number() over (order by entry_id), entry_id,
                'word-to-definition', 'new'
         from unnest($2::uuid[]) as entries(entry_id)`,
        [sessionId, wordIds],
      );

      const { rows: firstMemberRows } = await client.query(
        `select entry_id from training_session_members
         where session_id = $1 and ordinal = 1`,
        [sessionId],
      );
      const firstEntryId = firstMemberRows[0].entry_id as string;
      const { rows: firstDictionaryRows } = await client.query(
        `select dictionary_id from word_entries where id = $1`,
        [firstEntryId],
      );
      const firstDictionaryId = firstDictionaryRows[0].dictionary_id as string;

      // The membership is already latched. Revoke the dictionary entitlement;
      // the read-only selector reports the first member for explicit
      // reconciliation rather than mutating it or looping.
      await client.query(
        `delete from dictionary_entitlements
         where dictionary_id = $1 and subject_type = 'user' and subject_key = $2`,
        [firstDictionaryId, userId],
      );

      const { rows: firstRows } = await client.query(
        `select get_next_training_session_card($1::uuid, $2::uuid, ARRAY[]::text[]) as card`,
        [userId, sessionId],
      );
      expect(firstRows[0].card).toEqual(
        expect.objectContaining({
          trainingSessionUnavailable: true,
          trainingSessionOrdinal: 1,
          entryId: firstEntryId,
          cardTypeId: "word-to-definition",
          reason: "dictionary-access-revoked",
        }),
      );

      const { rows: readOnlySnapshotRows } = await client.query(
        `select get_training_session_snapshot($1::uuid, $2::uuid) as snapshot`,
        [userId, sessionId],
      );
      expect(readOnlySnapshotRows[0].snapshot.members[0]).toEqual(
        expect.objectContaining({ unavailableAt: null, unavailableReason: null }),
      );

      const { rows: markRows } = await client.query(
        `select mark_training_session_member_unavailable(
          $1::uuid, $2::uuid, $3::uuid, 'word-to-definition',
          'dictionary-access-revoked'
        ) as result`,
        [userId, sessionId, firstEntryId],
      );
      expect(markRows[0].result).toEqual(
        expect.objectContaining({ status: "unavailable", remaining: 4 }),
      );

      const { rows: members } = await client.query(
        `select entry_id as "entryId", card_type_id as "cardTypeId"
         from training_session_members
         where session_id = $1
         order by ordinal`,
        [sessionId],
      );

      const { rows: unavailableConsumeRows } = await client.query(
        `select private.consume_training_session_member(
          $1::uuid, $2::uuid, $3::uuid, 'word-to-definition'
        ) as result`,
        [userId, sessionId, firstEntryId],
      );
      expect(unavailableConsumeRows[0].result).toEqual(
        expect.objectContaining({ status: "unavailable", ordinal: 1 }),
      );

      await client.query("savepoint unavailable_reason_mismatch");
      await expect(
        client.query(
          `select mark_training_session_member_unavailable(
            $1::uuid, $2::uuid, $3::uuid, 'word-to-definition',
            'dictionary-access-revoked'
          ) as result`,
          [userId, sessionId, members[1].entryId],
        ),
      ).rejects.toThrow(/evidence mismatch/);
      await client.query("rollback to savepoint unavailable_reason_mismatch");

      const { rows: secondRowsAfterMark } = await client.query(
        `select get_next_training_session_card($1::uuid, $2::uuid, ARRAY[]::text[]) as card`,
        [userId, sessionId],
      );
      expect(secondRowsAfterMark[0].card.trainingSessionOrdinal).toBe(2);

      const { rows: snapshotRows } = await client.query(
        `select get_training_session_snapshot($1::uuid, $2::uuid) as snapshot`,
        [userId, sessionId],
      );
      const snapshot = snapshotRows[0].snapshot;
      expect(snapshot.plannedTotal).toBe(5);
      expect(snapshot.members[0]).toEqual(
        expect.objectContaining({
          unavailableAt: expect.any(String),
          unavailableReason: "dictionary-access-revoked",
        }),
      );

      const markUnavailable = async (entryId: string) => {
        const { rows } = await client.query(
          `select mark_training_session_member_unavailable(
            $1::uuid, $2::uuid, $3::uuid, 'word-to-definition', 'model-invalid'
          ) as result`,
          [userId, sessionId, entryId],
        );
        return rows[0].result;
      };

      const orderedRemainingEntryIds = snapshot.members
        .filter((member: { unavailableAt?: string | null }) => !member.unavailableAt)
        .map((member: { entryId: string }) => member.entryId);
      expect(await markUnavailable(orderedRemainingEntryIds[0])).toEqual(
        expect.objectContaining({ status: "unavailable", remaining: 3 }),
      );
      expect(await markUnavailable(orderedRemainingEntryIds[1])).toEqual(
        expect.objectContaining({ status: "unavailable", remaining: 2 }),
      );
      expect(await markUnavailable(orderedRemainingEntryIds[2])).toEqual(
        expect.objectContaining({ status: "unavailable", remaining: 1 }),
      );
      expect(await markUnavailable(orderedRemainingEntryIds[3])).toEqual(
        expect.objectContaining({
          status: "unavailable-exhausted",
          remaining: 0,
        }),
      );

      const { rows: completedRows } = await client.query(
        `select get_training_session_snapshot($1::uuid, $2::uuid) as snapshot`,
        [userId, sessionId],
      );
      expect(completedRows[0].snapshot.plannedTotal).toBe(5);
      expect(completedRows[0].snapshot.members).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ unavailableReason: "dictionary-access-revoked" }),
          expect.objectContaining({ unavailableReason: "model-invalid" }),
        ]),
      );
      expect(completedRows[0].snapshot.members).toHaveLength(5);
    }, userId);
  });

  test("accepts the observed projection reason when identity and model evidence fail together", async () => {
    const userId = randomUUID();
    await withTransaction(pool, async (client) => {
      await ensureUserWithSettings(client, userId, {
        daily_new_limit: 20,
        daily_review_limit: 20,
      });
      const { rows: dictionaryRows } = await client.query(
        `insert into dictionaries (
           language_code, slug, name, kind, visibility, owner_user_id,
           minimum_subscription_tier, schema_key, schema_version
         ) values (
           'nl', $1, 'Projection precedence fixture', 'curated', 'private', null,
           'free', 'nl-vandale-v1', 1
         ) returning id`,
        [`projection-precedence-${userId}`],
      );
      const dictionaryId = dictionaryRows[0].id as string;
      await client.query(
        `insert into dictionary_entitlements (
           dictionary_id, subject_type, subject_key, permission
         ) values ($1, 'user', $2, 'read')`,
        [dictionaryId, userId],
      );
      const { rows: entryRows } = await client.query(
        `insert into word_entries (
           dictionary_id, language_code, headword, part_of_speech,
           is_nt2_2000, raw
         ) values ($1, 'nl', 'projection-precedence', 'noun', true, '{}'::jsonb)
         returning id`,
        [dictionaryId],
      );
      const entryId = entryRows[0].id as string;
      const { rows: sessionRows } = await client.query(
        `insert into training_sessions (
           user_id, session_size, card_type_ids, list_type, card_filter,
           training_filter, planned_new, planned_review, planned_total
         ) values (
           $1, '5', ARRAY['word-to-definition']::text[], 'curated', 'both',
           '{}'::jsonb, 1, 0, 1
         ) returning id`,
        [userId],
      );
      const sessionId = sessionRows[0].id as string;
      await client.query(
        `insert into training_session_members (
           session_id, ordinal, entry_id, card_type_id, queue_source
         ) values ($1, 1, $2, 'word-to-definition', 'new')`,
        [sessionId, entryId],
      );

      const { rows } = await client.query(
        `select mark_training_session_member_unavailable(
          $1::uuid, $2::uuid, $3::uuid, 'word-to-definition',
          'projection-missing'
        ) as result`,
        [userId, sessionId, entryId],
      );
      expect(rows[0].result).toEqual(
        expect.objectContaining({
          status: "unavailable-exhausted",
          reason: "projection-missing",
          remaining: 0,
        }),
      );
    }, userId);
  });

  test("replaces an unavailable member without spending the accepted-action budget", async () => {
    const userId = randomUUID();
    await withTransaction(pool, async (client) => {
      await ensureUserWithSettings(client, userId, {
        daily_new_limit: 1,
        daily_review_limit: 1,
      });
      const validEntryId = await insertWord(client, `replacement-valid-${userId}`);
      const { rows: dictionaryRows } = await client.query(
        `insert into dictionaries (
           language_code, slug, name, kind, visibility, owner_user_id,
           minimum_subscription_tier, schema_key, schema_version
         ) values (
           'nl', $1, 'Replacement failure fixture', 'curated', 'private', null,
           'free', 'nl-vandale-v1', 1
         ) returning id`,
        [`replacement-invalid-${userId}`],
      );
      const dictionaryId = dictionaryRows[0].id as string;
      await client.query(
        `insert into dictionary_entitlements (
           dictionary_id, subject_type, subject_key, permission
         ) values ($1, 'user', $2, 'read')`,
        [dictionaryId, userId],
      );
      const { rows: invalidRows } = await client.query(
        `insert into word_entries (
           dictionary_id, language_code, headword, part_of_speech,
           is_nt2_2000, raw
         ) values ($1, 'nl', $2, 'noun', true, '{}'::jsonb)
         returning id`,
        [dictionaryId, `replacement-invalid-${userId}`],
      );
      const invalidEntryId = invalidRows[0].id as string;
      const { rows: sessionRows } = await client.query(
        `insert into training_sessions (
           user_id, session_size, card_type_ids, list_type, card_filter,
           training_filter, requested_total, planned_new, planned_review, planned_total
         ) values (
           $1, '2', ARRAY['word-to-definition']::text[], 'curated', 'both',
           '{}'::jsonb, 2, 1, 0, 1
         ) returning id`,
        [userId],
      );
      const sessionId = sessionRows[0].id as string;
      await client.query(
        `insert into training_session_members (
           session_id, ordinal, entry_id, card_type_id, queue_source
         ) values ($1, 1, $2, 'word-to-definition', 'new')`,
        [sessionId, invalidEntryId],
      );

      const { rows: unavailableRows } = await client.query(
        `select mark_training_session_member_unavailable(
           $1::uuid, $2::uuid, $3::uuid, 'word-to-definition', 'model-invalid'
         ) as result`,
        [userId, sessionId, invalidEntryId],
      );
      expect(unavailableRows[0].result).toEqual(
        expect.objectContaining({ status: 'unavailable-replaced', replacementOrdinal: 2 }),
      );

      const { rows: retriedUnavailableRows } = await client.query(
        `select mark_training_session_member_unavailable(
           $1::uuid, $2::uuid, $3::uuid, 'word-to-definition', 'model-invalid'
         ) as result`,
        [userId, sessionId, invalidEntryId],
      );
      expect(retriedUnavailableRows[0].result).toEqual(
        expect.objectContaining({ status: 'unavailable', ordinal: 1 }),
      );
      const { rows: memberCountRows } = await client.query(
        `select count(*)::integer as members
         from training_session_members where session_id = $1`,
        [sessionId],
      );
      expect(memberCountRows[0].members).toBe(2);

      const { rows: replacementRows } = await client.query(
        `select get_next_training_session_card($1::uuid, $2::uuid) as card`,
        [userId, sessionId],
      );
      const replacement = replacementRows[0].card;
      expect(replacement).toEqual(
        expect.objectContaining({ id: validEntryId, trainingSessionOrdinal: 2 }),
      );

      await client.query(
        `select set_config('request.jwt.claim.role', 'service_role', true)`,
      );
      const { rows: actionRows } = await client.query(
        `select perform_platform_v2_card_action_as_principal(
           $1::uuid, 'start-learning', $2::uuid, 'word-to-definition', $3::text,
           null, null, null, $4::uuid, null, 'first_party', null, $5::uuid
         ) as result`,
        [userId, validEntryId, replacement.stateRevision, randomUUID(), sessionId],
      );
      expect(actionRows[0].result).toEqual(
        expect.objectContaining({ status: 'accepted', actionId: 'start-learning' }),
      );

      const { rows: snapshotRows } = await client.query(
        `select get_training_session_snapshot($1::uuid, $2::uuid) as snapshot`,
        [userId, sessionId],
      );
      expect(snapshotRows[0].snapshot).toEqual(
        expect.objectContaining({
          requestedTotal: 2,
          completedActions: 1,
          completionReason: 'exhausted',
        }),
      );
    }, userId);
  });

  test("retires a pre-existing sparse direct member without grading it", async () => {
    const userId = randomUUID();
    await withTransaction(pool, async (client) => {
      await ensureUserWithSettings(client, userId, {
        daily_new_limit: 20,
        daily_review_limit: 20,
      });
      const replacementEntryId = await insertWord(
        client,
        `sparse-direct-replacement-${userId}`,
      );
      const { rows: sparseRows } = await client.query(
        `insert into word_entries (
           language_code, headword, meaning_id, part_of_speech, gender,
           is_nt2_2000, raw
         ) values (
           'nl', $1, 2, 'noun', 'n', true,
           '{"meanings":[{"definition":"a sparse later meaning","examples":[]}]}'::jsonb
         ) returning id`,
        [`sparse-direct-${userId}`],
      );
      const sparseEntryId = sparseRows[0].id as string;
      await client.query(
        `select private.reconcile_platform_v2_content_nodes(
           $1::uuid, $2::text, $3::jsonb
         )`,
        [
          sparseEntryId,
          `sparse-direct-${sparseEntryId}`,
          JSON.stringify([{
            inputKey: "definition",
            kind: "definition",
            sourcePath: "raw.meanings[0].definition",
            sourceNativeKey: "definition",
            sourceTextFingerprint: "sparse-direct-definition",
            sourceText: "a sparse later meaning",
          }]),
        ],
      );
      const { rows: listRows } = await client.query(
        `insert into user_word_lists (user_id, language_code, primary_language_code, name)
         values ($1, 'nl', 'nl', $2)
         returning id`,
        [userId, `Sparse direct replacement ${userId}`],
      );
      const listId = listRows[0].id as string;
      for (const entryId of [sparseEntryId, replacementEntryId]) {
        await client.query(`select add_entry_to_user_list($1, $2, $3)`, [
          userId,
          listId,
          entryId,
        ]);
      }
      const { rows: sessionRows } = await client.query(
        `insert into training_sessions (
           user_id, session_size, card_type_ids, list_type, card_filter,
           training_filter, list_id, requested_total, planned_new, planned_review, planned_total
         ) values (
           $1, '2', ARRAY['word-to-definition']::text[], 'user', 'both',
           '{}'::jsonb, $2, 2, 1, 0, 1
         ) returning id`,
        [userId, listId],
      );
      const sessionId = sessionRows[0].id as string;
      await client.query(
        `insert into training_session_members (
           session_id, ordinal, entry_id, card_type_id, queue_source
         ) values ($1, 1, $2, 'word-to-definition', 'new')`,
        [sessionId, sparseEntryId],
      );

      const { rows: unavailableRows } = await client.query(
        `select mark_training_session_member_unavailable(
           $1::uuid, $2::uuid, $3::uuid, 'word-to-definition',
           'direct-example-missing'
         ) as result`,
        [userId, sessionId, sparseEntryId],
      );
      expect(unavailableRows[0].result).toEqual(
        expect.objectContaining({ status: "unavailable-replaced", replacementOrdinal: 2 }),
      );

      const { rows: snapshotRows } = await client.query(
        `select get_training_session_snapshot($1::uuid, $2::uuid) as snapshot`,
        [userId, sessionId],
      );
      expect(snapshotRows[0].snapshot).toEqual(
        expect.objectContaining({ completedActions: 0, plannedTotal: 1 }),
      );
      expect(snapshotRows[0].snapshot.members).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            entryId: sparseEntryId,
            unavailableReason: "direct-example-missing",
          }),
          expect.objectContaining({ entryId: replacementEntryId, ordinal: 2 }),
        ]),
      );
      const { rows: reviewLogRows } = await client.query(
        `select count(*)::integer as count from user_review_log where user_id = $1`,
        [userId],
      );
      expect(reviewLogRows[0].count).toBe(0);
    }, userId);
  });

  test("keeps scheduler dictionary access identical for system, owned, public, entitled, denied, and null entries", async () => {
    const userId = randomUUID();
    const otherUserId = randomUUID();
    await withTransaction(pool, async (client) => {
      await ensureUserWithSettings(client, userId, {
        daily_new_limit: 20,
        daily_review_limit: 20,
      });
      await ensureUserWithSettings(client, otherUserId);
      await client.query(
        `insert into languages (code, name) values ('en', 'English')
         on conflict (code) do nothing`,
      );

      const slugSuffix = randomUUID();
      const { rows: dictionaryRows } = await client.query(
        `insert into dictionaries (
           language_code, slug, name, kind, visibility, owner_user_id,
           minimum_subscription_tier
         ) values
           ('nl', $1, 'System fixture', 'curated', 'system', null, 'free'),
           ('nl', $2, 'Owned fixture', 'user', 'private', $6, 'free'),
           ('nl', $3, 'Public fixture', 'curated', 'public', null, 'free'),
           ('nl', $4, 'Entitled fixture', 'curated', 'private', null, 'free'),
           ('nl', $5, 'Denied fixture', 'user', 'private', $7, 'free')
         returning id, slug`,
        [
          `scheduler-system-${slugSuffix}`,
          `scheduler-owned-${slugSuffix}`,
          `scheduler-public-${slugSuffix}`,
          `scheduler-entitled-${slugSuffix}`,
          `scheduler-denied-${slugSuffix}`,
          userId,
          otherUserId,
        ],
      );
      const dictionaries = new Map(
        dictionaryRows.map((row) => [row.slug.split(`-${slugSuffix}`)[0], row.id]),
      );
      await client.query(
        `insert into dictionary_entitlements (
           dictionary_id, subject_type, subject_key, permission
         ) values ($1, 'user', $2, 'read')`,
        [dictionaries.get("scheduler-entitled"), userId],
      );

      const orderedFixtures = [
        ["scheduler-system", "6 days"],
        ["scheduler-owned", "5 days"],
        ["scheduler-public", "4 days"],
        ["scheduler-entitled", "3 days"],
        ["scheduler-denied", "2 days"],
      ] as const;
      const entryIds = new Map<string, string>();
      for (const [dictionaryKey, age] of orderedFixtures) {
        const { rows } = await client.query(
          `insert into word_entries (
             dictionary_id, language_code, headword, part_of_speech,
             is_nt2_2000, raw
           ) values ($1, 'nl', $2, 'noun', true, '{}'::jsonb)
           returning id`,
          [dictionaries.get(dictionaryKey), `${dictionaryKey}-${slugSuffix}`],
        );
        entryIds.set(dictionaryKey, rows[0].id);
        await client.query(
          `insert into user_card_status (
             user_id, entry_id, card_type_id, fsrs_enabled, hidden,
             fsrs_last_interval, next_review_at
           ) values ($1, $2, 'word-to-definition', true, false, 2, now() - $3::interval)`,
          [userId, rows[0].id, age],
        );
      }
      // The current write boundary rejects new dictionary-less entries, but the
      // scheduler still has an explicit legacy-null read contract. Insert one
      // historical row below the write trigger to characterize that contract.
      await client.query(
        `alter table word_entries disable trigger trg_word_entries_management`,
      );
      const { rows: nullRows } = await client.query(
         `insert into word_entries (
           dictionary_id, language_code, headword, part_of_speech,
           is_nt2_2000, raw, management_kind, source_lifecycle,
           normalized_pos_status
         ) values (
           null, 'en', $1, 'noun', true, '{}'::jsonb, 'source', 'active',
           'unresolved'
         )
         returning id`,
        [`scheduler-null-${slugSuffix}`],
      );
      await client.query(
        `alter table word_entries enable trigger trg_word_entries_management`,
      );
      const nullEntryId = nullRows[0].id;
      await client.query(
        `insert into user_card_status (
           user_id, entry_id, card_type_id, fsrs_enabled, hidden,
           fsrs_last_interval, next_review_at
         ) values ($1, $2, 'word-to-definition', true, false, 2, now() - interval '1 day')`,
        [userId, nullEntryId],
      );

      const { rows: planRows } = await client.query(
        `select get_training_session_plan(
          $1, ARRAY['word-to-definition'], null, 'curated', 'review', '{}'
        ) as plan`,
        [userId],
      );
      expect(planRows[0].plan).toEqual(
        expect.objectContaining({
          plannedNew: 0,
          plannedReview: 5,
          plannedPractice: 0,
          plannedTotal: 5,
        }),
      );

      const excluded: string[] = [];
      const drained: string[] = [];
      for (;;) {
        const { rows } = await client.query(
          `select get_next_card(
            $1, ARRAY['word-to-definition'], ARRAY[]::uuid[], null,
            'curated', 'review', 'auto', $2::text[], false
          ) as item`,
          [userId, excluded],
        );
        const item = rows[0]?.item;
        if (!item) break;
        drained.push(item.id);
        excluded.push(`${item.id}:${item.mode}`);
      }
      expect(drained).toEqual([
        entryIds.get("scheduler-system"),
        entryIds.get("scheduler-owned"),
        entryIds.get("scheduler-public"),
        entryIds.get("scheduler-entitled"),
        nullEntryId,
      ]);
      expect(drained).not.toContain(entryIds.get("scheduler-denied"));
    }, userId);
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
            'user', 'both', 'auto', $3::text[], false
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
      const { rows: privateV1Rows } = await client.query(
        `select proc.oid
         from pg_proc proc
         join pg_namespace namespace on namespace.oid = proc.pronamespace
         where namespace.nspname = 'private'
           and proc.proname = 'training_scheduler_candidates_v1'`,
      );
      expect(privateV1Rows).toEqual([]);
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
            $1, $2::text[], ARRAY[]::uuid[], $3, 'user', 'both', 'new', ARRAY[]::text[], false
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
            $1, $2::text[], ARRAY[]::uuid[], $3, 'user', 'both', 'auto', $4::text[], false
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
              $1, $2::text[], ARRAY[]::uuid[], $3, 'user', 'both', 'auto', $4::text[], false
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
          'curated', 'both', 'auto', ARRAY[]::text[], false
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
            'curated', 'review', 'auto', $3::text[], true
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

  test("excludes future practice from the finite plan but permits explicit direct practice", async () => {
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
        expect.objectContaining({ plannedPractice: 0, plannedTotal: 0 }),
      );
      const trainingFilter = JSON.stringify({
        dateWindow: "today",
        timezone: "UTC",
      });
      const { rows: noPracticeSelection } = await client.query(
        `select get_next_filtered_card(
          $1, ARRAY['word-to-definition', $2], ARRAY[]::uuid[], NULL,
          'curated', 'review', 'auto', ARRAY[]::text[], $3::jsonb, false
        ) as item`,
        [userId, reverse, trainingFilter],
      );
      expect(noPracticeSelection[0]?.item).toBeUndefined();
      const { rows: firstSelection } = await client.query(
        `select get_next_filtered_card(
          $1, ARRAY['word-to-definition', $2], ARRAY[]::uuid[], NULL,
          'curated', 'review', 'auto', ARRAY[]::text[], $3::jsonb, true
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
          'curated', 'review', 'auto', ARRAY[$3]::text[], $4::jsonb, true
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
          'curated', 'review', 'auto', ARRAY[$3, $4]::text[], $5::jsonb, true
        ) as item`,
        [userId, reverse, firstKey, secondKey, trainingFilter],
      );
      expect(exhaustedSelection[0]?.item).toBeUndefined();
    }, userId);
  });
});
