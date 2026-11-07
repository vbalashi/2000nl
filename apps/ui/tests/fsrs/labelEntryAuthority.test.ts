import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {beforeAll,afterAll,describe,test,expect} from 'vitest';
import {getDbUrl,runMigrations,ensureUserWithSettings,withTransaction} from './dbTestUtils';
const url=getDbUrl();
(url?describe:describe.skip)('group author entry authority',()=>{
 const pool=new Pool({connectionString:url});beforeAll(()=>runMigrations(pool));afterAll(()=>pool.end());
 test('author entry requires an active accepted group path',async()=>{
  await withTransaction(pool,async c=>{
   const owner=randomUUID(),viewer=randomUUID(),outsider=randomUUID(),label=randomUUID(),list=randomUUID();
   for(const user of [owner,viewer,outsider])await ensureUserWithSettings(c,user);
   await c.query("select set_config('request.jwt.claim.sub',$1,true)",[owner]);
   const entry=(await c.query('select create_user_dictionary_entry($1,null,$2) id',[owner,{headword:'group-author-entry',languageCode:'nl',definition:'private definition'}])).rows[0].id;
   await c.query('insert into user_word_lists(id,user_id,name) values($1,$2,$3)',[list,owner,'lesson']);
   await c.query('insert into user_word_list_items(list_id,word_id) values($1,$2)',[list,entry]);
   await c.query('insert into private.collection_labels(user_id,id,name) values($1,$2,$3)',[owner,label,'group']);
   await c.query('insert into private.collection_label_assignments values($1,$2,$3)',[owner,list,label]);
   const opened=(await c.query("select mutate_label_share_v1($1,'open',0) value",[label])).rows[0].value;
   const readable=async(user:string)=>(await c.query("select private.entry_access_v1($1,$2,'browse') ok",[user,entry])).rows[0].ok;
   expect(await readable(viewer)).toBe(false);expect(await readable(owner)).toBe(true);
   await c.query("select set_config('request.jwt.claim.sub',$1,true)",[viewer]);await c.query('set local role authenticated');
   await c.query('select accept_label_share_v1($1)',[opened.invitationCode]);await c.query('reset role');
   expect(await readable(viewer)).toBe(true);expect(await readable(outsider)).toBe(false);
   expect((await c.query('select entry_id from private.readable_material_entry_ids_v1($1,$2)',[viewer,{kind:'collection',collectionType:'user',id:list}])).rows)
    .toEqual([{entry_id:entry}]);
   await c.query("select set_config('request.jwt.claim.sub',$1,true)",[viewer]);
   const received=(await c.query('select private.read_received_collection_page_v1(null,100) value')).rows[0].value;
   expect(JSON.stringify(received)).toContain(list);
   const personalLabel=randomUUID();
   await c.query('insert into private.collection_labels(user_id,id,name) values($1,$2,$3)',[viewer,personalLabel,'my group']);
   await c.query('set local role authenticated');
   expect((await c.query('select read_collection_access_paths_v1($1) value',[list])).rows[0].value)
    .toEqual({collectionId:list,isOwner:false,directSubscription:false,groups:[{labelId:label,name:'group'}]});
   const placement=(await c.query('select set_received_collection_labels_v1($1,$2,$3) value',[list,0,[personalLabel]])).rows[0].value;
   expect(placement.labelIds).toEqual([personalLabel]);
   await c.query('reset role');
   expect((await c.query('select count(*)::int n from private.collection_label_assignments where user_id=$1 and collection_id=$2',[owner,list])).rows[0].n).toBe(1);


   await c.query('savepoint borrowed_member');
   await c.query("select set_config('request.jwt.claim.sub',$1,true)",[outsider]);
   const borrowed=(await c.query('select create_user_dictionary_entry($1,null,$2) id',[outsider,{headword:'foreign',languageCode:'nl',definition:'foreign'}])).rows[0].id;
   await expect(c.query('insert into user_word_list_items(list_id,word_id) values($1,$2)',[list,borrowed])).rejects.toThrow('share_copy_required');
   await c.query('rollback to savepoint borrowed_member');

   await c.query("select set_config('request.jwt.claim.sub',$1,true)",[owner]);
   await c.query("select mutate_label_share_v1($1,'close',1)",[label]);
   expect(await readable(viewer)).toBe(false);
  });
 });
});
