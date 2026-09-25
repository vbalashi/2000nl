import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import {
  ensureUserWithSettings,
  getDbUrl,
  insertWord,
  runMigrations,
  withTransaction,
} from "./dbTestUtils";
import type { PlatformIdiomExerciseSessionV2 } from "../../../../packages/shared/types/platformV2";

const dbUrl = getDbUrl();
const describeIfDb = dbUrl ? describe : describe.skip;

async function createIdiomFixture(
  client: PoolClient,
  userId: string,
  options: { isNt2?: boolean } = {},
) {
  await ensureUserWithSettings(client, userId);
  const entryId = await insertWord(
    client,
    `exercise-hardening-${randomUUID()}`,
    { is_nt2_2000: options.isNt2 ?? true },
  );
  const idiomNodeId = randomUUID();
  const explanationNodeId = randomUUID();

  await client.query(
    `insert into private.platform_v2_content_nodes (
       id, entry_id, parent_content_node_id, kind, binding_state, first_source_revision,
       last_source_revision, source_text_fingerprint, diagnostic_locator
     ) values ($1, $2, null, 'idiom', 'active', 'test-revision', 'test-revision', $3, $4),
              ($5, $2, $1, 'idiom-explanation', 'active', 'test-revision',
               'test-revision', $6, $7)`,
    [
      idiomNodeId,
      entryId,
      `idiom-fingerprint-${idiomNodeId}`,
      `test.idiom.${idiomNodeId}`,
      explanationNodeId,
      `explanation-fingerprint-${explanationNodeId}`,
      `test.explanation.${explanationNodeId}`,
    ],
  );
  await client.query(
    `insert into public.user_card_status (
       user_id, entry_id, card_type_id, fsrs_enabled, in_learning,
       next_review_at
     ) values ($1, $2, 'word-to-definition', true, true, now())`,
    [userId, entryId],
  );

  await client.query("select set_config('request.jwt.claim.role', 'service_role', true)");
  await client.query("set local role service_role");
  const { rows } = await client.query(
    `select public.ensure_platform_v2_training_exercise_target_as_principal_v1(
       $1, $2, 'idiom', 'direct', $3, $4
     ) target_id`,
    [
      entryId,
      idiomNodeId,
      `source-revision-${idiomNodeId}`,
      `idiom-fingerprint-${idiomNodeId}`,
    ],
  );
  const targetId = rows[0].target_id as string;
  await client.query("reset role");

  return {
    entryId,
    idiomNodeId,
    targetId,
    targetKey: `training-exercise-v1:idiom:direct:${entryId}:${idiomNodeId}`,
  };
}

async function performIdiomAction(
  client: PoolClient,
  userId: string,
  targetId: string,
  clientEventId: string,
  options: {
    result?: "fail" | "hard" | "success" | "easy";
    stateRevision?: string;
    direction?: "direct" | "reverse";
    sessionId?: string | null;
    sourceContext?: Record<string, unknown> | null;
  } = {},
) {
  await client.query("select set_config('request.jwt.claim.role', 'service_role', true)");
  await client.query("set local role service_role");
  try {
    const { rows } = await client.query(
      `select public.perform_platform_v2_idiom_exercise_action_as_principal_v1(
         $1, $2::uuid, $3, $4, $5::uuid, $6, $7::uuid, $8::jsonb
       ) result`,
      [
        userId,
        targetId,
        options.stateRevision ?? "untracked",
        options.result ?? "success",
        clientEventId,
        options.direction ?? "direct",
        options.sessionId ?? null,
        options.sourceContext ?? null,
      ],
    );
    return rows[0].result as Record<string, unknown>;
  } finally {
    await client.query("reset role").catch(() => undefined);
  }
}

async function asAuthenticated<T>(client: PoolClient, fn: () => Promise<T>) {
  await client.query("select set_config('request.jwt.claim.role', 'authenticated', true)");
  await client.query("set local role authenticated");
  try {
    return await fn();
  } finally {
    await client.query("reset role").catch(() => undefined);
  }
}

async function asServiceRole<T>(client: PoolClient, fn: () => Promise<T>) {
  await client.query("select set_config('request.jwt.claim.role', 'service_role', true)");
  await client.query("set local role service_role");
  try {
    return await fn();
  } finally {
    await client.query("reset role").catch(() => undefined);
  }
}

async function startIdiomSession(
  client: PoolClient,
  userId: string,
  direction: "direct" | "reverse",
  sessionSize: number,
  requestId: string,
): Promise<PlatformIdiomExerciseSessionV2> {
  return asAuthenticated(client, async () => {
    const { rows } = await client.query(
      `select public.start_platform_v2_idiom_training_session(
         $1, $2, $3, $4::uuid
       ) result`,
      [userId, direction, String(sessionSize), requestId],
    );
    return rows[0].result as PlatformIdiomExerciseSessionV2;
  });
}

async function readIdiomCandidates(
  client: PoolClient,
  userId: string,
  direction: "direct" | "reverse",
) {
  return asServiceRole(client, async () => {
    const { rows } = await client.query(
      `select public.read_platform_v2_idiom_exercise_candidates_as_principal_v1(
         $1, $2, 20, 0
       ) result`,
      [userId, direction],
    );
    return rows[0].result as Record<string, unknown>;
  });
}

async function readIdiomSessionNext(
  client: PoolClient,
  userId: string,
  sessionId: string,
) {
  return asAuthenticated(client, async () => {
    const { rows } = await client.query(
      `select public.read_platform_v2_idiom_training_session_next(
         $1, $2::uuid
       ) result`,
      [userId, sessionId],
    );
    return rows[0].result as Record<string, unknown>;
  });
}

async function readIdiomSessionSnapshot(
  client: PoolClient,
  userId: string,
  sessionId: string,
) {
  return asAuthenticated(client, async () => {
    const { rows } = await client.query(
      `select public.read_platform_v2_idiom_training_session_snapshot(
         $1, $2::uuid
       ) result`,
      [userId, sessionId],
    );
    return rows[0].result as Record<string, unknown>;
  });
}

async function markIdiomSessionMemberUnavailable(
  client: PoolClient,
  userId: string,
  sessionId: string,
  targetId: string,
  reason: string,
) {
  return asAuthenticated(client, async () => {
    const { rows } = await client.query(
      `select public.mark_platform_v2_idiom_training_session_member_unavailable(
         $1, $2::uuid, $3::uuid, $4
       ) result`,
      [userId, sessionId, targetId, reason],
    );
    return rows[0].result as Record<string, unknown>;
  });
}

async function readExerciseTarget(
  client: PoolClient,
  userId: string,
  targetKey: string,
) {
  await client.query("select set_config('request.jwt.claim.role', 'service_role', true)");
  await client.query("set local role service_role");
  try {
    const { rows } = await client.query(
      `select public.read_platform_v2_training_exercise_target_v1($1, $2) result`,
      [userId, targetKey],
    );
    return rows[0].result as Record<string, unknown>;
  } finally {
    await client.query("reset role");
  }
}

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
      const sentenceTwo = randomUUID();

      for (const [contentNodeId, kind, fingerprint] of [
        [idiomA, "idiom", "idiom-a-fingerprint"],
        [idiomB, "idiom", "idiom-b-fingerprint"],
        [sentence, "example", "sentence-fingerprint"],
        [sentenceTwo, "example", "sentence-two-fingerprint"],
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
      const translationTwo = await register(
        sentenceTwo,
        "translation",
        "recall",
        "sentence-two-fingerprint",
      );

      const { rows: targets } = await client.query(
        `select target_key, family, direction, content_node_id
           from private.platform_v2_training_exercise_targets
          where id = any($1::uuid[])
          order by target_key`,
        [[
          idiomADirect,
          idiomAReverse,
          idiomBDirect,
          idiomBReverse,
          translation,
          translationTwo,
        ]],
      );
      expect(targets).toHaveLength(6);
      expect(new Set(targets.map((row) => row.target_key)).size).toBe(6);
      expect(targets.filter((row) => row.family === "idiom")).toHaveLength(4);
      const translationTargets = targets.filter((row) => row.family === "translation");
      expect(translationTargets).toHaveLength(2);
      expect(translationTargets.map((row) => row.content_node_id)).toEqual(
        expect.arrayContaining([sentence, sentenceTwo]),
      );

      await client.query(
        `insert into public.user_training_exercise_state (
           user_id, target_id, fsrs_stability, fsrs_difficulty, fsrs_reps,
           fsrs_enabled, next_review_at
         ) values ($1, $2, 2.5, 6, 1, true, now()),
                  ($1, $3, 3.5, 5, 2, true, now()),
                  ($1, $4, 4.5, 4, 3, true, now()),
                  ($1, $5, 5.5, 3, 4, true, now())`,
        [userId, idiomADirect, idiomBDirect, translation, translationTwo],
      );

      const { rows: translationStates } = await client.query(
        `select target_id, fsrs_reps
           from public.user_training_exercise_state
          where user_id = $1 and target_id = any($2::uuid[])
          order by target_id`,
        [userId, [translation, translationTwo]],
      );
      expect(translationStates).toHaveLength(2);
      expect(translationStates.map((row) => row.fsrs_reps)).toEqual(
        expect.arrayContaining([3, 4]),
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
             $1, $2::uuid, $3, $4, $5::uuid, $6, null, null
           ) result`,
          [userId, target.targetId, stateRevision, result, clientEventId, target.direction],
        );
        await client.query("reset role");
        return rows[0].result as Record<string, unknown>;
      };

      await client.query("savepoint direction_mismatch");
      await expect(
        performIdiomAction(
          client,
          userId,
          directTarget.targetId as string,
          randomUUID(),
          { direction: "reverse" },
        ),
      ).rejects.toThrow("training_exercise_target_direction_mismatch");
      await client.query("rollback to savepoint direction_mismatch");
      await client.query("release savepoint direction_mismatch");

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

      const otherUserId = randomUUID();
      await client.query(
        `insert into auth.users (id, email) values ($1, $2)`,
        [otherUserId, `${otherUserId}@test.local`],
      );
      await client.query(
        `update public.dictionaries
            set owner_user_id = $2
          where id = $1`,
        [dictionaryId, otherUserId],
      );

      const revokedCandidates = await readCandidates("direct");
      expect(revokedCandidates.items).toEqual([]);
      expect(
        await readExerciseTarget(
          client,
          userId,
          directTarget.targetKey as string,
        ),
      ).toEqual({ error: "training_exercise_target_not_found" });

      await client.query("savepoint revoked_action");
      await expect(
        performIdiomAction(
          client,
          userId,
          directTarget.targetId as string,
          randomUUID(),
        ),
      ).rejects.toThrow("training_exercise_source_not_eligible");
      await client.query("rollback to savepoint revoked_action");

      await client.query("reset role");
    });
  });

  test("treats volatile diagnostics as retry context and fails closed after retirement", async () => {
    await withTransaction(pool, async (client) => {
      const userId = randomUUID();
      const fixture = await createIdiomFixture(client, userId);
      const clientEventId = randomUUID();
      const sourceContext = {
        contractVersion: "source-context-v2",
        source: "dictionary",
        artifact: "fixture",
        location: { path: "entry.meanings[0]" },
        selection: { meaningIndex: 0 },
        context: { locale: "nl" },
        observation: { latencyMs: 12, tabId: "tab-a" },
        diagnostics: { requestId: "request-a" },
      };

      const accepted = await performIdiomAction(
        client,
        userId,
        fixture.targetId,
        clientEventId,
        { sourceContext },
      );
      expect(accepted).toMatchObject({
        status: "accepted",
        state: { fsrsReps: 1, fsrsLastGrade: 3 },
      });

      const duplicate = await performIdiomAction(
        client,
        userId,
        fixture.targetId,
        clientEventId,
        {
          stateRevision: "stale-after-reload",
          sourceContext: {
            ...sourceContext,
            observation: { latencyMs: 900, tabId: "tab-b" },
            diagnostics: { requestId: "request-b", retry: true },
          },
        },
      );
      expect(duplicate).toMatchObject({
        status: "duplicate",
        state: { fsrsReps: 1 },
      });

      await client.query("savepoint changed_retry");
      await expect(
        performIdiomAction(
          client,
          userId,
          fixture.targetId,
          clientEventId,
          { result: "fail", sourceContext },
        ),
      ).rejects.toThrow("training_exercise_action_idempotency_conflict");
      await client.query("rollback to savepoint changed_retry");

      await client.query(
        `update private.platform_v2_content_nodes
            set binding_state = 'retired'
          where id = $1`,
        [fixture.idiomNodeId],
      );
      expect(
        await readExerciseTarget(client, userId, fixture.targetKey),
      ).toEqual({ error: "training_exercise_target_not_found" });

      const duplicateAfterRetirement = await performIdiomAction(
        client,
        userId,
        fixture.targetId,
        clientEventId,
        { stateRevision: "another-stale-revision", sourceContext },
      );
      expect(duplicateAfterRetirement).toMatchObject({
        status: "duplicate",
        state: { fsrsReps: 1 },
      });

      const { rows } = await client.query(
        `select
           (select count(*)::integer from user_training_exercise_action_events
             where user_id = $1) as events,
           (select count(*)::integer from platform_v2_training_exercise_action_receipts
             where user_id = $1) as receipts,
           (select fsrs_reps from user_training_exercise_state
             where user_id = $1 and target_id = $2) as reps`,
        [userId, fixture.targetId],
      );
      expect(rows[0]).toEqual({ events: 1, receipts: 1, reps: 1 });
    });
  });

  test("serializes concurrent retries into one committed exercise action", async () => {
    const userId = randomUUID();
    const setup = await pool.connect();
    let fixture: Awaited<ReturnType<typeof createIdiomFixture>>;
    try {
      await setup.query("begin");
      fixture = await createIdiomFixture(setup, userId, { isNt2: false });
      await setup.query("commit");
    } catch (error) {
      await setup.query("rollback");
      throw error;
    } finally {
      setup.release();
    }

    const clientEventId = randomUUID();
    const attempt = async () => {
      const client = await pool.connect();
      try {
        await client.query("begin");
        const result = await performIdiomAction(
          client,
          userId,
          fixture.targetId,
          clientEventId,
        );
        await client.query("commit");
        return result;
      } catch (error) {
        await client.query("rollback");
        throw error;
      } finally {
        client.release();
      }
    };

    try {
      const outcomes = await Promise.allSettled([attempt(), attempt()]);
      const fulfilled = outcomes.filter(
        (outcome): outcome is PromiseFulfilledResult<Record<string, unknown>> =>
          outcome.status === "fulfilled",
      );
      expect(fulfilled).toHaveLength(2);
      expect(fulfilled.map((outcome) => outcome.value.status).sort()).toEqual([
        "accepted",
        "duplicate",
      ]);

      const { rows } = await pool.query(
        `select
           (select count(*)::integer from user_training_exercise_action_events
             where user_id = $1 and client_event_id = $2) as events,
           (select count(*)::integer from platform_v2_training_exercise_action_receipts
             where user_id = $1 and client_event_id = $2) as receipts,
           (select fsrs_reps from user_training_exercise_state
             where user_id = $1 and target_id = $3) as reps`,
        [userId, clientEventId, fixture.targetId],
      );
      expect(rows[0]).toEqual({ events: 1, receipts: 1, reps: 1 });
    } finally {
      await pool.query(`delete from auth.users where id = $1`, [userId]);
    }
  });

  test("requires the active run and consumes an exercise member once", async () => {
    await withTransaction(pool, async (client) => {
      const userId = randomUUID();
      const fixture = await createIdiomFixture(client, userId);
      const secondFixture = await createIdiomFixture(client, userId);
      const firstSessionId = randomUUID();
      const secondSessionId = randomUUID();

      await client.query(
        `insert into public.training_sessions (
           id, user_id, exercise_family, session_size, card_type_ids, list_type,
           card_filter, training_filter, requested_total
         ) values ($1, $2, 'idiom', '2', ARRAY['idiom:direct']::text[], 'curated',
                   'both', '{}'::jsonb, 2)`,
        [firstSessionId, userId],
      );
      await client.query(
        `insert into public.training_session_exercise_members (
         session_id, target_id, ordinal, queue_source
         ) values ($1, $2, 1, 'new')`,
        [firstSessionId, fixture.targetId],
      );
      await client.query(
        `insert into public.training_session_exercise_members (
           session_id, target_id, ordinal, queue_source
         ) values ($1, $2, 2, 'new')`,
        [firstSessionId, secondFixture.targetId],
      );

      const eventId = randomUUID();
      const accepted = await performIdiomAction(
        client,
        userId,
        fixture.targetId,
        eventId,
        { sessionId: firstSessionId },
      );
      expect(accepted).toMatchObject({ status: "accepted" });

      const { rows: consumedRows } = await client.query(
        `select consumed_at, unavailable_at
           from training_session_exercise_members
          where session_id = $1 and target_id = $2`,
        [firstSessionId, fixture.targetId],
      );
      expect(consumedRows).toEqual([
        expect.objectContaining({ consumed_at: expect.any(Date), unavailable_at: null }),
      ]);

      const duplicate = await performIdiomAction(
        client,
        userId,
        fixture.targetId,
        eventId,
        { sessionId: firstSessionId, stateRevision: "stale" },
      );
      expect(duplicate).toMatchObject({ status: "duplicate" });

      const secondAccepted = await performIdiomAction(
        client,
        userId,
        secondFixture.targetId,
        randomUUID(),
        { sessionId: firstSessionId },
      );
      expect(secondAccepted).toMatchObject({ status: "accepted" });

      const { rows: completedRows } = await client.query(
        `select completed_at, exhausted_at, completion_reason
           from training_sessions
          where id = $1`,
        [firstSessionId],
      );
      expect(completedRows).toEqual([
        expect.objectContaining({
          completed_at: expect.any(Date),
          exhausted_at: null,
          completion_reason: "completed",
        }),
      ]);

      await client.query(
        `insert into public.training_sessions (
           id, user_id, exercise_family, session_size, card_type_ids, list_type,
           card_filter, training_filter, requested_total
         ) values ($1, $2, 'idiom', '2', ARRAY['idiom:direct']::text[], 'curated',
                   'both', '{}'::jsonb, 2)`,
        [secondSessionId, userId],
      );

      await client.query("savepoint stale_exercise_action");
      await expect(
        performIdiomAction(
          client,
          userId,
          fixture.targetId,
          randomUUID(),
          { sessionId: firstSessionId },
        ),
      ).rejects.toThrow("training_session_superseded");
      await client.query("rollback to savepoint stale_exercise_action");

      const { rows: rejectedRows } = await client.query(
        `select
           (select count(*)::integer from user_training_exercise_action_events
             where user_id = $1) as events,
           (select count(*)::integer from user_training_exercise_state
             where user_id = $1 and fsrs_reps = 1) as states,
           (select count(*)::integer from training_session_exercise_members
             where session_id = $2 and consumed_at is not null) as consumed`,
        [userId, firstSessionId],
      );
      expect(rejectedRows[0]).toEqual({ events: 2, states: 2, consumed: 2 });
    });
  });

  test("starts an ordered idiom session, retries it idempotently, and supersedes it", async () => {
    const userId = randomUUID();
    await withTransaction(
      pool,
      async (client) => {
        await createIdiomFixture(client, userId);
        await createIdiomFixture(client, userId);
        const requestId = randomUUID();

        const candidateResult = await readIdiomCandidates(client, userId, "direct");
        const candidateItems = candidateResult.items as Array<{ targetId: string }>;
        expect(candidateItems).toHaveLength(2);

        const started = await startIdiomSession(
          client,
          userId,
          "direct",
          2,
          requestId,
        );
        expect(started).toMatchObject({
          contractVersion: "platform-idiom-exercise-session-v2",
          exerciseFamily: "idiom",
          direction: "direct",
          requestedTotal: 2,
          plannedTotal: 2,
          runStatus: "active",
        });
        expect(started.members).toHaveLength(2);
        expect(started.members.map((member) => member.targetId)).toEqual(
          candidateItems.map((candidate) => candidate.targetId),
        );

        const [firstMember, secondMember] = started.members;

        const replay = await startIdiomSession(
          client,
          userId,
          "direct",
          2,
          requestId,
        );
        expect(replay.sessionId).toBe(started.sessionId);
        expect(replay.members).toEqual(started.members);

        const firstNext = await readIdiomSessionNext(
          client,
          userId,
          started.sessionId as string,
        );
        expect(firstNext).toMatchObject({
          status: "ready",
          targetId: firstMember.targetId,
          direction: "direct",
          ordinal: 1,
        });
        await performIdiomAction(
          client,
          userId,
          firstMember.targetId,
          randomUUID(),
          { sessionId: started.sessionId as string },
        );

        const secondNext = await readIdiomSessionNext(
          client,
          userId,
          started.sessionId as string,
        );
        expect(secondNext).toMatchObject({
          status: "ready",
          targetId: secondMember.targetId,
          ordinal: 2,
        });
        await performIdiomAction(
          client,
          userId,
          secondMember.targetId,
          randomUUID(),
          { sessionId: started.sessionId as string },
        );

        expect(
          await readIdiomSessionNext(
            client,
            userId,
            started.sessionId as string,
          ),
        ).toMatchObject({ status: "completed", completedActions: 2 });
        expect(
          await readIdiomSessionSnapshot(
            client,
            userId,
            started.sessionId as string,
          ),
        ).toMatchObject({ completedActions: 2, completionReason: "completed" });

        const replacement = await startIdiomSession(
          client,
          userId,
          "reverse",
          1,
          randomUUID(),
        );
        expect(replacement).toMatchObject({
          direction: "reverse",
          runStatus: "active",
        });
        expect(
          await readIdiomSessionNext(
            client,
            userId,
            started.sessionId as string,
          ),
        ).toMatchObject({ status: "superseded" });
      },
      userId,
    );
  });

  test("returns an explicit unavailable diagnostic before skipping a missing projection", async () => {
    const userId = randomUUID();
    await withTransaction(
      pool,
      async (client) => {
        await createIdiomFixture(client, userId);
        await createIdiomFixture(client, userId);
        const started = await startIdiomSession(
          client,
          userId,
          "direct",
          2,
          randomUUID(),
        );
        const firstMember = started.members[0] as Record<string, unknown>;
        const secondMember = started.members[1] as Record<string, unknown>;
        const { rows: targetRows } = await client.query(
          `select content_node_id
             from private.platform_v2_training_exercise_targets
            where id = $1::uuid`,
          [firstMember.targetId],
        );

        await client.query(
          `update private.platform_v2_content_nodes
              set binding_state = 'retired'
            where id = $1`,
          [targetRows[0].content_node_id],
        );

        const unavailable = await readIdiomSessionNext(
          client,
          userId,
          started.sessionId as string,
        );
        expect(unavailable).toMatchObject({
          status: "unavailable",
          targetId: firstMember.targetId,
          reason: "projection-missing",
          remaining: 2,
        });

        expect(
          await markIdiomSessionMemberUnavailable(
            client,
            userId,
            started.sessionId as string,
            firstMember.targetId as string,
            "projection-missing",
          ),
        ).toMatchObject({ status: "unavailable", remaining: 1 });

        expect(
          await readIdiomSessionNext(
            client,
            userId,
            started.sessionId as string,
          ),
        ).toMatchObject({
          status: "ready",
          targetId: secondMember.targetId,
          ordinal: 2,
        });
      },
      userId,
    );
  });
  async function statsSession(client: PoolClient, userId: string, direction = "direct", filter = {}) {
    const sessionId = randomUUID();
    await client.query(`insert into training_sessions
      (id,user_id,exercise_family,session_size,card_type_ids,list_type,card_filter,training_filter,requested_total)
      values ($1,$2,'idiom','5',array[$3],'curated','both',$4,5)`,
      [sessionId,userId,`idiom:${direction}`,filter]);
    return sessionId;
  }
  async function readStats(client: PoolClient, sessionId: string) {
    return asAuthenticated(client, async () => (await client.query(
      'select public.read_training_idiom_stats_v1($1) result', [sessionId],
    )).rows[0].result);
  }

  test("idiom statistics read the full saved scope without materializing reverse targets", async () => {
    const userId = randomUUID();
    await withTransaction(pool, async client => {
      const a = await createIdiomFixture(client, userId);
      const b = await createIdiomFixture(client, userId);
      await client.query("update word_entries set part_of_speech = 'bn' where id = $1", [a.entryId]);
      await client.query("update word_entries set part_of_speech = 'ww' where id = $1", [b.entryId]);
      const all = await statsSession(client,userId,"reverse");
      const adjective = await statsSession(client,userId,"reverse",{partOfSpeech:["bn"]});
      const before = (await client.query(`select
        (select count(*) from private.platform_v2_training_exercise_targets) targets,
        (select count(*) from user_training_exercise_state) states,
        (select count(*) from user_training_exercise_action_events) events`)).rows;
      expect(await readStats(client,all)).toEqual({
        contractVersion:"training-idiom-stats-v1", newCardsToday:0,
        reviewCardsDone:0,reviewCardsDue:0,totalCardsStarted:0,totalCardsInScope:2,
      });
      expect(await readStats(client,adjective)).toMatchObject({totalCardsInScope:1});
      const after = (await client.query(`select
        (select count(*) from private.platform_v2_training_exercise_targets) targets,
        (select count(*) from user_training_exercise_state) states,
        (select count(*) from user_training_exercise_action_events) events`)).rows;
      expect(after).toEqual(before);
    }, userId);
  });

  test("idiom statistics count accepted first reviews and repeats once, in the user's study day", async () => {
    const userId = randomUUID();
    await withTransaction(pool, async client => {
      const a = await createIdiomFixture(client,userId);
      const b = await createIdiomFixture(client,userId);
      await createIdiomFixture(client,userId);
      const direct = await statsSession(client,userId);
      const reverse = await statsSession(client,userId,"reverse");
      await client.query("select set_config('training.test_reference_now','2026-09-24T12:00:00Z',true)");
      const old = await performIdiomAction(client,userId,a.targetId,randomUUID());
      await client.query("select set_config('training.test_reference_now','2026-09-25T12:00:00Z',true)");
      const eventId = randomUUID();
      await performIdiomAction(client,userId,a.targetId,eventId,{stateRevision:(old.state as {stateRevision:string}).stateRevision});
      await performIdiomAction(client,userId,a.targetId,eventId,{stateRevision:(old.state as {stateRevision:string}).stateRevision});
      await performIdiomAction(client,userId,b.targetId,randomUUID());
      // Both due before study day end; today's new introduction is not a review due.
      await client.query("update user_training_exercise_state set next_review_at='2026-09-25T20:00:00Z' where user_id=$1",[userId]);
      expect(await readStats(client,direct)).toMatchObject({
        newCardsToday:1,reviewCardsDone:1,reviewCardsDue:1,totalCardsStarted:2,totalCardsInScope:3,
      });
      expect(await readStats(client,reverse)).toMatchObject({newCardsToday:0,reviewCardsDone:0,totalCardsStarted:0,totalCardsInScope:3});
    },userId);
  });

  test("idiom statistics deny other users and anonymous calls", async () => {
    const owner = randomUUID();
    await withTransaction(pool,async client => {
      await createIdiomFixture(client,owner);
      const sessionId = await statsSession(client,owner);
      await client.query("select set_config('request.jwt.claim.sub',$1,true)",[randomUUID()]);
      await expect(readStats(client,sessionId)).rejects.toThrow('training_session_not_found');
    },owner);
    const {rows} = await pool.query(`select
      has_function_privilege('anon','public.read_training_idiom_stats_v1(uuid)','execute') anon,
      has_function_privilege('authenticated','private.training_idiom_source_nodes_v1(uuid,text,uuid,text,jsonb)','execute') internal`);
    expect(rows[0]).toEqual({anon:false,internal:false});
  });

  test("idiom statistics roll over at local 04:00 across the DST change", async () => {
    const userId = randomUUID();
    await withTransaction(pool,async client => {
      const fixture = await createIdiomFixture(client,userId);
      await client.query("update user_settings set training_schedule_timezone='Europe/Amsterdam' where user_id=$1",[userId]);
      const sessionId = await statsSession(client,userId);
      // After the autumn DST change, 02:59 UTC is 03:59 local: previous study day.
      await client.query("select set_config('training.test_reference_now','2026-10-25T02:59:00Z',true)");
      await performIdiomAction(client,userId,fixture.targetId,randomUUID());
      expect(await readStats(client,sessionId)).toMatchObject({newCardsToday:1,totalCardsStarted:1});
      await client.query("select set_config('training.test_reference_now','2026-10-25T03:00:00Z',true)");
      expect(await readStats(client,sessionId)).toMatchObject({newCardsToday:0,reviewCardsDone:0,totalCardsStarted:1});
    },userId);
  });

  async function pairAction(client: PoolClient,userId: string,action: "exclude-pair"|"restore-pair",eventId: string,
    target: {entryId?:string;cardTypeId?:string;targetId?:string},markId: string|null=null,sessionId: string|null=null) {
    return asServiceRole(client,async () => (await client.query(
      `select public.perform_training_pair_exclusion_as_principal_v1($1,$2,$3,$4,$5,$6,$7,$8) result`,
      [userId,action,eventId,target.entryId??null,target.cardTypeId??null,target.targetId??null,markId,sessionId],
    )).rows[0].result);
  }
  async function pairExcluded(client:PoolClient,userId:string,entryId:string,cardTypeId:string,
    nodeId:string|null=null,fingerprint:string|null=null) {
    return (await client.query(`select private.training_pair_excluded_v1($1,$2,$3,$4,$5,$6) excluded`,
      [userId,nodeId?'idiom':'meaning',entryId,nodeId,fingerprint,cardTypeId])).rows[0].excluded;
  }

  test("ordinary pair exclusion preserves FSRS and Known, and reverse-side undo restores the pair", async () => {
    const userId=randomUUID();
    await withTransaction(pool,async client=>{
      const fixture=await createIdiomFixture(client,userId);
      const before=(await client.query('select to_jsonb(s) state from user_card_status s where user_id=$1',[userId])).rows;
      const target={entryId:fixture.entryId,cardTypeId:'word-to-definition'};
      const eventId=randomUUID();
      const mark=await pairAction(client,userId,'exclude-pair',eventId,target);
      expect(mark).toMatchObject({status:'accepted',excluded:true,family:'meaning',consumption:null});
      expect(await pairExcluded(client,userId,fixture.entryId,'word-to-definition')).toBe(true);
      expect(await pairExcluded(client,userId,fixture.entryId,'definition-to-word')).toBe(true);
      expect(await pairExcluded(client,userId,fixture.entryId,'listen-type')).toBe(false);
      expect((await client.query('select to_jsonb(s) state from user_card_status s where user_id=$1',[userId])).rows).toEqual(before);
      expect((await client.query('select count(*)::int count from user_card_known_marks where user_id=$1',[userId])).rows[0].count).toBe(0);
      const restored=await pairAction(client,userId,'restore-pair',randomUUID(),
        {entryId:fixture.entryId,cardTypeId:'definition-to-word'},mark.exclusionId);
      expect(restored.excluded).toBe(false);
      expect(await pairExcluded(client,userId,fixture.entryId,'word-to-definition')).toBe(false);
      // A delayed retry returns its immutable receipt; it does not re-exclude.
      expect((await pairAction(client,userId,'exclude-pair',eventId,target)).status).toBe('duplicate');
      expect(await pairExcluded(client,userId,fixture.entryId,'word-to-definition')).toBe(false);
      expect((await client.query('select count(*)::int count from private.training_pair_exclusion_events where user_id=$1',[userId])).rows[0].count).toBe(2);
    },userId);
  });

  test("idiom exclusion consumes one current-session action without creating a grade or scheduling state", async()=>{
    const userId=randomUUID();
    await withTransaction(pool,async client=>{
      const fixture=await createIdiomFixture(client,userId);
      const session=await startIdiomSession(client,userId,'direct',1,randomUUID());
      const eventId=randomUUID();
      const mark=await pairAction(client,userId,'exclude-pair',eventId,{targetId:fixture.targetId},null,session.sessionId);
      expect(mark.consumption).toMatchObject({status:'consumed-complete',completedActions:1});
      expect(await pairExcluded(client,userId,fixture.entryId,'',fixture.idiomNodeId,`idiom-fingerprint-${fixture.idiomNodeId}`)).toBe(true);
      expect(await pairExcluded(client,userId,fixture.entryId,'',randomUUID(),'other-fingerprint')).toBe(false);
      expect(await pairExcluded(client,userId,fixture.entryId,'word-to-definition')).toBe(false);
      const duplicate=await pairAction(client,userId,'exclude-pair',eventId,{targetId:fixture.targetId},null,session.sessionId);
      expect(duplicate.status).toBe('duplicate');
      const {rows}=await client.query(`select
        (select count(*)::int from user_training_exercise_state where user_id=$1) states,
        (select count(*)::int from user_training_exercise_action_events where user_id=$1) reviews,
        (select count(*)::int from training_session_exercise_members where session_id=$2 and consumed_at is not null) consumed`,[userId,session.sessionId]);
      expect(rows[0]).toEqual({states:0,reviews:0,consumed:1});
      await pairAction(client,userId,'restore-pair',randomUUID(),{targetId:fixture.targetId},mark.exclusionId);
      expect(await pairExcluded(client,userId,fixture.entryId,'',fixture.idiomNodeId,`idiom-fingerprint-${fixture.idiomNodeId}`)).toBe(false);
    },userId);
  });

  test("pair exclusion removes both idiom directions from legacy and scoped selection without removing siblings", async () => {
    const userId = randomUUID();
    await withTransaction(pool, async client => {
      const excluded = await createIdiomFixture(client, userId);
      const sibling = await createIdiomFixture(client, userId);
      const target = { targetId: excluded.targetId };
      const mark = await pairAction(client, userId, 'exclude-pair', randomUUID(), target);
      for (const direction of ['direct', 'reverse']) {
        for (const version of [1, 2]) {
          const args = version === 1 ? "$1,$2,20,0" : "$1,$2,20,0,null,'curated','both','{}'::jsonb";
          const { rows } = await client.query(`select candidate->>'entryId' entry_id from
            private.platform_v2_idiom_exercise_candidates_v${version}(${args}) candidate`, [userId,direction]);
          expect(rows.map(row => row.entry_id)).toEqual([sibling.entryId]);
        }
      }
      await pairAction(client, userId, 'restore-pair', randomUUID(), target, mark.exclusionId);
      const restored = await client.query(`select count(*)::int count from
        private.platform_v2_idiom_exercise_candidates_v2($1,'direct',20,0,null,'curated','both','{}')`,[userId]);
      expect(restored.rows[0].count).toBe(2);
    }, userId);
  });

  test("a latched idiom becomes explicitly unavailable after library exclusion, without a review", async () => {
    const userId = randomUUID();
    await withTransaction(pool, async client => {
      const fixture = await createIdiomFixture(client, userId);
      const session = await startIdiomSession(client,userId,'direct',1,randomUUID());
      await pairAction(client,userId,'exclude-pair',randomUUID(),{targetId:fixture.targetId});
      expect(await readIdiomSessionNext(client,userId,session.sessionId)).toMatchObject({
        status:'unavailable',reason:'pair-excluded',targetId:fixture.targetId,
      });
      const result = await asAuthenticated(client,async () => (await client.query(
        "select public.mark_platform_v2_idiom_training_session_member_unavailable($1,$2,$3,'pair-excluded') result",
        [userId,session.sessionId,fixture.targetId])).rows[0].result);
      expect(result.status).toBe('unavailable-exhausted');
      expect((await client.query('select count(*)::int count from user_training_exercise_action_events where user_id=$1',[userId])).rows[0].count).toBe(0);
    },userId);
  });

  test("excluded idioms leave due counts but retain historical and total statistics", async () => {
    const userId = randomUUID();
    await withTransaction(pool,async client => {
      const fixture = await createIdiomFixture(client,userId);
      await performIdiomAction(client,userId,fixture.targetId,randomUUID());
      await client.query("update user_training_exercise_action_events set created_at=now()-interval '2 days' where user_id=$1",[userId]);
      await client.query("update user_training_exercise_state set next_review_at=now()-interval '1 minute' where user_id=$1",[userId]);
      const session = await statsSession(client,userId);
      const before = await readStats(client,session);
      expect(before.reviewCardsDue).toBe(1);
      const mark = await pairAction(client,userId,'exclude-pair',randomUUID(),{targetId:fixture.targetId});
      expect(await readStats(client,session)).toEqual({...before,reviewCardsDue:0});
      await pairAction(client,userId,'restore-pair',randomUUID(),{targetId:fixture.targetId},mark.exclusionId);
      expect(await readStats(client,session)).toEqual(before);
    },userId);
  });

  test("ordinary due statistics exclude the recall pair and preserve unrelated listening state", async () => {
    const userId=randomUUID();
    await withTransaction(pool,async client => {
      const fixture=await createIdiomFixture(client,userId);
      await client.query(`insert into user_card_status(user_id,entry_id,card_type_id,fsrs_enabled,next_review_at)
        values ($1,$2,'definition-to-word',true,now()),($1,$2,'listen-type',true,now())`,[userId,fixture.entryId]);
      const stats=async () => (await client.query(`select private.training_local_daily_stats_v1(
        $1,ARRAY['word-to-definition','definition-to-word','listen-type'],null,'curated','Europe/Amsterdam') result`,[userId])).rows[0].result;
      const before=await stats();
      expect(before.reviewCardsDue).toBe(3);
      const target={entryId:fixture.entryId,cardTypeId:'definition-to-word'};
      const mark=await pairAction(client,userId,'exclude-pair',randomUUID(),target);
      expect(await stats()).toEqual({...before,reviewCardsDue:1});
      await pairAction(client,userId,'restore-pair',randomUUID(),target,mark.exclusionId);
      expect(await stats()).toEqual(before);
    },userId);
  });

  test("an in-flight exclusion serializes a concurrent legacy review before it can change FSRS", async () => {
    const userId=randomUUID();
    const setup=await pool.connect();
    const excluding=await pool.connect();
    const reviewing=await pool.connect();
    let entryId:string|undefined;
    try {
      await setup.query('begin');
      await ensureUserWithSettings(setup,userId);
      entryId=await insertWord(setup,`pair-race-${randomUUID()}`);
      await setup.query('commit');
      await excluding.query('begin');
      await pairAction(excluding,userId,'exclude-pair',randomUUID(),{entryId,cardTypeId:'word-to-definition'});
      await reviewing.query('begin');
      await reviewing.query("select set_config('request.jwt.claim.sub',$1,true)",[userId]);
      await reviewing.query("set local statement_timeout='2s'");
      let settled=false;
      const pending=reviewing.query("select public.handle_card_review($1,$2,'definition-to-word','success',$3)",[userId,entryId,randomUUID()])
        .then(() => {settled=true;return 'accepted';},(error:Error) => {settled=true;return error.message;});
      await new Promise(resolve=>setTimeout(resolve,50));
      expect(settled).toBe(false);
      await excluding.query('commit');
      expect(await pending).toContain('training_pair_excluded');
      await reviewing.query('rollback');
      expect((await setup.query('select count(*)::int count from user_card_status where user_id=$1',[userId])).rows[0].count).toBe(0);
    } finally {
      await excluding.query('rollback');
      await reviewing.query('rollback');
      await setup.query('rollback');
      excluding.release();reviewing.release();setup.release();
      await pool.query('delete from auth.users where id=$1',[userId]);
      if(entryId) await pool.query('delete from word_entries where id=$1',[entryId]);
    }
  });

  test("ordinary exclusion filters both directions and legacy grades cannot bypass it", async () => {
    const userId = randomUUID();
    await withTransaction(pool,async client => {
      const fixture=await createIdiomFixture(client,userId);
      const candidates=async () => (await client.query(`select entry_id from private.training_scheduler_candidates_v2(
        $1,ARRAY['word-to-definition','definition-to-word'],null,'curated','both','auto',
        ARRAY[]::uuid[],ARRAY[]::text[],'{}',false,false)`,[userId])).rows;
      expect(await candidates()).not.toHaveLength(0);
      await pairAction(client,userId,'exclude-pair',randomUUID(),{entryId:fixture.entryId,cardTypeId:'definition-to-word'});
      expect(await candidates()).toHaveLength(0);
      await expect(asAuthenticated(client,() => client.query(
        "select public.handle_card_review($1,$2,'word-to-definition','success',$3)",[userId,fixture.entryId,randomUUID()]))).rejects.toThrow('training_pair_excluded');
    },userId);
  });

  test("excluded idioms reject new grades but preserve accepted grade retries", async () => {
    const userId = randomUUID();
    await withTransaction(pool, async client => {
      const fixture = await createIdiomFixture(client, userId);
      const event = randomUUID();
      const accepted = await performIdiomAction(client, userId, fixture.targetId, event);
      await pairAction(client, userId, 'exclude-pair', randomUUID(), { targetId: fixture.targetId });
      expect((await performIdiomAction(client,userId,fixture.targetId,event)).status).toBe('duplicate');
      await client.query('savepoint reject_grade');
      await expect(performIdiomAction(client,userId,fixture.targetId,randomUUID(), {
        stateRevision: (accepted.state as {stateRevision:string}).stateRevision,
      })).rejects.toThrow('training_pair_excluded');
      await client.query('rollback to savepoint reject_grade');
      expect((await client.query('select count(*)::int count from user_training_exercise_action_events where user_id=$1',[userId])).rows[0].count).toBe(1);
    }, userId);
  });

  test("exclude and undo preserve an already reviewed idiom's complete scheduling state and history", async () => {
    const userId = randomUUID();
    await withTransaction(pool, async client => {
      const fixture = await createIdiomFixture(client, userId);
      await performIdiomAction(client, userId, fixture.targetId, randomUUID());
      const snapshot = async () => (await client.query(`select
        (select jsonb_agg(to_jsonb(s)) from user_training_exercise_state s where user_id=$1) states,
        (select jsonb_agg(to_jsonb(e)) from user_training_exercise_action_events e where user_id=$1) events`, [userId])).rows;
      const before = await snapshot();
      const target = { targetId: fixture.targetId };
      const mark = await pairAction(client, userId, 'exclude-pair', randomUUID(), target);
      expect(await snapshot()).toEqual(before);
      await pairAction(client, userId, 'restore-pair', randomUUID(), target, mark.exclusionId);
      expect(await snapshot()).toEqual(before);
    }, userId);
  });

  test("out-of-order exclusion rolls back without a mark, event or consumed session budget", async () => {
    const userId = randomUUID();
    await withTransaction(pool, async client => {
      const first = await createIdiomFixture(client, userId);
      const second = await createIdiomFixture(client, userId);
      const session = await startIdiomSession(client, userId, 'direct', 2, randomUUID());
      const head = (await client.query(`select target_id from training_session_exercise_members
        where session_id=$1 and consumed_at is null order by ordinal limit 1`, [session.sessionId])).rows[0].target_id;
      const other = head === first.targetId ? second.targetId : first.targetId;
      await client.query('savepoint reject_exclusion');
      await expect(pairAction(client, userId, 'exclude-pair', randomUUID(), { targetId: other }, null, session.sessionId)).rejects.toThrow();
      await client.query('rollback to savepoint reject_exclusion');
      const result = (await client.query(`select
        (select count(*)::int from private.training_pair_exclusions where user_id=$1) marks,
        (select count(*)::int from private.training_pair_exclusion_events where user_id=$1) events,
        (select count(*)::int from training_session_exercise_members where session_id=$2 and consumed_at is not null) consumed`, [userId,session.sessionId])).rows[0];
      expect(result).toEqual({ marks: 0, events: 0, consumed: 0 });
    }, userId);
  });

  test("exclusion rejects stale undo, conflicting retries and a superseded training run",async()=>{
    for(const condition of ['stale','conflict','superseded'] as const){
      const userId=randomUUID();
      await withTransaction(pool,async client=>{
        const fixture=await createIdiomFixture(client,userId);
        const target={targetId:fixture.targetId};
        if(condition==='superseded'){
          const first=await startIdiomSession(client,userId,'direct',1,randomUUID());
          await startIdiomSession(client,userId,'direct',1,randomUUID());
          await expect(pairAction(client,userId,'exclude-pair',randomUUID(),target,null,first.sessionId)).rejects.toThrow('training_session_superseded');
          return;
        }
        const eventId=randomUUID();
        const mark=await pairAction(client,userId,'exclude-pair',eventId,target);
        await pairAction(client,userId,'restore-pair',randomUUID(),target,mark.exclusionId);
        if(condition==='stale'){
          await pairAction(client,userId,'exclude-pair',randomUUID(),target);
          await expect(pairAction(client,userId,'restore-pair',randomUUID(),target,mark.exclusionId)).rejects.toThrow('stale_exclusion_mark');
        } else {
          await expect(pairAction(client,userId,'restore-pair',eventId,target,mark.exclusionId)).rejects.toThrow('exclusion_idempotency_conflict');
        }
      },userId);
    }
  });

});
