import {randomUUID} from 'crypto';
import {Pool,type PoolClient} from 'pg';
import {afterAll,beforeAll,describe,expect,test} from 'vitest';
import {ensureUserWithSettings,getDbUrl,runMigrations,withTransaction} from './dbTestUtils';

const url=getDbUrl();
const principal=(c:PoolClient,id:string)=>c.query("select set_config('request.jwt.claim.sub',$1,true)",[id]);
const read=async(c:PoolClient,query='',sort='recent',cursor:unknown=null,limit=50)=>(await c.query('select read_owned_shared_collection_catalog_v1($1,$2,$3,$4) payload',[query,sort,cursor,limit])).rows[0].payload;
async function fixture(c:PoolClient){
 const owner=randomUUID(),viewer=randomUUID();for(const id of [owner,viewer])await ensureUserWithSettings(c,id);
 await principal(c,owner);const entry=(await c.query('select create_user_dictionary_entry($1,null,$2) id',[owner,{headword:randomUUID(),languageCode:'nl',definition:'owned'}])).rows[0].id;
 const names=['Alpha lesson','Beta % lesson','Gamma lesson','Private lesson'];const lists:string[]=[];
 for(const name of names){const id=(await c.query('insert into user_word_lists(user_id,name) values($1,$2) returning id',[owner,name])).rows[0].id;lists.push(id);}
 await c.query('insert into user_word_list_items(list_id,word_id) values($1,$2)',[lists[0],entry]);
 await c.query('set local role authenticated');const codes:string[]=[];
 for(const id of lists.slice(0,3)){const result=(await c.query("select command_collection_share_v1($1,'open',$2,0) payload",[randomUUID(),id])).rows[0].payload;codes.push(result.invitationCode);}
 await principal(c,viewer);await c.query("select command_collection_share_v1($1,'accept',null,null,$2)",[randomUUID(),codes[0]]);
 await principal(c,owner);
 return {owner,viewer,lists,entry};
}

(url?describe:describe.skip)('owner Shared catalog',()=>{
 const pool=new Pool({connectionString:url});beforeAll(()=>runMigrations(pool));afterAll(()=>pool.end());
 test('one bounded read returns only live own publications, counts and no invitation secrets',async()=>withTransaction(pool,async c=>{
  const f=await fixture(c);const page=await read(c,'','name');
  expect(page.collections.map((row:{name:string})=>row.name)).toEqual(['Alpha lesson','Beta % lesson','Gamma lesson']);
  expect(page.collections[0]).toMatchObject({id:f.lists[0],itemCount:1,subscriberCount:1});
  expect(page.collections[1]).toMatchObject({id:f.lists[1],itemCount:0,subscriberCount:0});
  expect(JSON.stringify(page)).not.toContain('invitationCode');expect(JSON.stringify(page)).not.toContain(f.viewer);
  expect((await read(c,'%','name')).collections.map((row:{id:string})=>row.id)).toEqual([f.lists[1]]);
  expect((await read(c,'private','name')).collections).toEqual([]);
  expect((await read(c,'','count')).collections[0].id).toBe(f.lists[0]);
  expect((await c.query('select read_collection_sharing_overview_v1() payload')).rows[0].payload).toEqual({sharedByMe:3,addedByMe:0});
  await principal(c,f.viewer);expect((await c.query('select read_collection_sharing_overview_v1() payload')).rows[0].payload).toEqual({sharedByMe:0,addedByMe:1});
 }));
 test('keyset pages are scoped to actor, search and sort; close removes only the closed publication',async()=>withTransaction(pool,async c=>{
  const f=await fixture(c);const first=await read(c,'','name',null,1);expect(first.collections).toHaveLength(1);expect(first.nextCursor).not.toBeNull();
  const second=await read(c,'','name',first.nextCursor,1);expect(second.collections.map((row:{id:string})=>row.id)).toEqual([f.lists[1]]);
  await c.query('savepoint invalid_cursor');await expect(read(c,'lesson','name',first.nextCursor,1)).rejects.toThrow('invalid_catalog_cursor');await c.query('rollback to savepoint invalid_cursor');
  await principal(c,f.viewer);expect((await read(c,'','name')).collections).toEqual([]);
  await c.query('savepoint foreign_cursor');await expect(read(c,'','name',first.nextCursor,1)).rejects.toThrow('invalid_catalog_cursor');await c.query('rollback to savepoint foreign_cursor');
  await principal(c,f.owner);await c.query("select command_collection_share_v1($1,'close',$2,1)",[randomUUID(),f.lists[0]]);
  expect((await read(c,'','name')).collections.map((row:{id:string})=>row.id)).toEqual([f.lists[1],f.lists[2]]);
 }));
 test('catalog grants remain authenticated-only',async()=>withTransaction(pool,async c=>{
  for(const role of ['anon','service_role'])expect((await c.query("select has_function_privilege($1,'public.read_owned_shared_collection_catalog_v1(text,text,jsonb,integer)','EXECUTE') allowed",[role])).rows[0].allowed).toBe(false);
  for(const role of ['anon','service_role'])expect((await c.query("select has_function_privilege($1,'public.read_collection_sharing_overview_v1()','EXECUTE') allowed",[role])).rows[0].allowed).toBe(false);
 }));
 test('bounded organizer badges distinguish owner publications without revealing another account',async()=>withTransaction(pool,async c=>{
  const f=await fixture(c),ids=[...f.lists,randomUUID()];
  expect((await c.query('select read_owned_collection_publication_badges_v1($1) payload',[ids])).rows[0].payload).toEqual({openIds:[...f.lists.slice(0,3)].sort()});
  await principal(c,f.viewer);expect((await c.query('select read_owned_collection_publication_badges_v1($1) payload',[ids])).rows[0].payload).toEqual({openIds:[]});
  await c.query('savepoint too_many');await expect(c.query('select read_owned_collection_publication_badges_v1($1)',[Array(101).fill(f.lists[0])])).rejects.toThrow('invalid_publication_badge_request');await c.query('rollback to savepoint too_many');
  await c.query('reset role');for(const role of ['anon','service_role'])expect((await c.query("select has_function_privilege($1,'public.read_owned_collection_publication_badges_v1(uuid[])','EXECUTE') allowed",[role])).rows[0].allowed).toBe(false);
 }));
 test('selected received source is current, exact and unavailable after close',async()=>withTransaction(pool,async c=>{
  const f=await fixture(c);
  const source=async(id:string)=>(await c.query('select read_received_collection_source_v1($1) payload',[id])).rows[0].payload;
  expect(await source(f.lists[0])).toBeNull();
  await principal(c,f.viewer);
  expect(await source(f.lists[0])).toMatchObject({id:f.lists[0],name:'Alpha lesson'});
  expect(await source(f.lists[1])).toBeNull();
  expect(await source(randomUUID())).toBeNull();
  await principal(c,f.owner);await c.query("select command_collection_share_v1($1,'close',$2,1)",[randomUUID(),f.lists[0]]);
  await principal(c,f.viewer);expect(await source(f.lists[0])).toBeNull();
  await c.query('reset role');for(const role of ['anon','service_role'])expect((await c.query("select has_function_privilege($1,'public.read_received_collection_source_v1(uuid)','EXECUTE') allowed",[role])).rows[0].allowed).toBe(false);
 }));
});
