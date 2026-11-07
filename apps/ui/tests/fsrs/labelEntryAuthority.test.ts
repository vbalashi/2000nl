import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {beforeAll,afterAll,describe,test,expect} from 'vitest';
import {getDbUrl,runMigrations,ensureUserWithSettings,withTransaction} from './dbTestUtils';
const url=getDbUrl();
(url?describe:describe.skip)('group author entry authority',()=>{
 const pool=new Pool({connectionString:url});beforeAll(()=>runMigrations(pool));afterAll(()=>pool.end());
 test('close emits invalidation for the departed subscriber in a new transaction',async()=>{
  const owner=randomUUID(),viewer=randomUUID(),label=randomUUID();const c=await pool.connect();
  try{
   await c.query('begin');
   await ensureUserWithSettings(c,owner);await ensureUserWithSettings(c,viewer);
   await c.query("select set_config('request.jwt.claim.sub',$1,true)",[owner]);
   await c.query('insert into private.collection_labels(user_id,id,name) values($1,$2,$3)',[owner,label,'events']);
   const opened=(await c.query("select mutate_label_share_v1($1,'open',0) value",[label])).rows[0].value;


   await c.query("select set_config('request.jwt.claim.sub',$1,true)",[viewer]);
   await c.query('select accept_label_share_v1($1)',[opened.invitationCode]);await c.query('commit');
   await c.query('begin');
   await c.query("delete from realtime.messages where topic=$1",['app:user:'+viewer]);
   await c.query("select set_config('request.jwt.claim.sub',$1,true)",[owner]);
   await c.query("select mutate_label_share_v1($1,'close',1)",[label]);
   expect((await c.query("select distinct payload->>'kind' kind from realtime.messages where topic=$1 order by kind",['app:user:'+viewer])).rows)
    .toEqual([{kind:'collections.changed'},{kind:'notes.changed'}]);
   await c.query('rollback');
  }finally{
   await c.query('rollback');await c.query('delete from auth.users where id=any($1::uuid[])',[[owner,viewer]]);c.release();
  }
 });
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
   expect((await c.query('select preflight_label_share_v1($1) value',[label])).rows[0].value).toEqual({labelId:label,collections:[]});
   const opened=(await c.query("select mutate_label_share_v1($1,'open',0) value",[label])).rows[0].value;
   const ownerCatalog=(await c.query('select read_personal_collection_catalog_v1() value')).rows[0].value;
   expect(ownerCatalog.collections.find((row:{id:string})=>row.id===list).isShared).toBe(true);

   const readable=async(user:string)=>(await c.query("select private.entry_access_v1($1,$2,'browse') ok",[user,entry])).rows[0].ok;
   expect(await readable(viewer)).toBe(false);expect(await readable(owner)).toBe(true);
   await c.query("select set_config('request.jwt.claim.sub',$1,true)",[viewer]);await c.query('set local role authenticated');
   await c.query('select accept_label_share_v1($1)',[opened.invitationCode]);await c.query('reset role');
   expect(await readable(viewer)).toBe(true);expect(await readable(outsider)).toBe(false);
   await c.query("select set_config('request.jwt.claim.sub',$1,true)",[owner]);
   const removalPlan=(await c.query('select prepare_collection_composition_v1($1,$2) value',[list,{action:'remove',entryIds:[entry]}])).rows[0].value;
   expect(removalPlan.audience.map((row:{userId:string})=>row.userId)).toEqual([viewer]);
   await c.query('savepoint unconfirmed_membership');
   await expect(c.query('select remove_entries_from_user_list($1,$2,$3)',[owner,list,[entry]])).rejects.toThrow('collection_audience_confirmation_required');
   await c.query('rollback to savepoint unconfirmed_membership');
   await c.query("select set_config('request.jwt.claim.sub',$1,true)",[viewer]);
   const snapshot=(await c.query('select private.independent_copy_snapshot_with_notes_v1($1,$2) value',[viewer,entry])).rows[0].value;
   expect(snapshot.content.headword).toBe('group-author-entry');
   expect(snapshot.revision).toMatch(/^[0-9a-f]{64}$/);
   expect((await c.query('select private.collection_audience_recipients_v1($1,$2) value',[owner,list])).rows[0].value.map((row:{userId:string})=>row.userId)).toEqual([viewer]);
   expect((await c.query("select collection_id,ownership,available_item_count::int,eligible from private.training_collection_catalog_cohort_v1($1,'',null,null,null,100,null)",[viewer])).rows)
    .toEqual([{collection_id:list,ownership:'received',available_item_count:1,eligible:true}]);


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
   expect((await c.query('select read_received_collection_source_v1($1) value',[list])).rows[0].value.id).toBe(list);
   expect((await c.query("select get_word_list_summary($1,$2,'user') value",[viewer,list])).rows[0].value.id).toBe(list);
   expect((await c.query('select read_selected_collection_membership_v1($1,$2) value',[list,[entry]])).rows[0].value)
    .toEqual({collectionId:list,includedEntryIds:[entry]});
   const placement=(await c.query('select set_received_collection_labels_v1($1,$2,$3) value',[list,0,[personalLabel]])).rows[0].value;
   expect(placement.labelIds).toEqual([personalLabel]);
   await c.query('reset role');
   await c.query("select set_config('request.jwt.claim.role','service_role',true)");
   await c.query('set local role service_role');
   await c.query("select perform_platform_v2_card_action_as_principal($1,'start-learning',$2,'word-to-definition','untracked',null,null,null,$3,null,'first_party',null)",[viewer,entry,randomUUID()]);

   await c.query('reset role');
   const progressBefore=(await c.query('select to_jsonb(status) value from user_card_status status where user_id=$1 and entry_id=$2',[viewer,entry])).rows;
   expect(progressBefore.length).toBeGreaterThan(0);
   expect((await c.query('select count(*)::int n from private.collection_label_assignments where user_id=$1 and collection_id=$2',[owner,list])).rows[0].n).toBe(1);


   await c.query('savepoint borrowed_member');
   await c.query("select set_config('request.jwt.claim.sub',$1,true)",[outsider]);
   const borrowed=(await c.query('select create_user_dictionary_entry($1,null,$2) id',[outsider,{headword:'foreign',languageCode:'nl',definition:'foreign'}])).rows[0].id;
   await expect(c.query('insert into user_word_list_items(list_id,word_id) values($1,$2)',[list,borrowed])).rejects.toThrow('share_copy_required');
   await c.query('rollback to savepoint borrowed_member');

   await c.query("select set_config('request.jwt.claim.sub',$1,true)",[owner]);
   const directRoot=randomUUID(),lifetime=randomUUID();
   await c.query('insert into private.collection_sharing_roots(id,owner_user_id,collection_id,is_open,access_lifetime) values($1,$2,$3,true,$4)',[directRoot,owner,list,lifetime]);
   await c.query('insert into private.collection_sharing_subscriptions(user_id,root_id,access_lifetime) values($1,$2,$3)',[viewer,directRoot,lifetime]);
   await c.query("select mutate_label_share_v1($1,'close',1)",[label]);


   expect(await readable(viewer)).toBe(true);
   await c.query('update private.collection_sharing_subscriptions set is_active=false where user_id=$1 and root_id=$2',[viewer,directRoot]);
   expect(await readable(viewer)).toBe(false);
   expect((await c.query('select to_jsonb(status) value from user_card_status status where user_id=$1 and entry_id=$2',[viewer,entry])).rows).toEqual(progressBefore);
   await c.query("select set_config('request.jwt.claim.sub',$1,true)",[viewer]);
   await c.query('set local role authenticated');
   expect((await c.query('select read_received_collection_source_v1($1) value',[list])).rows[0].value).toBeNull();
   expect((await c.query('select read_selected_collection_membership_v1($1,$2) value',[list,[entry]])).rows[0].value).toBeNull();
  });
 });
});
