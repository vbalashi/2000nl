import {randomUUID} from 'crypto';
import {Pool,type PoolClient} from 'pg';
import {afterAll,beforeAll,describe,expect,test} from 'vitest';
import {ensureUserWithSettings,getDbUrl,runMigrations,withTransaction} from './dbTestUtils';
const url=getDbUrl();
const actor=(c:PoolClient,id:string)=>c.query("select set_config('request.jwt.claim.sub',$1,true)",[id]);
async function fixture(c:PoolClient){const owner=randomUUID(),other=randomUUID();for(const id of [owner,other])await ensureUserWithSettings(c,id);await actor(c,owner);const entry=(await c.query('select create_user_dictionary_entry($1,null,$2) id',[owner,{headword:randomUUID(),languageCode:'nl',definition:'owned'}])).rows[0].id;const list=(await c.query("insert into user_word_lists(user_id,name) values($1,'owned') returning id",[owner])).rows[0].id;await c.query('insert into user_word_list_items(list_id,word_id) values($1,$2)',[list,entry]);return {owner,other,entry,list};}
const command=async(c:PoolClient,op:string,action:string,list:string,revision:number,reconcile=false)=>(await c.query('select command_collection_share_v1($1,$2,$3,$4,null,$5) payload',[op,action,list,revision,reconcile])).rows[0].payload;
(url?describe:describe.skip)('durable owner rejection',()=>{
 const pool=new Pool({connectionString:url});beforeAll(()=>runMigrations(pool));afterAll(()=>pool.end());
 test('rejected nonce cannot execute against a recreated list/root whose revision matches again',async()=>withTransaction(pool,async c=>{
  const f=await fixture(c);await c.query('set local role authenticated');await command(c,randomUUID(),'open',f.list,0);await command(c,randomUUID(),'rotate',f.list,1);
  const op=randomUUID(),rejected=await command(c,op,'close',f.list,1);expect(rejected).toEqual({operationId:op,status:'rejected',action:'close',collectionId:f.list,reason:'share_revision_conflict'});
  await c.query('reset role');await c.query('delete from user_word_lists where id=$1',[f.list]);await c.query("insert into user_word_lists(id,user_id,name) values($1,$2,'recreated')",[f.list,f.owner]);await c.query('insert into user_word_list_items(list_id,word_id) values($1,$2)',[f.list,f.entry]);await c.query('set local role authenticated');await command(c,randomUUID(),'open',f.list,0);
  expect(await command(c,op,'close',f.list,1)).toEqual(rejected);expect(await command(c,op,'close',f.list,1,true)).toEqual(rejected);
  expect((await c.query('select read_collection_share_command_v1($1) payload',[op])).rows[0].payload).toEqual(rejected);
  expect((await c.query('select read_collection_share_management_v1($1) payload',[f.list])).rows[0].payload).toMatchObject({isOpen:true,revision:1});
  expect(await command(c,randomUUID(),'close',f.list,1)).toMatchObject({status:'committed',isOpen:false});
 }));
 test('copy-required rejection cannot later execute after borrowed references are fixed',async()=>withTransaction(pool,async c=>{
  const f=await fixture(c);await actor(c,f.other);const foreign=(await c.query('select create_user_dictionary_entry($1,null,$2) id',[f.other,{headword:randomUUID(),languageCode:'nl',definition:'foreign'}])).rows[0].id;
  const source=(await c.query("insert into user_word_lists(user_id,name) values($1,'source') returning id",[f.other])).rows[0].id;await c.query('insert into user_word_list_items(list_id,word_id) values($1,$2)',[source,foreign]);await c.query('set local role authenticated');const published=await command(c,randomUUID(),'open',source,0);
  await actor(c,f.owner);await c.query("select command_collection_share_v1($1,'accept',null,null,$2)",[randomUUID(),published.invitationCode]);await c.query('reset role');await c.query('insert into user_word_list_items(list_id,word_id) values($1,$2)',[f.list,foreign]);await c.query('set local role authenticated');
  const op=randomUUID(),rejected=await command(c,op,'open',f.list,0);expect(rejected).toMatchObject({status:'rejected',reason:'share_copy_required'});
  await c.query('reset role');expect((await c.query('select count(*)::int n from private.collection_sharing_roots where collection_id=$1',[f.list])).rows[0].n).toBe(0);await c.query('set local role authenticated');
  await c.query('reset role');await c.query('delete from user_word_list_items where list_id=$1 and word_id=$2',[f.list,foreign]);await c.query('set local role authenticated');expect(await command(c,op,'open',f.list,0)).toEqual(rejected);expect(await command(c,randomUUID(),'open',f.list,0)).toMatchObject({status:'committed',isOpen:true});
 }));
 test('terminal receipts are private, actor-bound and hash-correlated',async()=>withTransaction(pool,async c=>{
  const f=await fixture(c);await c.query('set local role authenticated');const op=randomUUID();const rejected=await command(c,op,'rotate',f.list,0);expect(rejected).toMatchObject({status:'rejected',reason:'share_unavailable'});
  await c.query('savepoint mismatch');await expect(command(c,op,'close',f.list,0)).rejects.toThrow('share_operation_conflict');await c.query('rollback to savepoint mismatch');
  await c.query('reset role');await actor(c,f.other);const source=(await c.query("insert into user_word_lists(user_id,name) values($1,'shareable') returning id",[f.other])).rows[0].id;await c.query('set local role authenticated');
  const opened=await command(c,randomUUID(),'open',source,0);
  await actor(c,f.owner);
  for(const action of ['accept','unsubscribe']){
   await c.query('savepoint cross_action');
   await expect(action==='accept'?c.query("select command_collection_share_v1($1,'accept',null,null,$2)",[op,opened.invitationCode]):c.query("select command_collection_share_v1($1,'unsubscribe',$2)",[op,source])).rejects.toThrow('share_operation_conflict');
   await c.query('rollback to savepoint cross_action');
  }
  const joined=(await c.query("select command_collection_share_v1($1,'accept',null,null,$2) payload",[randomUUID(),opened.invitationCode])).rows[0].payload;
  expect(joined).toMatchObject({status:'committed',collectionId:source});
  await c.query('savepoint eligible_unsubscribe');await expect(c.query("select command_collection_share_v1($1,'unsubscribe',$2)",[op,source])).rejects.toThrow('share_operation_conflict');await c.query('rollback to savepoint eligible_unsubscribe');
  expect((await c.query('select read_received_collection_catalog_v1() payload')).rows[0].payload.collections).toEqual(expect.arrayContaining([expect.objectContaining({id:source,role:'viewer'})]));
  await actor(c,f.other);expect((await c.query('select read_collection_share_command_v1($1) payload',[op])).rows[0].payload).toEqual({operationId:op,status:'unknown'});await c.query('reset role');
  for(const role of ['anon','authenticated','service_role']){expect((await c.query("select has_table_privilege($1,'private.collection_share_terminal_rejections','SELECT') allowed",[role])).rows[0].allowed).toBe(false);expect((await c.query("select has_function_privilege($1,'private.collection_share_command_core_v1(uuid,text,uuid,integer,text,boolean)','EXECUTE') allowed",[role])).rows[0].allowed).toBe(false);}
 }));
});
