import {randomUUID} from "node:crypto";
import {Pool,type PoolClient} from "pg";
import {afterAll,beforeAll,describe,expect,test} from "vitest";
import {ensureUserWithSettings,getDbUrl,runMigrations,withTransaction} from "./dbTestUtils";
const url=getDbUrl();
const suite=url?describe:describe.skip;
type Permit={permitId:string;expiresAt:string;runGeneration:number;entryId:string;cardTypeId:string;contentVersion:number};
async function role(c:PoolClient,user:string,kind="authenticated") {
 await c.query("reset role");
 await c.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claim.role',$2,true)",[user,kind]);
 await c.query(`set local role ${kind}`);
}
async function rejected(c:PoolClient,call:()=>Promise<unknown>,message:RegExp) {
 await c.query("savepoint expected_failure");await expect(call()).rejects.toThrow(message);
 await c.query("rollback to savepoint expected_failure");await c.query("release savepoint expected_failure");
}
async function session(c:PoolClient,user:string,card="word-to-definition",family="meaning") {
 return (await c.query(`insert into training_sessions(user_id,session_size,card_type_ids,card_filter,
  planned_new,planned_total,requested_total,exercise_family)
  values($1,'5',array[$2]::text[],'new',2,2,5,$3) returning id`,[user,card,family])).rows[0].id as string;
}
async function fixture(c:PoolClient) {
 const user=randomUUID();await ensureUserWithSettings(c,user);
 await c.query("select set_config('request.jwt.claim.sub',$1,true)",[user]);
 const ids:string[]=[];
 for(let i=0;i<2;i++)ids.push((await c.query("select create_user_dictionary_entry($1,null,$2) id",[user,JSON.stringify({headword:`permit-${i}-${randomUUID()}`,languageCode:"nl",definition:`Meaning ${i}`,partOfSpeech:"noun",example:{source:"Een kort voorbeeld."}})])).rows[0].id);
 const run=await session(c,user);
 for(const [i,id]of ids.entries())await c.query("insert into training_session_members(session_id,ordinal,entry_id,card_type_id,queue_source) values($1,$2,$3,'word-to-definition','new')",[run,i+1,id]);
 await role(c,user);return {user,ids,run};
}
async function acknowledge(c:PoolClient,f:{user:string;run:string},entry:string,version=1,state="untracked",target:string|null=null,direction:string|null=null,card="word-to-definition"):Promise<Permit> {
 return (await c.query("select acknowledge_current_training_card_v1($1,$2,$3,$4,$5,$6,$7,$8) permit",[f.user,f.run,entry,card,version,state,target,direction])).rows[0].permit;
}
async function read(c:PoolClient,f:{user:string;run:string},permit:string) {
 return (await c.query("select read_current_training_entry_v1($1,$2,$3) payload",[f.user,f.run,permit])).rows[0].payload;
}
async function exerciseFixture(c:PoolClient,family:string,direction:string,kind:string) {
 const f=await fixture(c);await c.query("reset role");
 const node=(await c.query(`insert into private.platform_v2_content_nodes(entry_id,kind,binding_state,first_source_revision,last_source_revision,
  source_native_key,source_text_fingerprint,diagnostic_locator,identity_evidence,reconciliation_decision)
  values($1,$2,'active','permit-v1','permit-v1',$3,'permit-fingerprint','raw.example.source','{}','{}') returning id`,[f.ids[0],kind,randomUUID()])).rows[0].id;
 const target=(await c.query(`insert into private.platform_v2_training_exercise_targets(entry_id,content_node_id,family,direction,source_revision,source_text_fingerprint)
  values($1,$2,$3,$4,'permit-v1','permit-fingerprint') returning id`,[f.ids[0],node,family,direction])).rows[0].id;
 const card=`${family}:${direction}`,run=await session(c,f.user,card,family);
 await c.query("insert into training_session_exercise_members(session_id,target_id,ordinal,queue_source) values($1,$2,1,'new')",[run,target]);
 await role(c,f.user);return {...f,run,card,target,node};
}
async function beginUser(pool:Pool,user:string) {
 const c=await pool.connect();await c.query("begin");await role(c,user);
 const pid=(await c.query("select pg_backend_pid() pid")).rows[0].pid as number;return {c,pid};
}
async function blocked(pool:Pool,pid:number) {
 for(let i=0;i<100;i++) {
  if((await pool.query("select cardinality(pg_blocking_pids($1))>0 blocked",[pid])).rows[0].blocked)return;
  await new Promise(resolve=>setTimeout(resolve,10));
 }
 throw new Error("expected entry lock contention");
}
async function committedFixture(pool:Pool) {
 const c=await pool.connect();try{await c.query("begin");const f=await fixture(c);await c.query("commit");return f;}
 catch(error){await c.query("rollback");throw error;}finally{c.release();}
}
async function cleanupCommittedFixture(pool:Pool,f:{user:string;ids:string[]}) {
 const c=await pool.connect();try{
  await c.query("begin");
  await c.query("delete from private.training_current_card_permits where user_id=$1",[f.user]);
  await c.query("delete from training_active_runs where user_id=$1",[f.user]);
  await c.query("alter table training_session_members disable trigger training_session_members_identity_immutable");
  await c.query("delete from training_sessions where user_id=$1",[f.user]);
  await c.query("alter table training_session_members enable trigger training_session_members_identity_immutable");
  await c.query("delete from word_entries where id=any($1::uuid[])",[f.ids]);
  await c.query("delete from auth.users where id=$1",[f.user]);await c.query("commit");
 }catch(error){await c.query("rollback");throw error;}finally{c.release();}
}
suite("current displayed training card permit",()=>{
 const pool=new Pool({connectionString:url});beforeAll(()=>runMigrations(pool));afterAll(()=>pool.end());
 test("explicit display protects only one exact meaning; archive before display and queued ACK are denied",async()=>{
  await withTransaction(pool,async c=>{
   const f=await fixture(c);
   await rejected(c,()=>acknowledge(c,f,f.ids[1]),/current_training_target_not_next/);
   const permit=await acknowledge(c,f,f.ids[0]);
   const again=await acknowledge(c,f,f.ids[0]);expect(again).toEqual(permit);
   await c.query("select delete_user_dictionary_entry($1,$2)",[f.user,f.ids[0]]);
   expect(await acknowledge(c,f,f.ids[0])).toEqual(permit);
   const current=await read(c,f,permit.permitId);
   expect(current.items.map((item:{id:string})=>item.id)).toEqual([f.ids[0]]);
   expect(current.items[0].platform_v2_identity.entryId).toBe(f.ids[0]);
   expect(current.currentTarget).toMatchObject({permitId:permit.permitId,sessionId:f.run,entryId:f.ids[0],cardTypeId:'word-to-definition',targetId:null,direction:null,contentVersion:1,stateRevision:'untracked'});
   expect((await c.query("select fetch_dictionary_entry_by_id_gated($1) value",[f.ids[0]])).rows[0].value).toBeNull();
   await rejected(c,()=>c.query("select mark_training_session_member_unavailable($1,$2,$3,'word-to-definition','entry-archived')",[f.user,f.run,f.ids[0]]),/current_training_card_protected/);
   await c.query("select delete_user_dictionary_entry($1,$2)",[f.user,f.ids[1]]);
   await rejected(c,()=>acknowledge(c,f,f.ids[1]),/current_training_entry_unavailable/);
   expect((await read(c,f,randomUUID())).error).toBe('current_training_permit_invalid');
  });
 });
 test("state/content revision, expiry, target replacement and takeover fence permits",async()=>{
  await withTransaction(pool,async c=>{
   const f=await fixture(c),permit=await acknowledge(c,f,f.ids[0]);
   await rejected(c,()=>acknowledge(c,f,f.ids[0],2),/current_training_content_changed/);
   await rejected(c,()=>acknowledge(c,f,f.ids[0],1,'wrong'),/current_training_state_changed/);
   await c.query("reset role");
   await c.query("update private.training_current_card_permits set issued_at=now()-interval '2 hours',expires_at=now()-interval '1 hour' where user_id=$1",[f.user]);
   await role(c,f.user);expect((await read(c,f,permit.permitId)).error).toBe('current_training_permit_invalid');
   const renewed=await acknowledge(c,f,f.ids[0]);expect(renewed.permitId).not.toBe(permit.permitId);
   await c.query("reset role");
   await c.query("update training_session_members set consumed_at=now() where session_id=$1 and entry_id=$2",[f.run,f.ids[0]]);
   await role(c,f.user);
   const next=await acknowledge(c,f,f.ids[1]);expect(next.permitId).not.toBe(renewed.permitId);
   expect((await read(c,f,renewed.permitId)).error).toBe('current_training_permit_invalid');
   await c.query("reset role");await session(c,f.user);await role(c,f.user);
   await rejected(c,()=>read(c,f,next.permitId),/training_session_superseded/);
  });
 });
 test("discarding ephemeral permit authority preserves archived identity and review history",async()=>{
  await withTransaction(pool,async c=>{
   const f=await fixture(c),permit=await acknowledge(c,f,f.ids[0]);
   await c.query("select delete_user_dictionary_entry($1,$2)",[f.user,f.ids[0]]);
   await c.query("reset role");
   await c.query("insert into user_review_log(user_id,word_id,mode,grade,review_type) values($1,$2,'word-to-definition',3,'review')",[f.user,f.ids[0]]);
   await c.query("delete from private.training_current_card_permits where user_id=$1",[f.user]);
   expect((await c.query("select count(*)::int n from word_entries where id=$1 and archived_at is not null",[f.ids[0]])).rows[0].n).toBe(1);
   expect((await c.query("select count(*)::int n from user_review_log where user_id=$1 and word_id=$2",[f.user,f.ids[0]])).rows[0].n).toBe(1);
   await role(c,f.user);expect((await read(c,f,permit.permitId)).error).toBe('current_training_permit_invalid');
  });
 });
 test("foreign user and direct private storage access fail closed",async()=>{
  await withTransaction(pool,async c=>{
   const f=await fixture(c),permit=await acknowledge(c,f,f.ids[0]);
   await rejected(c,()=>c.query("select * from private.training_current_card_permits"),/permission denied/);
   await rejected(c,()=>c.query("select private.current_training_entry_permitted_v1($1,$2)",[f.user,f.ids[0]]),/permission denied/);
   await c.query("reset role");const other=randomUUID();await ensureUserWithSettings(c,other);await role(c,other);
   await rejected(c,()=>read(c,f,permit.permitId),/unauthorized/);
   await rejected(c,()=>acknowledge(c,f,f.ids[0]),/unauthorized/);
  });
 });
 test("a changed source invalidates a permit and Library/legacy paths cannot borrow the current exception",async()=>{
  await withTransaction(pool,async c=>{
   const f=await fixture(c),old=await acknowledge(c,f,f.ids[0]);
   await c.query("reset role");
   await c.query("update word_entries set raw=jsonb_set(raw,'{definition}',to_jsonb('Changed source'::text)) where id=$1",[f.ids[0]]);
   await role(c,f.user);
   expect((await read(c,f,old.permitId)).error).toBe('current_training_permit_invalid');
   await rejected(c,()=>acknowledge(c,f,f.ids[0]),/current_training_content_changed/);
   await acknowledge(c,f,f.ids[0],2);
   await c.query("select delete_user_dictionary_entry($1,$2)",[f.user,f.ids[0]]);
   await rejected(c,()=>c.query("select start_learning_entry_card($1,$2,'word-to-definition')",[f.user,f.ids[0]]),/word entry not found/);
   await role(c,f.user,'service_role');
   for(const scoped of [false,true]) {
    const query=scoped
      ? "select perform_platform_v2_card_action_as_principal($1,'start-learning',$2,'word-to-definition','untracked',null,null,null,$3,null,'first_party',null,null)"
      : "select perform_platform_v2_card_action_as_principal($1,'start-learning',$2,'word-to-definition','untracked',null,null,null,$3,null,'first_party',null)";
    await rejected(c,()=>c.query(query,[f.user,f.ids[0],randomUUID()]),/entry_not_accessible/);
   }
  });
 });
 test("a displayed archived ordinary card can finish and its committed action remains replayable",async()=>{
  await withTransaction(pool,async c=>{
   const f=await fixture(c),permit=await acknowledge(c,f,f.ids[0]);
   await c.query("select delete_user_dictionary_entry($1,$2)",[f.user,f.ids[0]]);
   const event=randomUUID();await role(c,f.user,'service_role');
   const call=()=>c.query("select perform_platform_v2_card_action_as_principal($1,'start-learning',$2,'word-to-definition','untracked',null,null,null,$3,null,'first_party',null,$4) result",[f.user,f.ids[0],event,f.run]);
   expect((await call()).rows[0].result.status).toBe('accepted');
   expect((await call()).rows[0].result.status).toBe('duplicate');
   await role(c,f.user);expect((await read(c,f,permit.permitId)).error).toBe('current_training_permit_invalid');
   await rejected(c,()=>acknowledge(c,f,f.ids[0]),/current_training_entry_unavailable/);
  });
 });
 test.each([['idiom','direct','idiom'],['translation','recall','example']])("%s permits bind target, direction, source node and revision",async(family,direction,kind)=>{
  await withTransaction(pool,async c=>{
   const f=await exerciseFixture(c,family,direction,kind),{target,node,card}=f;
   const exercise={user:f.user,run:f.run};
   await rejected(c,()=>acknowledge(c,exercise,f.ids[0],1,'untracked',target,'wrong',card),/current_training_target_invalid/);
   const permit=await acknowledge(c,exercise,f.ids[0],1,'untracked',target,direction,card);
   await c.query("select delete_user_dictionary_entry($1,$2)",[f.user,f.ids[0]]);
   expect((await read(c,exercise,permit.permitId)).items).toHaveLength(1);
   await c.query("reset role");await c.query("update private.platform_v2_content_nodes set source_text_fingerprint='changed' where id=$1",[node]);await role(c,f.user);
   expect((await read(c,exercise,permit.permitId)).error).toBe('current_training_permit_invalid');
  });
 });
 test.each([['idiom','direct','idiom'],['translation','recall','example']])("displayed archived %s target can finish once and reconcile its receipt",async(family,direction,kind)=>{
  await withTransaction(pool,async c=>{
   const f=await exerciseFixture(c,family,direction,kind);
   const permit=await acknowledge(c,f,f.ids[0],1,'untracked',f.target,direction,f.card);
   await c.query("select delete_user_dictionary_entry($1,$2)",[f.user,f.ids[0]]);
   await role(c,f.user,'service_role');const event=randomUUID();
   await rejected(c,()=>c.query(`select perform_platform_v2_${family}_exercise_action_as_principal_v1($1,$2,'untracked','success',$3,$4,null,null)`,[f.user,f.target,randomUUID(),direction]),/training_exercise_source_not_eligible/);
   const call=()=>c.query(`select perform_platform_v2_${family}_exercise_action_as_principal_v1($1,$2,'untracked','success',$3,$4,$5,null) result`,[f.user,f.target,event,direction,f.run]);
   expect((await call()).rows[0].result.status).toBe('accepted');
   expect((await call()).rows[0].result.status).toBe('duplicate');
   await role(c,f.user);expect((await read(c,f,permit.permitId)).error).toBe('current_training_permit_invalid');
  });
 });
 test.each([true,false])("archive and display acknowledgement serialize: acknowledgement first=%s",async(acknowledgementFirst)=>{
  const f=await committedFixture(pool),a=await beginUser(pool,f.user),b=await beginUser(pool,f.user);
  try {
   if(acknowledgementFirst) {
    const permit=await acknowledge(a.c,f,f.ids[0]);
    const archive=b.c.query("select delete_user_dictionary_entry($1,$2)",[f.user,f.ids[0]]);
    await blocked(pool,b.pid);await a.c.query("commit");await archive;await b.c.query("commit");
    await a.c.query("begin");await role(a.c,f.user);
    expect((await read(a.c,f,permit.permitId)).items).toHaveLength(1);
   } else {
    await b.c.query("select delete_user_dictionary_entry($1,$2)",[f.user,f.ids[0]]);
    const acknowledgement=acknowledge(a.c,f,f.ids[0]);
    const assertion=expect(acknowledgement).rejects.toThrow(/current_training_entry_unavailable/);
    await blocked(pool,a.pid);await b.c.query("commit");await assertion;
   }
  } finally {
   await a.c.query("rollback");await b.c.query("rollback");a.c.release();b.c.release();await cleanupCommittedFixture(pool,f);
  }
 });

});
