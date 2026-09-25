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

const dbUrl = getDbUrl();
const describeIfDb = dbUrl ? describe : describe.skip;

async function asRole<T>(
  client: PoolClient,
  role: "authenticated" | "service_role",
  userId: string,
  fn: () => Promise<T>,
) {
  await client.query("select set_config('request.jwt.claim.role', $1, true)", [role]);
  await client.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
  await client.query(`set local role ${role}`);
  try {
    return await fn();
  } finally {
    await client.query("reset role").catch(() => undefined);
  }
}

describeIfDb("translation exercise database contract", () => {
  const pool = new Pool({ connectionString: dbUrl });

  beforeAll(async () => {
    await runMigrations(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  test("scoped sessions filter before limiting, preserve retry identity and never broaden empty selections", async () => {
    await withTransaction(pool, async (client) => {
      const userId = randomUUID();
      await ensureUserWithSettings(client, userId);
      const noun = await insertWord(client, `sentence-noun-${randomUUID()}`);
      const adjective = await insertWord(client, `sentence-adjective-${randomUUID()}`);
      await client.query("update word_entries set part_of_speech='bn' where id=$1", [adjective]);
      for (const entryId of [noun, adjective]) {
        await client.query(`insert into private.platform_v2_content_nodes (
          id,entry_id,kind,binding_state,first_source_revision,last_source_revision,source_text_fingerprint,diagnostic_locator
        ) values ($1,$2,'example','active','v1','v1',$3,'raw.meanings[0].examples[0]')`,
        [randomUUID(), entryId, `example-${entryId}`]);
        await client.query(`insert into private.platform_v2_content_nodes (
          id,entry_id,kind,binding_state,first_source_revision,last_source_revision,source_text_fingerprint,diagnostic_locator
        ) values ($1,$2,'definition','active','v1','v1',$3,'raw.meanings[0].definition')`,
        [randomUUID(), entryId, `definition-${entryId}`]);
        await client.query(`insert into user_card_status(user_id,entry_id,card_type_id,fsrs_enabled,in_learning)
          values ($1,$2,'word-to-definition',true,true)`, [userId, entryId]);
      }
      const requestId = randomUUID();
      const start = (filter: object, id = requestId) => asRole(client, "authenticated", userId, async () => {
        const { rows } = await client.query(`select start_platform_v2_translation_training_session_scoped(
          $1,'1',$2,null,'curated','both',$3::jsonb,3) result`, [userId,id,JSON.stringify(filter)]);
        return rows[0].result;
      });
      const first = await start({ partOfSpeech: ["bn", "ww"] });
      expect(first.plannedTotal).toBe(1);
      expect(first.members[0].entryId).toBe(adjective);
      const stats = await asRole(client, "authenticated", userId, async () => {
        const { rows } = await client.query("select read_training_translation_stats_v1($1) result", [first.sessionId]);
        return rows[0].result;
      });
      expect(stats).toMatchObject({
        contractVersion: "training-translation-stats-v1",
        totalCardsInScope: 1, totalCardsStarted: 0,
        newCardsToday: 0, reviewCardsDone: 0, reviewCardsDue: 0,
      });
      const replay = await start({ partOfSpeech: ["ww", "bn", "bn"] });
      expect(replay.sessionId).toBe(first.sessionId);
      expect(replay.members).toEqual(first.members);
      const empty = await start({ partOfSpeech: ["ww"] }, randomUUID());
      expect(empty.plannedTotal).toBe(0);
      expect(empty.members).toEqual([]);
      expect(empty.completionReason).toBe("exhausted");
    });
  });

  test("keeps every eligible example node while excluding entries without ordinary learning state", async () => {
    await withTransaction(pool, async (client) => {
      const userId = randomUUID();
      await ensureUserWithSettings(client, userId);
      const learnedEntry = await insertWord(client, `sentence-multi-${randomUUID()}`);
      const knownEntry = await insertWord(client, `sentence-known-${randomUUID()}`);
      const untouchedEntry = await insertWord(client, `sentence-untouched-${randomUUID()}`);
      const exampleNodes = [0, 1, 2].map(() => randomUUID());
      const knownNode = randomUUID();
      const untouchedNode = randomUUID();
      for (const [index, nodeId] of exampleNodes.entries()) {
        await client.query(
          `insert into private.platform_v2_content_nodes (
             id, entry_id, kind, binding_state, first_source_revision,
             last_source_revision, source_text_fingerprint, diagnostic_locator
           ) values ($1, $2, 'example', 'active', 'test-v1', 'test-v1', $3, $4)`,
          [nodeId, learnedEntry, `sentence-${nodeId}`, `raw.meanings[0].examples[${index}]`],
        );
      }
      await client.query(
        `insert into private.platform_v2_content_nodes (
           id, entry_id, kind, binding_state, first_source_revision,
           last_source_revision, source_text_fingerprint, diagnostic_locator
         ) values ($1, $2, 'example', 'active', 'test-v1', 'test-v1', $3,
                  'raw.meanings[0].examples[0]')`,
        [knownNode, knownEntry, `sentence-${knownNode}`],
      );
      await client.query(
        `insert into private.platform_v2_content_nodes (
           id, entry_id, kind, binding_state, first_source_revision,
           last_source_revision, source_text_fingerprint, diagnostic_locator
         ) values ($1, $2, 'example', 'active', 'test-v1', 'test-v1', $3,
                  'raw.meanings[0].examples[0]')`,
        [untouchedNode, untouchedEntry, `sentence-${untouchedNode}`],
      );
      await client.query(
        `insert into public.user_card_status (
           user_id, entry_id, card_type_id, fsrs_enabled, in_learning
         ) values ($1, $2, 'word-to-definition', true, true)`,
        [userId, learnedEntry],
      );
      const { rows: knownEventRows } = await client.query(
        `insert into public.user_card_action_events (
           user_id, entry_id, card_type_id, action, client_event_id,
           action_payload_hash
         ) values ($1, $2, 'word-to-definition', 'mark-known', $3, 'sentence-known')
         returning id`,
        [userId, knownEntry, randomUUID()],
      );
      await client.query(
        `insert into public.user_card_known_marks (
           user_id, entry_id, card_type_id, mark_event_id
         ) values ($1, $2, 'word-to-definition', $3)`,
        [userId, knownEntry, knownEventRows[0].id],
      );

      const { rows: definitionRows } = await client.query(
        `select pg_get_functiondef(
           'private.training_translation_source_nodes_v1(uuid,uuid,text,jsonb)'::regprocedure
         ) as definition`,
      );
      expect(definitionRows[0].definition)
        .toContain("eligible_entries AS MATERIALIZED");
      expect(definitionRows[0].definition)
        .not.toContain("platform_v2_training_ordinary_meaning_eligible_v1");

      const { rows } = await client.query(
        `select content_node_id, entry_id
           from private.training_translation_source_nodes_v1(
             $1::uuid, null::uuid, 'curated', '{}'::jsonb
           )
          where entry_id = any($2::uuid[])
          order by content_node_id`,
        [userId, [learnedEntry, knownEntry, untouchedEntry]],
      );
      expect(rows.map((row) => row.content_node_id).sort())
        .toEqual([...exampleNodes, knownNode].sort());
      expect(rows.filter((row) => row.entry_id === learnedEntry)).toHaveLength(3);
      expect(rows.filter((row) => row.entry_id === knownEntry)).toHaveLength(1);
    });
  });

  test("keeps the source node identity stable through candidate, session, grade, and retry", async () => {
    await withTransaction(pool, async (client) => {
      const userId = randomUUID();
      await ensureUserWithSettings(client, userId);
      const entryId = await insertWord(client, `translation-contract-${randomUUID()}`);
      const definitionNodeId = randomUUID();
      const exampleNodeId = randomUUID();
      const definitionFingerprint = `definition-${definitionNodeId}`;
      const exampleFingerprint = `example-${exampleNodeId}`;

      await client.query(
        `insert into private.platform_v2_content_nodes (
           id, entry_id, kind, binding_state, first_source_revision,
           last_source_revision, source_text_fingerprint, diagnostic_locator
         ) values
           ($1, $2, 'definition', 'active', 'test-revision', 'test-revision', $3,
            'raw.meanings[0].definition'),
           ($4, $2, 'example', 'active', 'test-revision', 'test-revision', $5,
            'raw.meanings[0].examples[0]')`,
        [definitionNodeId, entryId, definitionFingerprint, exampleNodeId, exampleFingerprint],
      );
      await client.query(
        `insert into public.user_card_status (
           user_id, entry_id, card_type_id, fsrs_enabled, in_learning, next_review_at
         ) values ($1, $2, 'word-to-definition', true, true, now())`,
        [userId, entryId],
      );

      const readCandidates = async () =>
        asRole(client, "service_role", userId, async () => {
          const { rows } = await client.query(
            `select public.read_platform_v2_translation_candidates_as_principal_v1(
               $1, 10, 0
             ) result`,
            [userId],
          );
          return rows[0].result as {
            contractVersion: string;
            family: string;
            direction: string;
            items: Array<Record<string, unknown>>;
          };
        });

      const firstCandidates = await readCandidates();
      expect(firstCandidates).toMatchObject({
        contractVersion: "platform-translation-exercise-candidates-v1",
        family: "translation",
        direction: "recall",
      });
      expect(firstCandidates.items).toHaveLength(1);
      expect(firstCandidates.items[0]).toMatchObject({
        family: "translation",
        direction: "recall",
        entryId,
        contentNodeId: exampleNodeId,
        sourcePath: "raw.meanings[0].examples[0]",
        sourceTextFingerprint: exampleFingerprint,
        queueSource: "new",
      });
      const targetId = firstCandidates.items[0].targetId as string;
      const targetKey = firstCandidates.items[0].targetKey as string;
      expect(targetId).toEqual(expect.any(String));
      expect(targetKey).toContain(`translation:recall:${entryId}:${exampleNodeId}`);

      const secondCandidates = await readCandidates();
      expect(secondCandidates.items[0]).toMatchObject({ targetId, targetKey });

      const requestId = randomUUID();
      const session = await asRole(client, "authenticated", userId, async () => {
        const { rows } = await client.query(
          `select public.start_platform_v2_translation_training_session(
             $1, '1', $2::uuid
           ) result`,
          [userId, requestId],
        );
        return rows[0].result as Record<string, unknown>;
      });
      expect(session).toMatchObject({
        contractVersion: "platform-translation-exercise-session-v1",
        exerciseFamily: "translation",
        direction: "recall",
        requestedTotal: 1,
      });
      const sessionId = session.sessionId as string;
      expect(sessionId).toEqual(expect.any(String));

      const next = await asRole(client, "authenticated", userId, async () => {
        const { rows } = await client.query(
          `select public.read_platform_v2_translation_training_session_next(
             $1, $2::uuid
           ) result`,
          [userId, sessionId],
        );
        return rows[0].result as Record<string, unknown>;
      });
      expect(next).toMatchObject({
        status: "ready",
        sessionId,
        targetId,
        family: "translation",
        direction: "recall",
        contentNodeId: exampleNodeId,
        sourcePath: "raw.meanings[0].examples[0]",
      });

      const clientEventId = randomUUID();
      const performAction = () =>
        asRole(client, "service_role", userId, async () => {
          const { rows } = await client.query(
            `select public.perform_platform_v2_translation_exercise_action_as_principal_v1(
               $1, $2::uuid, 'untracked', 'success', $3::uuid, 'recall', $4::uuid, null
             ) result`,
            [userId, targetId, clientEventId, sessionId],
          );
          return rows[0].result as Record<string, unknown>;
        });

      await expect(performAction()).resolves.toMatchObject({
        status: "accepted",
        family: "translation",
        direction: "recall",
        targetId,
      });
      await expect(performAction()).resolves.toMatchObject({
        status: "duplicate",
        targetId,
      });

      const { rows: stored } = await client.query(
        `select state.fsrs_reps, state.last_result, member.consumed_at,
                session.completed_at
           from public.user_training_exercise_state state
           join public.training_session_exercise_members member
             on member.target_id = state.target_id and member.session_id = $2::uuid
           join public.training_sessions session on session.id = member.session_id
          where state.user_id = $1 and state.target_id = $3::uuid`,
        [userId, sessionId, targetId],
      );
      expect(stored).toHaveLength(1);
      expect(stored[0]).toMatchObject({ last_result: "success" });
      expect(stored[0].fsrs_reps).toBe(1);
      expect(stored[0].consumed_at).not.toBeNull();
      expect(stored[0].completed_at).not.toBeNull();
    });
  });
});
