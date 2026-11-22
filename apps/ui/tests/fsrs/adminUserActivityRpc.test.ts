import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { ensureLanguage, ensureUserWithSettings, getDbUrl, runMigrations, withTransaction } from "./dbTestUtils";

const dbUrl = getDbUrl();
const describeIfDb = dbUrl ? describe : describe.skip;

describeIfDb("admin user activity database projection", () => {
  const pool = new Pool({ connectionString: dbUrl });

  beforeAll(async () => { await runMigrations(pool); });
  afterAll(async () => { await pool.end(); });

  test("counts durable activity by UTC day, filters the learner and period, and audits delivery", async () => {
    await withTransaction(pool, async client => {
      const learner = randomUUID();
      const other = randomUUID();
      const operator = randomUUID();
      const request = randomUUID();
      for (const user of [learner, other, operator]) await ensureUserWithSettings(client, user);
      await ensureLanguage(client, "nl");
      const { rows: [word] } = await client.query(
        "insert into word_entries(language_code, headword, raw) values ('nl', $1, '{}') returning id",
        [`fixture-${randomUUID()}`],
      );
      await client.query("set local time zone 'Pacific/Auckland'");
      await client.query(
        "insert into admin_operators(email,user_id,is_active,permissions) values($1,$2,true,ARRAY['users.read'])",
        [`operator-${operator}@example.test`, operator],
      );

      const utc = "date_trunc('day', now(), 'UTC')";
      await client.query(
        `insert into training_sessions(user_id, session_size, card_type_ids, card_filter, created_at, completed_at, completion_reason)
        values
          ($1, '5', '{}', 'both', ${utc} - interval '168 hours', ${utc} - interval '48 hours', 'completed'),
          ($1, '5', '{}', 'both', ${utc} - interval '48 hours', ${utc} - interval '48 hours', 'exhausted'),
          ($1, '5', '{}', 'both', ${utc} - interval '48 hours', ${utc} - interval '24 hours', null),
          ($2, '5', '{}', 'both', ${utc} - interval '24 hours', null, null)`,
        [learner, other],
      );
      await client.query(
        `insert into user_review_log(user_id, word_id, mode, grade, review_type, reviewed_at) values
          ($1, $3, 'word-to-definition', 3, 'review', ${utc} - interval '1 hour'),
          ($1, $3, 'word-to-definition', 0, 'review', ${utc} - interval '96 hours'),
          ($2, $3, 'word-to-definition', 4, 'review', ${utc} - interval '96 hours'),
          ($1, $3, 'definition-to-word', 4, 'review', ${utc} - interval '144 hours')`,
        [learner, other, word.id],
      );
      await client.query(
        `insert into user_card_action_events(user_id, entry_id, card_type_id, action, action_payload_hash, created_at) values
          ($1,$2,'word-to-definition','start-learning','fixture',${utc} - interval '1 hour'),
          ($1,$2,'word-to-definition','record-view','fixture',${utc} - interval '72 hours')`,
        [learner, word.id],
      );
      const { rows: [node] } = await client.query(
        `insert into private.platform_v2_content_nodes
          (entry_id,kind,binding_state,first_source_revision,last_source_revision,source_text_fingerprint,diagnostic_locator)
         values($1,'idiom','active','fixture','fixture','fixture','fixture') returning id`,
        [word.id],
      );
      const { rows: [target] } = await client.query(
        `insert into private.platform_v2_training_exercise_targets
          (entry_id,content_node_id,family,direction,source_revision,source_text_fingerprint)
         values($1,$2,'idiom','direct','fixture','fixture') returning id`,
        [word.id, node.id],
      );
      await client.query(
        `insert into user_training_exercise_action_events
          (user_id,target_id,action,result,client_event_id,action_payload_hash,created_at)
         values($1,$2,'review-exercise','easy',gen_random_uuid(),'fixture',${utc} - interval '1 hour')`,
        [learner, target.id],
      );

      const read = async (actor: string, target: string, days: number, requestId = randomUUID()) => {
        const { rows: [row] } = await client.query(
          "select public.admin_user_activity($1,$2,$3,$4) as activity",
          [actor, target, requestId, days],
        );
        return row.activity;
      };
      expect(await read(other, learner, 7)).toEqual({ error: "forbidden" });
      expect(await read(operator, learner, 91)).toEqual({ error: "invalid_period" });
      expect(await read(operator, randomUUID(), 7)).toEqual({ error: "not_found" });

      const result = await read(operator, learner, 7, request);
      const { rows: [expected] } = await client.query(
        `select ${utc} - interval '1 hour' as latest, ${utc} - interval '144 hours' as start`,
      );
      expect(result).toMatchObject({ activeDays: 3, sessionsStarted: 2, sessionsCompleted: 1, acceptedActions: 4 });
      expect(new Date(result.periodStart)).toEqual(expected.start);
      expect(new Date(result.lastObservedAt)).toEqual(expected.latest);
      expect(Object.keys(result).sort()).toEqual([
        "acceptedActions", "activeDays", "asOf", "lastObservedAt", "periodStart", "sessionsCompleted", "sessionsStarted",
      ]);

      const { rows: audit } = await client.query(
        "select operator_user_id, target_id, action, outcome from admin_audit_events where request_id=$1",
        [request],
      );
      expect(audit).toEqual([{ operator_user_id: operator, target_id: learner, action: "user.activity.read", outcome: "success" }]);

      await client.query("delete from user_training_exercise_action_events where user_id=$1", [learner]);
      await client.query("delete from user_card_action_events where user_id=$1", [learner]);
      await client.query("delete from training_sessions where user_id=$1", [learner]);
      await client.query(
        `update user_review_log set grade=3, reviewed_at=${utc} - interval '480 hours' where user_id=$1`, [learner],
      );
      expect(await read(operator, learner, 7)).toMatchObject({
        activeDays: 0, sessionsStarted: 0, sessionsCompleted: 0, acceptedActions: 0,
        lastObservedAt: expect.any(String),
      });
      expect(await read(operator, operator, 30)).toMatchObject({ activeDays: 0, acceptedActions: 0, lastObservedAt: null });

      await client.query("alter table public.admin_audit_events add constraint fixture_audit_failure check (action <> 'user.activity.read') not valid");
      await expect(read(operator, learner, 7)).rejects.toMatchObject({ code: "23514" });
    });
  });
});
