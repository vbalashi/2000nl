import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { ensureUserWithSettings, getDbUrl, insertWord, runMigrations, withTransaction } from "./dbTestUtils";
const dbUrl=getDbUrl();
const describeIfDb=dbUrl?describe:describe.skip;
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
 const {rows}=await client.query(`insert into dictionaries(language_code,slug,name,publication_state) values('nl',$1,'Batch selection regression','general') returning id`,[randomUUID()]);
 const dictionary=rows[0].id;const entries:string[]=[];
 for(const [word,pos,count] of [['batchfiets','noun',4],['batchfiets','verb',2],['batchander','other',2],[' ÉÉN ','noun',1],['een','noun',1]] as const){
  const ids:string[]=[];
  for(let sense=1;sense<=count;sense++){
   const id=await insertWord(client,word);
   await client.query(`update word_entries set dictionary_id=$2,meaning_id=$3,part_of_speech=$4,gender='de',raw=$5 where id=$1`,[id,dictionary,sense,pos,{meanings:[{definition:'Een batchfiets betekenis.',examples:['Een batchfiets rijdt.','De batchfiets staat.']}]}]);
   ids.push(id);entries.push(id);
  }
  await bindSourceEntries(client,ids);
  for(const id of ids)await client.query('select refresh_dictionary_search_document($1,2)',[id]);
 }
 for(const profile of ['spoken','written']){
  await client.query("insert into private.vocabulary_frequency_profiles values('nl',$1,'fixture',800,now()) on conflict(language_code,profile) do update set max_rank=800",[profile]);
  for(const [i,word] of ['batchfiets','batchander','één','een'].entries())await client.query(`insert into private.vocabulary_frequency_ranks(language_code,profile,spelling_key,rank) values('nl',$1,$2,$3) on conflict(language_code,profile,spelling_key) do update set rank=excluded.rank`,[profile,word,profile==='spoken'?400+i:800-i]);
 }
 return {user,dictionary,entries};
}
const selection=(dictionary:string,mode='frequency',meanings:string|number=1,profile='spoken',materialKinds:string[]=[],parts:string[]=[],article:string|null=null)=>({
 materialSelection:{schemaVersion:1,allowedLanguageCodes:null,disabledDictionaryIds:[]},dictionaryIds:[dictionary],parts,article,sort:'alphabetical',
 vocabulary:{mode,meanings,profile,from:400,to:800,materialKinds},
});
describeIfDb('Library set based selection',()=>{
 const pool=new Pool({connectionString:dbUrl});
 beforeAll(async()=>{await runMigrations(pool);});afterAll(async()=>{await pool.end();});
 test('matches scalar membership across arbitrary ranges, meanings, POS and material modes without refilling',async()=>{
  await withTransaction(pool,async client=>{
   const f=await fixture(client);
   for(const mode of ['frequency','all'])for(const profile of ['spoken','written'])for(const meanings of ['all',1,2,3,4,5])for(const kinds of [[],['word'],['other']]){
    for(const [parts,article] of [[[],null],[['noun'],'de']] as [string[],string|null][]){
     const scope=selection(f.dictionary,mode,meanings,profile,kinds,parts,article);
     const {rows}=await client.query(`select array(select entry_id from private.library_selected_entry_ids_v1($1,$2) order by entry_id) batch,
      array(select id from word_entries where id=any($2) and private.library_entry_selection_matches_v1(id,part_of_speech,gender,$1) order by id) scalar`,[scope,f.entries]);
     expect(rows[0].batch).toEqual(rows[0].scalar);
    }
   }
   const {rows}=await client.query(`select array(select entry_id from private.library_selected_entry_ids_v1($1,'{}')) empty,
    array(select entry_id from private.library_selected_entry_ids_v1($1,$2)) late`,[selection(f.dictionary),[f.entries[3]]]);
   expect(rows[0]).toEqual({empty:[],late:[]});
  });
 },30_000);
 test('body categories reuse one authorized scope and retain loaded-only counts and cursors',async()=>{
  await withTransaction(pool,async client=>{
   const f=await fixture(client);
   await client.query(`alter function private.library_category_entry_ids_v1(uuid,jsonb) rename to library_scope_test_original;
    create sequence private.library_scope_test_calls;
    create function private.library_category_entry_ids_v1(uuid,jsonb) returns table(entry_id uuid) language plpgsql stable as $spy$
     begin if current_setting('plan_cache_mode') <> 'force_custom_plan' then raise exception 'body_custom_plan_required';end if;perform nextval('private.library_scope_test_calls');return query select * from private.library_scope_test_original($1,$2);end $spy$;`);
   await client.query('set local plan_cache_mode=force_generic_plan');
   for(const group of ['examples','definitions']){
    await client.query('alter sequence private.library_scope_test_calls restart with 1');
    const filter={parts:[],article:null,vocabulary:selection(f.dictionary).vocabulary};
    const {rows}=await client.query(`select public.search_library_category_v1($1,'batchfiets','nl',array[$2::uuid],$3,null,$4,1,null) result`,[f.user,f.dictionary,filter,group]);
    const result=rows[0].result;expect(result.error).toBeUndefined();
    const category=result.groups[0];expect(category.items).toHaveLength(1);expect(category.total).toBeNull();expect(category.count.relation).toBe('unknown');
    expect(category.page.hasMore).toBe(true);expect(category.page.nextCursor).toBeTruthy();
    expect(Number((await client.query('select last_value from private.library_scope_test_calls')).rows[0].last_value)).toBe(1);
    expect((await client.query("show plan_cache_mode")).rows[0].plan_cache_mode).toBe('force_generic_plan');
   }
  });
 },30_000);
 test('batch sort ranks retain exact spelling normalization, unknowns and disabled sort',async()=>{
  await withTransaction(pool,async client=>{
   const f=await fixture(client);
   const personal=(await client.query(`insert into dictionaries(language_code,slug,name,kind,visibility,owner_user_id,schema_key,schema_version) values('nl',$1,'Personal','user','private',$2,'user-entry-v1',1) returning id`,[randomUUID(),f.user])).rows[0].id;
   const own=(await client.query(`insert into word_entries(dictionary_id,language_code,headword,part_of_speech,management_kind,raw) values($1,'nl','batchfiets','noun','user','{}') returning id`,[personal])).rows[0].id;
   const ids=[...f.entries,own,randomUUID()];
   for(const sort of ['spoken','written']){
    const {rows}=await client.query(`select b.entry_id,b.sort_rank,private.vocabulary_order_rank_v1(b.entry_id,$2) scalar from private.library_entry_order_ranks_v1($1,$2)b`,[ids,sort]);
    expect(rows).toHaveLength(ids.length);for(const row of rows)expect(row.sort_rank).toBe(row.scalar);
    expect(rows.find(row=>row.entry_id===own)?.sort_rank).toBe(2147483647);
   }
   expect((await client.query(`select * from private.library_entry_order_ranks_v1($1,'alphabetical')`,[ids])).rows).toEqual([]);
  });
 });
 test('filtered browse never evaluates the combined predicate for every unrelated entry',async()=>{
  await withTransaction(pool,async client=>{
   const f=await fixture(client);
   for(let i=0;i<150;i++){
    const id=await insertWord(client,'unranked-'+i);
    await client.query('update word_entries set dictionary_id=$2 where id=$1',[id,f.dictionary]);
    await client.query('select refresh_dictionary_search_document($1,2)',[id]);
   }
   await client.query(`alter function private.library_entry_selection_matches_v1(uuid,text,text,jsonb) rename to library_selection_test_original;
    create sequence private.library_selection_test_calls;
    create function private.library_entry_selection_matches_v1(uuid,text,text,jsonb) returns boolean language plpgsql stable as $spy$
     begin perform nextval('private.library_selection_test_calls');return private.library_selection_test_original($1,$2,$3,$4);end $spy$;`);
   const {rows}=await client.query(`select public.lookup_platform_v2_library_filtered_entries($1,'','nl',array[$2::uuid],null,10,100,$3) result`,[f.user,f.dictionary,{parts:[],article:null,sort:"alphabetical",vocabulary:selection(f.dictionary).vocabulary}]);
   expect(rows[0].result.error).toBeUndefined();expect(rows[0].result.page.totalGroups).toBe(5);
   const calls=(await client.query('select last_value,is_called from private.library_selection_test_calls')).rows[0];
   expect(calls.is_called?Number(calls.last_value):0).toBeLessThanOrEqual(10);
  });
 },30_000);
});
