import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {beforeAll,afterAll,describe,test,expect} from 'vitest';
import {getDbUrl,runMigrations,ensureUserWithSettings,withTransaction} from './dbTestUtils';
const url=getDbUrl();
(url?describe:describe.skip)('group-aware shared catalog search',()=>{
 const pool=new Pool({connectionString:url});beforeAll(()=>runMigrations(pool));afterAll(()=>pool.end());
 test('searches and pages live collections once across group and direct paths',async()=>withTransaction(pool,async c=>{
  const owner=randomUUID(),viewer=randomUUID(),other=randomUUID(),root=randomUUID(),child=randomUUID(),personal=randomUUID();
  for(const user of [owner,viewer,other])await ensureUserWithSettings(c,user);
  const principal=(user:string)=>c.query("select set_config('request.jwt.claim.sub',$1,true)",[user]);
  await principal(owner);
  await c.query("insert into private.collection_labels(id,user_id,name) values($1,$2,'source')",[root,owner]);
  await c.query("insert into private.collection_labels(id,user_id,name,parent_id) values($1,$2,'child',$3)",[child,owner,root]);
  const ids=(await c.query("insert into user_word_lists(user_id,name) values($1,'Group search A'),($1,'Group search B'),($1,'Group search C'),($1,'not published') returning id",[owner])).rows.map(row=>row.id);
  await c.query('insert into private.collection_label_assignments values($1,$2,$3),($1,$4,$5),($1,$6,$5)',[owner,ids[0],root,ids[1],child,ids[2]]);
  const entry=(await c.query('select create_user_dictionary_entry($1,null,$2) id',[owner,{headword:randomUUID(),languageCode:'nl',definition:'catalog'}])).rows[0].id;
  await c.query('insert into user_word_list_items(list_id,word_id) values($1,$2)',[ids[0],entry]);
  const group=(await c.query("select mutate_label_share_v1($1,'open',0) value",[root])).rows[0].value;
  const readOwned=async(sort='name',cursor:unknown=null,limit=100)=>(await c.query("select read_owned_shared_collection_catalog_v1('Group search',$1,$2,$3) value",[sort,cursor,limit])).rows[0].value;
  const readReceived=async(sort='name',cursor:unknown=null,limit=100)=>(await c.query("select read_received_collection_catalog_v1('Group search',$1,'all',null,$2,$3) value",[sort,cursor,limit])).rows[0].value;
  let page=await readOwned();expect(page.collections.map((row:any)=>row.id)).toEqual(ids.slice(0,3));expect(page.collections.every((row:any)=>row.subscriberCount===0&&!row.directPublication&&row.groups.length===1&&row.groups[0].labelId===root)).toBe(true);
  expect((await c.query('select read_collection_sharing_overview_v1() value')).rows[0].value.sharedByMe).toBe(3);
  await principal(viewer);await c.query('select accept_label_share_v1($1)',[group.invitationCode]);
  page=await readReceived();expect(page.collections.map((row:any)=>row.id)).toEqual(ids.slice(0,3));expect(page.collections.map((row:any)=>row.itemCount)).toEqual([1,0,0]);
  expect(page.collections.every((row:any)=>!row.directSubscription&&row.groups[0].labelId===root)).toBe(true);
  expect((await c.query('select read_collection_sharing_overview_v1() value')).rows[0].value.addedByMe).toBe(3);
  await c.query("insert into private.collection_labels(id,user_id,name) values($1,$2,'my scope')",[personal,viewer]);
  await c.query('select set_received_collection_labels_v1($1,0,$2)',[ids[1],[personal]]);
  const scoped=(await c.query("select read_received_collection_catalog_v1('Group search','name','label',$1,null,100) value",[personal])).rows[0].value;
  expect(scoped.collections.map((row:any)=>row.id)).toEqual([ids[1]]);
  expect((await c.query("select read_received_collection_catalog_v1('Group search','name','unlabelled',null,null,100) value")).rows[0].value.collections.map((row:any)=>row.id)).toEqual([ids[0],ids[2]]);
  const first=await readReceived('name',null,1);
  for(const who of [viewer,other]){
   await principal(who);await c.query('savepoint cursor_guard');
   await expect(c.query("select read_received_collection_catalog_v1($1,'name','all',null,$2,1)",[who===viewer?'different query':'Group search',first.nextCursor])).rejects.toThrow('invalid_catalog_cursor');
   await c.query('rollback to savepoint cursor_guard');
  }
  await principal(viewer);
  const oldScope=(await c.query("select encode(sha256(convert_to(jsonb_build_array($1::uuid,'Group search','name','all',null)::text,'UTF8')),'hex') value",[viewer])).rows[0].value;
  await c.query('savepoint old_cursor');await expect(readReceived('name',{...first.nextCursor,scope:oldScope},1)).rejects.toThrow('invalid_catalog_cursor');await c.query('rollback to savepoint old_cursor');

  await principal(owner);const direct=(await c.query("select private.mutate_collection_share_v1($1,'open',$2,0) value",[randomUUID(),ids[0]])).rows[0].value;
  await principal(viewer);await c.query('select private.accept_collection_share_v1($1,$2)',[randomUUID(),direct.invitationCode]);
  page=await readReceived();expect(page.collections[0]).toMatchObject({id:ids[0],directSubscription:true});expect(page.collections[0].groups).toEqual([{labelId:root,name:'source'}]);

  for(const sort of ['name','recent','count']){
   for(const role of ['owner','viewer']){
    await principal(role==='owner'?owner:viewer);const read=role==='owner'?readOwned:readReceived;let cursor:unknown=null;const seen:string[]=[];
    do{const result=await read(sort,cursor,1);seen.push(...result.collections.map((row:any)=>row.id));cursor=result.nextCursor;}while(cursor);
    expect(seen).toHaveLength(3);expect(new Set(seen).size).toBe(3);expect(new Set(seen)).toEqual(new Set(ids.slice(0,3)));
   }
  }
  await principal(owner);page=await readOwned();expect(page.collections.every((row:any)=>row.subscriberCount===1)).toBe(true);
  await c.query("select mutate_label_share_v1($1,'close',1)",[root]);page=await readOwned();expect(page.collections.map((row:any)=>row.id)).toEqual([ids[0]]);
  await principal(viewer);page=await readReceived();expect(page.collections.map((row:any)=>row.id)).toEqual([ids[0]]);
  await principal(owner);await c.query("select private.mutate_collection_share_v1($1,'close',$2,1)",[randomUUID(),ids[0]]);
  await principal(viewer);expect((await readReceived()).collections).toEqual([]);
  await principal(owner);const reopened=(await c.query("select mutate_label_share_v1($1,'open',2) value",[root])).rows[0].value;
  expect((await readOwned()).collections.every((row:any)=>row.subscriberCount===0)).toBe(true);
  await principal(viewer);expect((await readReceived()).collections).toEqual([]);
  await c.query('select accept_label_share_v1($1)',[reopened.invitationCode]);const beforeRevoke=await readReceived('name',null,1);
  await principal(owner);await c.query("select mutate_label_share_v1($1,'close',3)",[root]);
  await principal(viewer);expect((await readReceived('name',beforeRevoke.nextCursor,1)).collections).toEqual([]);

 }));
});
