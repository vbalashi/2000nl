import {randomUUID} from 'crypto';
import {writeFileSync} from 'node:fs';
import {Pool,type PoolClient} from 'pg';
import {afterAll,beforeAll,describe,expect,test} from 'vitest';
import {ensureUserWithSettings,getDbUrl,runMigrations,withTransaction} from './dbTestUtils';

const url=getDbUrl();
const principal=(c:PoolClient,id:string)=>c.query("select set_config('request.jwt.claim.sub',$1,true)",[id]);
const summary=async(c:PoolClient,user:string,list:string,type='user')=>(await c.query('select get_word_list_summary($1,$2,$3) payload',[user,list,type])).rows[0].payload;
const selected=async(c:PoolClient,user:string)=>(await c.query("select get_active_training_scope($1,'nl') payload",[user])).rows[0].payload;
const select=async(c:PoolClient,user:string,list:string,type='user')=>(await c.query("select update_active_training_scope($1,'nl',$2,$3) payload",[user,list,type])).rows[0].payload;
const catalog=async(c:PoolClient,query='',language:string|null='nl',cursor:unknown=null,limit=50)=>(await c.query('select read_training_collection_catalog_v1($1,$2,$3,$4) payload',[query,language,cursor,limit])).rows[0].payload;
async function waitsFor(pool:Pool,pid:number,blocker:number){
 for(let attempt=0;attempt<200;attempt++){
  if((await pool.query('select $2=any(pg_blocking_pids($1)) waiting',[pid,blocker])).rows[0].waiting)return;
  await new Promise(resolve=>setTimeout(resolve,10));
 }
 throw Error('expected selected-material source protection lock');
}
async function fixture(c:PoolClient){
 const owner=randomUUID(),viewer=randomUUID(),outsider=randomUUID();
 for(const id of [owner,viewer,outsider])await ensureUserWithSettings(c,id);
 await principal(c,owner);
 const entries:string[]=[];
 for(let n=0;n<3;n++)entries.push((await c.query('select create_user_dictionary_entry($1,null,$2) id',[owner,{headword:randomUUID(),languageCode:'nl',definition:'meaning '+n}])).rows[0].id);
 const shared=(await c.query("insert into user_word_lists(user_id,name,description,language_code) values($1,'Shared lesson','private source description','nl') returning id",[owner])).rows[0].id;
 const privateList=(await c.query("insert into user_word_lists(user_id,name,language_code) values($1,'Unshared lesson','nl') returning id",[owner])).rows[0].id;
 for(const entry of entries.slice(0,2))await c.query('insert into user_word_list_items(list_id,word_id) values($1,$2)',[shared,entry]);
 const closedDictionary=(await c.query("insert into dictionaries(language_code,slug,name,kind,visibility,owner_user_id) values('nl',$1,'Closed source','curated','private',$2) returning id",[randomUUID(),owner])).rows[0].id;
 const closedEntry=(await c.query("insert into word_entries(dictionary_id,language_code,headword,raw) values($1,'nl','closed-'||$2::text,'{\"definition\":\"closed\"}') returning id",[closedDictionary,randomUUID()])).rows[0].id;
 await c.query('insert into user_word_list_items(list_id,word_id) values($1,$2)',[shared,closedEntry]);
 const own=(await c.query("insert into user_word_lists(user_id,name,language_code) values($1,'Own empty lesson','nl') returning id",[viewer])).rows[0].id;
 const curated=(await c.query("insert into word_lists(name,slug,language_code) values('Curated lesson',$1,'nl') returning id",[randomUUID()])).rows[0].id;
 await c.query('set local role authenticated');
 const opened=(await c.query("select command_collection_share_v1($1,'open',$2,0) payload",[randomUUID(),shared])).rows[0].payload;
 await principal(c,viewer);await c.query("select command_collection_share_v1($1,'accept',null,null,$2)",[randomUUID(),opened.invitationCode]);
 return {owner,viewer,outsider,shared,privateList,own,curated,entries,closedEntry};
}

(url?describe:describe.skip)('shared selected training material',()=>{
 const pool=new Pool({connectionString:url});beforeAll(()=>runMigrations(pool));afterAll(()=>pool.end());
 test('received selection persists and rehydrates with train-authorized counts but no owner metadata',async()=>withTransaction(pool,async c=>{
  const f=await fixture(c),read=await summary(c,f.viewer,f.shared);
  expect(read).toMatchObject({id:f.shared,name:'Shared lesson',ownership:'received',editable:false,user_word_list_items:[{count:2,available_count:2}]});
  expect(read).not.toHaveProperty('description');expect(read).not.toHaveProperty('card_policy');expect(JSON.stringify(read)).not.toContain('private source description');
  expect(await select(c,f.viewer,f.shared)).toMatchObject({active_list_id:f.shared,active_list_type:'user',active_list_ownership:'received',is_valid:true});
  expect(await selected(c,f.viewer)).toMatchObject({active_list_id:f.shared,active_list_type:'user',active_list_ownership:'received',is_valid:true});
  const ownCatalog=(await c.query("select get_available_word_lists($1,'nl','user') payload",[f.viewer])).rows[0].payload;
  expect(ownCatalog.map((row:{id:string})=>row.id)).toEqual([f.own]);
 }));
 test('close leaves an explicit unavailable selection without replacing stored intent',async()=>withTransaction(pool,async c=>{
  const f=await fixture(c);await select(c,f.viewer,f.shared);
  await principal(c,f.owner);await c.query("select command_collection_share_v1($1,'close',$2,1)",[randomUUID(),f.shared]);await principal(c,f.viewer);
  expect(await summary(c,f.viewer,f.shared)).toBeNull();
  expect(await selected(c,f.viewer)).toMatchObject({active_list_id:f.shared,active_list_type:'user',active_list_ownership:'received',is_valid:false,unavailable_reason:'shared_collection_unavailable'});
  await c.query('savepoint revoked_select');await expect(select(c,f.viewer,f.shared)).rejects.toThrow('user list is not available');await c.query('rollback to savepoint revoked_select');
  await c.query('reset role');expect((await c.query('select active_list_id from user_training_scopes where user_id=$1 and language_code=\'nl\'',[f.viewer])).rows[0].active_list_id).toBe(f.shared);
 }));
 test('own/curated selections remain compatible and foreign private/outsider selections stay denied',async()=>withTransaction(pool,async c=>{
  const f=await fixture(c);
  const own=await select(c,f.viewer,f.own);expect(own).toMatchObject({active_list_id:f.own,is_valid:true});expect(own).not.toHaveProperty('active_list_ownership');
  expect(await summary(c,f.viewer,f.own)).toMatchObject({id:f.own,name:'Own empty lesson',user_word_list_items:[{count:0}]});
  expect(await select(c,f.viewer,f.curated,'curated')).toMatchObject({active_list_id:f.curated,active_list_type:'curated',is_valid:true});
  expect(await summary(c,f.viewer,f.curated,'curated')).toMatchObject({id:f.curated,name:'Curated lesson'});
  expect(await summary(c,f.viewer,f.privateList)).toBeNull();await c.query('savepoint private_select');await expect(select(c,f.viewer,f.privateList)).rejects.toThrow('user list is not available');await c.query('rollback to savepoint private_select');
  await principal(c,f.outsider);expect(await summary(c,f.outsider,f.shared)).toBeNull();await c.query('savepoint outsider_select');await expect(select(c,f.outsider,f.shared)).rejects.toThrow('user list is not available');await c.query('rollback to savepoint outsider_select');
  await c.query('savepoint foreign_principal');await expect(selected(c,f.viewer)).rejects.toThrow('user_id does not match');await c.query('rollback to savepoint foreign_principal');
 }));
 test('archived and closed-catalog members cannot keep a received training selection valid',async()=>withTransaction(pool,async c=>{
  const f=await fixture(c);await select(c,f.viewer,f.shared);await principal(c,f.owner);
  for(const entry of f.entries.slice(0,2))await c.query('select delete_user_dictionary_entry($1,$2)',[f.owner,entry]);
  await principal(c,f.viewer);
  expect(await summary(c,f.viewer,f.shared)).toMatchObject({user_word_list_items:[{count:0,available_count:0}]});
  expect(await selected(c,f.viewer)).toMatchObject({active_list_id:f.shared,is_valid:false,active_list_ownership:'received',unavailable_reason:'shared_collection_unavailable'});
  await c.query('savepoint no_train_entry');await expect(select(c,f.viewer,f.shared)).rejects.toThrow('user list is not available');await c.query('rollback to savepoint no_train_entry');
 }));
 test('source deletion preserves received selection identity and helper grants stay closed',async()=>withTransaction(pool,async c=>{
  const f=await fixture(c);await select(c,f.viewer,f.shared);await principal(c,f.owner);
  await c.query('select delete_user_word_list($1,$2)',[f.owner,f.shared]);await principal(c,f.viewer);
  expect(await summary(c,f.viewer,f.shared)).toBeNull();
  expect(await selected(c,f.viewer)).toMatchObject({active_list_id:f.shared,is_valid:false,active_list_ownership:'received',unavailable_reason:'shared_collection_unavailable'});
  await c.query('reset role');
  for(const role of ['anon','authenticated','service_role']){
   expect((await c.query("select has_function_privilege($1,'private.received_collection_training_available_v1(uuid,uuid,text)','EXECUTE') allowed",[role])).rows[0].allowed).toBe(false);
   expect((await c.query("select has_function_privilege($1,'private.get_word_list_summary_owner_base_v1(uuid,uuid,text)','EXECUTE') allowed",[role])).rows[0].allowed).toBe(false);
  }
 }));
 test('a received scope without user_settings keeps the complete read contract',async()=>withTransaction(pool,async c=>{
  const f=await fixture(c);await select(c,f.viewer,f.shared);await c.query('reset role');
  await c.query('delete from user_settings where user_id=$1',[f.viewer]);await c.query('set local role authenticated');
  expect(await selected(c,f.viewer)).toMatchObject({language_code:'nl',active_list_id:f.shared,active_list_type:'user',active_list_ownership:'received',is_valid:true,
   active_scenario:'understanding',card_filter:'both',modes_enabled:['word-to-definition'],new_review_ratio:2,has_saved_scope:true});
 }));
 test('bounded training sources page own and received names under train authority and literal query',async()=>withTransaction(pool,async c=>{
  const f=await fixture(c),first=await catalog(c,'','nl',null,1),second=await catalog(c,'','nl',first.nextCursor,1);
  expect(first.collections).toEqual([{id:f.own,name:'Own empty lesson',ownership:'owned',availableItemCount:0}]);
  expect(second.collections).toEqual([{id:f.shared,name:'Shared lesson',ownership:'received',availableItemCount:2}]);expect(second.nextCursor).toBeNull();
  await c.query('reset role');await c.query("update user_word_lists set name='Own 100% lesson' where id=$1",[f.own]);await c.query('set local role authenticated');
  expect((await catalog(c,'%')).collections.map((row:{id:string})=>row.id)).toEqual([f.own]);
  expect((await catalog(c,'SHARED')).collections.map((row:{id:string})=>row.id)).toEqual([f.shared]);
  expect((await catalog(c,'','en')).collections).toEqual([]);
  await c.query('savepoint changed_query');await expect(catalog(c,'other','nl',first.nextCursor)).rejects.toThrow('invalid_catalog_cursor');await c.query('rollback to savepoint changed_query');
  await c.query('savepoint changed_language');await expect(catalog(c,'','en',first.nextCursor)).rejects.toThrow('invalid_catalog_cursor');await c.query('rollback to savepoint changed_language');
  await principal(c,f.outsider);await c.query('savepoint changed_account');await expect(catalog(c,'','nl',first.nextCursor)).rejects.toThrow('invalid_catalog_cursor');await c.query('rollback to savepoint changed_account');expect((await catalog(c)).collections).toEqual([]);
  await principal(c,f.owner);await c.query("select command_collection_share_v1($1,'close',$2,1)",[randomUUID(),f.shared]);await principal(c,f.viewer);
  expect((await catalog(c,'','nl',first.nextCursor)).collections).toEqual([]);
 }));
 test('received browse-only premium material is not offered as trainable',async()=>withTransaction(pool,async c=>{
  const f=await fixture(c);await c.query('reset role');await principal(c,f.owner);
  const dictionary=(await c.query("insert into dictionaries(language_code,slug,name,kind,visibility,publication_state,minimum_subscription_tier,owner_user_id) values('nl',$1,'Premium source','curated','public','general','premium',$2) returning id",[randomUUID(),f.owner])).rows[0].id;
  const entry=(await c.query("insert into word_entries(dictionary_id,language_code,headword,raw) values($1,'nl',$2,'{\"definition\":\"premium\"}') returning id",[dictionary,randomUUID()])).rows[0].id;
  const list=(await c.query("insert into user_word_lists(user_id,name,language_code) values($1,'Premium lesson','nl') returning id",[f.owner])).rows[0].id;
  await c.query('insert into user_word_list_items(list_id,word_id) values($1,$2)',[list,entry]);await c.query('set local role authenticated');
  const code=(await c.query("select command_collection_share_v1($1,'open',$2,0) payload",[randomUUID(),list])).rows[0].payload.invitationCode;
  await principal(c,f.viewer);await c.query("select command_collection_share_v1($1,'accept',null,null,$2)",[randomUUID(),code]);
  expect((await c.query("select can_browse_dictionary($1,$2) browse,can_access_dictionary($1,$2,'read') train",[f.viewer,dictionary])).rows[0]).toEqual({browse:true,train:false});
  expect((await catalog(c,'Premium')).collections).toEqual([]);
  await principal(c,f.owner);for(const id of f.entries.slice(0,2))await c.query('select delete_user_dictionary_entry($1,$2)',[f.owner,id]);await principal(c,f.viewer);
  expect((await catalog(c)).collections.map((row:{id:string})=>row.id)).toEqual([f.own]);
 }));
 test('ineligible received resources before the page do not hide later eligible rows',async()=>withTransaction(pool,async c=>{
  const f=await fixture(c);await c.query('reset role');
  const lists=(await c.query("insert into user_word_lists(user_id,name,language_code) select $1,'A empty '||lpad(n::text,3,'0'),'nl' from generate_series(1,101) n returning id",[f.owner])).rows.map(row=>row.id);
  await c.query('insert into private.collection_sharing_roots(owner_user_id,collection_id,is_open) select $1,unnest($2::uuid[]),true',[f.owner,lists]);
  await c.query('insert into private.collection_sharing_subscriptions(user_id,root_id,access_lifetime) select $1,id,access_lifetime from private.collection_sharing_roots where collection_id=any($2::uuid[])',[f.viewer,lists]);
  await c.query('set local role authenticated');const page=await catalog(c,'','nl',null,1);
  expect(page.collections.map((row:{id:string})=>row.id)).toEqual([f.own]);expect(page.nextCursor).not.toBeNull();
  expect((await catalog(c,'','nl',page.nextCursor,1)).collections.map((row:{id:string})=>row.id)).toEqual([f.shared]);
  for(const [query,language,limit] of [['x'.repeat(101),'nl',50],['','x'.repeat(17),50],['','nl',101]] as const){await c.query('savepoint bad_catalog');await expect(catalog(c,query,language,null,limit)).rejects.toThrow('invalid_catalog_request');await c.query('rollback to savepoint bad_catalog');}
  await c.query('reset role');for(const role of ['anon','service_role'])expect((await c.query("select has_function_privilege($1,'public.read_training_collection_catalog_v1(text,text,jsonb,integer)','EXECUTE') allowed",[role])).rows[0].allowed).toBe(false);
 }));
 test('saved training references resolve only the bounded requested current resources',async()=>withTransaction(pool,async c=>{
  const f=await fixture(c),read=async(ids:string[])=>(await c.query("select read_training_collection_summaries_v1($1,'nl') payload",[ids])).rows[0].payload;
  expect(await read([f.shared])).toEqual({collections:[{id:f.shared,name:'Shared lesson',ownership:'received',availableItemCount:2}]});
  expect((await read([f.shared,f.own,f.privateList,randomUUID()])).collections.map((row:{id:string})=>row.id)).toEqual([f.own,f.shared]);
  expect(await read([])).toEqual({collections:[]});
  for(const ids of [[f.shared,f.shared],Array(101).fill(f.shared)]){await c.query('savepoint invalid_references');await expect(read(ids)).rejects.toThrow('invalid_training_references');await c.query('rollback to savepoint invalid_references');}
  await principal(c,f.outsider);expect(await read([f.shared,f.own])).toEqual({collections:[]});
  await principal(c,f.owner);await c.query("select command_collection_share_v1($1,'close',$2,1)",[randomUUID(),f.shared]);await principal(c,f.viewer);expect(await read([f.shared])).toEqual({collections:[]});
  await c.query('reset role');for(const role of ['anon','service_role'])expect((await c.query("select has_function_privilege($1,'public.read_training_collection_summaries_v1(uuid[],text)','EXECUTE') allowed",[role])).rows[0].allowed).toBe(false);
  for(const role of ['anon','authenticated','service_role'])expect((await c.query("select has_function_privilege($1,'private.training_collection_catalog_cohort_v1(uuid,text,text,uuid,text,integer,uuid[])','EXECUTE') allowed",[role])).rows[0].allowed).toBe(false);
 }));
 test('owned mixed material is discovered and selectable only in an authorized member language',async()=>withTransaction(pool,async c=>{
  const f=await fixture(c);await c.query('reset role');await principal(c,f.viewer);
  await c.query("insert into languages(code,name) values('en','English'),('de','Deutsch') on conflict(code) do nothing");
  const entries:string[]=[];for(const language of ['nl','en'])entries.push((await c.query('select create_user_dictionary_entry($1,null,$2) id',[f.viewer,{headword:randomUUID(),languageCode:language,definition:'own mixed'}])).rows[0].id);
  const mixed=(await c.query("insert into user_word_lists(user_id,name,language_code,primary_language_code) values($1,'Mixed own lesson','en','en') returning id",[f.viewer])).rows[0].id;
  for(const entry of entries)await c.query('insert into user_word_list_items(list_id,word_id) values($1,$2)',[mixed,entry]);
  const closedDictionary=(await c.query("insert into dictionaries(language_code,slug,name,kind,visibility,owner_user_id) values('en',$1,'Closed English','curated','private',$2) returning id",[randomUUID(),f.owner])).rows[0].id;
  const closedEntry=(await c.query("insert into word_entries(dictionary_id,language_code,headword,raw) values($1,'en',$2,'{\"definition\":\"closed\"}') returning id",[closedDictionary,randomUUID()])).rows[0].id;
  const falseMixed=(await c.query("insert into user_word_lists(user_id,name,language_code,primary_language_code) values($1,'False mixed lesson','en','en') returning id",[f.viewer])).rows[0].id;
  for(const entry of [entries[0],closedEntry])await c.query('insert into user_word_list_items(list_id,word_id) values($1,$2)',[falseMixed,entry]);
  await c.query('set local role authenticated');
  expect((await catalog(c,'Mixed own')).collections).toEqual([{id:mixed,name:'Mixed own lesson',ownership:'owned',availableItemCount:1}]);
  expect(await select(c,f.viewer,mixed)).toMatchObject({active_list_id:mixed,is_valid:true});expect(await selected(c,f.viewer)).toMatchObject({active_list_id:mixed,is_valid:true});
  expect((await catalog(c,'Mixed own','de')).collections).toEqual([]);
  expect((await catalog(c,'False mixed')).collections).toEqual([]);
  await c.query('savepoint closed_mixed_select');await expect(select(c,f.viewer,falseMixed)).rejects.toThrow('user list is not available');await c.query('rollback to savepoint closed_mixed_select');
  await c.query('savepoint missing_mixed_language');await expect(c.query("select update_active_training_scope($1,'de',$2,'user')",[f.viewer,mixed])).rejects.toThrow('user list is not available');await c.query('rollback to savepoint missing_mixed_language');
 }));
 (process.env.SHARED_ACCESS_SCALE==='1'?test:test.skip)('training picker stays bounded on a100k-entry/1000-resource scope',async()=>{
  const samples:unknown[]=[];
  try{await withTransaction(pool,async c=>{
   const owner=randomUUID(),viewer=randomUUID();for(const id of [owner,viewer])await ensureUserWithSettings(c,id);await principal(c,owner);
   const dictionary=(await c.query("select ensure_user_dictionary($1,'nl','training scale') id",[owner])).rows[0].id;
   await c.query("set local statement_timeout='120s'");
   await c.query('create temporary table training_scale_entries(n integer primary key,id uuid not null) on commit drop');
   await c.query('insert into training_scale_entries select n,gen_random_uuid() from generate_series(1,100000) n');
   for(const trigger of ['trg_ensure_platform_v2_user_group','trg_reconcile_platform_v2_user_entry'])await c.query(`alter table word_entries disable trigger ${trigger}`);
   await c.query("insert into word_entries(id,dictionary_id,language_code,headword,meaning_id,raw) select id,$1,'nl','training-scale-'||n,1,jsonb_build_object('definition','definition '||n) from training_scale_entries",[dictionary]);
   for(const trigger of ['trg_ensure_platform_v2_user_group','trg_reconcile_platform_v2_user_entry'])await c.query(`alter table word_entries enable trigger ${trigger}`);
   await c.query('create temporary table training_scale_lists(n integer primary key,id uuid not null) on commit drop');
   await c.query('insert into training_scale_lists select n,gen_random_uuid() from generate_series(1,1000) n');
   await c.query("insert into user_word_lists(id,user_id,name,language_code) select id,$1,'Training scale '||lpad(n::text,4,'0'),'nl' from training_scale_lists",[owner]);
   await c.query('insert into user_word_list_items(list_id,word_id) select list.id,entry.id from training_scale_entries entry join training_scale_lists list on list.n=((entry.n-1)/100)+1');
   await c.query('insert into private.collection_sharing_roots(owner_user_id,collection_id,is_open) select $1,id,true from training_scale_lists',[owner]);
   await c.query('insert into private.collection_sharing_subscriptions(user_id,root_id,access_lifetime) select $1,id,access_lifetime from private.collection_sharing_roots where owner_user_id=$2',[viewer,owner]);
   for(const relation of ['word_entries','dictionaries','user_word_list_items','private.collection_sharing_roots','private.collection_sharing_subscriptions'])await c.query('analyze '+relation);
   const ids=(await c.query('select id from training_scale_lists order by n limit 100')).rows.map(row=>row.id);
   await c.query('set local role authenticated');
   for(const actor of [owner,viewer]){
    await principal(c,actor);let started=performance.now();const first=await catalog(c,'training scale','nl',null,25),firstMs=performance.now()-started;
    expect(first.collections).toHaveLength(25);expect(first.nextCursor).not.toBeNull();expect(first.collections.every((row:{availableItemCount:number;ownership:string})=>row.availableItemCount===100&&row.ownership===(actor===owner?'owned':'received'))).toBe(true);
    started=performance.now();const second=await catalog(c,'training scale','nl',first.nextCursor,25),secondMs=performance.now()-started;
    expect(second.collections).toHaveLength(25);expect(new Set([...first.collections,...second.collections].map((row:{id:string})=>row.id)).size).toBe(50);
    started=performance.now();const references=(await c.query("select read_training_collection_summaries_v1($1,'nl') payload",[ids])).rows[0].payload,referenceMs=performance.now()-started;
    expect(references.collections).toHaveLength(100);expect(references.collections.every((row:{availableItemCount:number})=>row.availableItemCount===100)).toBe(true);
    samples.push({actor:actor===owner?'owner':'viewer',firstMs,secondMs,referenceMs,pageRows:25,referenceRows:100});
   }
   await c.query('reset role');expect((await c.query("select prosrc from pg_proc where oid='private.training_collection_catalog_cohort_v1(uuid,text,text,uuid,text,integer,uuid[])'::regprocedure")).rows[0].prosrc).not.toContain('entry_access_v1(');
  });}finally{for(const relation of ['word_entries','dictionaries','user_word_list_items','private.collection_sharing_roots','private.collection_sharing_subscriptions'])await pool.query('analyze '+relation);}
  if(process.env.TRAINING_CATALOG_SCALE_EVIDENCE_PATH)writeFileSync(process.env.TRAINING_CATALOG_SCALE_EVIDENCE_PATH,JSON.stringify({fixture:{entries:100000,collections:1000,membersPerCollection:100},samples},null,2));
 },180000);
 test('selection holds its source parent while the scope save waits, before concurrent deletion',async()=>{
  const setup=await pool.connect();let f!:Awaited<ReturnType<typeof fixture>>;
  try{await setup.query('begin');f=await fixture(setup);await select(setup,f.viewer,f.own);await setup.query('commit');}
  catch(error){await setup.query('rollback');throw error;}finally{setup.release();}
  const selector=await pool.connect(),deleter=await pool.connect(),blocker=await pool.connect();
  let selecting:Promise<unknown>|undefined,deleting:Promise<unknown>|undefined;
  try{
   await blocker.query('begin');await blocker.query("select 1 from user_training_scopes where user_id=$1 and language_code='nl' for update",[f.viewer]);
   await selector.query('begin');await principal(selector,f.viewer);await selector.query('set local role authenticated');
   await deleter.query('begin');await principal(deleter,f.owner);await deleter.query('set local role authenticated');
   const selectorPid=(await selector.query('select pg_backend_pid() pid')).rows[0].pid,blockerPid=(await blocker.query('select pg_backend_pid() pid')).rows[0].pid,deleterPid=(await deleter.query('select pg_backend_pid() pid')).rows[0].pid;
   selecting=select(selector,f.viewer,f.shared);await waitsFor(pool,selectorPid,blockerPid);
   deleting=deleter.query('select delete_user_word_list($1,$2)',[f.owner,f.shared]);await waitsFor(pool,deleterPid,selectorPid);
   await blocker.query('commit');expect(await selecting).toMatchObject({active_list_id:f.shared,active_list_ownership:'received',is_valid:true});
   await selector.query('commit');await deleting;await deleter.query('commit');
   await selector.query('begin');await principal(selector,f.viewer);await selector.query('set local role authenticated');
   expect(await selected(selector,f.viewer)).toMatchObject({active_list_id:f.shared,active_list_ownership:'received',is_valid:false,unavailable_reason:'shared_collection_unavailable'});
  }finally{
   await blocker.query('rollback');await selecting?.catch(()=>undefined);await selector.query('rollback');await deleting?.catch(()=>undefined);await deleter.query('rollback');
   selector.release();deleter.release();blocker.release();
   await pool.query('delete from word_entries where id=any($1)',[[...f.entries,f.closedEntry]]);
   await pool.query('delete from word_lists where id=$1',[f.curated]);await pool.query('delete from auth.users where id=any($1)',[[f.owner,f.viewer,f.outsider]]);
  }
 });
});
