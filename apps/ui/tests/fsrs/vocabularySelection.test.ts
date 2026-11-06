import {afterAll,beforeAll,describe,expect,test} from "vitest";
import {randomUUID} from "node:crypto";
import {Pool,type PoolClient} from "pg";
import {ensureUserWithSettings,getDbUrl,runMigrations,withTransaction} from "./dbTestUtils";
const url=getDbUrl();
const options={mode:"frequency",materialKinds:[],profile:"spoken",from:1,to:2,meanings:2};
async function fixture(c:PoolClient,archivedFirst=false){
 const user=randomUUID();await ensureUserWithSettings(c,user);
 await c.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claim.role','service_role',true)",[user]);
 const dictionary=(await c.query(`insert into dictionaries(language_code,slug,name,kind,visibility,schema_key,schema_version)
 values('nl',$1,'Vocabulary fixture','curated','system',public.dictionary_source_settings_v1()->>'schemaKeyV1',1) returning id`,[`vocabulary-${randomUUID()}`])).rows[0].id;
 const scheme=`fixture-${randomUUID()}`;
 const run=(await c.query(`insert into private.dictionary_import_runs(dictionary_id,identity_scheme_version,artifact_format_version,manifest_checksum,input_checksum,source_record_count,artifact_count,status)
 values($1,$2,'test-v1','test-manifest','test-input',12,12,'completed') returning id`,[dictionary,scheme])).rows[0].id;
 const entries:Record<string,string[]>={};
 for(const [word,part,count] of [["vocabfiets","zn",4],["vocabfiets","ww",2],["vocabuitdrukking","other",3],["vocabonbekend","afk",1],["vocabvoor","vv",1]] as const){
  const key=`${word}:${part}`;entries[key]=[];
  for(let n=1;n<=count;n++){
   const raw={headword:word,part_of_speech:part,meanings:Array.from({length:count},(_,i)=>({definition:`Een ${word} betekenis ${i+1}.`,examples:[`Ik gebruik ${word}.`]}))};
   const entry=(await c.query(`insert into word_entries(dictionary_id,language_code,headword,meaning_id,part_of_speech,gender,raw,archived_at) values($1,'nl',$2,$3,$4,'de/het',$5,CASE WHEN $6 THEN now() END) returning id`,[dictionary,word,n,part,raw,archivedFirst&&word==='vocabfiets'&&part==='zn'&&n===1])).rows[0].id;
   entries[key].push(entry);
   await c.query("insert into private.platform_v2_content_nodes(entry_id,kind,binding_state,first_source_revision,last_source_revision,source_text_fingerprint,diagnostic_locator) values($1,'definition','active','v1','v1',$2,'raw.meanings[0].definition')",[entry,`definition-${entry}`]);
   await c.query(`insert into private.source_entry_bindings(dictionary_id,identity_scheme_version,source_entry_key,source_group_key,sense_ordinal,word_entry_id,binding_state,first_seen_run_id,last_seen_run_id,manifest_checksum,content_fingerprint_version,content_fingerprint,identity_evidence,reconciliation_decision)
   values($1,$2,$3,$4,$5,$6,'active',$7,$7,'test-manifest','test-v1','test-fingerprint','{"kind":"test"}','{"decision":"create"}')`,[dictionary,scheme,`${word}:${part}:${n}`,`${word}:${part}`,n,entry,run]);
   await c.query("insert into private.platform_v2_content_nodes(entry_id,kind,binding_state,first_source_revision,last_source_revision,source_text_fingerprint,diagnostic_locator) values($1,'example','active','v1','v1',$2,'raw.meanings[0].examples[0]')",[entry,`example-${entry}`]);
   await c.query("select refresh_dictionary_search_document($1,2)",[entry]);
  }
 }
 await c.query("delete from private.vocabulary_frequency_profiles where language_code='nl'");
 for(const profile of ["spoken","written"]){
  await c.query("insert into private.vocabulary_frequency_profiles values('nl',$1,'fixture',3,now())",[profile]);
  for(const [i,word] of (profile==='spoken'?["vocabfiets","vocabuitdrukking","vocabvoor"]:["vocabvoor","vocabfiets","vocabuitdrukking"]).entries())await c.query("insert into private.vocabulary_frequency_ranks values('nl',$1,$2,$3)",[profile,word,i+1]);
 }
 const filter={dictionaryScope:{mode:"selected",languageCode:"nl",dictionaryIds:[dictionary]},vocabulary:options};
 return {user,dictionary,entries,filter};
}
const ids=(payload:unknown)=>JSON.stringify(payload);
describe.skipIf(!url)("real vocabulary selection",()=>{
 const pool=new Pool({connectionString:url});beforeAll(()=>runMigrations(pool),120000);afterAll(()=>pool.end());
 test("inclusive ranks select all spelling units, first N independently; unknown frequencies stay out",()=>withTransaction(pool,async c=>{
  const {user,dictionary,entries}=await fixture(c);
  const filters={parts:[],article:null,vocabulary:options};
  const page=(await c.query("select lookup_platform_v2_library_filtered_entries($1,null,'nl',$2,null,100,100,$3) r",[user,[dictionary],filters])).rows[0].r;
  expect(page.error).toBeUndefined();
  for(const key of ["vocabfiets:zn","vocabfiets:ww","vocabuitdrukking:other"]){for(const e of entries[key].slice(0,2))expect(ids(page)).toContain(e);for(const e of entries[key].slice(2))expect(ids(page)).not.toContain(e);}
  expect(ids(page)).not.toContain(entries['vocabonbekend:afk'][0]);expect(ids(page)).not.toContain(entries['vocabvoor:vv'][0]);
  const other=(await c.query("select lookup_platform_v2_library_filtered_entries($1,null,'nl',$2,null,100,100,$3) r",[user,[dictionary],{...filters,parts:['noun'],article:'de',vocabulary:{...options,materialKinds:['other']}}])).rows[0].r;
  expect(ids(other)).toContain(entries['vocabuitdrukking:other'][0]);expect(ids(other)).not.toContain(entries['vocabfiets:zn'][0]);
  const written=(await c.query("select private.library_category_entry_ids_v1($1,$2) id",[user,{dictionaryIds:[dictionary],parts:[],article:null,vocabulary:{...options,profile:'written',from:1,to:1}}])).rows.map(r=>r.id);
  expect(written).toEqual([entries['vocabvoor:vv'][0]]);
 }));
 test("learning state narrows first meanings without refilling; availability, scheduler and launch agree",()=>withTransaction(pool,async c=>{
  const {user,entries,filter}=await fixture(c);const nouns=entries['vocabfiets:zn'];
  await c.query(`insert into user_card_status(user_id,entry_id,card_type_id,fsrs_enabled,in_learning,fsrs_reps,last_reviewed_at,next_review_at) select $1,unnest($2::uuid[]),'word-to-definition',true,true,2,now()-interval '2 days',now()-interval '1 day'`,[user,nouns.slice(0,2)]);
  const before=(await c.query("select count(*)::int n from user_card_status where user_id=$1",[user])).rows[0].n;
  const scope={...filter,partOfSpeech:['zn']};
  const count=(await c.query("select read_training_recipe_availability_v1($1,ARRAY['word-to-definition'],null,'curated',$2,'meaning') r",[user,scope])).rows[0].r;

  expect(count).toMatchObject({dueToday:2,totalReviews:2,newCards:0});
  const queue=await c.query("select entry_id,queue_source from private.training_scheduler_candidates_v2($1,ARRAY['word-to-definition'],null,'curated','new','auto',ARRAY[]::uuid[],ARRAY[]::text[],$2,false,false)",[user,scope]);
  expect(queue.rows.filter(r=>r.queue_source!=='practice')).toHaveLength(0);
  const plan=(await c.query("select start_training_session($1,ARRAY['word-to-definition'],null,'curated','new',$2,'5',$3,2) r",[user,scope,randomUUID()])).rows[0].r;
  expect(plan.plannedTotal).toBe(0);
  expect((await c.query("select count(*)::int n from user_card_status where user_id=$1",[user])).rows[0].n).toBe(before);
 }));
 test("Library query/label criteria apply beyond the first page and remain source scoped",()=>withTransaction(pool,async c=>{
  const {user,dictionary,entries,filter}=await fixture(c);
  const scope={...filter,librarySelection:{query:'vocabfiets',category:'headwords'}};
  const count=(await c.query("select read_training_recipe_availability_v1($1,ARRAY['word-to-definition'],null,'curated',$2,'meaning') r",[user,scope])).rows[0].r;
  expect(count.newCards).toBe(2);
  const list=(await c.query("insert into user_word_lists(user_id,name) values($1,'Vocabulary fixture') returning id",[user])).rows[0].id;
  await c.query("insert into user_word_list_items(list_id,word_id) values($1,$2)",[list,entries['vocabfiets:ww'][0]]);
  const scoped=(await c.query("select read_training_recipe_availability_v1($1,ARRAY['word-to-definition'],$2,'user',$3,'meaning') r",[user,list,{vocabulary:options,librarySelection:{query:'vocabfiets',category:'headwords'}}])).rows[0].r;
  expect(scoped.newCards).toBe(1);
  for(const category of ['headwords','examples','definitions','alphabetical']){
   const chosen=await c.query("select distinct entry_id from private.training_library_selection_entry_ids_v1($1,null,'curated',$2)",[user,{...scope,librarySelection:{query:'vocabfiets',category}}]);
   const page=(await c.query("select search_library_category_v1($1,'vocabfiets','nl',$2,$3,null,$4,100,null) r",[user,[dictionary],{parts:[],article:null,vocabulary:options},category])).rows[0].r;
   expect(chosen.rows.map(r=>r.entry_id).sort()).toEqual([...new Set(page.groups[0].items.map((item:{entry:{id:string}})=>item.entry.id))].sort());
  }
 }));
 test("sorting and cursors use frequency profile and data revision; malformed filters fail closed",()=>withTransaction(pool,async c=>{
  const {user,dictionary}=await fixture(c);
  const read=async(sort:string,cursor:string|null=null)=>(await c.query("select lookup_platform_v2_library_filtered_entries($1,null,'nl',$2,$3,1,100,$4) r",[user,[dictionary],cursor,{parts:[],article:null,sort}])).rows[0].r;
  const first=await read('written');expect(first.error).toBeUndefined();expect(ids(first)).toContain('vocabvoor');
  const cursor=first.page?.nextGroupCursor;
  // Cursor shape is bound to the criteria even when the visible result count changes.
  expect(cursor).toBeTruthy();
  if(cursor){expect((await read('spoken',cursor)).error).toBe('invalid_cursor');await c.query("update private.vocabulary_frequency_profiles set revision='changed'");expect((await read('written',cursor)).error).toBe('invalid_cursor');}
  for(const invalid of [null,{...options,from:0},{...options,meanings:6},{...options,materialKinds:['word','other']}]){
   const response=(await c.query("select lookup_platform_v2_library_filtered_entries($1,null,'nl',$2,null,100,100,$3) r",[user,[dictionary],{parts:[],article:null,vocabulary:invalid}])).rows[0].r;
   expect(response.error).toBe('invalid_library_filters');
  }
  expect((await c.query("select private.valid_training_library_selection_v1($1) ok",[{query:'vocabfiets',category:['headwords']}])).rows[0].ok).toBe(false);
 }));
 test("query handoff includes results after the first 100, and labels retain their own membership",()=>withTransaction(pool,async c=>{
  const {user,dictionary}=await fixture(c);
  const bulk=(await c.query(`insert into word_entries(dictionary_id,language_code,headword,meaning_id,part_of_speech,raw) select $1,'nl','vocabbulk',1,'zn','{"meanings":[{"definition":"Bulk fixture"}]}'::jsonb from generate_series(1,103) returning id`,[dictionary])).rows.map(r=>r.id);
  await c.query("select refresh_dictionary_search_document(unnest($1::uuid[]),2)",[bulk]);
  const filter={dictionaryScope:{mode:'selected',languageCode:'nl',dictionaryIds:[dictionary]},librarySelection:{query:'vocabbulk',category:'headwords'}};
  const publicPage=(await c.query("select search_library_category_v1($1,'vocabbulk','nl',$2,'{}',null,'headwords',100,null) r",[user,[dictionary]])).rows[0].r;
  expect(publicPage.groups[0].items).toHaveLength(100);expect(publicPage.groups[0].page.hasMore).toBe(true);
  const selected=(await c.query("select entry_id from private.training_library_selection_entry_ids_v1($1,null,'curated',$2)",[user,filter])).rows.map(r=>r.entry_id);
  const next=(await c.query("select search_library_category_v1($1,'vocabbulk','nl',$2,'{}',null,'headwords',100,$3) r",[user,[dictionary],publicPage.groups[0].page.nextCursor])).rows[0].r;
  expect(selected.sort()).toEqual([...new Set([...publicPage.groups[0].items,...next.groups[0].items].map((item:{entry:{id:string}})=>item.entry.id))].sort());
  for(const id of bulk)expect(selected).toContain(id);
  const list=(await c.query("insert into user_word_lists(user_id,name) values($1,'Label fixture') returning id",[user])).rows[0].id;
  await c.query("insert into user_word_list_items(list_id,word_id) values($1,$2)",[list,bulk[102]]);
  const label=(await c.query("insert into private.collection_labels(user_id,name) values($1,'Vocabulary label') returning id",[user])).rows[0].id;
  await c.query("insert into private.collection_label_assignments(user_id,collection_id,label_id) values($1,$2,$3)",[user,list,label]);
  const count=(await c.query("select read_training_recipe_availability_v1($1,ARRAY['word-to-definition'],null,'curated',$2,'meaning') r",[user,{...filter,librarySelection:{...filter.librarySelection,labelId:label}}])).rows[0].r;
  expect(count.newCards).toBe(1);
  await c.query("delete from private.collection_label_assignments where user_id=$1",[user]);
  const after=(await c.query("select read_training_recipe_availability_v1($1,ARRAY['word-to-definition'],null,'curated',$2,'meaning') r",[user,{...filter,librarySelection:{...filter.librarySelection,labelId:label}}])).rows[0].r;
  expect(after.newCards).toBe(0);
 }));
 test("personal entries without an explicit source link remain unranked; current material preferences apply to counts",()=>withTransaction(pool,async c=>{
  const {user,dictionary,entries,filter}=await fixture(c);
  const personal=(await c.query(`insert into dictionaries(language_code,slug,name,kind,visibility,owner_user_id,schema_key,schema_version) values('nl',$1,'Personal','user','private',$2,'user-entry-v1',1) returning id`,[`personal-${randomUUID()}`,user])).rows[0].id;
  const entry=(await c.query("insert into word_entries(dictionary_id,language_code,headword,part_of_speech,management_kind,raw) values($1,'nl','vocabfiets','zn','user','{}') returning id",[personal])).rows[0].id;
  expect((await c.query("select private.vocabulary_entry_selected_v1($1,$2) selected,private.vocabulary_order_rank_v1($1,'spoken') rank",[entry,options])).rows[0]).toEqual({selected:false,rank:2147483647});
  await c.query(`update user_settings set material_preferences=jsonb_build_object('schemaVersion',1,'learningLanguages','[]'::jsonb,'disabledDictionaryIds',jsonb_build_array($2::text)) where user_id=$1`,[user,dictionary]);
  const availability=await c.query("select read_training_recipe_availability_v1($1,ARRAY['word-to-definition'],null,'curated',$2,'meaning') r",[user,{...filter,dictionaryScope:{mode:'all',languageCode:'nl'}}]);
  expect(availability.rows[0].r.newCards).toBe(0);
  expect(entries['vocabfiets:zn']).toHaveLength(4);
 }));
 test("attached idioms inherit the selected parent meaning, with no status backfill",()=>withTransaction(pool,async c=>{
  const {user,filter,entries}=await fixture(c);const ids=entries['vocabfiets:zn'];
  await c.query("insert into user_card_status(user_id,entry_id,card_type_id,in_learning,fsrs_enabled) values($1,$2,'word-to-definition',true,true)",[user,ids[0]]);
  for(const entry of ids){const node=randomUUID();await c.query(`insert into private.platform_v2_content_nodes(id,entry_id,parent_content_node_id,kind,binding_state,first_source_revision,last_source_revision,source_text_fingerprint,diagnostic_locator) values($1,$2,null,'idiom','active','v1','v1',$3,'test.idiom'),($4,$2,$1,'idiom-explanation','active','v1','v1',$5,'test.explanation')`,[node,entry,`idiom-${node}`,randomUUID(),`explanation-${node}`]);}
  const nodes=(await c.query("select entry_id from private.training_idiom_source_nodes_v1($1,'direct',null,'curated',$2)",[user,filter])).rows.map(r=>r.entry_id);
  expect(nodes.sort()).toEqual(ids.slice(0,2).sort());
  const count=(await c.query("select read_training_recipe_availability_v1($1,ARRAY['idiom:direct'],null,'curated',$2,'idiom') r",[user,filter])).rows[0].r;
  expect(count.newCards).toBe(2);
 }));

 test("query handoff fails closed when Library search is not ready",()=>withTransaction(pool,async c=>{
  const {user,filter}=await fixture(c);
  await c.query("create or replace function private.dictionary_search_index_ready_v1() returns boolean language sql stable security definer set search_path=pg_catalog as $$select false$$");
  await expect(c.query("select read_training_recipe_availability_v1($1,ARRAY['word-to-definition'],null,'curated',$2,'meaning')",[user,{...filter,librarySelection:{query:'vocabfiets',category:'headwords'}}])).rejects.toThrow('search_index_not_ready');
 }));

 test("same-spelling same-POS homonyms keep independent dictionary-unit limits",()=>withTransaction(pool,async c=>{
  const {entries}=await fixture(c);const nouns=entries['vocabfiets:zn'];
  await c.query("update private.source_entry_bindings set source_group_key='second-homonym',sense_ordinal=sense_ordinal-2 where word_entry_id=any($1::uuid[])",[nouns.slice(2)]);
  const selected=(await c.query("select id from word_entries where id=any($1::uuid[]) and private.vocabulary_entry_selected_v1(id,$2)",[nouns,{...options,meanings:1}])).rows.map(r=>r.id);
  expect(selected.sort()).toEqual([nouns[0],nouns[2]].sort());
 }));

 test("search count metadata counts dictionary units without article hydration",()=>withTransaction(pool,async c=>{
  const {user,dictionary}=await fixture(c);
  const response=(await c.query("select search_library_category_v1($1,'vocabfiets','nl',$2,$3,null,'headwords',100,null) r",[user,[dictionary],{parts:[],article:null,vocabulary:options}])).rows[0].r;
  expect(response.groups[0].wordGroupCount).toBe(2);expect(response.groups[0].items).toHaveLength(4);
 }));
 test("collection handoff retains Library language even when collection primary language differs",()=>withTransaction(pool,async c=>{
  const {user,entries}=await fixture(c);
  await c.query("insert into languages(code,name) values('en','English') on conflict do nothing");
  const dictionary=(await c.query(`insert into dictionaries(language_code,slug,name,kind,visibility,owner_user_id,schema_key,schema_version) values('en',$1,'English personal','user','private',$2,'user-entry-v1',1) returning id`,[`english-${randomUUID()}`,user])).rows[0].id;
  const english=(await c.query(`insert into word_entries(dictionary_id,language_code,headword,part_of_speech,management_kind,raw) values($1,'en','englishfixture','noun','user','{"meanings":[{"definition":"An English fixture."}]}') returning id`,[dictionary])).rows[0].id;
  const list=(await c.query("insert into user_word_lists(user_id,name,language_code,primary_language_code) values($1,'Mixed fixture','nl','nl') returning id",[user])).rows[0].id;
  await c.query("insert into user_word_list_items(list_id,word_id) values($1,$2),($1,$3)",[list,english,entries['vocabfiets:zn'][0]]);
  const filter={librarySelection:{query:'',category:'headwords',languageCode:'en'}};
  const count=(await c.query("select read_training_recipe_availability_v1($1,ARRAY['word-to-definition'],$2,'user',$3,'meaning') r",[user,list,filter])).rows[0].r;expect(count.newCards).toBe(1);
  const plan=(await c.query("select start_training_session($1,ARRAY['word-to-definition'],$2,'user','new',$3,'5',$4,2) r",[user,list,filter,randomUUID()])).rows[0].r;expect(plan.plannedTotal).toBe(1);
  expect((await c.query("select entry_id from training_session_members where session_id=$1",[plan.sessionId])).rows.map(r=>r.entry_id)).toEqual([english]);
 }));

 test.each(['idiom','word-in-context'] as const)('source selection for %s separates learning, new and Already Know without changing card state',family=>withTransaction(pool,async c=>{
  const {user,entries,filter}=await fixture(c);const nouns=entries['vocabfiets:zn'];
  // Exact parent meanings: studying the first does not make its sibling studied.
  await c.query("insert into user_card_status(user_id,entry_id,card_type_id,in_learning,fsrs_enabled) values($1,$2,'word-to-definition',true,true)",[user,nouns[0]]);
  const event=(await c.query("insert into user_card_action_events(user_id,entry_id,card_type_id,action,client_event_id,action_payload_hash) values($1,$2,'word-to-definition','mark-known',$3,'source-known') returning id",[user,nouns[1],randomUUID()])).rows[0].id;
  await c.query("insert into user_card_known_marks(user_id,entry_id,card_type_id,mark_event_id) values($1,$2,'word-to-definition',$3)",[user,nouns[1],event]);
  for(const entry of nouns){const node=randomUUID();await c.query(`insert into private.platform_v2_content_nodes(id,entry_id,parent_content_node_id,kind,binding_state,first_source_revision,last_source_revision,source_text_fingerprint,diagnostic_locator) values($1,$2,null,'idiom','active','v1','v1',$3,'test.idiom'),($4,$2,$1,'idiom-explanation','active','v1','v1',$5,'test.explanation')`,[node,entry,`idiom-${node}`,randomUUID(),`explanation-${node}`]);}
  await c.query("insert into user_card_status(user_id,entry_id,card_type_id,in_learning,fsrs_enabled,fsrs_reps,last_reviewed_at) values($1,$2,'word-to-definition',false,false,2,now()-interval '5 days')",[user,nouns[3]]);
  expect((await c.query("select private.training_source_word_selected_v1($1,$2,'learning') ok",[user,nouns[3]])).rows[0].ok).toBe(false);
  const context=family==='word-in-context';const modes=context?['definition-to-word']:['idiom:direct'];
  const scope={...filter,partOfSpeech:['zn'],vocabulary:{...options,meanings:3},...(context?{presentationMode:'word-in-context'}:{})};
  const count=async(sourceWordStatus:string)=>(await c.query("select read_training_recipe_availability_v1($1,$2,null,'curated',$3,$4) r",[user,modes,{...scope,sourceWordStatus},context?'meaning':'idiom'])).rows[0].r;
  expect((await c.query("select private.training_source_word_selected_v1($1,$2,'all') ok",[user,nouns[1]])).rows[0].ok).toBe(true);
  const before=(await c.query("select count(*)::int n from user_card_status where user_id=$1",[user])).rows[0].n;
  expect((await count('learning')).newCards).toBe(1);
  expect((await count('all')).newCards).toBe(context ? 2 : 3);
  expect((await c.query("select count(*)::int n from user_card_status where user_id=$1",[user])).rows[0].n).toBe(before);
  if(context){
   const plan=(await c.query("select start_training_session($1,$2,null,'curated','new',$3,'5',$4,2) r",[user,modes,{...scope,sourceWordStatus:'all'},randomUUID()])).rows[0].r;
   expect(plan.plannedTotal).toBe(2);
   const selected=(await c.query("select entry_id from training_session_members where session_id=$1",[plan.sessionId])).rows.map(r=>r.entry_id);
   expect(selected.sort()).toEqual([nouns[0],nouns[2]].sort());
   // New source meanings can be rendered through their actual stored example.
   expect((await c.query("select read_training_word_context_member($1,$2,$3) r",[user,plan.sessionId,nouns[2]])).rows[0].r).toMatchObject({entryId:nouns[2]});
  } else {
   const selected=(await c.query("select entry_id from private.training_idiom_source_nodes_v1($1,'direct',null,'curated',$2)",[user,{...scope,sourceWordStatus:'learning'}])).rows.map(r=>r.entry_id);
   expect(selected).toEqual([nouns[0]]);
  }
 }));
 test('invalid source status is rejected instead of silently broadening the selection',()=>withTransaction(pool,async c=>{
  const {user,filter}=await fixture(c);
  await expect(c.query("select read_training_recipe_availability_v1($1,ARRAY['definition-to-word'],null,'curated',$2,'meaning')",[user,{...filter,presentationMode:'word-in-context',sourceWordStatus:'known'}])).rejects.toThrow('invalid_training_filter');
 }));

 test.each(["all","frequency"].flatMap(mode=>[{mode,jit:"off",profile:"spoken"},{mode,jit:"on",profile:"spoken"},{mode,jit:"off",profile:"written"},{mode,jit:"on",profile:"written"}]))("frequency availability narrows before meaning checks ($mode, $profile, jit $jit)",({mode,jit,profile})=>withTransaction(pool,async c=>{
  const {user,dictionary,filter}=await fixture(c);
  // A call budget catches full-dictionary scans without flaky timing assertions.
  await c.query(`insert into word_entries(dictionary_id,language_code,headword,meaning_id,part_of_speech,raw)
   select $1,'nl','unranked-scale-'||n,1,'zn','{"meanings":[{"definition":"Scale fixture"}]}'::jsonb
   from generate_series(1,1000) n`,[dictionary]);
  await c.query(`insert into user_card_status(user_id,entry_id,card_type_id,fsrs_enabled,in_learning,fsrs_reps,last_reviewed_at,next_review_at)
   select $1,id,'word-to-definition',true,true,2,now()-interval '2 days',now()-interval '1 day'
   from word_entries where dictionary_id=$2 and headword not like 'unranked-scale-%'`,[user,dictionary]);
  await c.query(`set local jit=${jit}`);
  await c.query("create sequence private.vocabulary_selection_test_calls");
  await c.query("alter function private.vocabulary_entry_selected_v1(uuid,jsonb) rename to vocabulary_entry_selected_test_original");
  await c.query(`create function private.vocabulary_entry_selected_v1(p_entry_id uuid,p_value jsonb) returns boolean
   language plpgsql stable security definer set search_path=pg_catalog,public,private,pg_temp as $$
   begin
    perform nextval('private.vocabulary_selection_test_calls');
    return private.vocabulary_entry_selected_test_original(p_entry_id,p_value);
   end; $$`);
  const selection={...options,mode,profile,from:profile==="spoken"?1:2,to:profile==="spoken"?2:3};
  const expected=new Map<string|number,number>(mode==="frequency"?[["all",9],[1,3],[2,6],[3,8]]:[["all",11],[1,5],[2,8],[3,10]]);
  for(const [meanings,count] of expected){
   await c.query("alter sequence private.vocabulary_selection_test_calls restart with 1");
   const result=(await c.query("select read_training_recipe_availability_v1($1,ARRAY['word-to-definition'],null,'curated',$2,'meaning') r",[user,{...filter,vocabulary:{...selection,meanings}}])).rows[0].r;
   expect(result.totalReviews).toBe(count);
   const calls=Number((await c.query("select last_value from private.vocabulary_selection_test_calls")).rows[0].last_value);
   expect(calls).toBeLessThanOrEqual(20);
  }
 }));
 test("meaning selection keeps its planner setting inside a broad caller",()=>withTransaction(pool,async c=>{
  const {entries}=await fixture(c);
  // Observe the selector's actual call context without mutating an immutable
  // index expression or asserting a planner choice that depends on statistics.
  await c.query("alter function private.valid_vocabulary_selection_v1(jsonb) rename to valid_vocabulary_selection_test_original");
  await c.query(`create function private.valid_vocabulary_selection_v1(p_value jsonb) returns boolean
   language plpgsql stable set search_path=pg_catalog,public,private,pg_temp as $$
   begin
    if current_setting('enable_nestloop') <> 'on' then raise exception 'inherited_scheduler_nested_loop_setting'; end if;
    return private.valid_vocabulary_selection_test_original(p_value);
   end; $$`);
  await c.query("set local enable_nestloop=off");
  expect((await c.query("select private.vocabulary_entry_selected_v1($1,$2) selected",[entries['vocabfiets:zn'][0],{...options,meanings:1}])).rows[0].selected).toBe(true);
  expect((await c.query('show enable_nestloop')).rows[0].enable_nestloop).toBe('off');
 }));
 test.each(['bound-homonyms','unbound','mixed-bindings','pointer-first','archived-first','tied-source-order','tied-fallback-order'])("batch membership matches scalar selection: %s",variant=>withTransaction(pool,async c=>{
  const {entries}=await fixture(c,variant==='archived-first');const nouns=entries['vocabfiets:zn'];
  if(variant==='bound-homonyms')await c.query("update private.source_entry_bindings set source_group_key='second-homonym',sense_ordinal=sense_ordinal-2 where word_entry_id=any($1::uuid[])",[nouns.slice(2)]);
  if(variant==='unbound'||variant==='mixed-bindings')await c.query("update private.source_entry_bindings set binding_state='retired' where word_entry_id=any($1::uuid[])",[variant==='unbound'?Object.values(entries).flat():nouns.slice(2)]);
  if(variant==='pointer-first')await c.query(`update word_entries set raw='{"cross_reference":"vocabfiets","meanings":[]}' where id=$1`,[nouns[0]]);
  if(variant==='tied-source-order')await c.query("update private.source_entry_bindings set sense_ordinal=1 where word_entry_id=any($1::uuid[])",[nouns]);
  if(variant==='tied-fallback-order'){
   await c.query("update private.source_entry_bindings set binding_state='retired' where word_entry_id=any($1::uuid[])",[nouns]);
   await c.query("update word_entries set meaning_id=1 where id=any($1::uuid[])",[nouns]);
  }
  const ids=Object.values(entries).flat();
  for(const mode of ['all','frequency'])for(const profile of ['spoken','written'])for(const meanings of ['all',1,2,3,4,5])for(const materialKinds of [[],['word'],['other']]){
   const selection={...options,mode,profile,from:1,to:3,meanings,materialKinds};
   const expected=(await c.query("select id from private.active_word_entries where id=any($1::uuid[]) and private.vocabulary_entry_selected_v1(id,$2) order by id",[ids,selection])).rows.map(r=>r.id);
   const actual=(await c.query("select entry_id id from private.vocabulary_selected_entry_ids_v1($2,$1) where entry_id=any($1::uuid[]) order by entry_id",[ids,selection])).rows.map(r=>r.id);
   expect(actual).toEqual(expected);
  }
 }));
 test("batch selection keeps empty scopes empty and orders siblings outside a narrowed scope",()=>withTransaction(pool,async c=>{
  const {entries}=await fixture(c);const late=entries['vocabfiets:zn'][3];
  for(const mode of ['all','frequency']){
   const selection={...options,mode,meanings:1};
   expect((await c.query("select * from private.vocabulary_selected_entry_ids_v1($1,ARRAY[]::uuid[])",[selection])).rows).toEqual([]);
   expect((await c.query("select * from private.vocabulary_selected_entry_ids_v1($1,$2)",[selection,[late]])).rows).toEqual([]);
  }
 }));
 test("batch fallback matches scalar null-dictionary units and personal singletons",()=>withTransaction(pool,async c=>{
  const {user}=await fixture(c);
  const personal=(await c.query(`insert into dictionaries(language_code,slug,name,kind,visibility,owner_user_id,schema_key,schema_version) values('nl',$1,'Personal','user','private',$2,'user-entry-v1',1) returning id`,[`personal-${randomUUID()}`,user])).rows[0].id;
  const ids:string[]=[];
  for(const dictionary of [null,personal])for(let n=1;n<=3;n++){
   const e=(await c.query(`insert into word_entries(dictionary_id,language_code,headword,meaning_id,part_of_speech,management_kind,raw) values($1,'nl','vocabfiets',$2,$3,$4,'{"meanings":[{"definition":"Personal fixture"}]}') returning id`,[dictionary,n,n===1?'NOUN':'zn',dictionary?'user':'source'])).rows[0].id;
   ids.push(e);
  }
  for(const mode of ['all','frequency'])for(const meanings of ['all',1,2,3,4,5]){
   const selection={...options,mode,meanings};
   const expected=(await c.query("select id from private.active_word_entries where id=any($1::uuid[]) and private.vocabulary_entry_selected_v1(id,$2) order by id",[ids,selection])).rows.map(r=>r.id);
   const actual=(await c.query("select entry_id id from private.vocabulary_selected_entry_ids_v1($2,$1) order by entry_id",[ids,selection])).rows.map(r=>r.id);
   expect(actual).toEqual(expected);
  }
 }));
 test("inactive malformed private selections stay closed",()=>withTransaction(pool,async c=>{
  const {user,filter}=await fixture(c);const scope={...filter,vocabulary:{}};
  expect((await c.query("select count(*)::int n from private.training_recipe_eligible_cards_v1($1,ARRAY['word-to-definition'],null,'curated','both','auto',ARRAY[]::uuid[],ARRAY[]::text[],$2,false,false)",[user,scope])).rows[0].n).toBe(0);
  expect((await c.query("select count(*)::int n from private.training_idiom_source_nodes_v1($1,'direct',null,'curated',$2)",[user,scope])).rows[0].n).toBe(0);
 }));
 test("nonfrequency context and multi-idiom parents share batch membership",()=>withTransaction(pool,async c=>{
  const {user,entries,filter}=await fixture(c);const nouns=entries['vocabfiets:zn'];
  const scope={...filter,partOfSpeech:['zn'],sourceWordStatus:'all',vocabulary:{...options,mode:'all',meanings:2}};
  const context=(await c.query("select read_training_recipe_availability_v1($1,ARRAY['definition-to-word'],null,'curated',$2,'meaning') r",[user,{...scope,presentationMode:'word-in-context'}])).rows[0].r;
  expect(context).toMatchObject({newCards:2,totalWords:1,totalMeanings:2,totalCards:2});
  for(const entry of nouns)for(let i=0;i<10;i++){
   const node=randomUUID();await c.query(`insert into private.platform_v2_content_nodes(id,entry_id,parent_content_node_id,kind,binding_state,first_source_revision,last_source_revision,source_text_fingerprint,diagnostic_locator) values($1,$2,null,'idiom','active','v1','v1',$3,'test.idiom'),($4,$2,$1,'idiom-explanation','active','v1','v1',$5,'test.explanation')`,[node,entry,`idiom-${node}`,randomUUID(),`explanation-${node}`]);
  }
  await c.query("create sequence private.idiom_selection_test_calls");
  await c.query("alter function private.vocabulary_entry_selected_v1(uuid,jsonb) rename to vocabulary_entry_selected_test_original");
  await c.query(`create function private.vocabulary_entry_selected_v1(p_entry_id uuid,p_value jsonb) returns boolean
   language plpgsql stable security definer set search_path=pg_catalog,public,private,pg_temp as $$
   begin perform nextval('private.idiom_selection_test_calls'); return private.vocabulary_entry_selected_test_original(p_entry_id,p_value); end; $$`);
  const idioms=(await c.query("select read_training_recipe_availability_v1($1,ARRAY['idiom:direct'],null,'curated',$2,'idiom') r",[user,scope])).rows[0].r;
  expect(idioms).toMatchObject({newCards:20,totalWords:1,totalMeanings:2,totalCards:20});
  expect(Number((await c.query("select last_value from private.idiom_selection_test_calls")).rows[0].last_value)).toBeLessThanOrEqual(4);
 }));
 test("batch context candidates match legacy and explicit source-word rules",()=>withTransaction(pool,async c=>{
  const {user,entries}=await fixture(c);const nouns=entries['vocabfiets:zn'];
  await c.query(`insert into user_card_status(user_id,entry_id,card_type_id,in_learning,fsrs_enabled,fsrs_reps,last_reviewed_at)
   values($1,$2,'word-to-definition',true,false,0,null),($1,$3,'word-to-definition',false,true,0,null),($1,$4,'word-to-definition',false,false,2,now())`,[user,...nouns.slice(0,3)]);
  for(const [entry,mode] of [[nouns[3],'word-to-definition'],[nouns[0],'definition-to-word']]){
   const event=(await c.query("insert into user_card_action_events(user_id,entry_id,card_type_id,action,client_event_id,action_payload_hash) values($1,$2,$3,'mark-known',$4,'context-known') returning id",[user,entry,mode,randomUUID()])).rows[0].id;
   await c.query("insert into user_card_known_marks(user_id,entry_id,card_type_id,mark_event_id) values($1,$2,$3,$4)",[user,entry,mode,event]);
  }
  await c.query("update private.platform_v2_content_nodes set diagnostic_locator='invalid.locator' where entry_id=$1 and kind='example'",[entries['vocabfiets:ww'][0]]);
  await c.query("update private.platform_v2_content_nodes set binding_state='retired' where entry_id=$1 and kind='example'",[entries['vocabvoor:vv'][0]]);
  const ids=Object.values(entries).flat();
  for(const filter of [{},{sourceWordStatus:'learning'},{sourceWordStatus:'all'}]){
   const expected=(await c.query("select id from word_entries where id=any($1::uuid[]) and private.training_word_context_candidate_v1($2,id,'definition-to-word',$3) order by id",[ids,user,filter])).rows.map(r=>r.id);
   const actual=(await c.query("select entry_id from private.training_word_context_entry_ids_v1($1,$2,$3) order by entry_id",[user,filter,ids])).rows.map(r=>r.entry_id);
   expect(actual).toEqual(expected);
   expect((await c.query("select * from private.training_word_context_entry_ids_v1($1,$2,ARRAY[]::uuid[])",[user,filter])).rows).toEqual([]);
  }
 }));
 test("context setup batches example checks and keeps private direct cards unavailable",()=>withTransaction(pool,async c=>{
  const {user,dictionary,filter}=await fixture(c);
  await c.query(`insert into word_entries(dictionary_id,language_code,headword,meaning_id,part_of_speech,raw)
   select $1,'nl','context-unrelated-'||n,1,'zn','{}' from generate_series(1,1000) n`,[dictionary]);
  await c.query("create sequence private.context_selection_test_calls");
  await c.query("alter function private.training_word_context_candidate_v1(uuid,uuid,text,jsonb) rename to training_word_context_candidate_test_original");
  await c.query(`create function private.training_word_context_candidate_v1(p_user uuid,p_entry uuid,p_mode text,p_filter jsonb) returns boolean language plpgsql stable as $$
   begin perform nextval('private.context_selection_test_calls'); return private.training_word_context_candidate_test_original(p_user,p_entry,p_mode,p_filter); end; $$`);
  const scope={...filter,partOfSpeech:['zn'],sourceWordStatus:'all',presentationMode:'word-in-context',vocabulary:{...options,mode:'all',meanings:2}};
  expect((await c.query("select read_training_recipe_availability_v1($1,ARRAY['definition-to-word'],null,'curated',$2,'meaning') r",[user,scope])).rows[0].r.newCards).toBe(2);
  expect(Number((await c.query("select last_value from private.context_selection_test_calls")).rows[0].last_value)).toBeLessThanOrEqual(4);
  expect((await c.query("select count(*)::int n from private.training_recipe_eligible_cards_v1($1,ARRAY['word-to-definition'],null,'curated','both','auto',ARRAY[]::uuid[],ARRAY[]::text[],$2,false,false)",[user,scope])).rows[0].n).toBe(0);
 }));

});

describe.skipIf(!url)("written POS observations preserve spelling frequency",()=>{
 const pool=new Pool({connectionString:url});beforeAll(()=>runMigrations(pool),120000);afterAll(()=>pool.end());
 test("written-only known POS precede unknown within a spelling, with complete cursor pages and revision invalidation",()=>withTransaction(pool,async c=>{
  const {user,dictionary,entries}=await fixture(c);
  const otherDictionary=await fixture(c);
  const unknown=entries['vocabonbekend:afk'][0];
  await c.query("update word_entries set headword='vocabfiets',part_of_speech='determiner' where id=$1",[unknown]);
  await c.query("select refresh_dictionary_search_document($1,2)",[unknown]);
  const read=async(sort:string,query:string|null=null,cursor:string|null=null)=>(await c.query(
   "select lookup_platform_v2_library_filtered_entries($1,$2,'nl',$3,$4,1,100,$5) r",[user,query,[dictionary,otherDictionary.dictionary],cursor,{parts:[],article:null,sort}])).rows[0].r;
  const collect=async(sort:string,query:string|null=null)=>{
   let cursor:string|null=null;const result:string[]=[];
   for(let n=0;n<20;n++){
    const page=await read(sort,query,cursor);expect(page.error).toBeUndefined();
    result.push(...page.items.map((e:{id:string})=>e.id));cursor=page.page.nextGroupCursor;
    if(!cursor)return result;
   }throw new Error('pagination_did_not_finish');
  };
  const spoken=await collect('spoken');const alphabetical=await collect('alphabetical');const withoutObservations=await collect('written');
  await c.query("insert into private.vocabulary_written_pos_profiles(language_code,revision) values('nl','fixture-pos-1')");
  await c.query("insert into private.vocabulary_written_pos_frequencies values('nl','vocabfiets','zn',10),('nl','vocabfiets','ww',25000000)");
  for(const query of [null,'vocabfiets']){
   const actual=await collect('written',query);
   const nouns=entries['vocabfiets:zn'],verbs=entries['vocabfiets:ww'];
   expect(actual.indexOf(verbs[0])).toBeLessThan(actual.indexOf(nouns[0]));
   expect(actual.indexOf(otherDictionary.entries['vocabfiets:ww'][0])).toBeLessThan(actual.indexOf(nouns[0]));
   expect(actual.indexOf(verbs[0])).toBeLessThan(actual.indexOf(otherDictionary.entries['vocabfiets:zn'][0]));
   expect(actual.indexOf(nouns.at(-1)!)).toBeLessThan(actual.indexOf(unknown));
   expect(new Set(actual).size).toBe(actual.length);
   expect(actual.filter(id=>[...nouns,...verbs,unknown].includes(id))).toHaveLength(7);
  }
  expect(await collect('spoken')).toEqual(spoken);expect(await collect('alphabetical')).toEqual(alphabetical);
  const first=await read('written');expect(first.page.nextGroupCursor).toBeTruthy();
  await c.query("update private.vocabulary_written_pos_profiles set revision='fixture-pos-2'");
  expect((await read('written',null,first.page.nextGroupCursor)).error).toBe('invalid_cursor');
  const headwordPage=(await c.query("select private.search_library_headwords_v1($1,false,'vocabfiets','nl',$2,100,null,$3) r",[user,[dictionary],{dictionaryIds:[dictionary],parts:[],article:null,sort:'written'}])).rows[0].r;
  expect(headwordPage.error).toBeUndefined();
  const categoryIds=headwordPage.items.map((x:{entry:{id:string}})=>x.entry.id);
  expect(categoryIds.indexOf(entries['vocabfiets:ww'][0])).toBeLessThan(categoryIds.indexOf(entries['vocabfiets:zn'][0]));
  expect(categoryIds.indexOf(entries['vocabfiets:zn'].at(-1)!)).toBeLessThan(categoryIds.indexOf(unknown));
  let categoryCursor:string|null=null;const categoryPaged:string[]=[];let categoryFirstCursor:string|null=null;
  for(let n=0;n<30;n++){
   const page=(await c.query("select search_library_category_v1($1,'vocabfiets','nl',$2,$3,null,'headwords',1,$4) r",[user,[dictionary],{parts:[],article:null,sort:'written'},categoryCursor])).rows[0].r;
   expect(page.error).toBeUndefined();categoryPaged.push(...page.groups[0].items.map((x:{entry:{id:string}})=>x.entry.id));
   categoryCursor=page.groups[0].page.nextCursor;if(n===0)categoryFirstCursor=categoryCursor;
   if(!categoryCursor)break;
  }
  expect(categoryCursor).toBeNull();expect(categoryPaged).toEqual(categoryIds);expect(categoryFirstCursor).toBeTruthy();
  await c.query("update private.vocabulary_written_pos_profiles set revision='fixture-pos-3'");
  const staleCategory=(await c.query("select search_library_category_v1($1,'vocabfiets','nl',$2,$3,null,'headwords',1,$4) r",[user,[dictionary],{parts:[],article:null,sort:'written'},categoryFirstCursor])).rows[0].r;
  expect(staleCategory.error).toBe('invalid_cursor');
  await c.query("delete from private.vocabulary_written_pos_profiles");
  expect(await collect('written')).toEqual(withoutObservations);
  expect(await collect('spoken')).toEqual(spoken);
 }));
 test("every inclusive range retains exactly its baseline meaning membership",()=>withTransaction(pool,async c=>{
  const {dictionary}=await fixture(c);
  await c.query("delete from private.vocabulary_frequency_ranks where profile='written' and language_code='nl'");
  await c.query("update private.vocabulary_frequency_profiles set max_rank=1500 where profile='written' and language_code='nl'");
  await c.query(`insert into private.vocabulary_frequency_ranks
   select 'nl','written',case n when 100 then 'vocabvoor' when 200 then 'vocabfiets' when 1250 then 'vocabuitdrukking' else 'unusedfixture'||n end,n from generate_series(1,1500) n`);
  const ranges=[[1,100],[1,200],[1,300],[200,400],[1000,1500]];
  const members=async()=>Promise.all(ranges.map(async([from,to])=>(await c.query(
   "select entry_id from private.vocabulary_selected_entry_ids_v1($1,ARRAY(select id from word_entries where dictionary_id=$2)) order by entry_id",
   [{...options,profile:'written',from,to,meanings:'all'},dictionary])).rows.map(r=>r.entry_id)));
  const before=await members();expect(before.map(x=>x.length)).toEqual([1,7,7,6,3]);
  await c.query("insert into private.vocabulary_written_pos_profiles(language_code,revision) values('nl','range-fixture')");
  await c.query("insert into private.vocabulary_written_pos_frequencies values('nl','vocabfiets','ww',2000),('nl','vocabuitdrukking','zn',9999999)");
  expect(await members()).toEqual(before);
 }));
});
