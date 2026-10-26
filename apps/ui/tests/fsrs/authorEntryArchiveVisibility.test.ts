import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { ensureUserWithSettings, getDbUrl, runMigrations, withTransaction } from "./dbTestUtils";

const url = getDbUrl();
const suite = url ? describe : describe.skip;
async function fixture(client: PoolClient, owner: string) {
  await ensureUserWithSettings(client, owner);
  await client.query("select set_config('request.jwt.claim.sub',$1,true)", [owner]);
  const list = (await client.query(`insert into user_word_lists(user_id,name,language_code,primary_language_code)
    values($1,'Archive visibility lesson','nl','nl') returning id`, [owner])).rows[0].id as string;
  const entries: string[] = [];
  for (let index = 0; index < 3; index++) {
    const id = (await client.query(`select create_user_dictionary_entry($1,null,
      jsonb_build_object('headword',$2::text,'languageCode','nl','definition',$3::text,
        'partOfSpeech','noun','gender','de')) id`,
    [owner, `archive-visibility-${owner}-${index}`, `Definition ${index}`])).rows[0].id as string;
    entries.push(id);
    await client.query("insert into user_word_list_items(list_id,word_id) values($1,$2)", [list,id]);
  }
  return {list, entries};
}
async function material(client: PoolClient, owner: string, list: string, cursor: string|null = null) {
  return (await client.query(`select lookup_platform_v2_library_material_entries(
    $1,'','nl',null,$2,1,50,'{}',jsonb_build_object('kind','collection','id',$3::text,'collectionType','user')) payload`,
  [owner,cursor,list])).rows[0].payload;
}
async function expectDenied(client: PoolClient, sql: string, values: unknown[]) {
  await client.query("savepoint expected_denial");
  try { await expect(client.query(sql,values)).rejects.toThrow(); }
  finally { await client.query("rollback to savepoint expected_denial"); }
}

suite("author archive read and issuance boundary", () => {
  const pool = new Pool({connectionString:url});
  beforeAll(() => runMigrations(pool));
  afterAll(() => pool.end());

  test("hides an archived meaning before collection counts and group pagination while retaining identity and history", async () => {
    const owner = randomUUID();
    await withTransaction(pool, async client => {
      const f=await fixture(client,owner), archived=f.entries[1];
      await client.query("insert into user_word_notes(user_id,word_entry_id,notes) values($1,$2,'Saved teaching note')",[owner,archived]);
      await client.query("select handle_card_review($1,$2,'word-to-definition','success',$3)",[owner,archived,randomUUID()]);
      const before=(await client.query("select count(*)::int n from user_review_log where user_id=$1 and word_id=$2",[owner,archived])).rows[0].n;
      expect(before).toBeGreaterThan(0);
      const groupBefore=(await client.query("select private.training_headword_group_v1($1) id",[archived])).rows[0].id;
      expect(groupBefore).toBeTruthy();
      await client.query("set local role authenticated");
      await client.query("select delete_user_dictionary_entry($1,$2)",[owner,archived]);
      expect((await client.query("select fetch_dictionary_entry_by_id_gated($1) value",[archived])).rows[0].value).toBeNull();
      const lists=(await client.query("select get_available_word_lists($1,'nl','user') value",[owner])).rows[0].value;
      const list=lists.find((item:{id:string})=>item.id===f.list);
      expect(list.user_word_list_items[0]).toMatchObject({count:2,available_count:2});
      const first=(await client.query("select fetch_library_collection_entries($1,'user','{}',null,'nl',1,1) value",[f.list])).rows[0].value;
      const second=(await client.query("select fetch_library_collection_entries($1,'user','{}',null,'nl',2,1) value",[f.list])).rows[0].value;
      expect(first.total).toBe(2);expect(second.total).toBe(2);
      expect([first.items[0].id,second.items[0].id].sort()).toEqual(f.entries.filter(id=>id!==archived).sort());
      await client.query("reset role");
      expect((await client.query("select private.training_headword_group_v1($1) id",[archived])).rows[0].id).toBe(groupBefore);
      const page1=await material(client,owner,f.list),page2=await material(client,owner,f.list,page1.page.nextGroupCursor);
      expect(page1.page.totalGroups).toBe(2);expect(page2.page.totalGroups).toBe(2);
      expect([...page1.items,...page2.items].map((item:{id:string})=>item.id).sort()).toEqual(f.entries.filter(id=>id!==archived).sort());
      expect((await client.query("select archived_at from word_entries where id=$1",[archived])).rows[0].archived_at).not.toBeNull();
      expect((await client.query("select count(*)::int n from user_word_list_items where list_id=$1",[f.list])).rows[0].n).toBe(3);
      expect((await client.query("select count(*)::int n from user_word_notes where word_entry_id=$1",[archived])).rows[0].n).toBe(1);
      expect((await client.query("select count(*)::int n from user_review_log where user_id=$1 and word_id=$2",[owner,archived])).rows[0].n).toBe(before);
      expect((await client.query("select count(*)::int n from user_card_status where user_id=$1 and entry_id=$2",[owner,archived])).rows[0].n).toBeGreaterThan(0);
    },owner);
  });

  test("archive closes exact/translation content reads and later source commands without affecting another active meaning", async () => {
    const owner=randomUUID();
    await withTransaction(pool,async client=>{
      const f=await fixture(client,owner),archived=f.entries[0],active=f.entries[1];
      const independent=(await client.query("select copy_entry_to_user_dictionary($1,$2,null,jsonb_build_object('headword',$3::text)) id",[owner,archived,`independent-${owner}`])).rows[0].id;
      await client.query("set local role authenticated");
      await client.query("select delete_user_dictionary_entry($1,$2)",[owner,archived]);
      expect((await client.query("select fetch_dictionary_entry_by_id_gated($1) value",[independent])).rows[0].value.id).toBe(independent);
      await expectDenied(client,"select update_user_dictionary_entry($1,$2,jsonb_build_object('headword','changed','languageCode','nl','definition','changed'))",[owner,archived]);
      await expectDenied(client,"select copy_entry_to_user_dictionary($1,$2,null,'{}')",[owner,archived]);
      await expectDenied(client,"select add_entry_to_user_list($1,$2,$3)",[owner,f.list,archived]);
      await expectDenied(client,"select start_learning_entry_card($1,$2,'word-to-definition')",[owner,archived]);
      await expectDenied(client,"select handle_card_review($1,$2,'word-to-definition','success',$3)",[owner,archived,randomUUID()]);
      expect((await client.query("select fetch_dictionary_entry_by_id_gated($1) value",[active])).rows[0].value.id).toBe(active);
      await client.query("reset role");
      const raw=(await client.query("select read_platform_v2_library_group($1,$2,50) value",[owner,archived])).rows[0].value;
      expect(raw.error).toBe('entry_not_accessible');
      // CI intentionally grants no raw table defaults. Model the existing
      // Supabase service-role SELECT privilege without changing production ACL.
      expect((await client.query("select rolbypassrls from pg_roles where rolname='service_role'")).rows[0].rolbypassrls).toBe(true);
      await client.query("grant select on public.word_entries to service_role");
      await client.query("set local role service_role");
      expect((await client.query("select dictionary_translation_source_v1($1) value",[archived])).rows[0].value).toBeNull();
      expect((await client.query("select dictionary_translation_source_v1($1) value",[active])).rows[0].value.word.id).toBe(active);
    },owner);
  });

  test("historical rows retain their identity and result but cannot reopen archived article or exercise text", async () => {
    const owner=randomUUID();
    await withTransaction(pool,async client=>{
      const f=await fixture(client,owner),entry=f.entries[0],node=randomUUID(),target=randomUUID();
      const privatePhrase="PRIVATE EXERCISE SHOULD NOT SURVIVE ARCHIVE";
      await client.query("insert into user_events(user_id,word_id,mode,event_type) values($1,$2,'word-to-definition','review_success')",[owner,entry]);
      await client.query(`insert into private.platform_v2_content_nodes(id,entry_id,kind,binding_state,first_source_revision,last_source_revision,source_text_fingerprint,diagnostic_locator,canonical_source_text)
        values($1,$2,'example','active','v1','v1','private-history-fingerprint','test-history',$3)`,[node,entry,privatePhrase]);
      await client.query(`insert into private.platform_v2_training_exercise_targets(id,entry_id,content_node_id,family,direction,source_revision,source_text_fingerprint)
        values($1,$2,$3,'translation','recall','v1','private-history-fingerprint')`,[target,entry,node]);
      await client.query(`insert into user_training_exercise_action_events(user_id,target_id,action,result,client_event_id,action_payload_hash)
        values($1,$2,'review-exercise','success',$3,'history-hash')`,[owner,target,randomUUID()]);
      await client.query("set local role authenticated");
      const before=(await client.query("select * from get_recent_training_history($1,now()-interval '1 day',50)",[owner])).rows;
      expect(before).toHaveLength(1);expect(JSON.stringify(before[0].raw)).toContain('Definition 0');
      expect((await client.query("select exercise_text from get_recent_training_activity_v1(50)")).rows[0].exercise_text).toBe(privatePhrase);
      await client.query("select delete_user_dictionary_entry($1,$2)",[owner,entry]);
      const history=(await client.query("select * from get_recent_training_history($1,now()-interval '1 day',50)",[owner])).rows;
      expect(history).toHaveLength(1);expect(history[0]).toMatchObject({id:entry,event_type:'review_success',raw:{}});
      const activity=(await client.query("select * from get_recent_training_activity_v1(50)")).rows;
      expect(activity).toHaveLength(1);expect(activity[0]).toMatchObject({entry_id:entry,review_result:'review_success',exercise_text:null});
      expect(JSON.stringify({history,activity})).not.toContain(privatePhrase);
      expect(JSON.stringify({history,activity})).not.toContain('Definition 0');
    },owner);
  });

  test("study-day history is retained while archived cards no longer count as future due work", async () => {
    const owner=randomUUID();
    await withTransaction(pool,async client=>{
      const f=await fixture(client,owner),entry=f.entries[0];
      await client.query(`insert into user_card_status(user_id,entry_id,card_type_id,fsrs_enabled,fsrs_stability,next_review_at,fsrs_last_interval,fsrs_reps)
        values($1,$2,'word-to-definition',true,3,now()-interval '1 hour',2,1)`,[owner,entry]);
      await client.query(`insert into user_review_log(user_id,word_id,mode,grade,review_type,reviewed_at)
        values($1,$2,'word-to-definition',3,'review',now())`,[owner,entry]);
      const read=async()=> (await client.query("select private.training_local_daily_stats_v1($1,ARRAY['word-to-definition'],$2,'user','UTC') value",[owner,f.list])).rows[0].value;
      expect(await read()).toMatchObject({reviewCardsDue:1,reviewCardsDone:1});
      await client.query("select delete_user_dictionary_entry($1,$2)",[owner,entry]);
      expect(await read()).toMatchObject({reviewCardsDue:0,reviewCardsDone:1});
      expect((await client.query("select get_training_stats($1,ARRAY['word-to-definition'],$2,'user') value",[owner,f.list])).rows[0].value).toMatchObject({today:1,totalItems:2});
      expect((await client.query("select get_detailed_training_stats($1,ARRAY['word-to-definition'],$2,'user') value",[owner,f.list])).rows[0].value).toMatchObject({reviewCardsDue:0,reviewCardsDone:1,totalWordsInList:2});
    },owner);
  });

  test("new queues never latch archived meanings; a previously latched unseen meaning yields only an unavailable diagnostic", async () => {
    const owner=randomUUID();
    await withTransaction(pool,async client=>{
      const f=await fixture(client,owner);
      const old=(await client.query("select start_training_session($1,ARRAY['word-to-definition'],$2,'user','both','{}','5') value",[owner,f.list])).rows[0].value;
      const first=(await client.query("select get_next_training_session_card($1,$2) value",[owner,old.sessionId])).rows[0].value;
      expect(first.id).toBeTruthy();
      await client.query("set local role authenticated");
      await client.query("select delete_user_dictionary_entry($1,$2)",[owner,first.id]);
      const unavailable=(await client.query("select get_next_training_session_card($1,$2) value",[owner,old.sessionId])).rows[0].value;
      expect(unavailable).toMatchObject({trainingSessionUnavailable:true,entryId:first.id,reason:'entry-archived'});
      expect(unavailable).not.toHaveProperty('word');expect(unavailable).not.toHaveProperty('raw');
      const retired=(await client.query("select mark_training_session_member_unavailable($1,$2,$3,'word-to-definition','entry-archived') value",[owner,old.sessionId,first.id])).rows[0].value;
      expect(retired.reason).toBe('entry-archived');
      const next=(await client.query("select get_next_training_session_card($1,$2) value",[owner,old.sessionId])).rows[0].value;
      expect(next.id).not.toBe(first.id);
      await expectDenied(client,"select mark_training_session_member_unavailable($1,$2,$3,'word-to-definition','entry-archived')",[owner,old.sessionId,next.id]);

      const fresh=(await client.query("select start_training_session($1,ARRAY['word-to-definition'],$2,'user','both','{}','5') value",[owner,f.list])).rows[0].value;
      expect(fresh.plannedTotal).toBe(2);
      await client.query("reset role");
      const members=(await client.query("select entry_id from training_session_members where session_id=$1",[fresh.sessionId])).rows;
      expect(members.map((row:{entry_id:string})=>row.entry_id)).not.toContain(first.id);
      expect(members).toHaveLength(2);
    },owner);
  });
});
