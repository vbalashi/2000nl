import {randomUUID} from "node:crypto";
import {Pool,type PoolClient} from "pg";
import {afterAll,beforeAll,describe,expect,test} from "vitest";
import {ensureUserWithSettings,getDbUrl,runMigrations,withTransaction} from "./dbTestUtils";
const url=getDbUrl();
async function principal(c:PoolClient,id:string){await c.query("select set_config('request.jwt.claim.sub',$1,true)",[id]);}
async function fixture(c:PoolClient){
  const [owner,teacher,viewer,outsider]=Array.from({length:4},()=>randomUUID());
  for(const id of [owner,teacher,viewer,outsider])await ensureUserWithSettings(c,id);
  await principal(c,owner);
  const selected=(await c.query("select create_user_dictionary_entry($1,null,$2) id",[owner,{headword:randomUUID(),languageCode:"nl",definition:"private lesson",notes:"raw teaching"}])).rows[0].id;
  const hidden=(await c.query("select create_user_dictionary_entry($1,null,$2) id",[owner,{headword:randomUUID(),languageCode:"nl",definition:"hidden lesson"}])).rows[0].id;
  const dictionary=(await c.query("insert into dictionaries(language_code,slug,name,kind,visibility,minimum_subscription_tier) values('nl',$1,'note source','curated','system','free') returning id",[randomUUID()])).rows[0].id;
  const common=(await c.query("insert into word_entries(dictionary_id,language_code,headword,meaning_id,raw) values($1,'nl',$2,1,'{\"definition\":\"common lesson\"}') returning id",[dictionary,randomUUID()])).rows[0].id;
  for(const [id,text]of [[owner,"owner teaching"],[teacher,"second teaching"],[viewer,"my addition"]]){
    await principal(c,id);await c.query("select write_entry_note_v1($1,0,$2)",[common,text]);
  }
  await principal(c,owner);await c.query("select write_entry_note_v1($1,0,'private teaching')",[selected]);await c.query("select write_entry_note_v1($1,0,'hidden teaching')",[hidden]);
  const lists:string[]=[];
  for(const [i,author]of [owner,owner,teacher].entries()){
    await principal(c,author);
    const list=(await c.query("insert into user_word_lists(user_id,name) values($1,$2) returning id",[author,`notes ${i}`])).rows[0].id;lists.push(list);
    await c.query("insert into user_word_list_items(list_id,word_id) values($1,$2)",[list,common]);
    if(i===0)await c.query("insert into user_word_list_items(list_id,word_id) values($1,$2)",[list,selected]);
    const code=(await c.query("select private.mutate_collection_share_v1($1,'open',$2,0) payload",[randomUUID(),list])).rows[0].payload.invitationCode;
    await principal(c,viewer);await c.query("select private.accept_collection_share_v1($1,$2)",[randomUUID(),code]);
  }
  return {owner,teacher,viewer,outsider,selected,hidden,common,dictionary,lists};
}
async function material(c:PoolClient,entry:string){return (await c.query("select read_entry_note_material_v1(array[$1::uuid]) payload",[entry])).rows[0].payload.entries[0].notes as {noteId:string;ownerUserId:string;text:string;revision:string;isOwn:boolean}[];}
(url?describe:describe.skip)("direct shared instructional note material",()=>{
  const pool=new Pool({connectionString:url});beforeAll(()=>runMigrations(pool));afterAll(()=>pool.end());
  test("one author overlay per meaning despite multiple collections; own addition stays distinct",async()=>withTransaction(pool,async c=>{
    const f=await fixture(c);await c.query("set local role authenticated");
    const notes=await material(c,f.common);
    expect(notes).toHaveLength(3);expect(new Set(notes.map(note=>note.noteId)).size).toBe(3);
    expect(notes.find(note=>note.isOwn)).toMatchObject({ownerUserId:f.viewer,text:"my addition",revision:"1"});
    expect(notes.filter(note=>!note.isOwn).map(note=>note.text).sort()).toEqual(["owner teaching","second teaching"]);
    expect((await material(c,f.selected)).map(note=>note.text)).toEqual(["private teaching"]);
    const entry=(await c.query("select fetch_dictionary_entry_by_id_gated($1) payload",[f.selected])).rows[0].payload;
    expect(entry.note_material).toEqual(await material(c,f.selected));expect(entry.raw.notes).toBe("raw teaching");
    expect((await c.query("select read_entry_note_v1($1) payload",[f.common])).rows[0].payload.notes).toBe("my addition");
    await c.query("savepoint raw_denied");
    await expect(c.query("select notes from user_word_notes where word_entry_id=$1",[f.common])).rejects.toThrow("permission denied");
    await c.query("rollback to savepoint raw_denied");
  }));
  test("updates are live; closing one of two author paths preserves the overlay until the last closes",async()=>withTransaction(pool,async c=>{
    const f=await fixture(c);await principal(c,f.owner);
    await c.query("select write_entry_note_v1($1,1,'updated teaching')",[f.common]);
    await c.query("select private.mutate_collection_share_v1($1,'close',$2,1)",[randomUUID(),f.lists[0]]);
    await principal(c,f.viewer);expect((await material(c,f.common)).some(note=>note.text==="updated teaching"&&note.revision==="2")).toBe(true);
    await principal(c,f.owner);await c.query("select private.mutate_collection_share_v1($1,'close',$2,1)",[randomUUID(),f.lists[1]]);
    await principal(c,f.viewer);expect((await material(c,f.common)).map(note=>note.text).sort()).toEqual(["my addition","second teaching"]);
    await principal(c,f.teacher);await c.query("delete from user_word_list_items where list_id=$1 and word_id=$2",[f.lists[2],f.common]);
    await principal(c,f.viewer);expect((await material(c,f.common)).map(note=>note.text)).toEqual(["my addition"]);
  }));
  test("a forwarded common entry carries only the forwarder's own note, not other teachers' overlays",async()=>withTransaction(pool,async c=>{
    const f=await fixture(c);await principal(c,f.viewer);
    const list=(await c.query("insert into user_word_lists(user_id,name) values($1,'forward') returning id",[f.viewer])).rows[0].id;
    await c.query("insert into user_word_list_items(list_id,word_id) values($1,$2)",[list,f.common]);
    const code=(await c.query("select private.mutate_collection_share_v1($1,'open',$2,0) payload",[randomUUID(),list])).rows[0].payload.invitationCode;
    await principal(c,f.outsider);expect(await material(c,f.common)).toEqual([]);
    await c.query("select private.accept_collection_share_v1($1,$2)",[randomUUID(),code]);
    expect((await material(c,f.common)).map(note=>note.text)).toEqual(["my addition"]);
  }));
  test("raw and overlay duplicates are displayed once without changing stored note identity",async()=>withTransaction(pool,async c=>{
    const f=await fixture(c);await principal(c,f.owner);await c.query("select write_entry_note_v1($1,1,'raw teaching')",[f.selected]);
    await principal(c,f.viewer);expect(await material(c,f.selected)).toEqual([]);
    const scopes=(await c.query("select private.entry_note_scope_material_v1($1,array[$2::uuid]) payload",[f.viewer,f.selected])).rows[0].payload;
    expect(scopes.find((note:{ownerUserId:string})=>note.ownerUserId===f.owner)).toMatchObject({text:"raw teaching",revision:"2"});
  }));
  test("unrelated notes, unreadable siblings and catalogue reads gain no overlay authority",async()=>withTransaction(pool,async c=>{
    const f=await fixture(c);await principal(c,f.outsider);expect(await material(c,f.common)).toEqual([]);
    await principal(c,f.viewer);await c.query("set local role authenticated");await c.query("savepoint denied");
    await expect(c.query("select read_entry_note_material_v1(array[$1::uuid])",[f.hidden])).rejects.toThrow("note_entry_unavailable");await c.query("rollback to savepoint denied");
    expect((await c.query("select fetch_dictionary_entry_by_id_gated($1) payload",[f.hidden])).rows[0].payload).toBeNull();
    await c.query("reset role");expect((await c.query("select private.entry_payload_for_reader_v1(null,to_jsonb(entry)) payload from word_entries entry where id=$1",[f.common])).rows[0].payload.note_material).toBeUndefined();
  }));
  test("private helper grants and bounded batch reads fail closed",async()=>withTransaction(pool,async c=>{
    const f=await fixture(c);
    for(const role of ["anon","authenticated","service_role"])expect((await c.query("select has_function_privilege($1,'private.entry_note_scope_material_v1(uuid,uuid[])','EXECUTE') allowed",[role])).rows[0].allowed).toBe(false);
    await c.query("set local role authenticated");await c.query("savepoint denied");
    await expect(c.query("select read_entry_note_material_v1(array_fill($1::uuid,array[51]))",[f.common])).rejects.toThrow("invalid_note_scope");await c.query("rollback to savepoint denied");
  }));
  test("sharing a curated entry does not bypass a closed dictionary",async()=>withTransaction(pool,async c=>{
    const f=await fixture(c);
    await c.query("update dictionaries set publication_state='unpublished',visibility='private' where id=$1",[f.dictionary]);
    await c.query("set local role authenticated");await c.query("savepoint denied");
    await expect(c.query("select read_entry_note_material_v1(array[$1::uuid])",[f.common])).rejects.toThrow("note_entry_unavailable");
    await c.query("rollback to savepoint denied");
    expect((await c.query("select fetch_dictionary_entry_by_id_gated($1) payload",[f.common])).rows[0].payload).toBeNull();
  }));
  test("a displayed-entry permit does not borrow revoked overlay authority",async()=>withTransaction(pool,async c=>{
    const f=await fixture(c);
    await principal(c,f.owner);await c.query("delete from user_word_list_items where list_id=$1 and word_id=$2",[f.lists[0],f.common]);await principal(c,f.viewer);
    const version=(await c.query("select content_version from word_entries where id=$1",[f.selected])).rows[0].content_version;
    await c.query("set local role authenticated");
    const run=(await c.query("select start_training_session($1,array['word-to-definition'],$2,'user','new','{}','5',$3) payload",[f.viewer,f.lists[0],randomUUID()])).rows[0].payload.sessionId;
    const permit=(await c.query("select acknowledge_current_training_card_v1($1,$2,$3,'word-to-definition',$4,'untracked') payload",[f.viewer,run,f.selected,version])).rows[0].payload.permitId;
    await c.query("reset role");await principal(c,f.owner);
    await c.query("select private.mutate_collection_share_v1($1,'close',$2,1)",[randomUUID(),f.lists[0]]);
    await principal(c,f.viewer);await c.query("set local role authenticated");
    const payload=(await c.query("select read_current_training_entry_v1($1,$2,$3) payload",[f.viewer,run,permit])).rows[0].payload;
    expect(payload.items[0].id).toBe(f.selected);expect(payload.items[0].note_material).toEqual([]);
    expect(JSON.stringify(payload)).not.toContain("private teaching");
  }));

  test("the batch byte budget is aggregate even when each individual note is valid",async()=>withTransaction(pool,async c=>{
    const f=await fixture(c);await principal(c,f.owner);
    const entries:string[]=[];
    for(let n=0;n<17;n++){
      const entry=(await c.query("select create_user_dictionary_entry($1,null,$2) id",[f.owner,{headword:randomUUID(),languageCode:"nl",definition:"bounded batch"}])).rows[0].id;
      entries.push(entry);await c.query("select write_entry_note_v1($1,0,repeat('a',65536))",[entry]);
    }
    await c.query("set local role authenticated");
    expect(await material(c,entries[0])).toHaveLength(1);
    await c.query("savepoint overflow");
    await expect(c.query("select read_entry_note_material_v1($1::uuid[])",[entries])).rejects.toThrow("note_material_too_large");
    await c.query("rollback to savepoint overflow");
  }));

  async function resetNoteHints(c:PoolClient,f:Awaited<ReturnType<typeof fixture>>){
    const topics=[f.owner,f.viewer,f.teacher,f.outsider].map(id=>'app:user:'+id);
    await c.query("delete from realtime.messages where topic=any($1::text[]) and payload->>'kind'=any(array['notes.changed','collections.changed'])",[topics]);
    for(const topic of topics)for(const kind of ['notes.changed','collections.changed'])await c.query("select set_config('app_event.sent_'||md5($1||':'||$2),'',true)",[topic,kind]);
    // Fixture setup and the asserted operation share a rollback-only transaction;
    // reset its already-emitted scope markers to model a new user command.
    await c.query("select set_config('app_event.collection_'||md5(id::text||':'||owner_user_id::text||':'||access_lifetime::text||':'||state::text),'',true) from private.collection_sharing_roots cross join unnest(array[true,false]) state where collection_id=any($1::uuid[])",[f.lists]);
  }
  async function noteHints(c:PoolClient,f:Awaited<ReturnType<typeof fixture>>){return (await c.query("select topic,payload,private,event from realtime.messages where payload->>'kind'='notes.changed' and topic=any($1::text[]) order by topic",[[f.owner,f.viewer,f.teacher,f.outsider].map(id=>'app:user:'+id)])).rows;}
  test.each(['common','selected','hidden'] as const)("%s note hints reach only the owner and currently provided readers",async kind=>withTransaction(pool,async c=>{
    const f=await fixture(c);await resetNoteHints(c,f);await principal(c,f.owner);await c.query("set local role authenticated");
    await c.query("select write_entry_note_v1($1,1,'updated private teaching text')",[f[kind]]);await c.query("reset role");
    const hints=await noteHints(c,f);
    expect(hints.map(h=>h.topic).sort()).toEqual((kind==='hidden'?[f.owner]:[f.owner,f.viewer]).map(id=>'app:user:'+id).sort());
    for(const hint of hints){
      expect(hint.private).toBe(true);expect(hint.event).toBe('app-event');
      expect(Object.keys(hint.payload).sort()).toEqual(['eventId','id','kind','occurredAt','revision','version']);
      expect(JSON.stringify(hint.payload)).not.toContain('teaching');expect(JSON.stringify(hint.payload)).not.toContain(f[kind]);
    }
  }));
  test("a recipient's personal note never broadcasts to the teacher or other learners",async()=>withTransaction(pool,async c=>{
    const f=await fixture(c);await resetNoteHints(c,f);await principal(c,f.viewer);
    await c.query("select write_entry_note_v1($1,1,'personal addition')",[f.common]);
    expect((await noteHints(c,f)).map(h=>h.topic)).toEqual(['app:user:'+f.viewer]);
  }));
  test("note update/delete and duplicate collection paths coalesce into one user-domain hint per transaction",async()=>withTransaction(pool,async c=>{
    const f=await fixture(c);await resetNoteHints(c,f);await principal(c,f.owner);
    await c.query("select write_entry_note_v1($1,1,'new note')",[f.common]);
    await c.query("select write_entry_note_v1($1,2,null)",[f.common]);
    await c.query("select write_entry_note_v1($1,1,'another meaning')",[f.selected]);
    expect((await noteHints(c,f)).map(h=>h.topic).sort()).toEqual([f.owner,f.viewer].map(id=>'app:user:'+id).sort());
  }));
  test("closed dictionary or lost last direct path cannot receive note hints",async()=>withTransaction(pool,async c=>{
    const f=await fixture(c);await resetNoteHints(c,f);await principal(c,f.owner);
    await c.query("select private.mutate_collection_share_v1($1,'close',$2,1)",[randomUUID(),f.lists[0]]);
    await c.query("select private.mutate_collection_share_v1($1,'close',$2,1)",[randomUUID(),f.lists[1]]);
    await resetNoteHints(c,f);
    await c.query("select write_entry_note_v1($1,1,'no longer provided')",[f.common]);
    expect((await noteHints(c,f)).map(h=>h.topic)).toEqual(['app:user:'+f.owner]);
    await resetNoteHints(c,f);await principal(c,f.teacher);
    await c.query("update dictionaries set visibility='private' where id=$1",[f.dictionary]);
    await c.query("update user_word_notes set notes='maintenance under closed source' where user_id=$1 and word_entry_id=$2",[f.teacher,f.common]);
    expect((await noteHints(c,f)).map(h=>h.topic)).toEqual(['app:user:'+f.teacher]);
  }));
  test("failed or rolled-back note writes leave no hints and helper calls stay closed",async()=>withTransaction(pool,async c=>{
    const f=await fixture(c);await resetNoteHints(c,f);await principal(c,f.owner);
    await c.query("savepoint failed_note");await expect(c.query("select write_entry_note_v1($1,0,'stale')",[f.common])).rejects.toThrow('note_changed');await c.query("rollback to savepoint failed_note");
    expect(await noteHints(c,f)).toHaveLength(0);
    await c.query("savepoint rolled_back_note");await c.query("select write_entry_note_v1($1,1,'rolled back')",[f.common]);expect(await noteHints(c,f)).toHaveLength(2);await c.query("rollback to savepoint rolled_back_note");expect(await noteHints(c,f)).toHaveLength(0);
    for(const role of ['anon','authenticated','service_role'])for(const signature of ['private.broadcast_entry_note_hint_v1(uuid,uuid)','private.broadcast_entry_note_row_v1()','private.broadcast_collection_material_hint_v1(uuid,uuid,uuid,boolean)','private.broadcast_collection_root_hint_v1()','private.broadcast_collection_subscription_hint_v1()','private.broadcast_collection_member_hint_v1()','private.broadcast_collection_list_hint_v1()','private.broadcast_shared_entry_material_hint_v1()'])
      expect((await c.query("select has_function_privilege($1,$2,'EXECUTE') allowed",[role,signature])).rows[0].allowed).toBe(false);
  }));

  test.each(['close','delete','rename','replace','move','archive','edit-source','delete-source'])("%s invalidates accepted readers without transmitting collection/source data",async action=>withTransaction(pool,async c=>{
    const f=await fixture(c);await resetNoteHints(c,f);await principal(c,f.owner);
    if(action==='close')await c.query("select private.mutate_collection_share_v1($1,'close',$2,1)",[randomUUID(),f.lists[0]]);
    else if(action==='delete')await c.query("delete from user_word_lists where id=$1",[f.lists[0]]);
    else if(action==='rename')await c.query("update user_word_lists set name='private renamed lesson' where id=$1",[f.lists[0]]);
    else if(action==='replace')await c.query("update user_word_list_items set word_id=$3 where list_id=$1 and word_id=$2",[f.lists[0],f.selected,f.hidden]);
    else if(action==='move')await c.query("update user_word_list_items set list_id=$2 where list_id=$1 and word_id=$3",[f.lists[0],f.lists[1],f.selected]);
    else if(action==='archive')await c.query("select delete_user_dictionary_entry($1,$2)",[f.owner,f.selected]);
    else if(action==='edit-source')await c.query("select update_user_dictionary_entry($1,$2,jsonb_build_object('headword',(select headword from word_entries where id=$2),'languageCode','nl','definition','private lesson','notes','updated source article'))",[f.owner,f.selected]);
    else await c.query("delete from word_entries where id=$1",[f.selected]);
    const hints=await noteHints(c,f);expect(hints.map(h=>h.topic).sort()).toEqual([f.owner,f.viewer].map(id=>'app:user:'+id).sort());
    for(const hint of hints){expect(Object.keys(hint.payload).sort()).toEqual(['eventId','id','kind','occurredAt','revision','version']);expect(JSON.stringify(hint.payload)).not.toContain('private');}
  }));
  test("invitation rotation does not invalidate accepted viewers or their notes",async()=>withTransaction(pool,async c=>{
    const f=await fixture(c);await resetNoteHints(c,f);await principal(c,f.owner);
    await c.query("select private.mutate_collection_share_v1($1,'rotate',$2,1)",[randomUUID(),f.lists[0]]);
    expect(await noteHints(c,f)).toHaveLength(0);
    expect((await c.query("select topic from realtime.messages where payload->>'kind'='collections.changed' and topic=any($1::text[])",[[f.owner,f.viewer].map(id=>'app:user:'+id)])).rows.map(r=>r.topic)).toEqual(['app:user:'+f.owner]);
  }));
  test("unsubscribe and accept hint the changed account and owner without disturbing other readers",async()=>withTransaction(pool,async c=>{
    const f=await fixture(c);await resetNoteHints(c,f);await principal(c,f.viewer);
    await c.query("select private.unsubscribe_collection_share_v1($1,$2)",[randomUUID(),f.lists[0]]);
    expect((await noteHints(c,f)).map(h=>h.topic).sort()).toEqual([f.owner,f.viewer].map(id=>'app:user:'+id).sort());
    await resetNoteHints(c,f);await principal(c,f.owner);
    const code=(await c.query("select private.mutate_collection_share_v1($1,'rotate',$2,1) value",[randomUUID(),f.lists[0]])).rows[0].value.invitationCode;
    await principal(c,f.outsider);await c.query("select private.accept_collection_share_v1($1,$2)",[randomUUID(),code]);
    expect((await noteHints(c,f)).map(h=>h.topic).sort()).toEqual([f.owner,f.outsider].map(id=>'app:user:'+id).sort());
  }));

  test("unshared membership UPDATE still invalidates its owner without reaching shared readers",async()=>withTransaction(pool,async c=>{
    const f=await fixture(c);await principal(c,f.owner);
    const list=(await c.query("insert into user_word_lists(user_id,name) values($1,$2) returning id",[f.owner,randomUUID()])).rows[0].id;
    await c.query("insert into user_word_list_items(list_id,word_id) values($1,$2)",[list,f.selected]);await resetNoteHints(c,f);
    await c.query("update user_word_list_items set word_id=$3 where list_id=$1 and word_id=$2",[list,f.selected,f.hidden]);
    expect(await noteHints(c,f)).toHaveLength(0);
    expect((await c.query("select topic from realtime.messages where payload->>'kind'='collections.changed' and topic=any($1::text[])",[[f.owner,f.viewer].map(id=>'app:user:'+id)])).rows.map(r=>r.topic)).toEqual(['app:user:'+f.owner]);
  }));

  test("private note hints remain confined by actual authenticated Broadcast topic policies",async()=>withTransaction(pool,async c=>{
    const f=await fixture(c);await resetNoteHints(c,f);await principal(c,f.owner);await c.query("select write_entry_note_v1($1,1,'provided text')",[f.common]);
    await principal(c,f.viewer);await c.query("set local role authenticated");
    await c.query("select set_config('realtime.topic',$1,true)",['app:user:'+f.owner]);
    expect((await c.query("select payload from realtime.messages where payload->>'kind'='notes.changed'")).rows).toHaveLength(0);
    await c.query("select set_config('realtime.topic',$1,true)",['app:user:'+f.viewer]);
    expect((await c.query("select payload from realtime.messages where payload->>'kind'='notes.changed'")).rows).toHaveLength(1);
    await principal(c,f.outsider);
    expect((await c.query("select payload from realtime.messages where payload->>'kind'='notes.changed'")).rows).toHaveLength(0);
  }));

});
