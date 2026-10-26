import {randomUUID} from 'crypto';
import {Pool,type PoolClient} from 'pg';
import {afterAll,beforeAll,describe,expect,test} from 'vitest';
import {ensureUserWithSettings,getDbUrl,runMigrations,withTransaction} from './dbTestUtils';
const url=getDbUrl();
const principal=(c:PoolClient,id:string)=>c.query("select set_config('request.jwt.claim.sub',$1,true)",[id]);
async function fixture(c:PoolClient){
 const owner=randomUUID(),viewer=randomUUID(),second=randomUUID(),outsider=randomUUID();for(const id of [owner,viewer,second,outsider])await ensureUserWithSettings(c,id);
 await principal(c,owner);const entry=(await c.query('select create_user_dictionary_entry($1,null,$2) id',[owner,{headword:randomUUID(),languageCode:'nl',definition:'lesson'}])).rows[0].id;
 const collection=(await c.query("insert into user_word_lists(user_id,name) values($1,'shared lesson') returning id",[owner])).rows[0].id;
 await c.query('insert into user_word_list_items(list_id,word_id) values($1,$2)',[collection,entry]);
 return {owner,viewer,second,outsider,entry,collection};
}
const mutate=async(c:PoolClient,id:string,action:string,revision:number)=>(await c.query('select private.mutate_collection_share_v1($1,$2,$3,$4) payload',[randomUUID(),action,id,revision])).rows[0].payload;
const accept=async(c:PoolClient,code:string,operation=randomUUID())=>(await c.query('select private.accept_collection_share_v1($1,$2) payload',[operation,code])).rows[0].payload;
const ownerRead=async(c:PoolClient,id:string)=>(await c.query('select read_collection_share_management_v1($1) payload',[id])).rows[0].payload;
const forward=async(c:PoolClient,id:string)=>(await c.query('select read_collection_share_forward_v1($1) payload',[id])).rows[0].payload;
async function denied(c:PoolClient,action:()=>Promise<unknown>,message:string){await c.query('savepoint denied');await expect(action()).rejects.toThrow(message);await c.query('rollback to savepoint denied');}
(url?describe:describe.skip)('original accepted invitation and management reads',()=>{
 const pool=new Pool({connectionString:url});beforeAll(()=>runMigrations(pool));afterAll(()=>pool.end());
 test('owner reads unshared state without creating a root or invitation',async()=>withTransaction(pool,async c=>{
  const f=await fixture(c);await c.query('set local role authenticated');
  expect(await ownerRead(c,f.collection)).toEqual({collectionId:f.collection,isOpen:false,revision:0,invitationCode:null,subscriberCount:0});
  await c.query('reset role');expect((await c.query('select count(*)::int n from private.collection_sharing_roots where collection_id=$1',[f.collection])).rows[0].n).toBe(0);
 }));
 test('accepted original code is forwardable, counts are live, reads do not join or write receipts',async()=>withTransaction(pool,async c=>{
  const f=await fixture(c);const opened=await mutate(c,f.collection,'open',0);await principal(c,f.viewer);const joined=await accept(c,opened.invitationCode);
  expect(joined).not.toHaveProperty('invitationCode');const before=(await c.query('select count(*)::int n from private.collection_sharing_command_receipts')).rows[0].n;
  await c.query('set local role authenticated');expect(await forward(c,f.collection)).toEqual({collectionId:f.collection,canForward:true,invitationCode:opened.invitationCode});
  await c.query('reset role');expect((await c.query('select count(*)::int n from private.collection_sharing_command_receipts')).rows[0].n).toBe(before);
  await principal(c,f.second);await accept(c,opened.invitationCode);await principal(c,f.owner);await c.query('set local role authenticated');
  expect(await ownerRead(c,f.collection)).toEqual({collectionId:f.collection,isOpen:true,revision:1,invitationCode:opened.invitationCode,subscriberCount:2});
 }));
 test('rotation preserves reading but never reveals the fresh owner code to an old recipient',async()=>withTransaction(pool,async c=>{
  const f=await fixture(c);const opened=await mutate(c,f.collection,'open',0);await principal(c,f.viewer);const originalOperation=randomUUID();await accept(c,opened.invitationCode,originalOperation);
  const original=(await c.query('select accepted_invitation_code,accepted_invitation_generation,accepted_at from private.collection_sharing_subscriptions where user_id=$1',[f.viewer])).rows[0];
  await principal(c,f.owner);const rotated=await mutate(c,f.collection,'rotate',1);await principal(c,f.viewer);
  expect(await forward(c,f.collection)).toEqual({collectionId:f.collection,canForward:false,invitationCode:null});
  expect((await c.query("select private.entry_access_v1($1,$2,'browse') allowed",[f.viewer,f.entry])).rows[0].allowed).toBe(true);
  await accept(c,opened.invitationCode,originalOperation);expect(await forward(c,f.collection)).toEqual({collectionId:f.collection,canForward:false,invitationCode:null});
  expect((await c.query('select accepted_invitation_code,accepted_invitation_generation,accepted_at from private.collection_sharing_subscriptions where user_id=$1',[f.viewer])).rows[0]).toEqual(original);
 }));
 test('explicit fresh invitation acceptance may update its known forwarding identity without renewing membership time',async()=>withTransaction(pool,async c=>{
  const f=await fixture(c);const opened=await mutate(c,f.collection,'open',0);await principal(c,f.viewer);await accept(c,opened.invitationCode);
  await c.query("update private.collection_sharing_subscriptions set accepted_at='2000-01-01T00:00:00Z' where user_id=$1",[f.viewer]);
  await principal(c,f.owner);const rotated=await mutate(c,f.collection,'rotate',1);await principal(c,f.viewer);await accept(c,rotated.invitationCode);
  expect(await forward(c,f.collection)).toEqual({collectionId:f.collection,canForward:true,invitationCode:rotated.invitationCode});
  const subscriptions=(await c.query('select accepted_at from private.collection_sharing_subscriptions where user_id=$1',[f.viewer])).rows;expect(subscriptions).toHaveLength(1);expect(subscriptions[0].accepted_at.toISOString()).toBe('2000-01-01T00:00:00.000Z');
 }));
 test('explicit unsubscribe and new accept may replace the forwarding identity',async()=>withTransaction(pool,async c=>{
  const f=await fixture(c);const opened=await mutate(c,f.collection,'open',0);await principal(c,f.viewer);await accept(c,opened.invitationCode);
  await principal(c,f.owner);const rotated=await mutate(c,f.collection,'rotate',1);await principal(c,f.viewer);
  await c.query('select private.unsubscribe_collection_share_v1($1,$2)',[randomUUID(),f.collection]);await denied(c,()=>forward(c,f.collection),'share_unavailable');
  await accept(c,rotated.invitationCode);expect((await forward(c,f.collection)).invitationCode).toBe(rotated.invitationCode);
 }));
 test('old receipt replay cannot restore a closed lifetime or replace its forwarding code',async()=>withTransaction(pool,async c=>{
  const f=await fixture(c);const opened=await mutate(c,f.collection,'open',0);await principal(c,f.viewer);const operation=randomUUID();await accept(c,opened.invitationCode,operation);
  await principal(c,f.owner);await mutate(c,f.collection,'close',1);expect((await ownerRead(c,f.collection)).subscriberCount).toBe(0);const reopened=await mutate(c,f.collection,'open',2);
  await principal(c,f.viewer);expect((await accept(c,opened.invitationCode,operation)).available).toBe(false);await denied(c,()=>forward(c,f.collection),'share_unavailable');
  await accept(c,reopened.invitationCode);expect((await forward(c,f.collection)).invitationCode).toBe(reopened.invitationCode);
 }));
 test('foreign owner reads and unrelated recipient reads fail uniformly, including raw table access',async()=>withTransaction(pool,async c=>{
  const f=await fixture(c);await mutate(c,f.collection,'open',0);await principal(c,f.outsider);await c.query('set local role authenticated');
  for(const id of [f.collection,randomUUID()]){await denied(c,()=>ownerRead(c,id),'share_unavailable');await denied(c,()=>forward(c,id),'share_unavailable');}
  await denied(c,()=>c.query('select accepted_invitation_code from private.collection_sharing_subscriptions'),'permission denied');
 }));
 test('legacy internal subscriptions without original identity do not get current owner invitations',async()=>withTransaction(pool,async c=>{
  const f=await fixture(c);const opened=await mutate(c,f.collection,'open',0);
  await c.query('insert into private.collection_sharing_subscriptions(user_id,root_id,access_lifetime) select $1,id,access_lifetime from private.collection_sharing_roots where id=$2',[f.viewer,opened.rootId]);
  await principal(c,f.viewer);expect(await forward(c,f.collection)).toEqual({collectionId:f.collection,canForward:false,invitationCode:null});
 }));
 test('new read grants are minimal and stored code/generation are always paired',async()=>withTransaction(pool,async c=>{
  const f=await fixture(c);const opened=await mutate(c,f.collection,'open',0);await principal(c,f.viewer);await accept(c,opened.invitationCode);
  for(const role of ['anon','service_role'])for(const fn of ['read_collection_share_management_v1(uuid)','read_collection_share_forward_v1(uuid)'])expect((await c.query('select has_function_privilege($1,$2,\'EXECUTE\') allowed',[role,fn])).rows[0].allowed).toBe(false);
  await denied(c,()=>c.query('update private.collection_sharing_subscriptions set accepted_invitation_generation=null where user_id=$1',[f.viewer]),'collection_sharing_accepted_invitation_shape');
  const receipt=(await c.query('select response from private.collection_sharing_command_receipts where user_id=$1',[f.viewer])).rows[0].response;expect(JSON.stringify(receipt)).not.toContain(opened.invitationCode);
 }));
});
