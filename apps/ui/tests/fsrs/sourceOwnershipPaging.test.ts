import {randomUUID} from 'node:crypto';
import {Pool,type PoolClient} from 'pg';
import {beforeAll,afterAll,describe,test,expect} from 'vitest';
import {getDbUrl,runMigrations,ensureUserWithSettings,withTransaction} from './dbTestUtils';
const url=getDbUrl();
const principal=(c:PoolClient,user:string)=>c.query("select set_config('request.jwt.claim.sub',$1,true)",[user]);
async function fixture(c:PoolClient){
 await c.query("insert into languages(code,name) values('en','English') on conflict(code) do nothing");
 const owner=randomUUID(),reader=randomUUID(),other=randomUUID(),label=randomUUID();
 for(const user of [owner,reader,other])await ensureUserWithSettings(c,user);
 await principal(c,owner);
 const entry=async(user:string,languageCode:string)=>(await c.query('select create_user_dictionary_entry($1,null,$2) id',[user,{headword:randomUUID(),languageCode,definition:'source scope'}])).rows[0].id;
 const nl=await entry(owner,'nl'),en=await entry(owner,'en');
 const shared=(await c.query("insert into user_word_lists(user_id,name,language_code,primary_language_code) values($1,'Z received nl','nl','nl'),($1,'Z received mixed','en','en'),($1,'Z received en','en','en') returning id",[owner])).rows.map(row=>row.id);
 await c.query('insert into user_word_list_items(list_id,word_id) values($1,$4),($2,$4),($2,$5),($3,$5)',[...shared,nl,en]);
 await c.query("insert into private.collection_labels(id,user_id,name) values($1,$2,'shared root')",[label,owner]);
 await c.query('insert into private.collection_label_assignments select $1,unnest($2::uuid[]),$3',[owner,shared,label]);
 const group=(await c.query("select mutate_label_share_v1($1,'open',0) value",[label])).rows[0].value;
 await principal(c,reader);await c.query('select accept_label_share_v1($1)',[group.invitationCode]);
 const owned=(await c.query("insert into user_word_lists(user_id,name,language_code,primary_language_code) select $1,'A owned '||lpad(n::text,3,'0'),'nl','nl' from generate_series(1,60)n returning id",[reader])).rows.map(row=>row.id);
 const ownLabel=randomUUID();await c.query("insert into private.collection_labels(id,user_id,name) values($1,$2,'my published label')",[ownLabel,reader]);await c.query('insert into private.collection_label_assignments values($1,$2,$3)',[reader,owned[0],ownLabel]);await c.query("select mutate_label_share_v1($1,'open',0)",[ownLabel]);
 return {owner,reader,other,label,group,shared,owned};
}
(url?describe:describe.skip)('server ownership before source paging',()=>{
 const pool=new Pool({connectionString:url});beforeAll(()=>runMigrations(pool));afterAll(()=>pool.end());
 test('legacy personal all includes group-only sources without changing language authority',async()=>withTransaction(pool,async c=>{
  const f=await fixture(c);
  const page=(await c.query("select read_personal_collection_catalog_v1('Z received','name','all',null,'nl',null,50) value")).rows[0].value;
  expect(page.collections.map((row:{id:string})=>row.id).sort()).toEqual(f.shared.slice(0,2).sort());
 }));
 test('received first page bypasses sixty owned rows; kind and account cursors cannot cross',async()=>withTransaction(pool,async c=>{
  const f=await fixture(c);
  const personal=async(ownership='all',cursor:unknown=null,limit=50)=>(await c.query("select read_personal_collection_catalog_v2('','name','all',null,'nl',$1,$2,$3) value",[cursor,limit,ownership])).rows[0].value;
  const training=async(ownership='all',cursor:unknown=null,limit=50)=>(await c.query("select read_training_collection_catalog_v2('','nl',$1,$2,$3) value",[cursor,limit,ownership])).rows[0].value;
  await c.query('set local role authenticated');
  for(const read of [personal,training]){
   const all=await read();expect(all.collections).toHaveLength(50);expect(all.collections.every((row:{ownership:string})=>row.ownership==='owned')).toBe(true);expect(all.nextCursor).not.toBeNull();
   const received=await read('received');expect(received.collections.map((row:{id:string})=>row.id).sort()).toEqual(f.shared.slice(0,2).sort());expect(received.nextCursor).toBeNull();
   const owned=await read('owned');expect(owned.collections).toHaveLength(50);expect(owned.collections.every((row:{ownership:string})=>row.ownership==='owned')).toBe(true);
   const first=await read('received',null,1),second=await read('received',first.nextCursor,1);expect(new Set([...first.collections,...second.collections].map((row:{id:string})=>row.id)).size).toBe(2);expect(second.nextCursor).toBeNull();
   for(const kind of ['all','owned']){await c.query('savepoint cursor_kind');await expect(read(kind,first.nextCursor,1)).rejects.toThrow('invalid_catalog_cursor');await c.query('rollback to savepoint cursor_kind');}
   await principal(c,f.other);await c.query('savepoint cursor_account');await expect(read('received',first.nextCursor,1)).rejects.toThrow('invalid_catalog_cursor');await c.query('rollback to savepoint cursor_account');expect((await read('received')).collections).toEqual([]);await principal(c,f.reader);
   for(const kind of ['shared','published','',null]){await c.query('savepoint bad_kind');await expect(read(kind as string)).rejects.toThrow('invalid_catalog_request');await c.query('rollback to savepoint bad_kind');}
  }
  const legacyTraining=(await c.query("select read_training_collection_catalog_v1('','nl',null,50) value")).rows[0].value;expect(legacyTraining).toEqual(await training());
  const legacyPersonal=(await c.query("select read_personal_collection_catalog_v1('','name','all',null,'nl',null,50) value")).rows[0].value;expect(legacyPersonal).toEqual(await personal());
  const sharedOwned=(await personal('owned')).collections.find((row:{id:string})=>row.id===f.owned[0]);expect(sharedOwned).toMatchObject({ownership:'owned',isShared:true});
  await c.query('reset role');await principal(c,f.owner);
  const direct=(await c.query("select private.mutate_collection_share_v1($1,'open',$2,0) value",[randomUUID(),f.shared[0]])).rows[0].value;
  await principal(c,f.reader);await c.query('select private.accept_collection_share_v1($1,$2)',[randomUUID(),direct.invitationCode]);expect((await personal('received')).collections).toHaveLength(2);expect((await training('received')).collections).toHaveLength(2);
  await c.query("update private.label_sharing_subscriptions set accepted_at='2024-01-01T00:00:00Z' where user_id=$1",[f.reader]);
  await c.query("update private.collection_sharing_subscriptions set accepted_at='2025-01-01T00:00:00Z' where user_id=$1",[f.reader]);
  const recent=(await c.query("select read_personal_collection_catalog_v2('','recent','all',null,'nl',null,1,'received') value")).rows[0].value;
  expect(recent.collections[0].id).toBe(f.shared[0]);expect(recent.nextCursor.key).toBe('2025-01-01T00:00:00.000000Z');

  await principal(c,f.owner);await c.query("select mutate_label_share_v1($1,'close',1)",[f.label]);await principal(c,f.reader);
  for(const read of [personal,training])expect((await read('received')).collections.map((row:{id:string})=>row.id)).toEqual([f.shared[0]]);
  await principal(c,f.owner);await c.query("select private.mutate_collection_share_v1($1,'close',$2,1)",[randomUUID(),f.shared[0]]);await principal(c,f.reader);
  for(const read of [personal,training])expect((await read('received')).collections).toEqual([]);
  for(const fn of ['public.read_personal_collection_catalog_v2(text,text,text,uuid,text,jsonb,integer,text)','public.read_training_collection_catalog_v2(text,text,jsonb,integer,text)'])for(const role of ['anon','service_role'])expect((await c.query('select has_function_privilege($1,$2,\'execute\') allowed',[role,fn])).rows[0].allowed).toBe(false);
 }));
});
