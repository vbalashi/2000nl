import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { Pool, type PoolClient } from "pg";
import { ensureUserWithSettings, getDbUrl, insertWord, runMigrations, withTransaction } from "./dbTestUtils";

const dbUrl = getDbUrl();
async function target(client: PoolClient, entryId: string, family: "idiom" | "translation", direction: string) {
  const node = randomUUID(), id = randomUUID();
  await client.query(`insert into private.platform_v2_content_nodes(id,entry_id,kind,binding_state,first_source_revision,last_source_revision,source_text_fingerprint,diagnostic_locator,canonical_source_text)
    values($1,$2,$3,'active','v1','v1','fingerprint','test','source phrase')`, [node, entryId, family === "idiom" ? "idiom" : "example"]);
  await client.query(`insert into private.platform_v2_training_exercise_targets(id,entry_id,content_node_id,family,direction,source_revision,source_text_fingerprint)
    values($1,$2,$3,$4,$5,'v1','fingerprint')`, [id,entryId,node,family,direction]);
  return { id, node };
}
async function event(client: PoolClient, user: string, id: string, at: string, action = "review-exercise", result: string | null = "success") {
  await client.query(`insert into user_training_exercise_action_events(user_id,target_id,action,result,client_event_id,action_payload_hash,created_at,source_context)
    values($1,$2,$3,$4,$5,'hash',now()+$6::interval,'{"privateUrl":"never display"}'::jsonb)`, [user,id,action,result,randomUUID(),at]);
}
async function auth(client: PoolClient, user: string) {
  await client.query("select set_config('request.jwt.claim.sub',$1,true)", [user]);
  await client.query("set local role authenticated");
}
(dbUrl ? describe : describe.skip)("recent training activity v1", () => {
  const pool = new Pool({ connectionString: dbUrl });
  beforeAll(async () => { await runMigrations(pool); });
  afterAll(async () => { await pool.end(); });
  test("merges all families, keeps older actions, guards ownership/access and withholds stale text", async () => {
    await withTransaction(pool, async client => {
      const user = randomUUID(), other = randomUUID();
      await ensureUserWithSettings(client,user); await ensureUserWithSettings(client,other);
      const entry = await insertWord(client,`history-${randomUUID()}`);
      const idiom = await target(client,entry,"idiom","reverse");
      const sentence = await target(client,entry,"translation","recall");
      await client.query(`insert into user_review_log(user_id,word_id,mode,grade,review_type,reviewed_at)
        values($1,$2,'word-to-definition',3,'review',now()-interval '3 days')`,[user,entry]);
      await event(client,user,idiom.id,"-2 days"); await event(client,user,sentence.id,"-1 minute");
      await event(client,other,idiom.id,"0 minutes");
      await event(client,user,idiom.id,"0 minutes","record-view",null);
      await event(client,user,idiom.id,"0 minutes","review-exercise","hide");
      // Changed source must not be passed off as the historical phrase.
      await client.query("update private.platform_v2_content_nodes set source_text_fingerprint='changed',canonical_source_text='different phrase' where id=$1",[idiom.node]);
      // A private dictionary without membership is not visible in history.
      const { rows: [dictionary] } = await client.query(`insert into dictionaries(language_code,slug,name,kind,visibility,minimum_subscription_tier,schema_key,schema_version)
        values('nl',$1,'Private test','curated','private','free','nl-vandale-v1',1) returning id`,[`history-private-${user}`]);
      const { rows: [hidden] } = await client.query(`insert into word_entries(dictionary_id,language_code,headword,part_of_speech,is_nt2_2000,raw)
        values($1,'nl','private word','noun',false,'{}') returning id`,[dictionary.id]);
      const hiddenTarget = await target(client,hidden.id,"idiom","direct"); await event(client,user,hiddenTarget.id,"0 minutes");
      await auth(client,user);
      const { rows } = await client.query("select * from get_recent_training_activity_v1(50)");
      expect(rows).toHaveLength(3);
      expect(rows.map(r=>r.exercise_family)).toEqual(["translation","idiom","meaning"]);
      expect(rows.map(r=>r.has_more)).toEqual([false,false,false]);
      expect(rows[0]).toMatchObject({ target_id:sentence.id,exercise_text:"source phrase",card_type_id:null,exercise_direction:"recall" });
      expect(rows[1]).toMatchObject({ target_id:idiom.id,exercise_text:null,exercise_direction:"reverse" });
      expect(rows[2]).toMatchObject({ card_type_id:"word-to-definition",target_id:null,exercise_text:null });
      expect(JSON.stringify(rows)).not.toContain("never display");
      expect((await client.query("select * from get_recent_training_activity_v1(1)")).rows[0].has_more).toBe(true);
      expect((await client.query("select * from get_recent_training_review_history(50)")).rows).toHaveLength(0);
    });
  });
  test("caps globally at 50 and produces stable distinct action identities", async () => {
    await withTransaction(pool, async client => {
      const user = randomUUID(); await ensureUserWithSettings(client,user);
      const entry = await insertWord(client,`cap-${randomUUID()}`), exercise = await target(client,entry,"idiom","direct");
      for (let i=0;i<31;i++) await event(client,user,exercise.id,"-3 days");
      await client.query(`insert into user_review_log(user_id,word_id,mode,grade,review_type,reviewed_at)
        select $1,$2,'word-to-definition',3,'review',now()-interval '3 days' from generate_series(1,31)`,[user,entry]);
      await auth(client,user);
      const a = (await client.query("select * from get_recent_training_activity_v1(100)")).rows;
      const b = (await client.query("select * from get_recent_training_activity_v1(50)")).rows;
      expect(a).toHaveLength(50); expect(a).toEqual(b);
      expect(new Set(a.map(r=>r.activity_id)).size).toBe(50);
      expect(a.every(r=>r.has_more)).toBe(true);
      expect(a.filter(r=>r.exercise_family === "meaning")).toHaveLength(31);
      expect(a.filter(r=>r.exercise_family === "idiom")).toHaveLength(19);
    });
  });
  test("requires a principal and grants execution only to authenticated clients", async () => {
    await withTransaction(pool, async client => {
      await client.query("select set_config('request.jwt.claim.sub','',true)");
      await expect(client.query("select * from get_recent_training_activity_v1(50)")).rejects.toThrow("unauthorized");
    });
    const { rows } = await pool.query(`select has_function_privilege('anon','public.get_recent_training_activity_v1(integer)','EXECUTE') anon,
      has_function_privilege('service_role','public.get_recent_training_activity_v1(integer)','EXECUTE') service,
      has_function_privilege('authenticated','public.get_recent_training_activity_v1(integer)','EXECUTE') learner`);
    expect(rows[0]).toEqual({ anon:false,service:false,learner:true });
  });
});
