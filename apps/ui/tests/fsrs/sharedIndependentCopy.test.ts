import {randomUUID} from "node:crypto";
import {Pool,type PoolClient} from "pg";
import {afterAll,beforeAll,describe,expect,test} from "vitest";
import {ensureUserWithSettings,getDbUrl,runMigrations,withTransaction} from "./dbTestUtils";
const url=getDbUrl();
async function user(c:PoolClient,id:string){await c.query("select set_config('request.jwt.claim.sub',$1,true)",[id]);}
async function fixture(c:PoolClient,common=false,paths=1,acceptTeacher=true){
  const [owner,viewer,teacher,outsider]=Array.from({length:4},()=>randomUUID());
  for(const id of [owner,viewer,teacher,outsider])await ensureUserWithSettings(c,id);
  await user(c,owner);
  let entry:string,dictionary:string;
  if(common){
    dictionary=(await c.query("insert into dictionaries(language_code,slug,name,kind,visibility,minimum_subscription_tier) values('nl',$1,'common copy source','curated','system','free') returning id",[randomUUID()])).rows[0].id;
    entry=(await c.query("insert into word_entries(dictionary_id,language_code,headword,meaning_id,raw) values($1,'nl',$2,1,$3) returning id",[dictionary,randomUUID(),{meanings:[{definition:"visible source",examples:["A source example"]}],notes:"raw note",generation:{contextText:"PRIVATE_SOURCE_CONTEXT"}}])).rows[0].id;
  }else{
    entry=(await c.query("select create_user_dictionary_entry($1,null,$2) id",[owner,{headword:randomUUID(),languageCode:"nl",definition:"visible source",notes:"raw note",example:{source:"A source example"},generation:{contextText:"PRIVATE_SOURCE_CONTEXT"}}])).rows[0].id;
    dictionary=(await c.query("select dictionary_id from word_entries where id=$1",[entry])).rows[0].dictionary_id;
  }
  await c.query("select write_entry_note_v1($1,0,'teacher overlay')",[entry]);
  await c.query("insert into user_word_notes(user_id,word_entry_id,notes) values($1,$2,'UNSHARED_OVERLAY')",[outsider,entry]);
  const roots:{list:string;id:string;owner:string;code:string}[]=[];
  for(const author of [...Array(paths).fill(owner),...(common?[teacher]:[])]){
    await user(c,author);
    if(author===teacher)await c.query("select write_entry_note_v1($1,0,'second teacher')",[entry]);
    const list=(await c.query("insert into user_word_lists(user_id,name) values($1,$2) returning id",[author,randomUUID()])).rows[0].id;
    await c.query("insert into user_word_list_items(list_id,word_id) values($1,$2)",[list,entry]);
    const code=(await c.query("select private.mutate_collection_share_v1($1,'open',$2,0) payload",[randomUUID(),list])).rows[0].payload.invitationCode;
    const id=(await c.query("select id from private.collection_sharing_roots where collection_id=$1",[list])).rows[0].id;
    roots.push({list,id,owner:author,code});
    if(author!==teacher||acceptTeacher){await user(c,viewer);await c.query("select private.accept_collection_share_v1($1,$2)",[randomUUID(),code]);}
  }
  await user(c,viewer);await c.query("select write_entry_note_v1($1,0,'recipient overlay')",[entry]);
  return {owner,viewer,teacher,outsider,entry,dictionary,common,roots};
}
async function preview(c:PoolClient,entry:string){return (await c.query("select preview_independent_entry_copy_v1($1) payload",[entry])).rows[0].payload;}
async function copy(c:PoolClient,entry:string,revision:string,operation=randomUUID()){return (await c.query("select copy_independent_entry_v1($1,$2,$3) payload",[operation,entry,revision])).rows[0].payload;}
async function rejected(c:PoolClient,fn:()=>Promise<unknown>,message:string){await c.query("savepoint rejected_copy");await expect(fn()).rejects.toThrow(message);await c.query("rollback to savepoint rejected_copy");}
async function waiting(pool:Pool,pid:number){for(let n=0;n<200;n++){if((await pool.query("select cardinality(pg_blocking_pids($1))>0 blocked",[pid])).rows[0].blocked)return;await new Promise(r=>setTimeout(r,10));}throw new Error("expected copy lease contention");}
(url?describe:describe.skip)("standalone mixed instructional copy",()=>{
  const pool=new Pool({connectionString:url});beforeAll(()=>runMigrations(pool));afterAll(()=>pool.end());
  test.each([false,true])("curated source:%s creates independent editable note text without foreign identity/progress",async common=>withTransaction(pool,async c=>{
    const f=await fixture(c,common);await c.query("set local role authenticated");
    const p=await preview(c,f.entry),created=await copy(c,f.entry,p.revision);
    expect(created.entryId).not.toBe(f.entry);await c.query("reset role");
    const raw=(await c.query("select raw from word_entries where id=$1",[created.entryId])).rows[0].raw;
    const paragraphs=raw.notes.split("\n\n");
    expect(paragraphs).toEqual(expect.arrayContaining(["raw note","teacher overlay","recipient overlay",...(common?["second teacher"]:[])]));
    expect(paragraphs).toHaveLength(common?4:3);
    expect(JSON.stringify(raw)).not.toContain("UNSHARED_OVERLAY");expect(JSON.stringify(raw)).not.toContain("PRIVATE_SOURCE_CONTEXT");
    for(const id of [f.owner,f.entry])expect(JSON.stringify(raw)).not.toContain(id);
    expect((await c.query("select count(*)::int n from user_card_status where entry_id=$1",[created.entryId])).rows[0].n).toBe(0);
    await c.query("set local role authenticated");await c.query("select update_user_dictionary_entry($1,$2,$3)",[f.viewer,created.entryId,{notes:"edited independent note"}]);await c.query("reset role");
    expect((await c.query("select notes from user_word_notes where user_id=$1 and word_entry_id=$2",[f.owner,f.entry])).rows[0].notes).toBe("teacher overlay");
  }));
  test("raw/overlay duplicates and repeated author collections contribute text once",async()=>withTransaction(pool,async c=>{
    const f=await fixture(c,false,2);await user(c,f.owner);await c.query("select write_entry_note_v1($1,1,'raw note')",[f.entry]);
    await user(c,f.viewer);const p=await preview(c,f.entry),created=await copy(c,f.entry,p.revision);
    const raw=(await c.query("select raw from word_entries where id=$1",[created.entryId])).rows[0].raw;
    expect(raw.notes.split("\n\n")).toEqual(["raw note","recipient overlay"]);
  }));
  test("receipt replay survives revoke/archive while a fresh operation is denied",async()=>withTransaction(pool,async c=>{
    const f=await fixture(c);const operation=randomUUID(),p=await preview(c,f.entry),created=await copy(c,f.entry,p.revision,operation);
    await user(c,f.owner);await c.query("select private.mutate_collection_share_v1($1,'close',$2,1)",[randomUUID(),f.roots[0].list]);
    await c.query("update word_entries set archived_at=clock_timestamp() where id=$1",[f.entry]);
    await user(c,f.viewer);expect(await copy(c,f.entry,p.revision,operation)).toEqual(created);
    await rejected(c,()=>copy(c,f.entry,p.revision),"copy_source_unavailable");
    expect((await c.query("select raw->>'notes' notes from word_entries where id=$1",[created.entryId])).rows[0].notes).toContain("teacher overlay");
  }));
  test("note absence ABA and reopened grant lifetime invalidate prior confirmation",async()=>withTransaction(pool,async c=>{
    const f=await fixture(c);await user(c,f.owner);await c.query("select write_entry_note_v1($1,1,null)",[f.entry]);
    await user(c,f.viewer);const absent=await preview(c,f.entry);
    await user(c,f.owner);await c.query("select write_entry_note_v1($1,2,'temporary')",[f.entry]);await c.query("select write_entry_note_v1($1,3,null)",[f.entry]);
    await user(c,f.viewer);await rejected(c,()=>copy(c,f.entry,absent.revision),"copy_source_changed");
    const before=await preview(c,f.entry);
    await user(c,f.owner);await c.query("select private.mutate_collection_share_v1($1,'close',$2,1)",[randomUUID(),f.roots[0].list]);
    const code=(await c.query("select private.mutate_collection_share_v1($1,'open',$2,2) payload",[randomUUID(),f.roots[0].list])).rows[0].payload.invitationCode;
    await user(c,f.viewer);await c.query("select private.accept_collection_share_v1($1,$2)",[randomUUID(),code]);
    await rejected(c,()=>copy(c,f.entry,before.revision),"copy_source_changed");
  }));
  test("invitation rotation does not revoke an accepted copy scope",async()=>withTransaction(pool,async c=>{
    const f=await fixture(c);const before=await preview(c,f.entry);
    await user(c,f.owner);await c.query("select private.mutate_collection_share_v1($1,'rotate',$2,1)",[randomUUID(),f.roots[0].list]);
    await user(c,f.viewer);expect((await preview(c,f.entry)).revision).toBe(before.revision);
    expect((await copy(c,f.entry,before.revision)).status).toBe("completed");
  }));
  test.each(["close","note","remove","delete","unsubscribe"])("%s and copy serialize in either transaction order",async kind=>{
    for(const first of ["copy","change"]){
      const seed=await pool.connect();let f!:Awaited<ReturnType<typeof fixture>>;
      try{await seed.query("begin");f=await fixture(seed);await seed.query("commit");}catch(e){await seed.query("rollback");throw e;}finally{seed.release();}
      const a=await pool.connect(),b=await pool.connect();let pending:Promise<unknown>|undefined;
      try{
        await a.query("begin");await user(a,f.viewer);const p=await preview(a,f.entry);await a.query("commit");
        await a.query("begin");await user(a,f.viewer);await a.query("set local role authenticated");
        await b.query("begin");await user(b,f.owner);
        const aPid=(await a.query("select pg_backend_pid() pid")).rows[0].pid,bPid=(await b.query("select pg_backend_pid() pid")).rows[0].pid;
        const change=async()=>{
          if(kind==="close")return b.query("select private.mutate_collection_share_v1($1,'close',$2,1)",[randomUUID(),f.roots[0].list]);
          if(kind==="remove")return b.query("delete from user_word_list_items where list_id=$1 and word_id=$2",[f.roots[0].list,f.entry]);
          if(kind==="delete")return b.query("delete from user_word_lists where id=$1",[f.roots[0].list]);
          if(kind==="unsubscribe"){await user(b,f.viewer);return b.query("select private.unsubscribe_collection_share_v1($1,$2)",[randomUUID(),f.roots[0].list]);}
          return b.query("select write_entry_note_v1($1,1,'changed teacher')",[f.entry]);
        };
        if(first==="copy"){
          const created=await copy(a,f.entry,p.revision);pending=change();await waiting(pool,bPid);await a.query("commit");await pending;await b.query("commit");
          expect((await pool.query("select raw->>'notes' notes from word_entries where id=$1",[created.entryId])).rows[0].notes).toContain("teacher overlay");
        }else{
          await change();pending=copy(a,f.entry,p.revision).then(()=>"unexpected success",e=>(e as Error).message);await waiting(pool,aPid);await b.query("commit");
          expect(await pending).toBe(kind!=="note"?"copy_source_unavailable":"copy_source_changed");await a.query("rollback");
          expect((await pool.query("select count(*)::int n from private.independent_entry_copy_receipts where user_id=$1",[f.viewer])).rows[0].n).toBe(0);
        }
      }finally{
        await a.query("rollback");await b.query("rollback");if(pending)await pending.catch(()=>undefined);a.release();b.release();
        await pool.query("delete from word_entries where id=$1 or dictionary_id in(select id from dictionaries where owner_user_id=any($2::uuid[]))",[f.entry,[f.owner,f.viewer,f.teacher,f.outsider]]);
        await pool.query("delete from auth.users where id=any($1::uuid[])",[[f.owner,f.viewer,f.teacher,f.outsider]]);
      }
    }
  });
  test.each(["alternate-path","new-teacher"].flatMap(kind=>["copy","preview"].map(action=>({kind,action}))))("unlocked $kind cannot substitute while $action waits for its selected lease",async({kind,action})=>{
    const seed=await pool.connect();let f!:Awaited<ReturnType<typeof fixture>>;
    try{await seed.query("begin");f=await fixture(seed,kind==="new-teacher",kind==="alternate-path"?2:1,false);await seed.query("commit");}catch(e){await seed.query("rollback");throw e;}finally{seed.release();}
    const a=await pool.connect(),b=await pool.connect(),third=await pool.connect();let pending:Promise<unknown>|undefined;
    try{
      await a.query("begin");await user(a,f.viewer);const p=await preview(a,f.entry);await a.query("commit");
      const root=f.roots.filter(root=>root.owner===f.owner).sort((a,b)=>a.id<b.id?-1:1)[0];
      await b.query("begin");await user(b,f.owner);
      await b.query("select private.mutate_collection_share_v1($1,$2,$3,1)",[randomUUID(),kind==="alternate-path"?"close":"rotate",root.list]);
      await a.query("begin");await user(a,f.viewer);await a.query("set local role authenticated");
      const pid=(await a.query("select pg_backend_pid() pid")).rows[0].pid;
      pending=(action==="copy"?copy(a,f.entry,p.revision):preview(a,f.entry)).then(()=>"unexpected success",e=>(e as Error).message);await waiting(pool,pid);
      if(kind==="new-teacher"){
        await third.query("begin");await user(third,f.viewer);
        await third.query("select private.accept_collection_share_v1($1,$2)",[randomUUID(),f.roots.find(root=>root.owner===f.teacher)!.code]);await third.query("commit");
      }
      await b.query("commit");expect(await pending).toBe("copy_source_changed");await a.query("rollback");
      expect((await pool.query("select count(*)::int n from private.independent_entry_copy_receipts where user_id=$1",[f.viewer])).rows[0].n).toBe(0);
    }finally{
      await a.query("rollback");await b.query("rollback");await third.query("rollback");if(pending)await pending.catch(()=>undefined);
      a.release();b.release();third.release();
      await pool.query("delete from word_entries where id=$1 or dictionary_id in(select id from dictionaries where owner_user_id=any($2::uuid[]))",[f.entry,[f.owner,f.viewer,f.teacher,f.outsider]]);
      if(f.common)await pool.query("delete from dictionaries where id=$1",[f.dictionary]);
      await pool.query("delete from auth.users where id=any($1::uuid[])",[[f.owner,f.viewer,f.teacher,f.outsider]]);
    }
  });
  test("flattening deduplicates note identities and rejects conflicting duplicates; private core cannot be called directly",async()=>withTransaction(pool,async c=>{
    const material=[{noteId:randomUUID(),ownerUserId:randomUUID(),text:"one note",revision:"1",isOwn:false}];
    expect((await c.query("select private.flatten_copy_note_overlays_v1('{}',$1) text",[JSON.stringify([...material,...material])])).rows[0].text).toBe("one note");
    await rejected(c,()=>c.query("select private.flatten_copy_note_overlays_v1('{}',$1)",[JSON.stringify([material[0],{...material[0],text:"different"}])]),"copy_content_invalid");
    for(const role of ["anon","authenticated","service_role"])for(const signature of ["private.copy_independent_entry_core_v1(uuid,uuid,text,uuid,boolean)","private.independent_copy_snapshot_with_notes_v1(uuid,uuid)","private.flatten_copy_note_overlays_v1(jsonb,jsonb)","private.collection_copy_admission_v1(uuid,uuid)","private.independent_copy_snapshot_in_cohort_v1(uuid,uuid,jsonb)","private.commit_independent_copy_snapshot_v1(uuid,uuid,uuid,text,uuid,boolean,jsonb)"])
      expect((await c.query("select has_function_privilege($1,$2,'EXECUTE') allowed",[role,signature])).rows[0].allowed).toBe(false);
  }));

  test.each(["dictionary","account","source owner","teacher owner","default target"])("%s parent deletion lock cannot invert the copy FK order",async parent=>{
    for(const first of ["copy","delete"]){
      const seed=await pool.connect();let f!:Awaited<ReturnType<typeof fixture>>;
      try{await seed.query("begin");f=await fixture(seed,parent==="teacher owner");await seed.query("commit");}catch(e){await seed.query("rollback");throw e;}finally{seed.release();}
      const a=await pool.connect(),b=await pool.connect();let pending:Promise<unknown>|undefined;
      try{
        let target:string|undefined;
        if(parent==="default target"){
          await a.query("begin");await user(a,f.viewer);
          target=(await a.query("select ensure_user_dictionary($1,'nl','My dictionary') id",[f.viewer])).rows[0].id;
          await a.query("commit");
        }
        await a.query("begin");await user(a,f.viewer);const p=await preview(a,f.entry);await a.query("commit");
        await a.query("begin");await user(a,f.viewer);await a.query("set local role authenticated");await b.query("begin");
        const bPid=(await b.query("select pg_backend_pid() pid")).rows[0].pid;
        const remove=()=>["dictionary","default target"].includes(parent)
          ?b.query("select id from dictionaries where id=$1 for update",[parent==="dictionary"?f.dictionary:target])
          :b.query("select id from auth.users where id=$1 for update",[parent==="account"?f.viewer:parent==="source owner"?f.owner:f.teacher]);
        if(first==="copy"){
          await copy(a,f.entry,p.revision);pending=remove();await waiting(pool,bPid);await a.query("commit");await pending;await b.query("rollback");
        }else{
          await remove();await rejected(a,()=>copy(a,f.entry,p.revision),"copy_source_changed");await a.query("rollback");await b.query("rollback");
        }
      }finally{
        await a.query("rollback");await b.query("rollback");if(pending)await pending.catch(()=>undefined);a.release();b.release();
        await pool.query("delete from word_entries where id=$1 or dictionary_id in(select id from dictionaries where owner_user_id=any($2::uuid[]))",[f.entry,[f.owner,f.viewer,f.teacher,f.outsider]]);
        await pool.query("delete from auth.users where id=any($1::uuid[])",[[f.owner,f.viewer,f.teacher,f.outsider]]);
      }
    }
  });

  async function borrowedList(c:PoolClient,f:Awaited<ReturnType<typeof fixture>>){
    await user(c,f.viewer);
    const id=(await c.query("insert into user_word_lists(user_id,name) values($1,$2) returning id",[f.viewer,randomUUID()])).rows[0].id;
    await c.query("insert into user_word_list_items(list_id,word_id) values($1,$2)",[id,f.entry]);
    return id as string;
  }
  async function bulkPreview(c:PoolClient,list:string){return (await c.query("select preview_collection_independent_copy_v1($1) payload",[list])).rows[0].payload;}
  async function bulkCopy(c:PoolClient,list:string,revision:string,operation=randomUUID()){return (await c.query("select copy_collection_independent_entries_v1($1,$2,$3) payload",[operation,list,revision])).rows[0].payload;}
  async function addSecondBorrowedSource(c:PoolClient,f:Awaited<ReturnType<typeof fixture>>,selected:string){
    await user(c,f.teacher);
    const second=(await c.query("select create_user_dictionary_entry($1,null,$2) id",[f.teacher,{headword:randomUUID(),languageCode:"nl",definition:"another author's source"}])).rows[0].id;
    await c.query("select write_entry_note_v1($1,0,'other author material')",[second]);
    const secondList=(await c.query("insert into user_word_lists(user_id,name) values($1,$2) returning id",[f.teacher,randomUUID()])).rows[0].id;
    await c.query("insert into user_word_list_items(list_id,word_id) values($1,$2)",[secondList,second]);
    const code=(await c.query("select private.mutate_collection_share_v1($1,'open',$2,0) payload",[randomUUID(),secondList])).rows[0].payload.invitationCode;
    await user(c,f.viewer);await c.query("select private.accept_collection_share_v1($1,$2)",[randomUUID(),code]);
    await c.query("insert into user_word_list_items(list_id,word_id) values($1,$2)",[selected,second]);
    return second as string;
  }
  test("public bulk preparation copies selected-private notes atomically, leaves common/other references and replays after revoke",async()=>withTransaction(pool,async c=>{
    const f=await fixture(c),selected=await borrowedList(c,f),other=await borrowedList(c,f);
    const second=await addSecondBorrowedSource(c,f,selected);
    const commonDictionary=(await c.query("insert into dictionaries(language_code,slug,name,kind,visibility,minimum_subscription_tier) values('nl',$1,'common','curated','system','free') returning id",[randomUUID()])).rows[0].id;
    const common=(await c.query("insert into word_entries(dictionary_id,language_code,headword,meaning_id,raw) values($1,'nl',$2,1,$3) returning id",[commonDictionary,randomUUID(),{meanings:[{definition:"common"}]}])).rows[0].id;
    await c.query("insert into user_word_list_items(list_id,word_id) values($1,$2)",[selected,common]);
    await c.query("set local role authenticated");const p=await bulkPreview(c,selected),op=randomUUID();
    expect(p).toMatchObject({borrowedCount:2,canCopy:true});expect(JSON.stringify(p)).not.toContain("overlay");
    const result=await bulkCopy(c,selected,p.revision,op);expect(result.copiedCount).toBe(2);
    await c.query("reset role");
    const ids=(await c.query("select word_id from user_word_list_items where list_id=$1",[selected])).rows.map(r=>r.word_id);
    expect(ids).toContain(common);expect(ids).not.toContain(f.entry);expect(ids).not.toContain(second);
    const secondCopy=(await c.query("select entry.raw from private.independent_entry_copy_receipts receipt join word_entries entry on entry.id=receipt.copied_entry_id where receipt.user_id=$1 and receipt.source_entry_id=$2",[f.viewer,second])).rows[0].raw;
    expect(secondCopy.notes).toContain("other author material");expect(secondCopy.notes).not.toContain("teacher overlay");
    const replacement=(await c.query("select copied_entry_id from private.independent_entry_copy_receipts where user_id=$1 and source_entry_id=$2",[f.viewer,f.entry])).rows[0].copied_entry_id,raw=(await c.query("select raw from word_entries where id=$1",[replacement])).rows[0].raw;
    expect(raw.notes).toContain("teacher overlay");expect(raw.notes).toContain("recipient overlay");expect(JSON.stringify(raw)).not.toContain("UNSHARED_OVERLAY");
    expect((await c.query("select word_id from user_word_list_items where list_id=$1",[other])).rows[0].word_id).toBe(f.entry);
    expect((await c.query("select count(*)::int n from user_card_status where user_id=$1 and entry_id=$2",[f.viewer,replacement])).rows[0].n).toBe(0);
    await user(c,f.owner);await c.query("select private.mutate_collection_share_v1($1,'close',$2,1)",[randomUUID(),f.roots[0].list]);
    await user(c,f.viewer);expect(await bulkCopy(c,selected,p.revision,op)).toEqual(result);
  }));
  test("bulk preview confirmation changes with instructional notes and never partially replaces",async()=>withTransaction(pool,async c=>{
    const f=await fixture(c),selected=await borrowedList(c,f);const p=await bulkPreview(c,selected);
    await user(c,f.owner);await c.query("select write_entry_note_v1($1,1,'revised teacher')",[f.entry]);await user(c,f.viewer);
    await rejected(c,()=>bulkCopy(c,selected,p.revision),"copy_source_changed");
    expect((await c.query("select word_id from user_word_list_items where list_id=$1",[selected])).rows[0].word_id).toBe(f.entry);
    expect((await c.query("select count(*)::int n from private.collection_copy_receipts where user_id=$1",[f.viewer])).rows[0].n).toBe(0);
    const fresh=await bulkPreview(c,selected);expect(fresh.revision).not.toBe(p.revision);expect((await bulkCopy(c,selected,fresh.revision)).copiedCount).toBe(1);
  }));
  test.each(["source","root","list","member","note","author","account","dictionary"])("bulk %s contention retries without inverse waits and retains atomicity",async kind=>{
    for(const first of ["copy","change"]){
      const seed=await pool.connect();let f!:Awaited<ReturnType<typeof fixture>>,selected!:string;
      try{await seed.query("begin");f=await fixture(seed);selected=await borrowedList(seed,f);await seed.query("commit");}catch(e){await seed.query("rollback");throw e;}finally{seed.release();}
      const a=await pool.connect(),b=await pool.connect();let pending:Promise<unknown>|undefined;
      try{
        await a.query("begin");await user(a,f.viewer);const p=await bulkPreview(a,selected);await a.query("commit");
        await a.query("begin");await user(a,f.viewer);await a.query("set local role authenticated");await b.query("begin");
        const pid=(await b.query("select pg_backend_pid() pid")).rows[0].pid;
        const change=()=>kind==="note"?b.query("select id from user_word_notes where user_id=$1 and word_entry_id=$2 for update",[f.owner,f.entry])
          :kind==="author"?b.query("select private.lock_sharing_author_scope_v1($1,true)",[f.owner])
          :kind==="source"?b.query("select id from word_entries where id=$1 for update",[f.entry])
          :kind==="root"?b.query("select id from private.collection_sharing_roots where id=$1 for update",[f.roots[0].id])
          :kind==="list"?b.query("select id from user_word_lists where id=$1 for update",[selected])
          :kind==="member"?b.query("select word_id from user_word_list_items where list_id=$1 for update",[selected])
          :kind==="account"?b.query("select id from auth.users where id=$1 for update",[f.owner])
          :b.query("select id from dictionaries where id=$1 for update",[f.dictionary]);
        if(first==="copy"){
          await bulkCopy(a,selected,p.revision);pending=change();await waiting(pool,pid);await a.query("commit");await pending;await b.query("rollback");
        }else{
          await change();await rejected(a,()=>bulkCopy(a,selected,p.revision),"copy_source_changed");await a.query("rollback");await b.query("rollback");
          expect((await pool.query("select word_id from user_word_list_items where list_id=$1",[selected])).rows[0].word_id).toBe(f.entry);
          expect((await pool.query("select count(*)::int n from private.collection_copy_receipts where user_id=$1",[f.viewer])).rows[0].n).toBe(0);
        }
      }finally{
        await a.query("rollback");await b.query("rollback");if(pending)await pending.catch(()=>undefined);a.release();b.release();
        await pool.query("delete from word_entries where id=$1 or dictionary_id in(select id from dictionaries where owner_user_id=any($2::uuid[]))",[f.entry,[f.owner,f.viewer,f.teacher,f.outsider]]);
        await pool.query("delete from auth.users where id=any($1::uuid[])",[[f.owner,f.viewer,f.teacher,f.outsider]]);
      }
    }
  });

  test("second borrowed-author copy failure rolls back the first copy, all memberships and receipts",async()=>withTransaction(pool,async c=>{
    const f=await fixture(c),selected=await borrowedList(c,f),second=await addSecondBorrowedSource(c,f,selected);
    const last=(await c.query("select headword from word_entries where id=any($1::uuid[]) order by id desc limit 1",[[f.entry,second]])).rows[0].headword;
    await c.query("select set_config('test.fail_copy_word',$1,true),set_config('test.fail_copy_user',$2,true)",[last,f.viewer]);
    await c.query(`create function pg_temp.reject_second_mixed_copy() returns trigger language plpgsql security definer set search_path=pg_catalog,public,private,pg_temp as $body$
      declare n integer;
      begin
        if NEW.headword=current_setting('test.fail_copy_word') then
          select count(*) into n from private.independent_entry_copy_receipts where user_id=current_setting('test.fail_copy_user')::uuid;
          raise exception 'injected_after_first_copy:%',n;
        end if;
        return NEW;
      end;
      $body$`);
    await c.query("create trigger test_reject_second_mixed_copy before insert on word_entries for each row execute function pg_temp.reject_second_mixed_copy()");
    const p=await bulkPreview(c,selected);expect(p.borrowedCount).toBe(2);
    const before=(await c.query("select count(*)::int n from word_entries")).rows[0].n;
    await c.query("set local role authenticated");await rejected(c,()=>bulkCopy(c,selected,p.revision),"injected_after_first_copy:1");await c.query("reset role");
    expect((await c.query("select count(*)::int n from word_entries")).rows[0].n).toBe(before);
    expect((await c.query("select word_id from user_word_list_items where list_id=$1 order by word_id",[selected])).rows.map(r=>r.word_id)).toEqual([f.entry,second].sort());
    for(const table of ["independent_entry_copy_receipts","collection_copy_receipts"])
      expect((await c.query(`select count(*)::int n from private.${table} where user_id=$1`,[f.viewer])).rows[0].n).toBe(0);
  }));
  test.each(["point","bulk","bulk then point"])("overlapping %s copy and bulk admission never wait in reverse order",async first=>{
    const seed=await pool.connect();let f!:Awaited<ReturnType<typeof fixture>>,selected!:string;
    try{await seed.query("begin");f=await fixture(seed);selected=await borrowedList(seed,f);await seed.query("commit");}catch(e){await seed.query("rollback");throw e;}finally{seed.release();}
    const a=await pool.connect(),b=await pool.connect();let pending:Promise<unknown>|undefined;
    try{
      await a.query("begin");await user(a,f.viewer);const point=await preview(a,f.entry),batch=await bulkPreview(a,selected);await a.query("commit");
      await a.query("begin");await user(a,f.viewer);await a.query("set local role authenticated");
      await b.query("begin");await user(b,f.viewer);await b.query("set local role authenticated");
      if(first==="point")await copy(a,f.entry,point.revision);else await bulkCopy(a,selected,batch.revision);
      if(first==="bulk then point"){
        const pid=(await b.query("select pg_backend_pid() pid")).rows[0].pid;
        pending=copy(b,f.entry,point.revision);await waiting(pool,pid);await a.query("commit");
        expect(await pending).toMatchObject({status:"completed"});await b.query("commit");
      }else{
        await rejected(b,()=>bulkCopy(b,selected,batch.revision),"copy_source_changed");
        await b.query("rollback");await a.query("commit");
      }
    }finally{
      await a.query("rollback");await b.query("rollback");if(pending)await pending.catch(()=>undefined);a.release();b.release();
      await pool.query("delete from word_entries where id=$1 or dictionary_id in(select id from dictionaries where owner_user_id=any($2::uuid[]))",[f.entry,[f.owner,f.viewer,f.teacher,f.outsider]]);
      await pool.query("delete from auth.users where id=any($1::uuid[])",[[f.owner,f.viewer,f.teacher,f.outsider]]);
    }
  });

  test("batch snapshot rejects every resource outside its fixed admitted cohort",async()=>withTransaction(pool,async c=>{
    const f=await fixture(c),selected=await borrowedList(c,f);
    const cohort=(await c.query("select private.collection_copy_admission_v1($1,$2) value",[f.viewer,selected])).rows[0].value;
    expect((await c.query("select private.independent_copy_snapshot_in_cohort_v1($1,$2,$3) value",[f.viewer,f.entry,cohort])).rows[0].value.content.notes).toContain("teacher overlay");
    for(const field of ["entries","dictionaries","owners","roots"]){
      await rejected(c,()=>c.query("select private.independent_copy_snapshot_in_cohort_v1($1,$2,$3)",[f.viewer,f.entry,{...cohort,[field]:[]}]),"copy_source_changed");
    }
  }));

  test("public selected-private copy persists visible references through snapshot, validation and fresh identity",async()=>withTransaction(pool,async c=>{
    const f=await fixture(c);
    await c.query("update word_entries set raw=$2 where id=$1",[f.entry,{meanings:[{definition:"visible definition",cross_references:[{headword:"reference word",sourceEntryId:"HIDDEN_SOURCE"}]}],reference_tables:[{title:"Forms",rows:[{label:"past",value:"was",url:"HIDDEN_URL"}]}],cross_reference:{headword:"base word",entryId:"HIDDEN_ID"},source_identity:{homograph_number:2,privateUrl:"HIDDEN_URL"},displayPronunciation:"ˈword"}]);
    await c.query("set local role authenticated");const p=await preview(c,f.entry),created=await copy(c,f.entry,p.revision);await c.query("reset role");
    const raw=(await c.query("select raw from word_entries where id=$1",[created.entryId])).rows[0].raw;
    expect(created.entryId).not.toBe(f.entry);expect(raw.meanings[0].cross_references).toEqual([{headword:"reference word"}]);
    expect(raw.cross_reference).toEqual({headword:"base word"});expect(raw.reference_tables).toEqual([{title:"Forms",rows:[{label:"past",value:"was"}]}]);
    expect(raw.homograph_number).toBe(2);expect(raw.displayPronunciation).toBe("ˈword");expect(raw.notes).toContain("teacher overlay");
    expect(JSON.stringify(raw)).not.toContain("HIDDEN_");
  }));

});
