import { randomUUID } from 'crypto';
import { Pool, type PoolClient } from 'pg';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { ensureUserWithSettings, getDbUrl, runMigrations, withTransaction } from './dbTestUtils';
const url = getDbUrl();
const principal = (c: PoolClient, id: string | null) => c.query("select set_config('request.jwt.claim.sub',$1,true)", [id ?? '']);
async function fixture(c: PoolClient) {
 const owner=randomUUID(), viewer=randomUUID(), outsider=randomUUID();
 for(const id of [owner,viewer,outsider])await ensureUserWithSettings(c,id);
 await principal(c,owner);
 const selected=(await c.query('select create_user_dictionary_entry($1,null,$2) id',[owner,{headword:randomUUID(),languageCode:'nl',definition:'shared lesson'}])).rows[0].id;
 const hidden=(await c.query('select create_user_dictionary_entry($1,null,$2) id',[owner,{headword:randomUUID(),languageCode:'nl',definition:'hidden sibling'}])).rows[0].id;
 const lists:string[]=[];
 for(let i=0;i<3;i++){
  const list=(await c.query('insert into user_word_lists(user_id,name) values($1,$2) returning id',[owner,'lesson '+i])).rows[0].id;
  await c.query('insert into user_word_list_items(list_id,word_id) values($1,$2)',[list,selected]);lists.push(list);
  const code=(await c.query("select private.mutate_collection_share_v1($1,'open',$2,0) payload",[randomUUID(),list])).rows[0].payload.invitationCode;
  await principal(c,viewer);await c.query('select private.accept_collection_share_v1($1,$2)',[randomUUID(),code]);await principal(c,owner);
 }
 const ownLabel=randomUUID(), foreignLabel=randomUUID();
 await c.query("select mutate_collection_labels_v1($1,0,$2)",[owner,{type:'create',id:foreignLabel,name:'Secret source organization'}]);
 await c.query("select mutate_collection_labels_v1($1,1,$2)",[owner,{type:'set-collection-labels',collection_id:lists[0],label_ids:[foreignLabel]}]);
 await principal(c,viewer);await c.query("select mutate_collection_labels_v1($1,0,$2)",[viewer,{type:'create',id:ownLabel,name:'My lessons'}]);
 return {owner,viewer,outsider,selected,hidden,lists,ownLabel,foreignLabel};
}
const page=async(c:PoolClient,after:string|null=null,limit=100)=>(await c.query('select private.read_received_collection_page_v1($1,$2) payload',[after,limit])).rows[0].payload;
const place=async(c:PoolClient,collection:string,revision:number,labels:string[])=>(await c.query('select private.set_received_collection_labels_v1($1,$2,$3) payload',[collection,revision,labels])).rows[0].payload;
async function denied(c:PoolClient,action:()=>Promise<unknown>,message:string){await c.query('savepoint denied');await expect(action()).rejects.toThrow(message);await c.query('rollback to savepoint denied');}
(url?describe:describe.skip)('received collection personal organization',()=>{
 const pool=new Pool({connectionString:url});beforeAll(()=>runMigrations(pool));afterAll(()=>pool.end());
 test('one source identity, only own labels, no imported author organization or secrets',async()=>withTransaction(pool,async c=>{
  const f=await fixture(c);const first=await page(c);expect(first.collections).toHaveLength(3);
  expect(first.collections.find((r:{id:string})=>r.id===f.lists[0])).toMatchObject({id:f.lists[0],ownerUserId:f.owner,itemCount:1,role:'viewer',labelIds:[]});
  expect(JSON.stringify(first)).not.toContain(f.foreignLabel);expect(JSON.stringify(first)).not.toContain('Secret source');expect(JSON.stringify(first)).not.toContain('invitation');
  expect(await place(c,f.lists[0],1,[f.ownLabel,f.ownLabel])).toEqual({collectionId:f.lists[0],revision:2,labelIds:[f.ownLabel]});
  expect((await page(c)).collections.find((r:{id:string})=>r.id===f.lists[0]).labelIds).toEqual([f.ownLabel]);
  expect((await c.query('select user_id from user_word_lists where id=$1',[f.lists[0]])).rows[0].user_id).toBe(f.owner);
  expect((await c.query('select count(*)::int n from private.collection_label_assignments where user_id=$1',[f.viewer])).rows[0].n).toBe(0);
 }));
 test('rejects foreign labels, stale revisions and inaccessible or own resources',async()=>withTransaction(pool,async c=>{
  const f=await fixture(c);
  await denied(c,()=>place(c,f.lists[0],1,[f.foreignLabel]),'label_not_found');
  await place(c,f.lists[0],1,[f.ownLabel]);await denied(c,()=>place(c,f.lists[0],1,[]),'label_catalog_conflict');
  await principal(c,f.outsider);await denied(c,()=>place(c,f.lists[0],0,[]),'collection_not_found');
  expect((await page(c)).collections).toEqual([]);
  await principal(c,f.owner);await denied(c,()=>place(c,f.lists[0],2,[]),'collection_not_found');expect((await page(c)).collections).toEqual([]);
 }));
 test('no-op assignments keep revision; clearing removes only recipient placements',async()=>withTransaction(pool,async c=>{
  const f=await fixture(c);await place(c,f.lists[0],1,[f.ownLabel]);expect((await place(c,f.lists[0],2,[f.ownLabel])).revision).toBe(2);
  expect((await place(c,f.lists[0],2,[])).revision).toBe(3);
  expect((await c.query('select count(*)::int n from private.collection_label_assignments where user_id=$1',[f.owner])).rows[0].n).toBe(1);
 }));
 test('closing hides retained placements and reopening requires explicit new acceptance',async()=>withTransaction(pool,async c=>{
  const f=await fixture(c);await place(c,f.lists[0],1,[f.ownLabel]);await principal(c,f.owner);
  await c.query("select private.mutate_collection_share_v1($1,'close',$2,1)",[randomUUID(),f.lists[0]]);
  await principal(c,f.viewer);expect((await page(c)).collections.some((r:{id:string})=>r.id===f.lists[0])).toBe(false);
  await denied(c,()=>place(c,f.lists[0],2,[]),'collection_not_found');
  await principal(c,f.owner);const reopened=(await c.query("select private.mutate_collection_share_v1($1,'open',$2,2) payload",[randomUUID(),f.lists[0]])).rows[0].payload;
  await principal(c,f.viewer);expect((await page(c)).collections).toHaveLength(2);
  await c.query('select private.accept_collection_share_v1($1,$2)',[randomUUID(),reopened.invitationCode]);
  expect((await page(c)).collections.find((r:{id:string})=>r.id===f.lists[0]).labelIds).toEqual([f.ownLabel]);
 }));
 test('unsubscribe does not create a duplicate; reaccept reuses original identity',async()=>withTransaction(pool,async c=>{
  const f=await fixture(c);await place(c,f.lists[0],1,[f.ownLabel]);await c.query('select private.unsubscribe_collection_share_v1($1,$2)',[randomUUID(),f.lists[0]]);
  expect((await page(c)).collections).toHaveLength(2);await denied(c,()=>place(c,f.lists[0],2,[]),'collection_not_found');
 }));
 test('label deletion cascades only its placements, keeping collections and descendant labels',async()=>withTransaction(pool,async c=>{
  const f=await fixture(c);const child=randomUUID();await c.query('select mutate_collection_labels_v1($1,1,$2)',[f.viewer,{type:'create',id:child,name:'Child',parent_id:f.ownLabel}]);
  await place(c,f.lists[0],2,[f.ownLabel,child]);await c.query('select mutate_collection_labels_v1($1,3,$2)',[f.viewer,{type:'delete',id:f.ownLabel}]);
  expect((await page(c)).collections.find((r:{id:string})=>r.id===f.lists[0]).labelIds).toEqual([child]);
  expect((await c.query('select parent_id from private.collection_labels where id=$1',[child])).rows[0].parent_id).toBeNull();
  expect((await page(c)).collections).toHaveLength(3);
 }));
 test('keyset pages traverse all resources once and do not count hidden source siblings',async()=>withTransaction(pool,async c=>{
  const f=await fixture(c);let cursor=null;const ids:string[]=[];
  do{const result=await page(c,cursor,1);expect(result.collections).toHaveLength(1);expect(result.collections[0].itemCount).toBe(1);ids.push(result.collections[0].id);cursor=result.nextCursor;}while(cursor);
  expect(ids).toEqual([...f.lists].sort());expect(new Set(ids).size).toBe(3);
  expect((await c.query('select private.entry_access_v1($1,$2,\'browse\') allowed',[f.viewer,f.hidden])).rows[0].allowed).toBe(false);
 }));
 test('API roles cannot read or mutate closed storage/helpers; principal and bounds fail closed',async()=>withTransaction(pool,async c=>{
  const f=await fixture(c);
  for(const role of ['anon','authenticated','service_role']){
   expect((await c.query("select has_table_privilege($1,'private.received_collection_label_placements','SELECT') allowed",[role])).rows[0].allowed).toBe(false);
   for(const fn of ['private.set_received_collection_labels_v1(uuid,bigint,uuid[])','private.read_received_collection_page_v1(uuid,integer)'])expect((await c.query("select has_function_privilege($1,$2,'EXECUTE') allowed",[role,fn])).rows[0].allowed).toBe(false);
  }
  await denied(c,()=>page(c,null,101),'invalid_catalog_request');
  await denied(c,()=>c.query('select private.set_received_collection_labels_v1($1,1,array[[$2::uuid]])',[f.lists[0],f.ownLabel]),'invalid_label_operation');
  await principal(c,null);await denied(c,()=>page(c),'unauthorized');
 }));
 test('recipient labels filter only live placed collections, including descendant projections',async()=>withTransaction(pool,async c=>{
  const f=await fixture(c);await place(c,f.lists[0],1,[f.ownLabel]);
  const material={kind:'label',id:f.ownLabel};
  expect((await c.query('select entry_id from private.library_material_entry_ids_v1($1,$2)',[f.viewer,material])).rows).toEqual([{entry_id:f.selected}]);
  await principal(c,f.owner);await c.query("select private.mutate_collection_share_v1($1,'close',$2,1)",[randomUUID(),f.lists[0]]);
  await principal(c,f.viewer);expect((await c.query('select entry_id from private.library_material_entry_ids_v1($1,$2)',[f.viewer,material])).rows).toEqual([]);
 }));
 test('counts exclude a curated source after it becomes closed',async()=>withTransaction(pool,async c=>{
  const f=await fixture(c);await principal(c,f.owner);
  const dictionary=(await c.query("insert into dictionaries(language_code,slug,name,kind,visibility,minimum_subscription_tier) values('nl',$1,'curated source','curated','system','free') returning id",[randomUUID()])).rows[0].id;
  const entry=(await c.query("insert into word_entries(dictionary_id,language_code,headword,meaning_id,raw) values($1,'nl',$2,1,'{\"definition\":\"common\"}') returning id",[dictionary,randomUUID()])).rows[0].id;
  await c.query('insert into user_word_list_items(list_id,word_id) values($1,$2)',[f.lists[0],entry]);await principal(c,f.viewer);
  expect((await page(c)).collections.find((r:{id:string})=>r.id===f.lists[0]).itemCount).toBe(2);
  await c.query("update dictionaries set publication_state='unpublished',visibility='private' where id=$1",[dictionary]);
  expect((await page(c)).collections.find((r:{id:string})=>r.id===f.lists[0]).itemCount).toBe(1);
 }));
 test('source deletion removes placements while the recipient label survives',async()=>withTransaction(pool,async c=>{
  const f=await fixture(c);await place(c,f.lists[0],1,[f.ownLabel]);await principal(c,f.owner);
  await c.query('delete from user_word_lists where id=$1',[f.lists[0]]);
  expect((await c.query('select count(*)::int n from private.received_collection_label_placements where collection_id=$1',[f.lists[0]])).rows[0].n).toBe(0);
  expect((await c.query('select id from private.collection_labels where id=$1',[f.ownLabel])).rows).toHaveLength(1);
 }));
 test('catalog continues past a full 100-row page without truncation or duplicate identities',async()=>withTransaction(pool,async c=>{
  const f=await fixture(c);await principal(c,f.owner);
  const extra=(await c.query("insert into user_word_lists(user_id,name) select $1,'bulk lesson '||n from generate_series(1,101) n returning id",[f.owner])).rows.map(r=>r.id);
  await c.query('insert into private.collection_sharing_roots(owner_user_id,collection_id,is_open) select $1,id,true from user_word_lists where id=any($2::uuid[])',[f.owner,extra]);
  await c.query('insert into user_word_list_items(list_id,word_id) select id,$1 from user_word_lists where id=any($2::uuid[])',[f.selected,extra]);
  await c.query('insert into private.collection_sharing_subscriptions(user_id,root_id,access_lifetime) select $1,id,access_lifetime from private.collection_sharing_roots where collection_id=any($2::uuid[])',[f.viewer,extra]);
  await principal(c,f.viewer);const first=await page(c);expect(first.collections).toHaveLength(100);expect(first.nextCursor).not.toBeNull();
  const second=await page(c,first.nextCursor);expect(second.collections).toHaveLength(4);expect(second.nextCursor).toBeNull();
  const records=[...first.collections,...second.collections];expect(records.every(r=>r.itemCount===1)).toBe(true);
  expect(records.map(r=>r.id)).toEqual([...f.lists,...extra].sort());
 }));
 test('placement and concurrent source deletion preserve parent-before-root order',async()=>{
  const actor=await pool.connect(),blocker=await pool.connect(),deleter=await pool.connect();
  let f:Awaited<ReturnType<typeof fixture>>|undefined;
  let writing:Promise<{ok:boolean;code?:string}>|undefined,deleting:Promise<{ok:boolean;code?:string}>|undefined;
  const wait=async(observer:PoolClient,pid:number)=>{
   for(let i=0;i<100;i++){
    await observer.query('select pg_stat_clear_snapshot()');
    if((await observer.query("select wait_event_type from pg_stat_activity where pid=$1",[pid])).rows[0]?.wait_event_type==='Lock')return;
    await new Promise(resolve=>setTimeout(resolve,10));
   }throw new Error('expected placement lock');
  };
  try{
   await actor.query('begin');f=await fixture(actor);await actor.query('commit');
   for(const c of [actor,blocker,deleter]){await c.query('begin');await c.query("set local statement_timeout='5s'");}
   await blocker.query('select 1 from private.collection_label_catalogs where user_id=$1 for update',[f.viewer]);
   await principal(actor,f.viewer);const actorPid=(await actor.query('select pg_backend_pid() id')).rows[0].id;
   const deletePid=(await deleter.query('select pg_backend_pid() id')).rows[0].id;
   writing=place(actor,f.lists[0],1,[f.ownLabel]).then(()=>({ok:true}),e=>({ok:false,code:e.code}));
   await wait(deleter,actorPid);await principal(deleter,f.owner);
   deleting=deleter.query('delete from user_word_lists where id=$1',[f.lists[0]]).then(()=>({ok:true}),e=>({ok:false,code:e.code}));
   await wait(blocker,deletePid);await blocker.query('commit');
   const written=await writing;await actor.query(written.ok?'commit':'rollback');
   const removed=await deleting;await deleter.query(removed.ok?'commit':'rollback');
   expect(written).toEqual({ok:true});expect(removed).toEqual({ok:true});
   expect((await actor.query('select count(*)::int n from private.received_collection_label_placements where collection_id=$1',[f.lists[0]])).rows[0].n).toBe(0);
  }finally{
   await blocker.query('rollback');await actor.query('rollback');await deleter.query('rollback');
   if(writing)await writing;if(deleting)await deleting;
   actor.release();blocker.release();deleter.release();
   if(f){const users=[f.owner,f.viewer,f.outsider];await pool.query('delete from user_word_lists where user_id=any($1::uuid[])',[users]);await pool.query('delete from word_entries where dictionary_id in(select id from dictionaries where owner_user_id=any($1::uuid[]))',[users]);await pool.query('delete from auth.users where id=any($1::uuid[])',[users]);}
  }
 });

});
