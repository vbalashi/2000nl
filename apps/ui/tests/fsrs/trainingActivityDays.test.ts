import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { ensureUserWithSettings, getDbUrl, insertWord, runMigrations, withTransaction } from "./dbTestUtils";

const dbUrl = getDbUrl();
const zone = "Europe/Amsterdam";

async function auth(client: PoolClient, userId: string) {
  await client.query(`select set_config('request.jwt.claim.sub',$1,true)`, [userId]);
  await client.query("set local role authenticated");
}
async function read(client: PoolClient, language: string | null, days: number | null = 3) {
  const { rows } = await client.query("select get_training_activity_days_v1($1,$2) result", [language, days]);
  return rows[0].result;
}
/** Instant at a learner-local wall time relative to the current study day. */
async function localInstant(client: PoolClient, dayOffset: number, time: string): Promise<Date> {
  const { rows } = await client.query(
    `select ((private.training_study_day_date_v1(clock_timestamp(),$1)+$2::int)+$3::time) at time zone $1 at`,
    [zone, dayOffset, time],
  );
  return rows[0].at;
}
async function exerciseTarget(client: PoolClient, entryId: string) {
  const node = randomUUID(), target = randomUUID();
  await client.query(`insert into private.platform_v2_content_nodes(id,entry_id,kind,binding_state,first_source_revision,last_source_revision,source_text_fingerprint,diagnostic_locator)
    values($1,$2,'idiom','active','v1','v1','test-fingerprint','test')`, [node, entryId]);
  await client.query(`insert into private.platform_v2_training_exercise_targets(id,entry_id,content_node_id,family,direction,source_revision,source_text_fingerprint)
    values($1,$2,$3,'idiom','direct','v1','test-fingerprint')`, [target, entryId, node]);
  return target;
}
async function started(client: PoolClient, userId: string, entryId: string, at: Date) {
  await client.query(`insert into user_card_action_events(user_id,entry_id,card_type_id,action,action_payload_hash,created_at)
    values($1,$2,'word-to-definition','start-learning','hash',$3)`, [userId, entryId, at]);
}
async function reviewed(client: PoolClient, userId: string, entryId: string, type: "new" | "review", at: Date) {
  await client.query(`insert into user_review_log(user_id,word_id,mode,grade,review_type,reviewed_at)
    values($1,$2,'word-to-definition',3,$3,$4)`, [userId, entryId, type, at]);
}
async function exercised(client: PoolClient, userId: string, targetId: string, at: Date) {
  await client.query(`insert into user_training_exercise_action_events(user_id,target_id,action,result,client_event_id,action_payload_hash,created_at)
    values($1,$2,'review-exercise','success',$3,'hash',$4)`, [userId, targetId, randomUUID(), at]);
}

(dbUrl ? describe : describe.skip)("training activity days read model", () => {
  const pool = new Pool({ connectionString: dbUrl });
  beforeAll(async () => { await runMigrations(pool); });
  afterAll(async () => { await pool.end(); });

  test("attributes new and review actions of all families to learner-local study days", async () => {
    await withTransaction(pool, async client => {
      const userId = randomUUID(), other = randomUUID();
      await ensureUserWithSettings(client, userId);
      await ensureUserWithSettings(client, other);
      await client.query("update user_settings set training_schedule_timezone=$2 where user_id=$1", [userId, zone]);
      const a = await insertWord(client, `activity-a-${randomUUID()}`);
      const b = await insertWord(client, `activity-b-${randomUUID()}`);
      await client.query("insert into languages(code,name) values('en','English') on conflict (code) do nothing");
      const { rows: [dictionary] } = await client.query(`insert into dictionaries(language_code,slug,name,kind,visibility,minimum_subscription_tier,schema_key,schema_version)
        values('en',$1,'English test','curated','private','free','nl-vandale-v1',1) returning id`, [`activity-en-${userId}`]);
      const { rows: [english] } = await client.query(`insert into word_entries(dictionary_id,language_code,headword,part_of_speech,is_nt2_2000,raw)
        values($1,'en',$2,'noun',false,'{}'::jsonb) returning id`, [dictionary.id, `activity-en-${randomUUID()}`]);
      const target = await exerciseTarget(client, a);

      // Start-learning and the first graded review of one card are one introduction.
      await started(client, userId, a, await localInstant(client, 0, "05:00"));
      await reviewed(client, userId, a, "new", await localInstant(client, 0, "05:01"));
      await reviewed(client, userId, b, "review", await localInstant(client, 0, "06:00"));
      // 03:59 local on the calendar date of today still belongs to yesterday's study day.
      await reviewed(client, userId, b, "review", await localInstant(client, 0, "03:59"));
      await exercised(client, userId, target, await localInstant(client, -2, "12:00"));
      await exercised(client, userId, target, await localInstant(client, 0, "12:00"));
      await reviewed(client, userId, english.id, "review", await localInstant(client, 0, "07:00"));
      // Another learner's history and actions before the window are invisible.
      await reviewed(client, other, b, "review", await localInstant(client, 0, "06:00"));
      await reviewed(client, userId, b, "review", await localInstant(client, -3, "12:00"));

      await auth(client, userId);
      const dutch = await read(client, "nl");
      expect(dutch.timezone).toBe(zone);
      expect(dutch.days.map((d: { date: string }) => d.date).at(-1)).toBe(dutch.today);
      expect(dutch.days.map(({ newCount, reviewCount, activeMilliseconds }: Record<string, number>) => [newCount, reviewCount, activeMilliseconds]))
        .toEqual([[1, 0, 0], [0, 1, 0], [1, 2, 0]]);
      const all = await read(client, null);
      expect(all.days.at(-1)).toMatchObject({ newCount: 1, reviewCount: 3 });
      expect((await read(client, "en")).days.at(-1)).toMatchObject({ newCount: 0, reviewCount: 1 });
      expect(typeof dutch.coverageStartedAt).toBe("string");

      await client.query("reset role");
      const { rows: [writes] } = await client.query(`select
        (select count(*) from user_card_status where user_id=$1)::int statuses,
        (select count(*) from private.training_active_time_v1 where user_id=$1)::int receipts`, [userId]);
      expect(writes).toEqual({ statuses: 0, receipts: 0 });
    });
  });

  test("validates the range and requires an authenticated principal", async () => {
    await withTransaction(pool, async client => {
      const userId = randomUUID();
      await ensureUserWithSettings(client, userId);
      await client.query("select set_config('request.jwt.claim.sub','',true)");
      expect(await read(client, "nl")).toEqual({ error: "unauthorized" });
      await auth(client, userId);
      for (const days of [0, 367, null]) expect(await read(client, "nl", days)).toEqual({ error: "invalid_activity_range" });
      expect(await read(client, "Dutch")).toEqual({ error: "invalid_activity_range" });
      const year = await read(client, "nl", 366);
      expect(year.days).toHaveLength(366);
      expect(year.days.every((d: Record<string, number>) => d.newCount === 0 && d.reviewCount === 0)).toBe(true);
    });
  });

  test("grants execution only to authenticated learners", async () => {
    const { rows } = await pool.query(`select
      has_function_privilege('anon','public.get_training_activity_days_v1(text,integer)','EXECUTE') anon,
      has_function_privilege('service_role','public.get_training_activity_days_v1(text,integer)','EXECUTE') service,
      has_function_privilege('authenticated','public.get_training_activity_days_v1(text,integer)','EXECUTE') learner`);
    expect(rows[0]).toEqual({ anon: false, service: false, learner: true });
  });
});
