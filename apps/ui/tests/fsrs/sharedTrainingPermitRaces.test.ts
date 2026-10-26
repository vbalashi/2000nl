import {randomUUID} from "node:crypto";
import {writeFileSync} from "node:fs";
import {Pool,type PoolClient} from "pg";
import {afterAll,beforeAll,describe,expect,test} from "vitest";
import {ensureUserWithSettings,getDbUrl,runMigrations} from "./dbTestUtils";
const url=getDbUrl();
async function principal(c:PoolClient,id:string) { await c.query("select set_config('request.jwt.claim.sub',$1,true)",[id]); }
async function fixture(pool:Pool) {
  const c=await pool.connect();
  try {
    await c.query("begin");
    const owner=randomUUID(),viewer=randomUUID();
    for(const id of [owner,viewer]) await ensureUserWithSettings(c,id);
    await principal(c,owner);
    const entry=(await c.query("select create_user_dictionary_entry($1,null,$2) id",[owner,{headword:randomUUID(),languageCode:"nl",definition:"shared race meaning"}])).rows[0].id;
    const list=(await c.query("insert into user_word_lists(user_id,name) values($1,'permit race') returning id",[owner])).rows[0].id;
    await c.query("insert into user_word_list_items(list_id,word_id) values($1,$2)",[list,entry]);
    const code=(await c.query("select private.mutate_collection_share_v1($1,'open',$2,0) payload",[randomUUID(),list])).rows[0].payload.invitationCode;
    await principal(c,viewer); await c.query("select private.accept_collection_share_v1($1,$2)",[randomUUID(),code]);
    const run=(await c.query("select start_training_session($1,array['word-to-definition'],$2,'user','new','{}','5',$3) payload",[viewer,list,randomUUID()])).rows[0].payload.sessionId;
    await c.query("commit"); return {owner,viewer,entry,list,run};
  } catch(error) { await c.query("rollback"); throw error; } finally { c.release(); }
}
type Fixture=Awaited<ReturnType<typeof fixture>>;
async function cleanup(pool:Pool,f:Fixture) {
  const c=await pool.connect();
  try {
    await c.query("begin");
    await c.query("delete from private.training_current_card_permits where user_id=$1",[f.viewer]);
    await c.query("delete from training_active_runs where user_id=$1",[f.viewer]);
    await c.query("delete from training_run_start_receipts where user_id=$1",[f.viewer]);
    await c.query("alter table training_session_members disable trigger training_session_members_identity_immutable");
    await c.query("delete from training_sessions where user_id=$1",[f.viewer]);
    await c.query("alter table training_session_members enable trigger training_session_members_identity_immutable");
    await c.query("delete from auth.users where id=$1",[f.viewer]);
    await c.query("delete from word_entries where id=$1",[f.entry]);
    await c.query("delete from auth.users where id=any($1)",[[f.owner,f.viewer]]);
    await c.query("commit");
  } catch(error) { await c.query("rollback"); throw error; } finally { c.release(); }
}
async function blocked(pool:Pool,pid:number) {
  for(let n=0;n<200;n++) {
    if((await pool.query("select cardinality(pg_blocking_pids($1))>0 blocked",[pid])).rows[0].blocked) return;
    await new Promise(resolve=>setTimeout(resolve,10));
  }
  throw new Error("expected sharing authority contention");
}
async function acknowledge(c:PoolClient,f:Fixture) {
  return (await c.query("select acknowledge_current_training_card_v1($1,$2,$3,'word-to-definition',1,'untracked') payload",[f.viewer,f.run,f.entry])).rows[0].payload;
}
async function revoke(c:PoolClient,f:Fixture,kind:string) {
  if(kind==="close") await c.query("select private.mutate_collection_share_v1($1,'close',$2,1)",[randomUUID(),f.list]);
  else if(kind==="unsubscribe") {
    await principal(c,f.viewer);
    await c.query("select private.unsubscribe_collection_share_v1($1,$2)",[randomUUID(),f.list]);
  } else if(kind==="delete") {
    await c.query("set local role authenticated");
    await c.query("select delete_user_word_list($1,$2)",[f.owner,f.list]);
  } else await c.query("delete from user_word_list_items where list_id=$1 and word_id=$2",[f.list,f.entry]);
}
(url?describe:describe.skip)("shared displayed-card issuance serialization",()=>{
  const pool=new Pool({connectionString:url});beforeAll(async()=>{
    await runMigrations(pool);
    if(process.env.SHARED_MUTATION_EXPECT_JIT) expect((await pool.query("show jit")).rows[0].jit).toBe(process.env.SHARED_MUTATION_EXPECT_JIT);
    if(process.env.SHARED_MUTATION_RUNTIME_EVIDENCE_PATH) writeFileSync(process.env.SHARED_MUTATION_RUNTIME_EVIDENCE_PATH,JSON.stringify((await pool.query("select name,setting from pg_settings where name in ('server_version','jit','jit_above_cost','jit_provider','max_parallel_workers_per_gather','shared_preload_libraries','session_preload_libraries','plan_cache_mode') order by name")).rows,null,2));
  });afterAll(()=>pool.end());
  for(const kind of ["close","remove","delete","unsubscribe"]) for(const first of ["ack","revoke"]) test(`${kind}: ${first} commits first`,async()=>{
    const f=await fixture(pool),a=await pool.connect(),b=await pool.connect();
    try {
      await a.query("begin");await b.query("begin");
      await principal(a,f.viewer);await a.query("set local role authenticated");await principal(b,f.owner);
      const aPid=(await a.query("select pg_backend_pid() pid")).rows[0].pid;
      const bPid=(await b.query("select pg_backend_pid() pid")).rows[0].pid;
      if(first==="ack") {
        const permit=await acknowledge(a,f);
        const pending=revoke(b,f,kind);await blocked(pool,bPid);
        await a.query("commit");await pending;await b.query("commit");
        await a.query("begin");await principal(a,f.viewer);await a.query("set local role authenticated");
        const payload=(await a.query("select read_current_training_entry_v1($1,$2,$3) payload",[f.viewer,f.run,permit.permitId])).rows[0].payload;
        expect(payload.items.map((item:{id:string})=>item.id)).toEqual([f.entry]);
      } else {
        await revoke(b,f,kind);
        const pending=acknowledge(a,f).then(()=>({message:"unexpected success"}),error=>error as Error);
        await blocked(pool,aPid);await b.query("commit");
        expect((await pending).message).toContain("current_training_entry_unavailable");
      }
    } finally {
      await a.query("rollback");await b.query("rollback");a.release();b.release();await cleanup(pool,f);
    }
  });
  test("a newly accepted unlocked path cannot replace the revoked path while ACK waits",async()=>{
    const f=await fixture(pool),a=await pool.connect(),b=await pool.connect(),third=await pool.connect();
    try {
      await third.query("begin");await principal(third,f.owner);
      const list=(await third.query("insert into user_word_lists(user_id,name) values($1,'new path') returning id",[f.owner])).rows[0].id;
      await third.query("insert into user_word_list_items(list_id,word_id) values($1,$2)",[list,f.entry]);
      const code=(await third.query("select private.mutate_collection_share_v1($1,'open',$2,0) payload",[randomUUID(),list])).rows[0].payload.invitationCode;
      await third.query("commit");
      await a.query("begin");await principal(a,f.viewer);await a.query("set local role authenticated");
      await b.query("begin");await principal(b,f.owner);await revoke(b,f,"close");
      const pid=(await a.query("select pg_backend_pid() pid")).rows[0].pid;
      const pending=acknowledge(a,f).then(()=>({message:"unexpected success"}),error=>error as Error);
      await blocked(pool,pid);
      await third.query("begin");await principal(third,f.viewer);
      const thirdPid=(await third.query("select pg_backend_pid() pid")).rows[0].pid;
      const acceptance=third.query("select private.accept_collection_share_v1($1,$2)",[randomUUID(),code]);
      await blocked(pool,thirdPid);
      await b.query("commit");expect((await pending).message).toContain("current_training_entry_unavailable");
      await acceptance;await third.query("commit");
      await a.query("rollback");await a.query("begin");await principal(a,f.viewer);await a.query("set local role authenticated");
      expect((await acknowledge(a,f)).entryId).toBe(f.entry);
    } finally {
      await a.query("rollback");await b.query("rollback");await third.query("rollback");
      a.release();b.release();third.release();await cleanup(pool,f);
    }
  });

  for(const kind of ["close","remove","delete","unsubscribe"]) for(const first of ["action","revoke"]) for(const action of ["v2","legacy","exclude","resume"]) test(`${kind}: ${action} mutation, ${first} first`,async()=>{
    const f=await fixture(pool),a=await pool.connect(),b=await pool.connect();
    try {
      await a.query("begin");await principal(a,f.viewer);
      const revision=(await a.query("select get_meaning_learning_progress_v1($1) payload",[f.entry])).rows[0].payload.revision;
      await a.query("select set_config('request.jwt.claim.role',$1,true)",[action==="legacy"?"authenticated":"service_role"]);
      await a.query(action==="legacy"?"set local role authenticated":"set local role service_role");
      await b.query("begin");await principal(b,f.owner);
      const aPid=(await a.query("select pg_backend_pid() pid")).rows[0].pid;
      const bPid=(await b.query("select pg_backend_pid() pid")).rows[0].pid;
      const mutate=async()=>{
        if(action==="v2") await a.query("select perform_platform_v2_card_action_as_principal($1,'start-learning',$2,'word-to-definition','untracked',null,null,null,$3,null,'first_party',null)",[f.viewer,f.entry,randomUUID()]);
        else if(action==="legacy") await a.query("select start_learning_entry_card($1,$2,'word-to-definition')",[f.viewer,f.entry]);
        else if(action==="exclude") await a.query("select perform_training_headword_exclusion_as_principal_v1($1,'exclude-headword',$2,$3,null,null,null)",[f.viewer,randomUUID(),f.entry]);
        else await a.query("select resume_meaning_learning_as_principal_v1($1,$2,$3,$4)",[f.viewer,f.entry,revision,randomUUID()]);
      };
      if(first==="action") {
        await mutate();const pending=revoke(b,f,kind);await blocked(pool,bPid);
        await a.query("commit");await pending;await b.query("commit");
      } else {
        await revoke(b,f,kind);const pending=mutate().then(()=>({message:"unexpected success"}),error=>error as Error);
        await blocked(pool,aPid);await b.query("commit");
        expect((await pending).message).toMatch(/entry_not_accessible|dictionary access denied|exclusion_target_unavailable|meaning_unavailable/);
        expect((await pool.query("select count(*)::int n from user_card_status where user_id=$1",[f.viewer])).rows[0].n).toBe(0);
      }
    } finally {
      await a.query("rollback");await b.query("rollback");a.release();b.release();await cleanup(pool,f);
    }
  });

  test("different learners share author admission without serializing their progress writes",async()=>{
    const f=await fixture(pool),other=randomUUID(),a=await pool.connect(),b=await pool.connect();
    try {
      await b.query("begin");await ensureUserWithSettings(b,other);
      await b.query("insert into private.collection_sharing_subscriptions(user_id,root_id,access_lifetime) select $1,id,access_lifetime from private.collection_sharing_roots where collection_id=$2",[other,f.list]);await b.query("commit");
      for(const [c,id] of [[a,f.viewer],[b,other]] as const) {
        await c.query("begin");await principal(c,id);await c.query("select set_config('request.jwt.claim.role','service_role',true)");await c.query("set local role service_role");
      }
      const act=async(c:PoolClient,id:string)=>(await c.query("select perform_platform_v2_card_action_as_principal($1,'start-learning',$2,'word-to-definition','untracked',null,null,null,$3,null,'first_party',null) payload",[id,f.entry,randomUUID()])).rows[0].payload;
      expect((await act(a,f.viewer)).status).toBe("accepted");
      // A remains uncommitted; an exclusive admission implementation would fail
      // this lock-only bound rather than silently serializing every student.
      await b.query("set local lock_timeout='500ms'");expect((await act(b,other)).status).toBe("accepted");
    } finally {
      await a.query("rollback");await b.query("rollback");a.release();b.release();
      await pool.query("delete from auth.users where id=$1",[other]);await cleanup(pool,f);
    }
  });
  test("unsupported service-role legacy calls reject without corrupting the connection",async()=>{
    const f=await fixture(pool),c=await pool.connect();
    try {
      await c.query("begin");await principal(c,f.viewer);await c.query("set local role service_role");
      await c.query("savepoint rejected_role");
      await expect(c.query("select start_learning_entry_card($1,$2,'word-to-definition')",[f.viewer,f.entry])).rejects.toThrow("permission denied for function start_learning_entry_card");
      await c.query("rollback to savepoint rejected_role");
      expect((await c.query("select 1 ok")).rows[0].ok).toBe(1);
    } finally {await c.query("rollback");c.release();await cleanup(pool,f);}
  });
  test("authority fence helpers cannot be called by API roles",async()=>{
    for(const role of ["anon","authenticated","service_role"]) for(const signature of ["private.lock_sharing_author_scope_v1(uuid,boolean)","private.lock_shared_learning_source_v1(uuid,uuid)","private.guard_shared_collection_delete_v1()"]) {
      expect((await pool.query("select has_function_privilege($1,$2,'execute') allowed",[role,signature])).rows[0].allowed).toBe(false);
    }
  });
  test("Known resume and session actions share run-before-source ordering",async()=>{
    const f=await fixture(pool),a=await pool.connect(),b=await pool.connect(),holder=await pool.connect();
    let pendingA:Promise<any>|undefined,pendingB:Promise<any>|undefined;
    const aPid=(await a.query("select pg_backend_pid() pid")).rows[0].pid;
    const bPid=(await b.query("select pg_backend_pid() pid")).rows[0].pid;
    try {
      await holder.query("begin");await principal(holder,f.viewer);await holder.query("select set_config('request.jwt.claim.role','service_role',true)");
      const mark=(await holder.query("select perform_platform_v2_card_action_as_principal($1,'mark-known',$2,'word-to-definition','untracked',null,null,null,$3,null,'first_party',null) payload",[f.viewer,f.entry,randomUUID()])).rows[0].payload;
      const progress=(await holder.query("select get_meaning_learning_progress_v1($1) payload",[f.entry])).rows[0].payload;
      await holder.query("commit");await holder.query("begin");
      await holder.query("select id from word_entries where id=$1 for update",[f.entry]);
      await a.query("begin");await principal(a,f.viewer);await a.query("select set_config('request.jwt.claim.role','service_role',true)");await a.query("set local role service_role");
      pendingA=a.query("select resume_meaning_learning_as_principal_v1($1,$2,$3,$4) payload",[f.viewer,f.entry,progress.revision,randomUUID()]).then(result=>result.rows[0].payload,error=>({error:error.message}));
      await blocked(pool,aPid);
      await b.query("begin");await principal(b,f.viewer);await b.query("select set_config('request.jwt.claim.role','service_role',true)");await b.query("set local role service_role");
      pendingB=b.query("select perform_platform_v2_card_action_as_principal($1,'review-card',$2,'word-to-definition',$3,null,null,'success',$4,null,'first_party',null,$5) payload",[f.viewer,f.entry,mark.card.stateRevision,randomUUID(),f.run]).then(result=>result.rows[0].payload,error=>({error:error.message}));
      await blocked(pool,bPid);
      expect((await pool.query("select $1=any(pg_blocking_pids($2)) expected",[aPid,bPid])).rows[0].expected).toBe(true);
      await holder.query("commit");expect((await pendingA).status).toBe("accepted");await a.query("commit");
      expect((await pendingB).error).toMatch(/platform_card_state_conflict|platform_known_mark_conflict/);
    } finally {
      await pool.query("select pg_cancel_backend($1),pg_cancel_backend($2)",[aPid,bPid]);
      await holder.query("rollback");if(pendingA)await pendingA;if(pendingB)await pendingB;
      await a.query("rollback");await b.query("rollback");a.release();b.release();holder.release();await cleanup(pool,f);
    }
  });

});
