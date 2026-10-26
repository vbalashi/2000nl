import {randomUUID} from 'crypto';
import {Pool,type PoolClient} from 'pg';
import {afterAll,beforeAll,describe,expect,test} from 'vitest';
import {ensureUserWithSettings,getDbUrl,runMigrations,withTransaction} from './dbTestUtils';
const url=getDbUrl();
const principal=(c:PoolClient,id:string)=>c.query("select set_config('request.jwt.claim.sub',$1,true)",[id]);
async function fixture(c:PoolClient){
 const owner=randomUUID(),viewer=randomUUID(),outsider=randomUUID();for(const id of [owner,viewer,outsider])await ensureUserWithSettings(c,id);await principal(c,owner);
 const entry=(await c.query('select create_user_dictionary_entry($1,null,$2) id',[owner,{headword:randomUUID(),languageCode:'nl',definition:'lesson'}])).rows[0].id;
 const collection=(await c.query("insert into user_word_lists(user_id,name) values($1,'lesson') returning id",[owner])).rows[0].id;
 await c.query('insert into user_word_list_items(list_id,word_id) values($1,$2)',[collection,entry]);return {owner,viewer,outsider,entry,collection};
}
const command=async(c:PoolClient,action:string,collection:string|null=null,revision:number|null=null,code:string|null=null,operation=randomUUID())=>(await c.query('select command_collection_share_v1($1,$2,$3,$4,$5) payload',[operation,action,collection,revision,code])).rows[0].payload;
const receipt=async(c:PoolClient,id:string)=>(await c.query('select read_collection_share_command_v1($1) payload',[id])).rows[0].payload;
async function gate(c:PoolClient,on:boolean){await c.query('reset role');await c.query('update private.collection_sharing_rollout set new_writes_enabled=$1',[on]);await c.query('set local role authenticated');}
async function denied(c:PoolClient,action:()=>Promise<unknown>,message:string){await c.query('savepoint denied');await expect(action()).rejects.toThrow(message);await c.query('rollback to savepoint denied');}
(url?describe:describe.skip)('public sharing command admission',()=>{
 const pool=new Pool({connectionString:url});beforeAll(()=>runMigrations(pool));afterAll(()=>pool.end());
 test('authenticated open/preview/accept have minimal projections and preview never joins',async()=>withTransaction(pool,async c=>{
  const f=await fixture(c);await c.query('set local role authenticated');const opened=await command(c,'open',f.collection,0);expect(opened).toMatchObject({status:'committed',action:'open',role:'owner',isOpen:true,available:true});expect(opened).not.toHaveProperty('rootId');expect(opened).not.toHaveProperty('accessLifetime');
  await principal(c,f.viewer);const preview=(await c.query('select preview_collection_share_v1($1) payload',[opened.invitationCode])).rows[0].payload;expect(preview).toMatchObject({collectionId:f.collection,offeredRole:'viewer',alreadyAdded:false,role:null,entryCount:1});expect(preview).not.toHaveProperty('invitationCode');
  expect((await c.query('select read_received_collection_catalog_v1() payload')).rows[0].payload.collections).toEqual([]);
  const operation=randomUUID();expect(await receipt(c,operation)).toEqual({operationId:operation,status:'unknown'});
  const joined=await command(c,'accept',null,null,opened.invitationCode,operation);expect(joined).toEqual({operationId:operation,status:'committed',action:'accept',collectionId:f.collection,available:true,role:'viewer'});
  expect(await receipt(c,operation)).toEqual(joined);
 }));
 test('DB disable blocks direct admissions, ignores user GUCs and writes no receipt',async()=>withTransaction(pool,async c=>{
  const f=await fixture(c);await gate(c,false);await c.query("select set_config('app.collection_sharing_writes_enabled','true',true)");const operation=randomUUID();
  await denied(c,()=>command(c,'open',f.collection,0,null,operation),'sharing_writes_disabled');expect(await receipt(c,operation)).toEqual({operationId:operation,status:'unknown'});
  await c.query('reset role');expect((await c.query('select count(*)::int n from private.collection_sharing_roots where collection_id=$1',[f.collection])).rows[0].n).toBe(0);
 }));
 test('disable preserves reads but blocks new joins, rotation, note and recipient-label writes',async()=>withTransaction(pool,async c=>{
  const f=await fixture(c);await c.query('set local role authenticated');const opened=await command(c,'open',f.collection,0);await principal(c,f.viewer);await command(c,'accept',null,null,opened.invitationCode);await gate(c,false);
  expect((await c.query('select preview_collection_share_v1($1) payload',[opened.invitationCode])).rows[0].payload.alreadyAdded).toBe(true);
  expect((await c.query('select read_entry_note_v1($1) payload',[f.entry])).rows[0].payload.notes).toBeNull();
  await denied(c,()=>c.query("select write_entry_note_v1($1,0,'blocked')",[f.entry]),'sharing_writes_disabled');
  await denied(c,()=>c.query('select set_received_collection_labels_v1($1,0,array[]::uuid[])',[f.collection]),'sharing_writes_disabled');
  await principal(c,f.outsider);await denied(c,()=>command(c,'accept',null,null,opened.invitationCode),'sharing_writes_disabled');
  await principal(c,f.owner);await denied(c,()=>command(c,'rotate',f.collection,1),'sharing_writes_disabled');
 }));
 test('close/unsubscribe and completed replay remain available during rollback without recreating rights',async()=>withTransaction(pool,async c=>{
  const f=await fixture(c);await c.query('set local role authenticated');const operation=randomUUID();const opened=await command(c,'open',f.collection,0,null,operation);
  await principal(c,f.viewer);const joinOperation=randomUUID();await command(c,'accept',null,null,opened.invitationCode,joinOperation);await gate(c,false);await principal(c,f.owner);
  expect((await command(c,'open',f.collection,0,null,operation)).isOpen).toBe(true);
  expect((await command(c,'close',f.collection,1)).isOpen).toBe(false);
  const replay=await command(c,'open',f.collection,0,null,operation);expect(replay).toMatchObject({isOpen:false,invitationCode:null,status:'committed'});
  await principal(c,f.viewer);expect(await command(c,'unsubscribe',f.collection)).toMatchObject({status:'committed',available:false,role:null});
  expect(await command(c,'accept',null,null,opened.invitationCode,joinOperation)).toMatchObject({status:'committed',available:false,role:null});
  await denied(c,()=>command(c,'accept',null,null,opened.invitationCode),'sharing_writes_disabled');
 }));
 test('a stale principal without an account cannot preview private invitation metadata',async()=>withTransaction(pool,async c=>{
  const f=await fixture(c);await c.query('set local role authenticated');const opened=await command(c,'open',f.collection,0);
  await principal(c,randomUUID());await denied(c,()=>c.query('select preview_collection_share_v1($1)',[opened.invitationCode]),'unauthorized');
 }));
 test('reconcile-only mode cannot execute a fresh command even when DB writes are enabled',async()=>withTransaction(pool,async c=>{
  const f=await fixture(c);await c.query('set local role authenticated');const operation=randomUUID();
  expect((await c.query("select command_collection_share_v1($1,'open',$2,0,null,true) payload",[operation,f.collection])).rows[0].payload).toEqual({operationId:operation,status:'unknown'});
  expect((await c.query('select read_collection_share_management_v1($1) payload',[f.collection])).rows[0].payload.isOpen).toBe(false);
  await command(c,'open',f.collection,0,null,operation);await gate(c,false);
  expect((await c.query("select command_collection_share_v1($1,'open',$2,0,null,true) payload",[operation,f.collection])).rows[0].payload.status).toBe('committed');
  await denied(c,()=>c.query("select command_collection_share_v1($1,'open',$2,1,null,true)",[operation,f.collection]),'share_operation_conflict');
 }));
 test('receipt reconciliation is account-bound and code-free for non-owners',async()=>withTransaction(pool,async c=>{
  const f=await fixture(c);await c.query('set local role authenticated');const operation=randomUUID();const opened=await command(c,'open',f.collection,0,null,operation);
  await principal(c,f.viewer);expect(await receipt(c,operation)).toEqual({operationId:operation,status:'unknown'});const join=randomUUID();await command(c,'accept',null,null,opened.invitationCode,join);
  await principal(c,f.owner);await command(c,'rotate',f.collection,1);await principal(c,f.viewer);const saved=await receipt(c,join);expect(saved.role).toBe('viewer');expect(saved).not.toHaveProperty('invitationCode');expect(saved).not.toHaveProperty('accessLifetime');
 }));
 test('intent conflicts and stale revisions never replay a different mutation',async()=>withTransaction(pool,async c=>{
  const f=await fixture(c);await c.query('set local role authenticated');const operation=randomUUID();await command(c,'open',f.collection,0,null,operation);
  await denied(c,()=>command(c,'close',f.collection,1,null,operation),'share_operation_conflict');expect(await command(c,'close',f.collection,0)).toMatchObject({status:'rejected',reason:'share_revision_conflict'});
  await principal(c,f.viewer);expect(await command(c,'close',f.collection,1)).toMatchObject({status:'rejected',reason:'share_unavailable'});
 }));
 test.each([['open',null,0,null],['accept',randomUUID(),null,'A'.repeat(26)],['unsubscribe',randomUUID(),1,null],['rotate',randomUUID(),1,'A'.repeat(26)],['unsupported',null,null,null]] as const)('invalid command tuple %s is rejected before writes',async(action,list,revision,code)=>withTransaction(pool,async c=>{
  await fixture(c);await c.query('set local role authenticated');await denied(c,()=>command(c,action,list,revision,code),'invalid_share_command');
 }));
 test('missing gate row fails closed and private configuration/cores cannot be accessed by API roles',async()=>withTransaction(pool,async c=>{
  const f=await fixture(c);await c.query('delete from private.collection_sharing_rollout');await c.query('set local role authenticated');await denied(c,()=>command(c,'open',f.collection,0),'sharing_writes_disabled');
  await denied(c,()=>c.query('update private.collection_sharing_rollout set new_writes_enabled=true'),'permission denied');
  await c.query('reset role');
  for(const role of ['anon','authenticated','service_role']){
   expect((await c.query("select has_function_privilege($1,'private.require_collection_sharing_writes_v1()','EXECUTE') allowed",[role])).rows[0].allowed).toBe(false);
   expect((await c.query("select has_table_privilege($1,'private.collection_sharing_rollout','SELECT') allowed",[role])).rows[0].allowed).toBe(false);
  }
 }));
 async function wait(observer:PoolClient,pid:number){for(let i=0;i<100;i++){await observer.query('select pg_stat_clear_snapshot()');if((await observer.query('select wait_event_type from pg_stat_activity where pid=$1',[pid])).rows[0]?.wait_event_type==='Lock')return;await new Promise(r=>setTimeout(r,10));}throw new Error('expected gate lock');}
 test.each(['admission-first','disable-first'] as const)('operator disable serializes with admissions: %s',async order=>{
  const actor=await pool.connect(),operator=await pool.connect();let f:Awaited<ReturnType<typeof fixture>>|undefined,pending:Promise<{ok:boolean;message?:string}>|undefined;
  try{
   await actor.query('begin');f=await fixture(actor);await actor.query('commit');await actor.query('begin');await operator.query('begin');await principal(actor,f.owner);await actor.query('set local role authenticated');
   await actor.query("set local statement_timeout='5s'");await operator.query("set local statement_timeout='5s'");
   if(order==='admission-first'){
    await command(actor,'open',f.collection,0);await actor.query('reset role');const pid=(await operator.query('select pg_backend_pid() id')).rows[0].id;
    pending=operator.query('update private.collection_sharing_rollout set new_writes_enabled=false').then(()=>({ok:true}),e=>({ok:false,message:e.message}));await wait(actor,pid);await actor.query('commit');expect(await pending).toEqual({ok:true});await operator.query('commit');
   }else{
    await operator.query('update private.collection_sharing_rollout set new_writes_enabled=false');const pid=(await actor.query('select pg_backend_pid() id')).rows[0].id;
    pending=command(actor,'open',f.collection,0).then(()=>({ok:true}),e=>({ok:false,message:e.message}));await wait(operator,pid);await operator.query('commit');expect(await pending).toEqual({ok:false,message:'sharing_writes_disabled'});await actor.query('rollback');
   }
   await actor.query('begin');await principal(actor,f!.owner);await actor.query('set local role authenticated');await denied(actor,()=>command(actor,'open',f!.collection,order==='admission-first'?1:0),'sharing_writes_disabled');await actor.query('rollback');
  }finally{
   if(order==='admission-first'){await actor.query('rollback');await operator.query('rollback');}
   else{await operator.query('rollback');await actor.query('rollback');}
   if(pending)await pending;actor.release();operator.release();
   await pool.query('update private.collection_sharing_rollout set new_writes_enabled=true');
   if(f){const users=[f.owner,f.viewer,f.outsider];await pool.query('delete from user_word_lists where user_id=any($1::uuid[])',[users]);await pool.query('delete from word_entries where dictionary_id in(select id from dictionaries where owner_user_id=any($1::uuid[]))',[users]);await pool.query('delete from auth.users where id=any($1::uuid[])',[users]);}
  }
 });
});
