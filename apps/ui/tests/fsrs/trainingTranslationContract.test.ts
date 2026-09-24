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
