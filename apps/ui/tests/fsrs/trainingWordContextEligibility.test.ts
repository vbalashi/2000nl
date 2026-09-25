import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { Pool } from "pg";
import { ensureUserWithSettings, getDbUrl, insertWord, runMigrations, withTransaction } from "./dbTestUtils";

const dbUrl = getDbUrl();
const describeIfDb = dbUrl ? describe : describe.skip;

describeIfDb("word in context uses ordinary reverse membership", () => {
  const pool = new Pool({ connectionString: dbUrl });

  beforeAll(async () => runMigrations(pool));
  afterAll(async () => pool.end());

  test("latches only familiar exact meanings with an active example", async () => {
    await withTransaction(pool, async (client) => {
      const userId = randomUUID();
      await ensureUserWithSettings(client, userId);
      await client.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
      const familiar = await insertWord(client, `context-familiar-${randomUUID()}`);
      const noExample = await insertWord(client, `context-no-example-${randomUUID()}`);
      const unfamiliar = await insertWord(client, `context-unfamiliar-${randomUUID()}`);
      const retired = await insertWord(client, `context-retired-${randomUUID()}`);
      for (const entryId of [familiar, noExample, retired]) {
        await client.query(`insert into user_card_status
          (user_id, entry_id, card_type_id, fsrs_enabled, in_learning)
          values ($1,$2,'word-to-definition',true,true)`, [userId, entryId]);
      }
      for (const [entryId, state] of [
        [familiar, "active"], [unfamiliar, "active"], [retired, "retired"],
      ]) {
        await client.query(`insert into private.platform_v2_content_nodes
          (id,entry_id,kind,binding_state,first_source_revision,last_source_revision,
           source_text_fingerprint,diagnostic_locator)
          values ($1,$2,'example',$3,'v1','v1',$4,'raw.meanings[0].examples[0]')`,
          [randomUUID(), entryId, state, `example-${entryId}`]);
      }
      const { rows } = await client.query(`select start_training_session(
        p_user_id => $1::uuid,
        p_card_type_ids => ARRAY['definition-to-word']::text[],
        p_list_id => NULL::uuid, p_list_type => 'curated',
        p_card_filter => 'both',
        p_training_filter => '{"presentationMode":"word-in-context"}'::jsonb,
        p_session_size => '5', p_request_id => $2::uuid,
        p_new_review_ratio => 2) session`, [userId, randomUUID()]);
      expect(rows[0].session.plannedTotal).toBe(1);
      const { rows: members } = await client.query(
        `select entry_id, card_type_id from training_session_members where session_id=$1`,
        [rows[0].session.sessionId],
      );
      expect(members).toEqual([{ entry_id: familiar, card_type_id: "definition-to-word" }]);
      const { rows: oldState } = await client.query(
        `select count(*)::integer total from user_training_exercise_state where user_id=$1`,
        [userId],
      );
      expect(oldState[0].total).toBe(0);
    });
  });

  test("rejects direct or mixed directions for a context session", async () => {
    await withTransaction(pool, async (client) => {
      const userId = randomUUID();
      await ensureUserWithSettings(client, userId);
      await client.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
      await expect(client.query(`select start_training_session(
        p_user_id => $1::uuid,
        p_card_type_ids => ARRAY['word-to-definition','definition-to-word']::text[],
        p_list_id => NULL::uuid, p_list_type => 'curated', p_card_filter => 'both',
        p_training_filter => '{"presentationMode":"word-in-context"}'::jsonb,
        p_session_size => '5', p_request_id => $2::uuid,
        p_new_review_ratio => 2)`, [userId, randomUUID()]))
        .rejects.toThrow(/word_context_requires_reverse_mode/);
    });
  });

  test("freezes one source per meaning, rotates after a reverse review, and checks ownership", async () => {
    await withTransaction(pool, async (client) => {
      const userId = randomUUID();
      const otherUserId = randomUUID();
      await ensureUserWithSettings(client, userId);
      await ensureUserWithSettings(client, otherUserId);
      await client.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
      const entryId = await insertWord(client, `context-rotation-${randomUUID()}`);
      const firstNode = randomUUID();
      const secondNode = randomUUID();
      for (const [index, nodeId] of [firstNode, secondNode].entries()) {
        await client.query(`insert into private.platform_v2_content_nodes
          (id,entry_id,kind,binding_state,first_source_revision,last_source_revision,
           source_text_fingerprint,diagnostic_locator,source_order)
          values ($1,$2,'example','active','v1','v1',$3,$4,$5)`,
          [nodeId, entryId, `fingerprint-${nodeId}`, `raw.meanings[0].examples[${index}]`, index + 1]);
      }
      await client.query(`insert into user_card_status
        (user_id,entry_id,card_type_id,fsrs_enabled,in_learning)
        values ($1,$2,'word-to-definition',true,true)`, [userId, entryId]);
      const start = async () => {
        const { rows } = await client.query(`select start_training_session(
          p_user_id => $1::uuid,
          p_card_type_ids => ARRAY['definition-to-word']::text[],
          p_list_id => NULL::uuid, p_list_type => 'curated', p_card_filter => 'both',
          p_training_filter => '{"presentationMode":"word-in-context"}'::jsonb,
          p_session_size => '1', p_request_id => $2::uuid,
          p_new_review_ratio => 2) session`, [userId, randomUUID()]);
        return rows[0].session.sessionId as string;
      };
      const read = async (sessionId: string) => {
        const { rows } = await client.query(`select read_training_word_context_member(
          $1::uuid,$2::uuid,$3::uuid) as source`, [userId, sessionId, entryId]);
        return rows[0].source;
      };
      const session1 = await start();
      expect(await read(session1)).toMatchObject({
        entryId, contentNodeId: firstNode,
        sourceTextFingerprint: `fingerprint-${firstNode}`,
      });
      expect(await read(session1)).toMatchObject({ contentNodeId: firstNode });
      await client.query(`insert into user_card_status
        (user_id,entry_id,card_type_id,fsrs_enabled,fsrs_reps,fsrs_last_interval,next_review_at)
        values ($1,$2,'definition-to-word',true,1,1,now()-interval '1 day')`,
        [userId, entryId]);
      const session2 = await start();
      expect(await read(session1)).toBeNull();
      expect(await read(session2)).toMatchObject({ contentNodeId: secondNode });
      await expect(client.query(`select read_training_word_context_member(
        $1::uuid,$2::uuid,$3::uuid)`, [otherUserId, session2, entryId]))
        .rejects.toThrow(/unauthorized/);
    });
  });
});
