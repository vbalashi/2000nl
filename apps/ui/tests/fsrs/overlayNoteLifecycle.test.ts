import {randomUUID} from "node:crypto";
import {Pool,type PoolClient} from "pg";
import {afterAll,beforeAll,describe,expect,test} from "vitest";
import {ensureUserWithSettings,getDbUrl,runMigrations,withTransaction} from "./dbTestUtils";
const url=getDbUrl();
async function fixture(c:PoolClient){
  const owner=randomUUID(),other=randomUUID();
  for(const id of [owner,other])await ensureUserWithSettings(c,id);
  await c.query("select set_config('request.jwt.claim.sub',$1,true)",[owner]);
  const entry=(await c.query("select create_user_dictionary_entry($1,null,$2) id",[owner,{headword:randomUUID(),languageCode:"nl",definition:"note lifecycle"}])).rows[0].id;
  return {owner,other,entry};
}
async function denied(c:PoolClient,query:string,args:unknown[],message:string){
  await c.query("savepoint note_denied");
  await expect(c.query(query,args)).rejects.toThrow(message);
  await c.query("rollback to savepoint note_denied");
}
(url?describe:describe.skip)("overlay note lifecycle",()=>{
  const pool=new Pool({connectionString:url});beforeAll(()=>runMigrations(pool));afterAll(()=>pool.end());
  test("own note HTTP revision tokens retain bigint precision and reject stale updates",async()=>withTransaction(pool,async c=>{
    const f=await fixture(c);
    await c.query("insert into private.user_word_note_revisions(user_id,word_entry_id,revision) values($1,$2,9007199254740993)",[f.owner,f.entry]);
    await c.query("set local role authenticated");
    expect((await c.query("select read_entry_note_v1($1) value",[f.entry])).rows[0].value.revision).toBe("9007199254740993");
    expect((await c.query("select write_entry_note_v1($1,$2,'exact version') value",[f.entry,"9007199254740993"])).rows[0].value.revision).toBe("9007199254740994");
    await denied(c,"select write_entry_note_v1($1,$2,'stale')",[f.entry,"9007199254740993"],"note_changed");
    expect((await c.query("select write_entry_note_v1($1,$2,null) value",[f.entry,"9007199254740994"])).rows[0].value).toMatchObject({notes:null,revision:"9007199254740995"});
  }));
  test("authenticated compare-revision writes preserve a deletion clock and keep reads personal",async()=>withTransaction(pool,async c=>{
    const f=await fixture(c);await c.query("set local role authenticated");
    const read=async()=>(await c.query("select read_entry_note_v1($1) payload",[f.entry])).rows[0].payload;
    const write=async(revision:number,notes:string|null)=>(await c.query("select write_entry_note_v1($1,$2,$3) payload",[f.entry,revision,notes])).rows[0].payload;
    expect(await read()).toEqual({entryId:f.entry,notes:null,revision:"0"});
    expect(await write(0,"first")).toMatchObject({notes:"first",revision:"1"});
    expect(await write(1,"first")).toMatchObject({notes:"first",revision:"1"});
    await denied(c,"select write_entry_note_v1($1,0,'lost update')",[f.entry],"note_changed");
    expect(await write(1,"second")).toMatchObject({notes:"second",revision:"2"});
    expect(await write(2,null)).toMatchObject({notes:null,revision:"3"});
    expect(await write(3,null)).toMatchObject({notes:null,revision:"3"});
    expect(await write(3,"third")).toMatchObject({notes:"third",revision:"4"});
    await c.query("select set_config('request.jwt.claim.sub',$1,true)",[f.other]);
    await denied(c,"select read_entry_note_v1($1)",[f.entry],"note_entry_unavailable");
    await denied(c,"select write_entry_note_v1($1,4,'foreign')",[f.entry],"note_entry_unavailable");
  }));
  test("absent→insert→delete invalidates an otherwise identical copy preview",async()=>withTransaction(pool,async c=>{
    const f=await fixture(c);await c.query("set local role authenticated");
    const before=(await c.query("select preview_independent_entry_copy_v1($1) payload",[f.entry])).rows[0].payload;
    await c.query("select write_entry_note_v1($1,0,'temporary')",[f.entry]);
    await c.query("select write_entry_note_v1($1,1,null)",[f.entry]);
    const after=(await c.query("select preview_independent_entry_copy_v1($1) payload",[f.entry])).rows[0].payload;
    expect(after.revision).not.toBe(before.revision);
    await denied(c,"select copy_independent_entry_v1($1,$2,$3)",[randomUUID(),f.entry,before.revision],"copy_source_changed");
  }));
  test("same note id/text/timestamp after an ABA still invalidates the copy token",async()=>withTransaction(pool,async c=>{
    const f=await fixture(c);
    await c.query("insert into user_word_notes(user_id,word_entry_id,notes) values($1,$2,'A')",[f.owner,f.entry]);
    const before=(await c.query("select preview_independent_entry_copy_v1($1) payload",[f.entry])).rows[0].payload;
    await c.query("update user_word_notes set notes='B' where user_id=$1 and word_entry_id=$2",[f.owner,f.entry]);
    await c.query("update user_word_notes set notes='A' where user_id=$1 and word_entry_id=$2",[f.owner,f.entry]);
    const after=(await c.query("select preview_independent_entry_copy_v1($1) payload",[f.entry])).rows[0].payload;
    expect(after.revision).not.toBe(before.revision);
  }));
  test("raw overlay DML is closed while the exact RPC remains available",async()=>withTransaction(pool,async c=>{
    const f=await fixture(c);
    for(const role of ["authenticated","service_role","anon"]){
      const rights=(await c.query("select has_table_privilege($1,'public.user_word_notes','INSERT') i,has_table_privilege($1,'public.user_word_notes','UPDATE') u,has_table_privilege($1,'public.user_word_notes','DELETE') d,has_table_privilege($1,'private.user_word_note_revisions','SELECT') clock",[role])).rows[0];
      expect(rights).toEqual({i:false,u:false,d:false,clock:false});
    }
    await c.query("set local role authenticated");
    await denied(c,"insert into user_word_notes(user_id,word_entry_id,notes) values($1,$2,'raw')",[f.owner,f.entry],"permission denied");
    await denied(c,"select write_entry_note_v1($1,-1,'bad')",[f.entry],"invalid_note_request");
    await denied(c,"select write_entry_note_v1($1,0,repeat('a',65537))",[f.entry],"invalid_note_request");
  }));
  test("source deletion cascades do not resurrect note clocks",async()=>withTransaction(pool,async c=>{
    const f=await fixture(c);
    await c.query("select write_entry_note_v1($1,0,'retained')",[f.entry]);
    await c.query("delete from word_entries where id=$1",[f.entry]);
    expect((await c.query("select count(*)::int n from private.user_word_note_revisions where word_entry_id=$1",[f.entry])).rows[0].n).toBe(0);
  }));
  test("a subscriber edits only their own retained overlay across revoke and reaccept",async()=>withTransaction(pool,async c=>{
    const f=await fixture(c);
    await c.query("select write_entry_note_v1($1,0,'owner note')",[f.entry]);
    const list=(await c.query("insert into user_word_lists(user_id,name) values($1,'notes') returning id",[f.owner])).rows[0].id;
    await c.query("insert into user_word_list_items(list_id,word_id) values($1,$2)",[list,f.entry]);
    const code=(await c.query("select private.mutate_collection_share_v1($1,'open',$2,0) payload",[randomUUID(),list])).rows[0].payload.invitationCode;
    await c.query("select set_config('request.jwt.claim.sub',$1,true)",[f.other]);
    await c.query("select private.accept_collection_share_v1($1,$2)",[randomUUID(),code]);
    await c.query("set local role authenticated");
    expect((await c.query("select read_entry_note_v1($1) payload",[f.entry])).rows[0].payload).toMatchObject({notes:null,revision:"0"});
    await c.query("select write_entry_note_v1($1,0,'viewer note')",[f.entry]);
    await c.query("reset role");await c.query("select set_config('request.jwt.claim.sub',$1,true)",[f.owner]);
    await c.query("select private.mutate_collection_share_v1($1,'close',$2,1)",[randomUUID(),list]);
    await c.query("select set_config('request.jwt.claim.sub',$1,true)",[f.other]);await c.query("set local role authenticated");
    await denied(c,"select read_entry_note_v1($1)",[f.entry],"note_entry_unavailable");
    await denied(c,"select write_entry_note_v1($1,1,'revoked change')",[f.entry],"note_entry_unavailable");
    await c.query("reset role");
    expect((await c.query("select notes from user_word_notes where user_id=$1 and word_entry_id=$2",[f.owner,f.entry])).rows[0].notes).toBe("owner note");
    await c.query("select set_config('request.jwt.claim.sub',$1,true)",[f.owner]);
    const fresh=(await c.query("select private.mutate_collection_share_v1($1,'open',$2,2) payload",[randomUUID(),list])).rows[0].payload.invitationCode;
    await c.query("select set_config('request.jwt.claim.sub',$1,true)",[f.other]);
    await c.query("select private.accept_collection_share_v1($1,$2)",[randomUUID(),fresh]);
    await c.query("set local role authenticated");
    expect((await c.query("select read_entry_note_v1($1) payload",[f.entry])).rows[0].payload).toMatchObject({notes:"viewer note",revision:"1"});
  }));
  test.each(["write","copy"])("%s commits before the competing note/copy operation",async first=>{
    const seed=await pool.connect();let f:Awaited<ReturnType<typeof fixture>>;
    try{await seed.query("begin");f=await fixture(seed);await seed.query("commit");}
    catch(error){await seed.query("rollback");throw error;}
    finally{seed.release();}
    const writer=await pool.connect(),copier=await pool.connect();
    let pending:Promise<unknown>|undefined;
    try{
      for(const c of [writer,copier]){await c.query("begin");await c.query("select set_config('request.jwt.claim.sub',$1,true)",[f!.owner]);await c.query("set local role authenticated");}
      const writerPid=(await writer.query("select pg_backend_pid() pid")).rows[0].pid;
      const copierPid=(await copier.query("select pg_backend_pid() pid")).rows[0].pid;
      const old=(await copier.query("select preview_independent_entry_copy_v1($1) payload",[f!.entry])).rows[0].payload.revision;
      if(first==="write"){
        await copier.query("commit");await copier.query("begin");await copier.query("select set_config('request.jwt.claim.sub',$1,true)",[f!.owner]);await copier.query("set local role authenticated");
        await writer.query("select write_entry_note_v1($1,0,'new note')",[f!.entry]);
        pending=copier.query("select copy_independent_entry_v1($1,$2,$3)",[randomUUID(),f!.entry,old]).then(()=>"unexpected success",error=>(error as Error).message);
      }else{
        pending=writer.query("select write_entry_note_v1($1,0,'new note')",[f!.entry]);
      }
      const waitingPid=first==="write"?copierPid:writerPid;
      let observed=false;
      for(let n=0;!observed&&n<200;n++){
        observed=(await pool.query("select cardinality(pg_blocking_pids($1))>0 blocked",[waitingPid])).rows[0].blocked;
        if(!observed)await new Promise(resolve=>setTimeout(resolve,10));
      }
      expect(observed).toBe(true);
      if(first==="write"){
        await writer.query("commit");expect(await pending).toBe("copy_source_changed");await copier.query("rollback");
      }else{
        const copied=(await copier.query("select copy_independent_entry_v1($1,$2,$3) payload",[randomUUID(),f!.entry,old])).rows[0].payload;
        await copier.query("commit");await pending;await writer.query("commit");
        expect((await pool.query("select raw->>'notes' notes from word_entries where id=$1",[copied.entryId])).rows[0].notes??null).toBeNull();
      }
    }finally{
      await writer.query("rollback");await copier.query("rollback");if(pending)await pending.catch(()=>undefined);
      writer.release();copier.release();
      await pool.query("delete from word_entries where dictionary_id in(select id from dictionaries where owner_user_id=any($1::uuid[]))",[[f!.owner,f!.other]]);
      await pool.query("delete from auth.users where id=any($1::uuid[])",[[f!.owner,f!.other]]);
    }
  });

});
