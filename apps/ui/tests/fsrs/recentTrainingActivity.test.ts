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
        values('nl',$1,'Private test','curated','private','free',(public.dictionary_source_settings_v1()->>'schemaKeyV1'),1) returning id`,[`history-private-${user}`]);
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
  test("v2 merges known and historical exclusions without losing grades or leaking other users", async () => {
    await withTransaction(pool, async client => {
      const user=randomUUID(), other=randomUUID();
      await ensureUserWithSettings(client,user); await ensureUserWithSettings(client,other);
      const entry=await insertWord(client,`known-${randomUUID()}`);
      await client.query(`update word_entries set raw='{ "definition": "a synthetic meaning" }'::jsonb where id=$1`,[entry]);
      await client.query(`insert into user_review_log(user_id,word_id,mode,grade,review_type,reviewed_at) values($1,$2,'word-to-definition',1,'review',now()-interval '3 minutes')`,[user,entry]);
      await client.query(`insert into user_card_action_events(user_id,entry_id,card_type_id,action,action_payload_hash,created_at) values($1,$2,'definition-to-word','mark-known','test',now()-interval '2 minutes'),($3,$2,'word-to-definition','mark-known','test',now())`,[user,entry,other]);
      const mark=randomUUID(), group=randomUUID();
      await client.query(`insert into private.platform_v2_headword_groups(id,dictionary_id,management_kind,identity_scheme_version,source_group_key) select $1::uuid,dictionary_id,'source','test',($1::uuid)::text from word_entries where id=$2`,[group,entry]);
      await client.query(`insert into private.training_headword_exclusions(id,user_id,headword_group_id,entry_id,created_at) values($1,$2,$4,$3,now()-interval '1 minute')`,[mark,user,entry,group]);
      await client.query(`insert into private.training_headword_exclusion_events(user_id,client_event_id,action,exclusion_id,request_hash,response,created_at) values($1,$2,'exclude-headword',$3,'test','{}',now()-interval '1 minute')`,[user,randomUUID(),mark]);
      await auth(client,user);
      const rows=(await client.query("select * from get_recent_training_activity_v2(50)")).rows;
      expect(rows.map(r=>r.review_result)).toEqual(['known','known','review_fail']);
      expect(rows.map(r=>r.card_type_id)).toEqual(['both-directions','definition-to-word','word-to-definition']);
      expect(rows.every(r=>r.meaning_text==='a synthetic meaning' && r.content_language_code==='nl')).toBe(true);
      expect((await client.query("select * from get_recent_training_activity_v2(2)")).rows.every(r=>r.has_more)).toBe(true);
    });
  });
  test("v2 reports pair exclusion and restoration without inventing an exercise direction", async () => {
    await withTransaction(pool, async client => {
      const user=randomUUID(); await ensureUserWithSettings(client,user);
      const entry=await insertWord(client,`pair-${randomUUID()}`), exercise=await target(client,entry,"idiom","reverse");
      const mark=randomUUID();
      await client.query(`insert into private.training_pair_exclusions(id,user_id,pair_key,family,entry_id,content_node_id,source_text_fingerprint,created_at) values($1,$2,'test-key','idiom',$3,$4,'fingerprint',now())`,[mark,user,entry,exercise.node]);
      await client.query(`insert into private.training_pair_exclusion_events(user_id,client_event_id,action,exclusion_id,request_hash,response,created_at) values($1,$2,'exclude-pair',$3,'test','{}',now()-interval '1 minute'),($1,$4,'restore-pair',$3,'test','{}',now())`,[user,randomUUID(),mark,randomUUID()]);
      await auth(client,user);
      const rows=(await client.query("select * from get_recent_training_activity_v2(50)")).rows;
      expect(rows.map(r=>r.review_result)).toEqual(['restored','excluded']);
      expect(rows.every(r=>r.exercise_family==='idiom' && r.exercise_direction===null && r.exercise_text==='source phrase')).toBe(true);
    });
  });
  test("v2 applies one stable 50-action limit across known marks and grades", async () => {
    await withTransaction(pool, async client => {
      const user=randomUUID(); await ensureUserWithSettings(client,user);
      const entry=await insertWord(client,`limit-${randomUUID()}`);
      await client.query(`insert into user_card_action_events(user_id,entry_id,card_type_id,action,action_payload_hash,created_at) select $1,$2,'word-to-definition','mark-known','test',now() from generate_series(1,30)`,[user,entry]);
      await client.query(`insert into user_review_log(user_id,word_id,mode,grade,review_type,reviewed_at) select $1,$2,'word-to-definition',3,'review',now()-interval '1 minute' from generate_series(1,30)`,[user,entry]);
      await auth(client,user);
      const rows=(await client.query("select * from get_recent_training_activity_v2(50)")).rows;
      expect(rows).toHaveLength(50);
      expect(rows.filter(r=>r.review_result==='known')).toHaveLength(30);
      expect(rows.filter(r=>r.review_result==='review_success')).toHaveLength(20);
      expect(rows.every(r=>r.has_more)).toBe(true);
      expect(new Set(rows.map(r=>r.activity_id)).size).toBe(50);
    });
  });
  test("v2 hides conversion bookkeeping but retains a later independent undo", async () => {
    await withTransaction(pool, async client => {
      const user=randomUUID(); await ensureUserWithSettings(client,user);
      const entry=await insertWord(client,`converted-${randomUUID()}`), eventId=randomUUID(), undoId=randomUUID(), markId=randomUUID();
      const exclusionId=randomUUID(), groupId=randomUUID();
      await client.query(`insert into private.platform_v2_headword_groups(id,dictionary_id,management_kind,identity_scheme_version,source_group_key) select $1::uuid,dictionary_id,'source','test',($1::uuid)::text from word_entries where id=$2`,[groupId,entry]);
      await client.query(`insert into private.training_headword_exclusions(id,user_id,entry_id,headword_group_id,created_at,restored_at) values($1,$2,$3,$4,now(),now())`,[exclusionId,user,entry,groupId]);
      await client.query(`insert into user_card_action_events(id,user_id,entry_id,card_type_id,action,action_payload_hash,created_at) values($1,$3,$4,'word-to-definition','mark-known','test',now()-interval '1 hour'),($2,$3,$4,'word-to-definition','undo-known','test',now())`,[eventId,undoId,user,entry]);
      await client.query(`insert into user_card_known_marks(id,user_id,entry_id,card_type_id,mark_event_id,cleared_at,undo_event_id) values($1,$2,$3,'word-to-definition',$4,now(),$5)`,[markId,user,entry,eventId,undoId]);
      await client.query(`insert into private.meaning_exclusion_known_conversions(exclusion_id,user_id,entry_id,introduced_mark_ids) values($1,$2,$3,array[$4::uuid])`,[exclusionId,user,entry,markId]);
      await auth(client,user);
      const rows=(await client.query("select * from get_recent_training_activity_v2(50)")).rows;
      expect(rows.map(r=>r.review_result)).toEqual(['restored']);
    });
  });
  test("v2 badges use a complete accessible source group, never a history position", async () => {
    await withTransaction(pool, async client => {
      const user=randomUUID(); await ensureUserWithSettings(client,user);
      const word=`badge-${randomUUID()}`, one=await insertWord(client,word), two=await insertWord(client,word);
      const dict=(await client.query("select dictionary_id from word_entries where id=$1",[one])).rows[0].dictionary_id;
      const scheme=`test-${randomUUID()}`, group=`group-${randomUUID()}`;
      const run=(await client.query(`insert into private.dictionary_import_runs(dictionary_id,identity_scheme_version,artifact_format_version,manifest_checksum,input_checksum,source_record_count,artifact_count,status) values($1,$2,'test','m','i',2,2,'completed') returning id`,[dict,scheme])).rows[0].id;
      for (const [index,id] of [one,two].entries()) await client.query(`insert into private.source_entry_bindings(dictionary_id,identity_scheme_version,source_entry_key,source_group_key,sense_ordinal,word_entry_id,binding_state,first_seen_run_id,last_seen_run_id,manifest_checksum,content_fingerprint_version,content_fingerprint,identity_evidence,reconciliation_decision) values($1,$2,$3,$4,$5,$6,'active',$7,$7,'m','v','f','{}','{}')`,[dict,scheme,randomUUID(),group,index+1,id,run]);
      await client.query(`insert into user_review_log(user_id,word_id,mode,grade,review_type,reviewed_at) values($1,$2,'word-to-definition',3,'review',now())`,[user,two]);
      await auth(client,user);
      const row=(await client.query("select * from get_recent_training_activity_v2(50)")).rows[0];
      expect(row).toMatchObject({entry_id:two,meaning_ordinal:2,meaning_count:2});
      await client.query('reset role');
      await client.query("update private.source_entry_bindings set sense_ordinal=8 where word_entry_id=$1",[two]);
      await auth(client,user);
      const ambiguous=(await client.query("select * from get_recent_training_activity_v2(50)")).rows[0];
      expect(ambiguous.meaning_ordinal).toBeNull(); expect(ambiguous.meaning_count).toBeNull();
    });
  });
  test("v2 is restricted to authenticated principals", async () => {
    const {rows} = await pool.query(`select has_function_privilege('anon','public.get_recent_training_activity_v2(integer)','EXECUTE') anon, has_function_privilege('service_role','public.get_recent_training_activity_v2(integer)','EXECUTE') service, has_function_privilege('authenticated','public.get_recent_training_activity_v2(integer)','EXECUTE') learner`);
    expect(rows[0]).toEqual({anon:false,service:false,learner:true});
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
