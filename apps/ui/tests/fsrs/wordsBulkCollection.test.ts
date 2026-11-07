import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { ensureUserWithSettings, getDbUrl, insertWord, runMigrations, withTransaction } from "./dbTestUtils";
const dbUrl=getDbUrl();
async function bindSourceEntries(
  client: PoolClient,
  entryIds: string[],
  groupKey = `private-source-group-${randomUUID()}`,
) {
  const identitySchemeVersion = `platform-v2-test-${randomUUID()}`;
  const { rows: dictionaryRows } = await client.query(
    `select dictionary_id from word_entries where id = $1`,
    [entryIds[0]],
  );
  const dictionaryId = dictionaryRows[0].dictionary_id as string;
  const { rows: runRows } = await client.query(
    `insert into private.dictionary_import_runs (
       dictionary_id,
       identity_scheme_version,
       artifact_format_version,
       manifest_checksum,
       input_checksum,
       source_record_count,
       artifact_count,
       status
     )
     values ($1, $2, 'test-v1', $3, $4, $5, $5, 'completed')
     returning id`,
    [
      dictionaryId,
      identitySchemeVersion,
      randomUUID(),
      randomUUID(),
      entryIds.length,
    ],
  );
  const importRunId = runRows[0].id as string;

  for (const [index, entryId] of entryIds.entries()) {
    await client.query(
      `insert into private.source_entry_bindings (
         dictionary_id,
         identity_scheme_version,
         source_entry_key,
         source_group_key,
         sense_ordinal,
         word_entry_id,
         binding_state,
         first_seen_run_id,
         last_seen_run_id,
         manifest_checksum,
         content_fingerprint_version,
         content_fingerprint,
         identity_evidence,
         reconciliation_decision
       )
       values (
         $1,
         $2,
         $3,
         $4,
         $5,
         $6,
         'active',
         $7,
         $7,
         'test-manifest',
         'test-v1',
         $8,
         '{"kind":"test"}'::jsonb,
         '{"decision":"create"}'::jsonb
       )`,
      [
        dictionaryId,
        identitySchemeVersion,
        `source-entry-${index + 1}-${randomUUID()}`,
        groupKey,
        index + 1,
        entryId,
        importRunId,
        `fingerprint-${index + 1}`,
      ],
    );
  }

  return groupKey;
}




async function fixture(client:PoolClient){
 const user=randomUUID();await ensureUserWithSettings(client,user);
 const dictionary=(await client.query(`insert into dictionaries(language_code,slug,name,publication_state) values('nl',$1,'Meaning count fixture','general') returning id`,[randomUUID()])).rows[0].id;
 const ids:string[][]=[];
 for(const [word,pos,count] of [['countfiets','noun',3],['countlopen','verb',2]] as const){
  const group:string[]=[];
  for(let sense=1;sense<=count;sense++){
   const id=await insertWord(client,word);
   await client.query(`update word_entries set dictionary_id=$2,meaning_id=$3,part_of_speech=$4,gender='de',raw=$5 where id=$1`,[id,dictionary,sense,pos,{meanings:[{definition:'A precise count fixture.'}]}]);
   group.push(id);
  }
  await bindSourceEntries(client,group);ids.push(group);
  for(const id of group)await client.query('select refresh_dictionary_search_document($1,2)',[id]);
 }
 for(const profile of ['spoken','written']){
  await client.query(`insert into private.vocabulary_frequency_profiles values('nl',$1,'fixture',150,now()) on conflict(language_code,profile) do update set max_rank=150`,[profile]);
  for(const [i,word] of ['countfiets','countlopen'].entries())await client.query(`insert into private.vocabulary_frequency_ranks values('nl',$1,$2,$3) on conflict(language_code,profile,spelling_key) do update set rank=excluded.rank`,[profile,word,100+i*50]);
 }
 const list=(await client.query(`insert into user_word_lists(user_id,name,language_code) values($1,'Count collection','nl') returning id`,[user])).rows[0].id;
 for(const id of [ids[0][0],ids[0][1],ids[1][0]])await client.query('insert into user_word_list_items(list_id,word_id) values($1,$2)',[list,id]);
 return {user,dictionary,ids,list};
}
const filters=(meanings:string|number='all',parts:string[]=[])=>({parts,article:null,sort:'alphabetical',vocabulary:{mode:'frequency',materialKinds:[],profile:'spoken',from:100,to:150,meanings}});
(dbUrl?describe:describe.skip)('bulk article selection',()=>{
 const pool=new Pool({connectionString:dbUrl});beforeAll(()=>runMigrations(pool));afterAll(()=>pool.end());
 test('resolves matching meanings and category results with the current filters',async()=>{
  await withTransaction(pool,async client=>{
   const f=await fixture(client);await client.query("select set_config('request.jwt.claim.sub',$1,true)",[f.user]);
   const groups=(await client.query(`select distinct g.id from private.platform_v2_headword_groups g join private.source_entry_bindings b on g.dictionary_id=b.dictionary_id and g.identity_scheme_version=b.identity_scheme_version and g.source_group_key=b.source_group_key where b.word_entry_id=any($1::uuid[]) order by g.id`,[f.ids.flat()])).rows.map(row=>row.id);
   const resolve=async(ids:string[],query:string,filter:unknown,all=false,category='browse')=>(await client.query('select private.words_bulk_resolve_v1($1,$2,$3,$4,$5,$6,$7,$8,$9) result',[f.user,ids,query,'nl',[f.dictionary],filter,null,all,category])).rows[0].result;
   const full=await resolve(groups,'',filters());expect(full.entryIds).toHaveLength(5);
   expect((await resolve(groups,'',filters(1))).entryIds).toHaveLength(2);
   const group=(await client.query(`select g.id from private.platform_v2_headword_groups g join private.source_entry_bindings b on g.dictionary_id=b.dictionary_id and g.identity_scheme_version=b.identity_scheme_version and g.source_group_key=b.source_group_key where b.word_entry_id=$1`,[f.ids[0][0]])).rows[0].id;
   const searched=await resolve([group],'countfiets',filters(),false,'headwords');expect(searched.articleCount).toBe(1);expect(searched.entryIds).toHaveLength(3);
   const all=await resolve([],'countfiets',filters(1),true,'headwords');expect(all.articleCount).toBe(1);expect(all.entryIds).toHaveLength(1);
   const grants=(await client.query(`select has_function_privilege('anon','public.prepare_words_bulk_collection_v1(uuid[],text,text,uuid[],jsonb,jsonb,uuid,boolean,text)','execute') anon,has_function_privilege('authenticated','public.prepare_words_bulk_collection_v1(uuid[],text,text,uuid[],jsonb,jsonb,uuid,boolean,text)','execute') authenticated,has_function_privilege('authenticated','private.words_bulk_resolve_v1(uuid,uuid[],text,text,uuid[],jsonb,jsonb,boolean,text)','execute') resolver`)).rows[0];
   expect(grants).toEqual({anon:false,authenticated:true,resolver:false});
  });
 });
 test('resolves selections across pages and excludes articles from all-filter selection',async()=>{
  await withTransaction(pool,async client=>{
   const f=await fixture(client);await client.query("select set_config('request.jwt.claim.sub',$1,true)",[f.user]);const selected:string[]=[];
   for(let i=0;i<52;i++){
    const id=await insertWord(client,`bulkpage${String(i).padStart(2,'0')}`);
    await client.query("update word_entries set dictionary_id=$2,meaning_id=1,part_of_speech='noun',gender='de',raw=$3 where id=$1",[id,f.dictionary,{meanings:[{definition:'Pagination fixture.'}]}]);
    await bindSourceEntries(client,[id]);await client.query('select refresh_dictionary_search_document($1,2)',[id]);
    if(i===0||i===51)selected.push((await client.query(`select g.id from private.platform_v2_headword_groups g join private.source_entry_bindings b on g.dictionary_id=b.dictionary_id and g.identity_scheme_version=b.identity_scheme_version and g.source_group_key=b.source_group_key where b.word_entry_id=$1`,[id])).rows[0].id);
   }
   const resolve=async(ids:string[],all:boolean)=>(await client.query('select private.words_bulk_resolve_v1($1,$2,$3,$4,$5,$6,$7,$8,$9) result',[f.user,ids,'','nl',[f.dictionary],{parts:[],article:null},null,all,'browse'])).rows[0].result;
   expect((await resolve(selected,false)).entryIds).toHaveLength(2);
   const all=await resolve([],true),except=await resolve([selected[1]],true);
   expect(all.articleCount).toBe(54);expect(all.entryIds).toHaveLength(57);expect(except.articleCount).toBe(53);expect(except.entryIds).toHaveLength(56);
  });
 });
 test('adds a group-shared author entry by reference while access is live',async()=>{
  await withTransaction(pool,async client=>{
   if(!(await client.query("select to_regprocedure('private.collection_audience_recipients_v1(uuid,uuid)') is not null present")).rows[0].present)return;
   const owner=randomUUID(),viewer=randomUUID(),label=randomUUID(),source=randomUUID(),target=randomUUID();
   await ensureUserWithSettings(client,owner);await ensureUserWithSettings(client,viewer);await client.query("select set_config('request.jwt.claim.sub',$1,true)",[owner]);
   const entry=(await client.query('select create_user_dictionary_entry($1,null,$2) id',[owner,{headword:'bulksharedtest',languageCode:'nl',definition:'shared source'}])).rows[0].id;
   await client.query("insert into user_word_lists(id,user_id,name,language_code) values($1,$2,'source','nl')",[source,owner]);await client.query('insert into user_word_list_items(list_id,word_id) values($1,$2)',[source,entry]);
   await client.query("insert into private.collection_labels(id,user_id,name) values($1,$2,'group')",[label,owner]);await client.query('insert into private.collection_label_assignments values($1,$2,$3)',[owner,source,label]);
   const opened=(await client.query("select mutate_label_share_v1($1,'open',0) value",[label])).rows[0].value;
   await client.query("select set_config('request.jwt.claim.sub',$1,true)",[viewer]);await client.query('select accept_label_share_v1($1)',[opened.invitationCode]);
   await client.query("insert into user_word_lists(id,user_id,name,language_code) values($1,$2,'target','nl')",[target,viewer]);
   const group=(await client.query('select public.read_platform_v2_presentation_identity($1,$2,false) value',[viewer,[entry]])).rows[0].value.entries[0]?.headwordGroupId;
   expect(group).toBeTruthy();
   const access=(await client.query("select public.can_access_dictionary($1,e.dictionary_id,'read') dictionary_access,private.entry_access_v1($1,e.id,'train') entry_access from private.active_word_entries e where e.id=$2",[viewer,entry])).rows[0];
   expect(access).toEqual({dictionary_access:false,entry_access:true});
   const plan=(await client.query('select public.prepare_words_bulk_collection_v1($1,$2,$3,$4,$5,$6,$7,$8,$9) value',[[group],'','nl',null,{parts:[],article:null},{kind:'collection',collectionType:'user',id:source},target,false,'browse'])).rows[0].value;
   expect(plan.meaningCount).toBe(1);
   expect((await client.query('select public.confirm_words_bulk_collection_v1($1) value',[plan.planId])).rows[0].value).toMatchObject({status:'committed',addedCount:1});
   expect((await client.query('select word_id from user_word_list_items where list_id=$1',[target])).rows).toEqual([{word_id:entry}]);
   const second=randomUUID();await client.query("insert into user_word_lists(id,user_id,name,language_code) values($1,$2,'second','nl')",[second,viewer]);
   const stale=(await client.query('select public.prepare_words_bulk_collection_v1($1,$2,$3,$4,$5,$6,$7,$8,$9) value',[[group],'','nl',null,{parts:[],article:null},{kind:'collection',collectionType:'user',id:source},second,false,'browse'])).rows[0].value;
   await client.query("select set_config('request.jwt.claim.sub',$1,true)",[owner]);await client.query("select mutate_label_share_v1($1,'close',1)",[label]);
   await client.query("select set_config('request.jwt.claim.sub',$1,true)",[viewer]);await client.query('savepoint revoked');
   await expect(client.query('select public.confirm_words_bulk_collection_v1($1)',[stale.planId])).rejects.toThrow();await client.query('rollback to savepoint revoked');
   expect((await client.query('select count(*)::int n from user_word_list_items where list_id=$1',[second])).rows[0].n).toBe(0);
  });
 });
 test('prepares and confirms a frozen selection when audience authority is installed',async()=>{
  await withTransaction(pool,async client=>{
   const present=(await client.query("select to_regprocedure('private.collection_audience_recipients_v1(uuid,uuid)') is not null present")).rows[0].present;
   if(!present)return;
   const f=await fixture(client);await client.query("select set_config('request.jwt.claim.sub',$1,true)",[f.user]);
   const target=(await client.query("insert into user_word_lists(user_id,name,language_code) values($1,'bulk target','nl') returning id",[f.user])).rows[0].id;
   const groups=(await client.query(`select distinct g.id from private.platform_v2_headword_groups g join private.source_entry_bindings b on g.dictionary_id=b.dictionary_id and g.identity_scheme_version=b.identity_scheme_version and g.source_group_key=b.source_group_key where b.word_entry_id=any($1::uuid[]) order by g.id`,[f.ids.flat()])).rows.map(row=>row.id);
   const plan=(await client.query('select public.prepare_words_bulk_collection_v1($1,$2,$3,$4,$5,$6,$7,$8,$9) result',[groups,'','nl',[f.dictionary],filters(1),null,target,false,'browse'])).rows[0].result;
   expect(plan).toMatchObject({collectionId:target,articleCount:2,meaningCount:2,audience:[]});
   const viewer=randomUUID(),root=randomUUID(),lifetime=randomUUID();await ensureUserWithSettings(client,viewer);
   await client.query('insert into private.collection_sharing_roots(id,owner_user_id,collection_id,is_open,access_lifetime) values($1,$2,$3,true,$4)',[root,f.user,target,lifetime]);
   await client.query('insert into private.collection_sharing_subscriptions(user_id,root_id,access_lifetime) values($1,$2,$3)',[viewer,root,lifetime]);
   const shared=(await client.query('select public.prepare_words_bulk_collection_v1($1,$2,$3,$4,$5,$6,$7,$8,$9) result',[groups,'','nl',[f.dictionary],filters(1),null,target,false,'browse'])).rows[0].result;
   expect(shared.audience).toHaveLength(1);
   await client.query('delete from private.collection_sharing_subscriptions where user_id=$1 and root_id=$2',[viewer,root]);
   await client.query('savepoint stale_audience');
   await expect(client.query('select public.confirm_words_bulk_collection_v1($1)',[shared.planId])).rejects.toThrow('collection_audience_changed');
   await client.query('rollback to savepoint stale_audience');
   const changed=(await client.query('select public.prepare_words_bulk_collection_v1($1,$2,$3,$4,$5,$6,$7,$8,$9) result',[groups,'','nl',[f.dictionary],filters(1),null,target,false,'browse'])).rows[0].result;
   await client.query('insert into user_word_list_items(list_id,word_id) values($1,$2)',[target,f.ids[0][2]]);
   await client.query('savepoint stale');
   await expect(client.query('select public.confirm_words_bulk_collection_v1($1)',[changed.planId])).rejects.toThrow('collection_audience_changed');
   await client.query('rollback to savepoint stale');
   await client.query('delete from user_word_list_items where list_id=$1',[target]);
   await client.query(`create function pg_temp.reject_bulk_fixture() returns trigger language plpgsql as $$ begin raise exception 'fixture_failure'; end $$`);
   await client.query('create trigger reject_bulk_fixture before insert on public.user_word_list_items for each row execute function pg_temp.reject_bulk_fixture()');
   await client.query('savepoint atomic_failure');
   await expect(client.query('select public.confirm_words_bulk_collection_v1($1)',[plan.planId])).rejects.toThrow('fixture_failure');
   await client.query('rollback to savepoint atomic_failure');
   expect((await client.query('select count(*)::int n from user_word_list_items where list_id=$1',[target])).rows[0].n).toBe(0);
   await client.query('drop trigger reject_bulk_fixture on public.user_word_list_items');
   await client.query("select set_config('request.jwt.claim.sub',$1,true)",[viewer]);
   expect((await client.query('select public.read_words_bulk_collection_plan_v1($1) result',[plan.planId])).rows[0].result.status).toBe('unknown');
   await client.query('savepoint wrong_user');
   await expect(client.query('select public.confirm_words_bulk_collection_v1($1)',[plan.planId])).rejects.toThrow('collection_plan_unavailable');
   await client.query('rollback to savepoint wrong_user');
   await client.query("select set_config('request.jwt.claim.sub',$1,true)",[f.user]);
   const receipt=(await client.query('select public.confirm_words_bulk_collection_v1($1) result',[plan.planId])).rows[0].result;expect(receipt).toMatchObject({status:'committed',addedCount:2});
   expect((await client.query('select public.confirm_words_bulk_collection_v1($1) result',[plan.planId])).rows[0].result).toEqual(receipt);
   expect((await client.query('select public.read_words_bulk_collection_plan_v1($1) result',[plan.planId])).rows[0].result).toEqual(receipt);
  });
 });
});
