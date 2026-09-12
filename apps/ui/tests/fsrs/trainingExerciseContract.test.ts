import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import {
  ensureUserWithSettings,
  getDbUrl,
  insertWord,
  runMigrations,
  withTransaction,
} from "./dbTestUtils";

const dbUrl = getDbUrl();
const describeIfDb = dbUrl ? describe : describe.skip;

describeIfDb("content-bound training exercise database contract", () => {
  const pool = new Pool({ connectionString: dbUrl });

  beforeAll(async () => {
    await runMigrations(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  test("preserves ordinary state while isolating idioms, translation, and retirement", async () => {
    await withTransaction(pool, async (client) => {
      const userId = randomUUID();
      await ensureUserWithSettings(client, userId);
      const entryId = await insertWord(client, `exercise-contract-${randomUUID()}`);
      const idiomA = randomUUID();
      const idiomB = randomUUID();
      const sentence = randomUUID();

      for (const [contentNodeId, kind, fingerprint] of [
        [idiomA, "idiom", "idiom-a-fingerprint"],
        [idiomB, "idiom", "idiom-b-fingerprint"],
        [sentence, "example", "sentence-fingerprint"],
      ] as const) {
        await client.query(
          `insert into private.platform_v2_content_nodes (
             id, entry_id, kind, binding_state, first_source_revision,
             last_source_revision, source_text_fingerprint, diagnostic_locator
           ) values ($1, $2, $3, 'active', 'test-revision', 'test-revision', $4, $5)`,
          [contentNodeId, entryId, kind, fingerprint, `test.${kind}.${contentNodeId}`],
        );
      }

      await client.query(
        `insert into public.user_card_status (
           user_id, entry_id, card_type_id, fsrs_stability, fsrs_difficulty,
           fsrs_reps, fsrs_last_grade, fsrs_enabled, next_review_at,
           last_reviewed_at, seen_count, success_count, last_result
         ) values ($1, $2, 'word-to-definition', 7.5, 4.25, 3, 3, true,
                   now(), now(), 4, 3, 'success')`,
        [userId, entryId],
      );
      const beforeOrdinary = await client.query(
        `select user_id, entry_id, card_type_id, fsrs_stability, fsrs_difficulty,
                fsrs_reps, fsrs_last_grade, fsrs_enabled, next_review_at,
                last_reviewed_at, seen_count, success_count, last_result
           from public.user_card_status
          where user_id = $1 and entry_id = $2 and card_type_id = 'word-to-definition'`,
        [userId, entryId],
      );

      const register = async (
        contentNodeId: string | null,
        family: string,
        direction: string,
        fingerprint: string | null,
      ) => {
        await client.query("select set_config('request.jwt.claim.role', 'service_role', true)");
        await client.query("set local role service_role");
        const { rows } = await client.query(
          `select public.ensure_platform_v2_training_exercise_target_as_principal_v1(
             $1, $2, $3, $4, 'test-revision', $5
           ) target_id`,
          [entryId, contentNodeId, family, direction, fingerprint],
        );
        await client.query("reset role");
        return rows[0].target_id as string;
      };

      const idiomADirect = await register(idiomA, "idiom", "direct", "idiom-a-fingerprint");
      const idiomAReverse = await register(idiomA, "idiom", "reverse", "idiom-a-fingerprint");
      const idiomBDirect = await register(idiomB, "idiom", "direct", "idiom-b-fingerprint");
      const idiomBReverse = await register(idiomB, "idiom", "reverse", "idiom-b-fingerprint");
      const translation = await register(
        sentence,
        "translation",
        "recall",
        "sentence-fingerprint",
      );

      const { rows: targets } = await client.query(
        `select target_key, family, direction, content_node_id
           from private.platform_v2_training_exercise_targets
          where id = any($1::uuid[])
          order by target_key`,
        [[idiomADirect, idiomAReverse, idiomBDirect, idiomBReverse, translation]],
      );
      expect(targets).toHaveLength(5);
      expect(new Set(targets.map((row) => row.target_key)).size).toBe(5);
      expect(targets.filter((row) => row.family === "idiom")).toHaveLength(4);
      expect(targets.find((row) => row.family === "translation")).toMatchObject({
        direction: "recall",
        content_node_id: sentence,
      });

      await client.query(
        `insert into public.user_training_exercise_state (
           user_id, target_id, fsrs_stability, fsrs_difficulty, fsrs_reps,
           fsrs_enabled, next_review_at
         ) values ($1, $2, 2.5, 6, 1, true, now()),
                  ($1, $3, 3.5, 5, 2, true, now())`,
        [userId, idiomADirect, idiomBDirect],
      );

      const clientEventId = randomUUID();
      const { rows: eventRows } = await client.query(
        `insert into public.user_training_exercise_action_events (
           user_id, target_id, action, result, client_event_id,
           action_payload_hash
         ) values ($1, $2, 'review-card', 'success', $3, 'payload-a')
         returning id`,
        [userId, idiomADirect, clientEventId],
      );
      await client.query(
        `insert into public.platform_v2_training_exercise_action_receipts (
           user_id, client_event_id, target_id, action_payload_hash,
           event_id, response
         ) values ($1, $2, $3, 'payload-a', $4, '{"status":"accepted"}'::jsonb)`,
        [userId, clientEventId, idiomADirect, eventRows[0].id],
      );

      await client.query("select set_config('request.jwt.claim.role', 'service_role', true)");
      await client.query("set local role service_role");
      const { rows: readRows } = await client.query(
        `select public.read_platform_v2_training_exercise_target_v1(
           $1, $2
         ) result`,
        [
          userId,
          `training-exercise-v1:idiom:direct:${entryId}:${idiomA}`,
        ],
      );
      expect(readRows[0].result).toMatchObject({
        family: "idiom",
        direction: "direct",
        visibilityState: "active",
        state: { fsrsReps: 1 },
      });

      await client.query("savepoint duplicate_action");
      await expect(
        client.query(
          `insert into public.user_training_exercise_action_events (
             user_id, target_id, action, result, client_event_id,
             action_payload_hash
           ) values ($1, $2, 'review-card', 'success', $3, 'payload-b')`,
          [userId, idiomBDirect, clientEventId],
        ),
      ).rejects.toThrow();
      await client.query("rollback to savepoint duplicate_action");
      await client.query("release savepoint duplicate_action");

      await client.query("reset role");

      await client.query(
        `update private.platform_v2_content_nodes
            set binding_state = 'retired'
          where id = $1`,
        [idiomA],
      );
      const { rows: retired } = await client.query(
        `select target_key, visibility_state, retired_at, retirement_reason
           from private.platform_v2_training_exercise_targets
          where content_node_id = $1
          order by target_key`,
        [idiomA],
      );
      expect(retired).toHaveLength(2);
      expect(retired.every((row) => row.visibility_state === "retired")).toBe(true);
      expect(retired.every((row) => row.retired_at !== null)).toBe(true);
      expect(retired.every((row) => row.retirement_reason === "source-node-retired")).toBe(true);

      const { rows: retainedState } = await client.query(
        `select fsrs_reps
           from public.user_training_exercise_state
          where user_id = $1 and target_id = $2`,
        [userId, idiomADirect],
      );
      expect(retainedState).toEqual([{ fsrs_reps: 1 }]);

      const afterOrdinary = await client.query(
        `select user_id, entry_id, card_type_id, fsrs_stability, fsrs_difficulty,
                fsrs_reps, fsrs_last_grade, fsrs_enabled, next_review_at,
                last_reviewed_at, seen_count, success_count, last_result
           from public.user_card_status
          where user_id = $1 and entry_id = $2 and card_type_id = 'word-to-definition'`,
        [userId, entryId],
      );
      expect(afterOrdinary.rows).toEqual(beforeOrdinary.rows);
    });
  });

  test("keeps target state and action storage private to authenticated reads", async () => {
    const { rows } = await pool.query(
      `select
         (select relrowsecurity from pg_class where oid = 'public.user_training_exercise_state'::regclass) as state_rls,
         (select relrowsecurity from pg_class where oid = 'public.training_session_exercise_members'::regclass) as session_rls,
         has_table_privilege('anon', 'public.user_training_exercise_state', 'select') as anon_state_select,
         has_table_privilege('authenticated', 'public.user_training_exercise_state', 'select') as authenticated_state_select,
         has_function_privilege('anon', 'private.ensure_platform_v2_training_exercise_target_v1(uuid,uuid,text,text,text,text)', 'execute') as anon_target_register,
         has_function_privilege('service_role', 'private.ensure_platform_v2_training_exercise_target_v1(uuid,uuid,text,text,text,text)', 'execute') as service_target_register,
         has_function_privilege('anon', 'public.ensure_platform_v2_training_exercise_target_as_principal_v1(uuid,uuid,text,text,text,text)', 'execute') as anon_target_wrapper,
         has_function_privilege('service_role', 'public.ensure_platform_v2_training_exercise_target_as_principal_v1(uuid,uuid,text,text,text,text)', 'execute') as service_target_wrapper`,
    );

    expect(rows[0]).toMatchObject({
      state_rls: true,
      session_rls: true,
      anon_state_select: false,
      authenticated_state_select: true,
      anon_target_register: false,
      service_target_register: false,
      anon_target_wrapper: false,
      service_target_wrapper: true,
    });
  });

  test("selects only eligible explained idioms and grades each direction independently", async () => {
    await withTransaction(pool, async (client) => {
      const userId = randomUUID();
      await ensureUserWithSettings(client, userId);
      const dictionaryId = randomUUID();
      await client.query(
        `insert into public.dictionaries (
           id, language_code, slug, name, kind, visibility, owner_user_id,
           is_editable
         ) values ($1, 'nl', $2, 'Exercise user dictionary', 'user', 'private', $3, true)`,
        [dictionaryId, `exercise-user-${userId}`, userId],
      );
      const { rows: entryRows } = await client.query(
        `insert into public.word_entries (
           dictionary_id, language_code, headword, raw
         ) values ($1, 'nl', 'drop', '{"meanings":[{"definition":"candy"}]}'::jsonb)
         returning id`,
        [dictionaryId],
      );
      const entryId = entryRows[0].id as string;
      const idiomOne = randomUUID();
      const idiomTwo = randomUUID();
      const unexplained = randomUUID();
      const explanationOne = randomUUID();
      const explanationTwo = randomUUID();
      const exampleOne = randomUUID();

      for (const [id, kind, parent] of [
        [idiomOne, "idiom", null],
        [idiomTwo, "idiom", null],
        [unexplained, "idiom", null],
        [explanationOne, "idiom-explanation", idiomOne],
        [explanationTwo, "idiom-explanation", idiomTwo],
        [exampleOne, "example", idiomOne],
      ] as const) {
        await client.query(
          `insert into private.platform_v2_content_nodes (
             id, entry_id, parent_content_node_id, kind, binding_state,
             first_source_revision, last_source_revision,
             source_text_fingerprint, diagnostic_locator
           ) values ($1, $2, $3, $4, 'active', 'test-revision', 'test-revision', $5, $6)`,
          [id, entryId, parent, kind, `${kind}-fingerprint-${id}`, `test.${kind}.${id}`],
        );
      }

      await client.query(
        `insert into public.user_card_status (
           user_id, entry_id, card_type_id, fsrs_enabled, in_learning,
           next_review_at
         ) values ($1, $2, 'word-to-definition', true, true, now())`,
        [userId, entryId],
      );

      const readCandidates = async (direction: "direct" | "reverse") => {
        await client.query("select set_config('request.jwt.claim.role', 'service_role', true)");
        await client.query("set local role service_role");
        const { rows } = await client.query(
          `select public.read_platform_v2_idiom_exercise_candidates_as_principal_v1(
             $1, $2, 20, 0
           ) result`,
          [userId, direction],
        );
        await client.query("reset role");
        return rows[0].result as {
          family: string;
          direction: string;
          items: Array<Record<string, unknown>>;
        };
      };

      const direct = await readCandidates("direct");
      expect(direct.family).toBe("idiom");
      expect(direct.direction).toBe("direct");
      expect(direct.items).toHaveLength(2);
      expect(direct.items.map((item) => item.expressionSourcePath)).toEqual(
        expect.arrayContaining([
          `test.idiom.${idiomOne}`,
          `test.idiom.${idiomTwo}`,
        ]),
      );
      expect(direct.items.every((item) => item.queueSource === "new")).toBe(true);
      const directOne = direct.items.find((item) => item.contentNodeId === idiomOne);
      expect(directOne).toMatchObject({
        explanationSourcePath: `test.idiom-explanation.${explanationOne}`,
        exampleSourcePaths: [`test.example.${exampleOne}`],
      });

      const reverse = await readCandidates("reverse");
      expect(reverse.items).toHaveLength(2);
      expect(reverse.items.map((item) => item.contentNodeId)).not.toEqual(
        expect.arrayContaining([unexplained]),
      );

      const reverseOne = reverse.items.find((item) => item.contentNodeId === idiomOne);
      if (!directOne || !reverseOne) {
        throw new Error("idiomOne candidates were not returned in both directions");
      }
      const directTarget = directOne;
      const reverseTarget = reverseOne;
      const action = async (
        target: Record<string, unknown>,
        result: "fail" | "hard" | "success" | "easy",
        clientEventId: string,
        stateRevision = "untracked",
      ) => {
        await client.query("select set_config('request.jwt.claim.role', 'service_role', true)");
        await client.query("set local role service_role");
        const { rows } = await client.query(
          `select public.perform_platform_v2_idiom_exercise_action_as_principal_v1(
             $1, $2::uuid, $3, $4, $5::uuid, null, null
           ) result`,
          [userId, target.targetId, stateRevision, result, clientEventId],
        );
        await client.query("reset role");
        return rows[0].result as Record<string, unknown>;
      };

      const directActionId = randomUUID();
      const directAccepted = await action(
        directTarget,
        "success",
        directActionId,
      );
      expect(directAccepted).toMatchObject({
        status: "accepted",
        actionId: "review-exercise",
        family: "idiom",
        direction: "direct",
        state: { fsrsReps: 1, fsrsLastGrade: 3, successCount: 1 },
      });

      const directDuplicate = await action(
        directTarget,
        "success",
        directActionId,
      );
      expect(directDuplicate).toMatchObject({
        status: "duplicate",
        state: { fsrsReps: 1 },
      });

      const reverseAccepted = await action(
        reverseTarget,
        "fail",
        randomUUID(),
      );
      expect(reverseAccepted).toMatchObject({
        status: "accepted",
        direction: "reverse",
        state: { fsrsReps: 1, fsrsLapses: 1, fsrsLastGrade: 1 },
      });

      const { rows: states } = await client.query(
        `select target_id, fsrs_reps, fsrs_lapses
           from public.user_training_exercise_state
          where user_id = $1
          order by target_id`,
        [userId],
      );
      expect(states).toHaveLength(2);
      expect(states.every((row) => row.fsrs_reps === 1)).toBe(true);
      expect(states.some((row) => row.fsrs_lapses === 1)).toBe(true);

      await client.query("reset role");
    });
  });
});
