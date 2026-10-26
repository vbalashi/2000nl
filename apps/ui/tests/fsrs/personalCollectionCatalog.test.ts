import {randomUUID} from 'crypto';
import {Pool,type PoolClient} from 'pg';
import {afterAll,beforeAll,describe,expect,test} from 'vitest';
import {ensureUserWithSettings,getDbUrl,runMigrations,withTransaction} from './dbTestUtils';
const url=getDbUrl();
const principal=(c:PoolClient,id:string)=>c.query("select set_config('request.jwt.claim.sub',$1,true)",[id]);
const catalog=async(c:PoolClient,query='',sort='name',scope='all',label:string|null=null,cursor:unknown=null,limit=50)=>(await c.query('select read_personal_collection_catalog_v1($1,$2,$3,$4,null,$5,$6) payload',[query,sort,scope,label,cursor,limit])).rows[0].payload;
async function fixture(c:PoolClient){
 const owner=randomUUID(),reader=randomUUID();for(const id of [owner,reader])await ensureUserWithSettings(c,id);
 await principal(c,owner);
 const entry=(await c.query('select create_user_dictionary_entry($1,null,$2) id',[owner,{headword:randomUUID(),languageCode:'nl',definition:'shared lesson'}])).rows[0].id;
 const shared=(await c.query("insert into user_word_lists(user_id,name,language_code) values($1,'Beta lesson','nl') returning id",[owner])).rows[0].id;
 await c.query('insert into user_word_list_items(list_id,word_id) values($1,$2)',[shared,entry]);
 await c.query('set local role authenticated');
 const opened=(await c.query("select command_collection_share_v1($1,'open',$2,0) payload",[randomUUID(),shared])).rows[0].payload;
 const authorLabel=randomUUID();await c.query('select mutate_collection_labels_v1($1,0,$2)',[owner,{type:'create',id:authorLabel,name:'Author secret label'}]);
 await c.query('select mutate_collection_labels_v1($1,1,$2)',[owner,{type:'set-collection-labels',collection_id:shared,label_ids:[authorLabel]}]);
 await principal(c,reader);await c.query("select command_collection_share_v1($1,'accept',null,null,$2)",[randomUUID(),opened.invitationCode]);
 await c.query('reset role');
 const own=(await c.query("insert into user_word_lists(user_id,name,language_code) values($1,'Alpha % lesson','nl') returning id",[reader])).rows[0].id;
 const privateList=(await c.query("insert into user_word_lists(user_id,name,language_code) values($1,'Private lesson','nl') returning id",[owner])).rows[0].id;
 await c.query('set local role authenticated');await principal(c,reader);
 const parent=randomUUID(),child=randomUUID();
 await c.query('select mutate_collection_labels_v1($1,0,$2)',[reader,{type:'create',id:parent,name:'YouTube'}]);
 await c.query('select mutate_collection_labels_v1($1,1,$2)',[reader,{type:'create',id:child,name:'Channel',parent_id:parent}]);
 await c.query('select mutate_collection_labels_v1($1,2,$2)',[reader,{type:'set-collection-labels',collection_id:own,label_ids:[child]}]);
 await c.query('select set_received_collection_labels_v1($1,3,$2)',[shared,[child]]);
 return {owner,reader,shared,own,privateList,parent,child,authorLabel};
}
(url?describe:describe.skip)('unified personal collection catalog',()=>{
 const pool=new Pool({connectionString:url});beforeAll(()=>runMigrations(pool));afterAll(()=>pool.end());
 test('one sorted page combines own and live received with only recipient placements',async()=>withTransaction(pool,async c=>{
  const f=await fixture(c),page=await catalog(c);
  expect(page.collections.map((row:{id:string})=>row.id)).toEqual([f.own,f.shared]);
  expect(page.collections).toEqual([expect.objectContaining({id:f.own,ownership:'owned',isShared:false,itemCount:0,labelIds:[f.child]}),expect.objectContaining({id:f.shared,ownership:'received',isShared:true,itemCount:1,labelIds:[f.child]})]);
  expect(page.revision).toBe(4);expect(JSON.stringify(page)).not.toContain(f.authorLabel);expect(JSON.stringify(page)).not.toContain(f.privateList);expect(JSON.stringify(page)).not.toContain('invitationCode');
  const editor=(await c.query('select read_received_collection_label_state_v1($1) payload',[f.shared])).rows[0].payload;
  expect(editor).toMatchObject({collectionId:f.shared,labelIds:[f.child],catalog:{revision:4}});expect(editor.catalog.labels.map((label:{id:string})=>label.id).sort()).toEqual([f.parent,f.child].sort());expect(JSON.stringify(editor)).not.toContain(f.authorLabel);
  expect((await catalog(c,'','name','label',f.parent)).collections).toHaveLength(2);
  expect((await catalog(c,'','name','unlabelled')).collections).toEqual([]);
  expect((await catalog(c,'%')).collections.map((row:{id:string})=>row.id)).toEqual([f.own]);
  expect((await catalog(c,'','count')).collections[0].id).toBe(f.shared);
  const first=await catalog(c,'','name','all',null,null,1),second=await catalog(c,'','name','all',null,first.nextCursor,1);
  expect(first.collections[0].id).toBe(f.own);expect(second.collections[0].id).toBe(f.shared);expect(second.nextCursor).toBeNull();
 }));
 test('close removes only the received projection; cursor and labels cannot cross accounts',async()=>withTransaction(pool,async c=>{
  const f=await fixture(c),first=await catalog(c,'','name','all',null,null,1);
  await principal(c,f.owner);await c.query('savepoint foreign_cursor');await expect(catalog(c,'','name','all',null,first.nextCursor,1)).rejects.toThrow('invalid_catalog_cursor');await c.query('rollback to savepoint foreign_cursor');
  await c.query("select command_collection_share_v1($1,'close',$2,1)",[randomUUID(),f.shared]);await principal(c,f.reader);
  expect((await catalog(c)).collections.map((row:{id:string})=>row.id)).toEqual([f.own]);
  await c.query('savepoint closed_state');await expect(c.query('select read_received_collection_label_state_v1($1)',[f.shared])).rejects.toThrow('collection_not_found');await c.query('rollback to savepoint closed_state');
  await c.query('savepoint foreign_label');await expect(catalog(c,'','name','label',f.authorLabel)).rejects.toThrow('label_not_found');await c.query('rollback to savepoint foreign_label');
  await c.query('reset role');for(const role of ['anon','service_role'])expect((await c.query("select has_function_privilege($1,'public.read_personal_collection_catalog_v1(text,text,text,uuid,text,jsonb,integer)','EXECUTE') allowed",[role])).rows[0].allowed).toBe(false);
 }));
});
