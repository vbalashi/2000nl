import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {beforeAll,afterAll,describe,test,expect} from 'vitest';
import {getDbUrl,runMigrations,ensureUserWithSettings,withTransaction} from './dbTestUtils';
const url=getDbUrl();
(url?describe:describe.skip)('foreign group references',()=>{
 const pool=new Pool({connectionString:url});beforeAll(()=>runMigrations(pool));afterAll(()=>pool.end());
 test('reference requires explicit original Add and stops forwarding after rotation',async()=>{
  await withTransaction(pool,async c=>{
   const author=randomUUID(),curator=randomUUID(),viewer=randomUUID(),label=randomUUID(),list=randomUUID();
   for(const user of [author,curator,viewer])await ensureUserWithSettings(c,user);
   const as=async(user:string)=>c.query("select set_config('request.jwt.claim.sub',$1,true)",[user]);
   await as(author);
   const entry=(await c.query('select create_user_dictionary_entry($1,null,$2) id',[author,{headword:'original',languageCode:'nl',definition:'private'}])).rows[0].id;
   await c.query('insert into user_word_lists(id,user_id,name) values($1,$2,$3)',[list,author,'original collection']);
   await c.query('insert into user_word_list_items(list_id,word_id) values($1,$2)',[list,entry]);
   const original=(await c.query("select command_collection_share_v1($1,'open',$2,0,null,false) value",[randomUUID(),list])).rows[0].value;
   await as(curator);await c.query("select command_collection_share_v1($1,'accept',null,null,$2,false)",[randomUUID(),original.invitationCode]);
   await c.query('insert into private.collection_labels(user_id,id,name) values($1,$2,$3)',[curator,label,'curated']);
   await c.query('insert into private.received_collection_label_placements values($1,$2,$3)',[curator,list,label]);
   const group=(await c.query("select mutate_label_share_v1($1,'open',0) value",[label])).rows[0].value;
   await as(viewer);await c.query('select accept_label_share_v1($1)',[group.invitationCode]);
   const refs=async()=>(await c.query('select read_label_share_references_v1($1) value',[label])).rows[0].value.references;
   expect(await refs()).toEqual([{collectionId:list,name:'original collection',invitationCode:original.invitationCode}]);
   expect((await c.query("select private.entry_access_v1($1,$2,'browse') ok",[viewer,entry])).rows[0].ok).toBe(false);
   await as(author);await c.query("select command_collection_share_v1($1,'rotate',$2,1,null,false)",[randomUUID(),list]);
   await as(viewer);expect(await refs()).toEqual([]);
  });
 });
});
