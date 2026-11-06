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
const filters=(meanings:string|number='all',parts:string[]=[],profile='spoken')=>({parts,article:null,sort:'alphabetical',vocabulary:{mode:'frequency',materialKinds:[],profile,from:100,to:150,meanings}});
async function browse(client:PoolClient,f:Awaited<ReturnType<typeof fixture>>,filter:unknown,cursor:string|null=null,query='',limit=1){
 return (await client.query(`select public.lookup_platform_v2_library_filtered_entries($1,$2,'nl',array[$3::uuid],$4,$5,50,$6) result`,[f.user,query,f.dictionary,cursor,limit,filter])).rows[0].result;
}
async function material(client:PoolClient,f:Awaited<ReturnType<typeof fixture>>,filter:unknown,cursor:string|null=null,query='',list=f.list){
 return (await client.query(`select public.lookup_platform_v2_library_material_entries($1,$2,'nl',$3::uuid[],$4,1,50,$5,$6) result`,[f.user,query,null,cursor,filter,{kind:'collection',id:list,collectionType:'user'}])).rows[0].result;
}
(dbUrl?describe:describe.skip)('Library exact article and meaning counts',()=>{
 const pool=new Pool({connectionString:dbUrl});beforeAll(()=>runMigrations(pool));afterAll(()=>pool.end());
 test('counts selected entries across every page and changes first-N without changing article totals',async()=>{
  await withTransaction(pool,async client=>{
   const f=await fixture(client);
   for(const profile of ['spoken','written'])for(const [meanings,expected]of [['all',5],[1,2],[2,4],[3,5]] as const){
    let cursor:string|null=null;let pages=0;const seen=new Set<string>();
    do{
     const result=await browse(client,f,filters(meanings,[],profile),cursor);
     expect(result.error).toBeUndefined();expect(result.page.totalGroups).toBe(2);expect(result.page.totalMeanings).toBe(expected);
     for(const item of result.items)seen.add(item.id);
     cursor=result.page.nextGroupCursor;pages++;
    }while(cursor&&pages<4);
    expect(cursor).toBeNull();expect(pages).toBe(2);expect(seen.size).toBe(expected);
   }
   expect((await browse(client,f,filters('all'),null,'',25)).page.totalMeanings).toBe(5);
   expect((await browse(client,f,filters('all',['noun']))).page).toMatchObject({totalGroups:1,totalMeanings:3});
   expect((await browse(client,f,filters(2,['noun']))).page).toMatchObject({totalGroups:1,totalMeanings:2});
   expect((await browse(client,f,filters('all',['adjective']))).page).toMatchObject({totalGroups:0,totalMeanings:0});
  });
 });
 test('inactive vocabulary retains Library pointer entries and excludes archived entries',async()=>{
  await withTransaction(pool,async client=>{
   const f=await fixture(client);
   await client.query(`update word_entries set raw='{"cross_reference":"countlopen","meanings":[]}' where id=$1`,[f.ids[0][2]]);
   await client.query('select refresh_dictionary_search_document($1,2)',[f.ids[0][2]]);
   const archived=(await client.query(`insert into word_entries(dictionary_id,language_code,headword,part_of_speech,raw,archived_at) values($1,'nl','countarchived','noun','{}',now()) returning id`,[f.dictionary])).rows[0].id;
   await client.query('select refresh_dictionary_search_document($1,2)',[archived]);
   for(const filter of [{parts:[],article:null,sort:'alphabetical'},{...filters('all'),vocabulary:{...filters('all').vocabulary,mode:'all'}}]){
    const result=await browse(client,f,filter,null,'',25);
    expect(result.error).toBeUndefined();expect(result.page).toMatchObject({totalGroups:2,totalMeanings:5});
    expect(result.items.map((entry:{id:string})=>entry.id)).toContain(f.ids[0][2]);
    expect(result.items.map((entry:{id:string})=>entry.id)).not.toContain(archived);
   }
  });
 });
 test('exact matches count matching meanings, not full-article expansion',async()=>{
  await withTransaction(pool,async client=>{
   const f=await fixture(client);
   expect((await browse(client,f,filters('all'),null,'countfiets')).page).toMatchObject({totalGroups:1,totalMeanings:3});
   expect((await browse(client,f,filters(1),null,'countfiets')).page).toMatchObject({totalGroups:1,totalMeanings:1});
   expect((await browse(client,f,filters('all'),null,'unmatched-fixture')).page).toMatchObject({totalGroups:0,totalMeanings:0});
  });
 });
 test('material pages count exact memberships and exclude unavailable entries without refilling first-N',async()=>{
  await withTransaction(pool,async client=>{
   const f=await fixture(client),other=randomUUID();await ensureUserWithSettings(client,other);
   const foreignDictionary=(await client.query(`insert into dictionaries(language_code,slug,name,kind,publication_state,owner_user_id,is_editable,schema_key,schema_version) values('nl',$1,'Foreign count fixture','user','general',$2,true,'user-entry-v1',1) returning id`,[randomUUID(),other])).rows[0].id;
   const foreign=(await client.query(`insert into word_entries(dictionary_id,language_code,headword,meaning_id,part_of_speech,raw) values($1,'nl','countfiets',1,'noun','{}') returning id`,[foreignDictionary])).rows[0].id;
   await client.query('insert into user_word_list_items(list_id,word_id) values($1,$2)',[f.list,foreign]);
   let cursor:string|null=null;let pages=0;
   do{
    const result=await material(client,f,filters('all'),cursor);
    expect(result.error).toBeUndefined();expect(result.page).toMatchObject({totalGroups:2,totalMeanings:3,unavailableEntryCount:1});
    expect(JSON.stringify(result)).not.toContain(foreign);cursor=result.page.nextGroupCursor;pages++;
   }while(cursor&&pages<4);
   expect(pages).toBe(2);
   const exact=await material(client,f,filters('all'),null,'countfiets');
   expect(exact.page).toMatchObject({totalGroups:1,totalMeanings:2,unavailableEntryCount:1});expect(exact.items).toHaveLength(3);
   expect((await material(client,f,filters(1),null,'countfiets')).page).toMatchObject({totalGroups:1,totalMeanings:1});
   await client.query('delete from user_word_list_items where list_id=$1',[f.list]);
   for(const id of [f.ids[0][2],f.ids[1][1]])await client.query('insert into user_word_list_items(list_id,word_id) values($1,$2)',[f.list,id]);
   expect((await material(client,f,filters(1))).page).toMatchObject({totalGroups:0,totalMeanings:0});
   expect((await material(client,f,filters('all'))).page).toMatchObject({totalGroups:2,totalMeanings:2});
  });
 });
});
