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

  test("familiarity is scoped to the learner and exact meaning, including known and previously reviewed cards", async () => {
    await withTransaction(pool, async (client) => {
      const userId = randomUUID();
      const otherUserId = randomUUID();
      await ensureUserWithSettings(client, userId);
      await ensureUserWithSettings(client, otherUserId);
      const known = await insertWord(client, `context-known-${randomUUID()}`);
      const reviewed = await insertWord(client, `context-reviewed-${randomUUID()}`);
      const untouched = await insertWord(client, `context-untouched-${randomUUID()}`);
      for (const entryId of [known, reviewed, untouched]) {
        await client.query(`insert into private.platform_v2_content_nodes
          (id,entry_id,kind,binding_state,first_source_revision,last_source_revision,
           source_text_fingerprint,diagnostic_locator)
          values ($1,$2,'example','active','v1','v1',$3,'raw.meanings[0].examples[0]')`,
        [randomUUID(), entryId, `example-${entryId}`]);
      }
      const event = await client.query(`insert into user_card_action_events
        (user_id,entry_id,card_type_id,action,client_event_id,action_payload_hash)
        values ($1,$2,'word-to-definition','mark-known',$3,'context-known') returning id`,
      [userId, known, randomUUID()]);
      await client.query(`insert into user_card_known_marks (user_id,entry_id,card_type_id,mark_event_id)
        values ($1,$2,'word-to-definition',$3)`, [userId, known, event.rows[0].id]);
      await client.query(`insert into user_card_status
        (user_id,entry_id,card_type_id,fsrs_enabled,in_learning,fsrs_reps)
        values ($1,$2,'word-to-definition',false,false,1),
               ($3,$4,'word-to-definition',true,true,0)`,
      [userId, reviewed, otherUserId, untouched]);
      const result = await client.query(`select entry_id,
        private.training_word_context_candidate_v1($1, entry_id, 'definition-to-word') eligible
        from unnest($2::uuid[]) entry_id`, [userId, [known, reviewed, untouched]]);
      expect(result.rows).toEqual([
        { entry_id: known, eligible: true },
        { entry_id: reviewed, eligible: true },
        { entry_id: untouched, eligible: false },
      ]);
    });
  });

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
      const group = await client.query(`insert into private.platform_v2_headword_groups
        (dictionary_id,management_kind,identity_scheme_version,source_group_key)
        select id,'source',$1,$2 from dictionaries limit 1 returning id`, [randomUUID(), randomUUID()]);
      await client.query(`insert into private.training_headword_exclusions
        (user_id,headword_group_id,entry_id,created_at) values ($1,$2,$3,now())`, [userId,group.rows[0].id,familiar]);
      const startWithFilter = async (studyingOnly: boolean) => {
        const { rows } = await client.query(`select start_training_session(
          p_user_id => $1::uuid, p_card_type_ids => ARRAY['definition-to-word']::text[],
          p_list_id => NULL::uuid, p_list_type => 'curated', p_card_filter => 'both',
          p_training_filter => $2::jsonb, p_session_size => '5', p_request_id => $3::uuid,
          p_new_review_ratio => 2) session`, [userId, JSON.stringify({presentationMode: 'word-in-context', studyingOnly}), randomUUID()]);
        const members = await client.query(`select entry_id from training_session_members where session_id=$1`, [rows[0].session.sessionId]);
        return {sessionId: rows[0].session.sessionId, entries: members.rows.map(row => row.entry_id)};
      };
      expect((await startWithFilter(true)).entries).toEqual([]);
      const expanded = await startWithFilter(false);
      expect(expanded.entries).toEqual([unfamiliar]);
      const card = await client.query(`select get_next_training_session_card($1,$2) card`, [userId, expanded.sessionId]);
      expect(card.rows[0].card).toMatchObject({id: unfamiliar, mode: 'definition-to-word'});
      const context = await client.query(`select read_training_word_context_member($1,$2,$3) source`, [userId,expanded.sessionId,unfamiliar]);
      expect(context.rows[0].source).toMatchObject({entryId: unfamiliar});
      for (const [studyingOnly, expected] of [[true, 0], [false, 1]] as const) {
        const available = await client.query(`select read_training_recipe_availability_v1(
          $1, ARRAY['definition-to-word'],null,'curated',$2,'meaning') result`,
        [userId, JSON.stringify({presentationMode:'word-in-context',studyingOnly})]);
        expect(available.rows[0].result.newCards).toBe(expected);
      }
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

  test("a context action consumes one ordinary reverse member without a sentence schedule", async () => {
    await withTransaction(pool, async (client) => {
      const userId = randomUUID();
      await ensureUserWithSettings(client, userId);
      await client.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
      const entryId = await insertWord(client, `context-action-${randomUUID()}`);
      await client.query(`insert into private.platform_v2_content_nodes
        (id,entry_id,kind,binding_state,first_source_revision,last_source_revision,
         source_text_fingerprint,diagnostic_locator)
        values ($1,$2,'example','active','v1','v1','fingerprint',
          'raw.meanings[0].examples[0]')`, [randomUUID(), entryId]);
      await client.query(`insert into user_card_status
        (user_id,entry_id,card_type_id,fsrs_enabled,in_learning)
        values ($1,$2,'word-to-definition',true,true)`, [userId, entryId]);
      const { rows: startRows } = await client.query(`select start_training_session(
        p_user_id => $1::uuid,
        p_card_type_ids => ARRAY['definition-to-word']::text[],
        p_list_id => NULL::uuid, p_list_type => 'curated', p_card_filter => 'both',
        p_training_filter => '{"presentationMode":"word-in-context"}'::jsonb,
        p_session_size => '1', p_request_id => $2::uuid,
        p_new_review_ratio => 2) session`, [userId, randomUUID()]);
      const sessionId = startRows[0].session.sessionId as string;
      const { rows: cardRows } = await client.query(`select get_next_training_session_card(
        $1::uuid,$2::uuid) card`, [userId, sessionId]);
      const card = cardRows[0].card;
      expect(card).toMatchObject({ id: entryId, mode: "definition-to-word" });
      const { rows: hintRows } = await client.query(`select mark_training_word_context_hint_opened(
        $1::uuid,$2::uuid,$3::uuid) opened`, [userId, sessionId, entryId]);
      expect(hintRows[0].opened).toBe(true);
      await client.query("select set_config('request.jwt.claim.role', 'service_role', true)");
      const eventId = randomUUID();
      const action = () => client.query(`select perform_platform_v2_card_action_as_principal(
        $1::uuid,'start-learning',$2::uuid,'definition-to-word',$3::text,
        null,null,null,$4::uuid,null,'first_party',null,$5::uuid) result`,
        [userId, entryId, card.stateRevision, eventId, sessionId]);
      expect((await action()).rows[0].result.status).toBe("accepted");
      expect((await action()).rows[0].result.status).toBe("duplicate");
      const { rows: events } = await client.query(`select presentation_mode,
        presentation_content_node_id, presentation_source_text_fingerprint,
        presentation_hint_opened from user_card_action_events
        where user_id=$1 and client_event_id=$2`, [userId, eventId]);
      expect(events).toEqual([expect.objectContaining({
        presentation_mode: "word-in-context",
        presentation_source_text_fingerprint: "fingerprint",
        presentation_hint_opened: true,
      })]);
      expect(events[0].presentation_content_node_id).toBeTruthy();
      const { rows: status } = await client.query(`select card_type_id,seen_count
        from user_card_status where user_id=$1 and entry_id=$2
        order by card_type_id`, [userId, entryId]);
      expect(status).toHaveLength(2);
      expect(status.find((row) => row.card_type_id === "definition-to-word")?.seen_count).toBe(1);
      expect(status.find((row) => row.card_type_id === "word-to-definition")?.seen_count).toBe(0);
      const { rows: members } = await client.query(`select count(*)::integer total
        from training_session_members where session_id=$1 and consumed_at is not null`, [sessionId]);
      expect(members[0].total).toBe(1);
      const { rows: exercise } = await client.query(`select count(*)::integer total
        from user_training_exercise_state where user_id=$1`, [userId]);
      expect(exercise[0].total).toBe(0);
      await expect(client.query(`select mark_training_word_context_hint_opened(
        $1::uuid,$2::uuid,$3::uuid)`, [randomUUID(), sessionId, entryId]))
        .rejects.toThrow(/unauthorized/);
    });
  });
});
