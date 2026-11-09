import {randomUUID} from 'node:crypto';
import {Pool,type PoolClient} from 'pg';
import {beforeAll,afterAll,describe,test,expect} from 'vitest';
import {getDbUrl,runMigrations,ensureUserWithSettings,withTransaction} from './dbTestUtils';
const url=getDbUrl();
const asUser=(c:PoolClient,id:string)=>c.query("select set_config('request.jwt.claim.sub',$1,true)",[id]);
async function fixture(c:PoolClient){
 const owner=randomUUID(),reader=randomUUID(),other=randomUUID(),label=randomUUID(),nested=randomUUID(),otherLabel=randomUUID();
 for(const user of [owner,reader,other])await ensureUserWithSettings(c,user);
 await c.query("insert into languages(code,name) values('en','English') on conflict do nothing");
 const rows=(await c.query("insert into user_word_lists(user_id,name,language_code,primary_language_code) values($1,'Alpha','nl','nl'),($1,'Beta','nl','nl'),($1,'English','en','en'),($1,'Outside','nl','nl'),($2,'Mine','nl','nl') returning id",[owner,reader])).rows.map(r=>r.id);
 await c.query("insert into private.collection_labels(id,user_id,name,parent_id) values($1,$4,'Shared',null),($2,$4,'Nested',$1),($3,$4,'Other',null)",[label,nested,otherLabel,owner]);
 await c.query('insert into private.collection_label_assignments(user_id,collection_id,label_id) values($1,$2,$6),($1,$3,$7),($1,$4,$6),($1,$5,$8)',[owner,...rows.slice(0,4),label,nested,otherLabel]);
 await c.query('insert into private.collection_label_assignments values($1,$2,$3)',[owner,rows[0],otherLabel]);
 await asUser(c,owner);const group=(await c.query("select mutate_label_share_v1($1,'open',0) value",[label])).rows[0].value;
 const otherGroup=(await c.query("select mutate_label_share_v1($1,'open',0) value",[otherLabel])).rows[0].value;
 await asUser(c,reader);await c.query('select accept_label_share_v1($1)',[group.invitationCode]);await c.query('select accept_label_share_v1($1)',[otherGroup.invitationCode]);
 return {owner,reader,other,label,nested,otherLabel,group,rows};
}
(url?describe:describe.skip)('received shared labels as personal catalog scopes',()=>{
 const pool=new Pool({connectionString:url});beforeAll(()=>runMigrations(pool));afterAll(()=>pool.end());
 const read=async(c:PoolClient,label:string,query='',sort='name',cursor:unknown=null,limit=50,ownership='all')=>(await c.query("select read_personal_collection_catalog_v2($1,$2,'group',$3,'nl',$4,$5,$6) value",[query,sort,label,cursor,limit,ownership])).rows[0].value;
 test('filters the authoritative group before language, sorting and paging without personal assignments',async()=>withTransaction(pool,async c=>{
  const f=await fixture(c);await c.query('set local role authenticated');
  const first=await read(c,f.label,'','name',null,1);expect(first.collections.map((r:{name:string})=>r.name)).toEqual(['Alpha']);expect(first.nextCursor).not.toBeNull();
  const second=await read(c,f.label,'','name',first.nextCursor,1);expect(second.collections.map((r:{name:string})=>r.name)).toEqual(['Beta']);expect(second.nextCursor).toBeNull();
  expect((await read(c,f.label,'Beta')).collections.map((r:{name:string})=>r.name)).toEqual(['Beta']);
  expect((await read(c,f.label,'','count')).collections).toHaveLength(2);
  expect((await read(c,f.label,'','recent')).collections).toHaveLength(2);
  expect((await read(c,f.label,'','name',null,50,'owned')).collections).toEqual([]);
  expect(first.collections[0]).toMatchObject({ownership:'received',isShared:true,labelIds:[]});
 }));
 test('rejects an unrelated group cursor',async()=>withTransaction(pool,async c=>{
  const f=await fixture(c);const first=await read(c,f.label,'','name',null,1);
  await expect(read(c,f.otherLabel,'','name',first.nextCursor,1)).rejects.toThrow('invalid_catalog_cursor');
 }));
 test('requires this account active subscription, even when another path still grants a child',async()=>withTransaction(pool,async c=>{
  const f=await fixture(c);await c.query('select unsubscribe_label_share_v1($1)',[f.label]);
  const all=(await c.query("select read_personal_collection_catalog_v2('Alpha','name','all',null,'nl',null,50,'received') value")).rows[0].value;expect(all.collections.map((r:{id:string})=>r.id)).toEqual([f.rows[0]]);
  await expect(read(c,f.label)).rejects.toThrow('label_not_found');
 }));
 test('an unaccepted, closed or reopened group cannot be used as a scope',async()=>withTransaction(pool,async c=>{
  const f=await fixture(c);await asUser(c,f.owner);await c.query("select mutate_label_share_v1($1,'close',1)",[f.label]);await asUser(c,f.reader);
  await expect(read(c,f.label)).rejects.toThrow('label_not_found');
 }));
 test('does not republish a borrowed collection even when the recipient already has another accepted path',async()=>withTransaction(pool,async c=>{
  const f=await fixture(c);await asUser(c,f.other);
  const borrowed=(await c.query("insert into user_word_lists(user_id,name,language_code,primary_language_code) values($1,'Borrowed','nl','nl') returning id",[f.other])).rows[0].id;
  const state=(await c.query("select private.mutate_collection_share_v1($1,'open',$2,0) value",[randomUUID(),borrowed])).rows[0].value;
  for(const user of [f.owner,f.reader]){await asUser(c,user);await c.query('select private.accept_collection_share_v1($1,$2)',[randomUUID(),state.invitationCode]);}
  await c.query('insert into private.received_collection_label_placements(user_id,collection_id,label_id) values($1,$2,$3)',[f.owner,borrowed,f.label]);
  const all=(await c.query("select read_personal_collection_catalog_v2('Borrowed','name','all',null,'nl',null,50,'received') value")).rows[0].value;expect(all.collections).toHaveLength(1);
  expect((await read(c,f.label,'Borrowed')).collections).toEqual([]);
 }));
 test('rejects an account which has never accepted the group',async()=>withTransaction(pool,async c=>{
  const f=await fixture(c);await asUser(c,f.other);await expect(read(c,f.label)).rejects.toThrow('label_not_found');
 }));
 test('reopening a publication requires a new acceptance and does not revive the old lifetime',async()=>withTransaction(pool,async c=>{
  const f=await fixture(c);await asUser(c,f.owner);await c.query("select mutate_label_share_v1($1,'close',1)",[f.label]);const reopened=(await c.query("select mutate_label_share_v1($1,'open',2) value",[f.label])).rows[0].value;
  await asUser(c,f.reader);await c.query('savepoint old_lifetime');await expect(read(c,f.label)).rejects.toThrow('label_not_found');await c.query('rollback to savepoint old_lifetime');
  await c.query('select accept_label_share_v1($1)',[reopened.invitationCode]);expect((await read(c,f.label)).collections).toHaveLength(2);
 }));

});
