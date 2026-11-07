import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {beforeAll,afterAll,describe,test,expect} from 'vitest';
import {getDbUrl,runMigrations,ensureUserWithSettings,withTransaction} from './dbTestUtils';
const url=getDbUrl();
(url?describe:describe.skip)('owned publication batch metadata',()=>{
 const pool=new Pool({connectionString:url});beforeAll(()=>runMigrations(pool));afterAll(()=>pool.end());
 test('counts distinct current readers across paths and keeps published zero distinct from private',async()=>withTransaction(pool,async c=>{
  const owner=randomUUID(),a=randomUUID(),b=randomUUID(),outsider=randomUUID(),label=randomUUID(),child=randomUUID();
  for(const user of [owner,a,b,outsider])await ensureUserWithSettings(c,user);
  const setUser=(id:string)=>c.query("select set_config('request.jwt.claim.sub',$1,true)",[id]);
  await setUser(owner);
  const lists=(await c.query("insert into user_word_lists(user_id,name) values($1,'both'),($1,'group'),($1,'private') returning id",[owner])).rows.map(row=>row.id);
  await c.query("insert into private.collection_labels(id,user_id,name) values($1,$2,'root')",[label,owner]);
  await c.query("insert into private.collection_labels(id,user_id,name,parent_id) values($1,$2,'child',$3)",[child,owner,label]);
  await c.query('insert into private.collection_label_assignments values($1,$2,$3),($1,$4,$5)',[owner,lists[0],label,lists[1],child]);
  const direct=(await c.query("select private.mutate_collection_share_v1($1,'open',$2,0) value",[randomUUID(),lists[0]])).rows[0].value;
  const group=(await c.query("select mutate_label_share_v1($1,'open',0) value",[label])).rows[0].value;
  const read=async(ids=lists)=>{
   await setUser(owner);await c.query('set local role authenticated');
   const rows=(await c.query('select read_owned_collection_access_metadata_v1($1) value',[ids])).rows[0].value.collections;
   await c.query('reset role');return new Map<string,{collectionId:string;isShared:boolean;subscriberCount:number}>(rows.map((r:any)=>[r.collectionId,r]));
  };
  let rows=await read();
  for(const id of lists.slice(0,2))expect(rows.get(id)).toEqual({collectionId:id,isShared:true,subscriberCount:0});
  expect(rows.get(lists[2])).toEqual({collectionId:lists[2],isShared:false,subscriberCount:0});
  await setUser(a);await c.query('select private.accept_collection_share_v1($1,$2)',[randomUUID(),direct.invitationCode]);await c.query('select accept_label_share_v1($1)',[group.invitationCode]);
  await setUser(b);await c.query('select accept_label_share_v1($1)',[group.invitationCode]);
  rows=await read();expect(rows.get(lists[0])?.subscriberCount).toBe(2);expect(rows.get(lists[1])?.subscriberCount).toBe(2);
  await c.query("select mutate_label_share_v1($1,'close',1)",[label]);rows=await read();
  expect(rows.get(lists[0])).toMatchObject({isShared:true,subscriberCount:1});expect(rows.get(lists[1])).toMatchObject({isShared:false,subscriberCount:0});
  const reopened=(await c.query("select mutate_label_share_v1($1,'open',2) value",[label])).rows[0].value;
  rows=await read();expect(rows.get(lists[1])).toMatchObject({isShared:true,subscriberCount:0});
  await setUser(a);await c.query('select accept_label_share_v1($1)',[reopened.invitationCode]);rows=await read();
  expect(rows.get(lists[0])?.subscriberCount).toBe(1);expect(rows.get(lists[1])?.subscriberCount).toBe(1);
  await setUser(a);await c.query('select unsubscribe_label_share_v1($1)',[label]);rows=await read();expect(rows.get(lists[1])).toMatchObject({isShared:true,subscriberCount:0});
  await setUser(outsider);await c.query('set local role authenticated');
  expect((await c.query('select read_owned_collection_access_metadata_v1($1) value',[[...lists,randomUUID()]])).rows[0].value).toEqual({collections:[]});
  await c.query('reset role');
  expect((await read([lists[2],lists[2],randomUUID()])).size).toBe(1);
  expect((await read([])).size).toBe(0);
  for(const ids of [null,[null],Array(201).fill(lists[0])]){
   await c.query('savepoint invalid_batch');await expect(c.query('select read_owned_collection_access_metadata_v1($1)',[ids])).rejects.toThrow('invalid_share_request');await c.query('rollback to savepoint invalid_batch');
  }
  for(const role of ['anon','service_role'])expect((await c.query("select has_function_privilege($1,'public.read_owned_collection_access_metadata_v1(uuid[])','execute') allowed",[role])).rows[0].allowed).toBe(false);
 }));
});
