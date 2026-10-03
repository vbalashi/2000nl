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


const selection=(ids:string[]|null,parts:string[]=[],article:string|null=null)=>({
 materialSelection:{schemaVersion:1,allowedLanguageCodes:null,disabledDictionaryIds:[]},
 dictionaryIds:ids,parts,article,
});
async function baseline(client:PoolClient){
 const {rows}=await client.query(`select pg_get_functiondef('private.lookup_platform_v2_library_filtered_entries_base_v1(uuid,boolean,text,text,text,integer,integer,jsonb)'::regprocedure) definition`);
 const definition=String(rows[0].definition).replace('private.lookup_platform_v2_library_filtered_entries_base_v1(', 'private.library_browse_pre196_test(')
  .replace(/    IF v_raw_query IS NULL THEN\n        RETURN private\.lookup_platform_v2_library_browse_entries_v1\([\s\S]*?    END IF;\n/, '');
 expect(definition).not.toContain('RETURN private.lookup_platform_v2_library_browse_entries_v1(');
 await client.query(definition);
}
async function lookup(client:PoolClient,user:string,scope:unknown,cursor:string|null=null,bound=50,query=''){
 const args=[user,query,cursor,bound,JSON.stringify(scope)];
 const {rows}=await client.query(`select
 private.library_browse_pre196_test($1,false,$2,'nl',$3,3,$4,$5) old,
 private.lookup_platform_v2_library_filtered_entries_base_v1($1,false,$2,'nl',$3,3,$4,$5) current`,args);
 expect(rows[0].current).toEqual(rows[0].old);
 return rows[0].current;
}
async function fixture(client:PoolClient,user=randomUUID()){
 await ensureUserWithSettings(client,user);
 const {rows}=await client.query(`insert into dictionaries(language_code,slug,name) values('nl',$1,'Library browse parity') returning id`,[randomUUID()]);
 const dictionary=rows[0].id;
 const entries:string[]=[];
 for(let group=0;group<8;group++){
  const ids:string[]=[];
  for(let sense=0;sense<2;sense++){
   const id=await insertWord(client,`browse-${group}`);
   await client.query(`update word_entries set dictionary_id=$2,meaning_id=$3,part_of_speech=$4,gender=$5 where id=$1`,[id,dictionary,sense+1,group%2?'verb':'noun',sense?'het':'de']);
   ids.push(id);entries.push(id);
  }
  await bindSourceEntries(client,ids);
  for(const id of ids)await client.query('select refresh_dictionary_search_document($1,2)',[id]);
 }
 return {user,dictionary,entries};
}
describeIfDb('Library empty browse bounded query',()=>{
 const pool=new Pool({connectionString:dbUrl});
 beforeAll(async()=>{await runMigrations(pool);});
 afterAll(async()=>{await pool.end();});
 test('matches the previous projection, total, ordering and cursors across pages and filters',async()=>{
  await withTransaction(pool,async client=>{
   await baseline(client);const f=await fixture(client);
   for(const scope of [selection([f.dictionary]),selection([f.dictionary],['noun']),selection([f.dictionary],['noun'],'de'),selection([f.dictionary],['verb']),selection([])]){
    let cursor:string|null=null;let count=0;
    do {const page=await lookup(client,f.user,scope,cursor);expect(page.error).toBeUndefined();cursor=page.page.nextGroupCursor;count++;}while(cursor&&count<10);
    expect(cursor).toBeNull();
   }
   await lookup(client,f.user,selection([f.dictionary]),null,50,'browse-2');
   await lookup(client,f.user,selection([f.dictionary]),null,1);
   await lookup(client,f.user,selection([f.dictionary]),'not-a-cursor');
   const page=await lookup(client,f.user,selection([f.dictionary]));
   const mismatched=await lookup(client,f.user,selection([f.dictionary],['noun']),page.page.nextGroupCursor);
   expect(mismatched.error).toBe('invalid_cursor');
  });
 },30_000);
 test('keeps private unindexed user entries owner-scoped and source tier access intact',async()=>{
  await withTransaction(pool,async client=>{
   await baseline(client);const f=await fixture(client);const other=randomUUID();await ensureUserWithSettings(client,other);
   await client.query(`select set_config('request.jwt.claim.sub',$1,true)`,[f.user]);
   const {rows}=await client.query(`select create_user_dictionary_entry($1,NULL,jsonb_build_object('headword','own-browse','languageCode','nl','definition','owned')) id`,[f.user]);
   const entry=rows[0].id;await client.query('delete from dictionary_search_documents where entry_id=$1',[entry]);
   const {rows:dict}=await client.query('select dictionary_id from word_entries where id=$1',[entry]);
   const ownScope=selection([dict[0].dictionary_id]);
   const own=await lookup(client,f.user,ownScope);expect(own.items.map((x:{id:string})=>x.id)).toContain(entry);
   const hidden=await lookup(client,other,ownScope);expect(hidden.items).toEqual([]);expect(hidden.page.totalGroups).toBe(0);
   await client.query(`update dictionaries set minimum_subscription_tier='premium' where id=$1`,[f.dictionary]);
   expect((await lookup(client,f.user,selection([f.dictionary]))).items).toEqual([]);
   await client.query(`update user_settings set subscription_tier='premium' where user_id=$1`,[f.user]);
   expect((await lookup(client,f.user,selection([f.dictionary]))).items.length).toBeGreaterThan(0);
  });
 },30_000);
 test('orders overlapping source groups globally and honors entitlement and material restrictions',async()=>{
  await withTransaction(pool,async client=>{
   await baseline(client);const first=await fixture(client);const second=await fixture(client,first.user);
   const scope=selection([first.dictionary,second.dictionary]);
   let cursor:string|null=null;const headwords:string[]=[];
   do {
    const page=await lookup(client,first.user,scope,cursor);expect(page.page.totalGroups).toBe(16);
    headwords.push(...page.items.map((item:{headword:string})=>item.headword));cursor=page.page.nextGroupCursor;
   }while(cursor);
   expect(headwords).toEqual([...headwords].sort());expect(headwords).toHaveLength(32);
   await client.query(`update dictionaries set visibility='private' where id=$1`,[second.dictionary]);
   expect((await lookup(client,first.user,scope)).page.totalGroups).toBe(8);
   await client.query(`insert into dictionary_entitlements(dictionary_id,subject_type,subject_key,permission) values($1,'user',$2,'read')`,[second.dictionary,first.user]);
   expect((await lookup(client,first.user,scope)).page.totalGroups).toBe(16);
   const disabled={...scope,materialSelection:{...scope.materialSelection,disabledDictionaryIds:[second.dictionary]}};
   expect((await lookup(client,first.user,disabled)).page.totalGroups).toBe(8);
   const languagePaused={...scope,materialSelection:{...scope.materialSelection,allowedLanguageCodes:[]}};
   expect((await lookup(client,first.user,languagePaused)).page.totalGroups).toBe(0);
   await client.query(`update dictionary_entitlements set ends_at=now()-interval '1 minute' where dictionary_id=$1`,[second.dictionary]);
   expect((await lookup(client,first.user,scope)).page.totalGroups).toBe(8);
  });
 },30_000);
 test('default browse does not touch the wide filter entry table',async()=>{
  await withTransaction(pool,async client=>{
   const f=await fixture(client);
   const {rows}=await client.query(`select pg_get_functiondef('private.lookup_platform_v2_library_browse_entries_v1(uuid,boolean,text,text,text,integer,integer,jsonb)'::regprocedure) definition`);
   const definition=String(rows[0].definition);
   let query=definition.slice(definition.indexOf('    WITH user_context'),definition.indexOf('    INTO\n        v_items'));
   const literals:Record<string,string>={p_user_id:'$1::uuid',p_catalog:'false',p_library_selection:'$2::jsonb',v_language_code:"'nl'::text",v_raw_query:'NULL::text',v_query:"''::text",v_query_unaccent:"''::text",v_cursor_group_id:'NULL::uuid',v_cursor_tier_rank:'NULL::integer',v_cursor_match_rank:'NULL::integer',v_cursor_dictionary_rank:'NULL::integer',v_cursor_sort_headword:'NULL::text',v_group_limit:'25',v_group_entry_bound:'50',v_query_key:"'test'::text"};
   for(const [name,literal] of Object.entries(literals)) query=query.replace(new RegExp('\\b'+name+'\\b','g'),()=>literal);
   await client.query('SET LOCAL plan_cache_mode=force_generic_plan');
   await client.query('PREPARE library_browse_plan_test(uuid,jsonb) AS '+query);
   const scopeLiteral=JSON.stringify(selection([f.dictionary])).replace(/'/g,"''");
   const {rows:plans}=await client.query(`EXPLAIN(ANALYZE,BUFFERS,FORMAT JSON) EXECUTE library_browse_plan_test('${f.user}','${scopeLiteral}')`);
   await client.query('DEALLOCATE library_browse_plan_test');
   const plan=plans[0]['QUERY PLAN'][0].Plan;
   const nodes:any[]=[];const visit=(node:any)=>{nodes.push(node);for(const child of node.Plans??[])visit(child);};visit(plan);
   expect(nodes.filter(node=>node.Alias==='filter_entry').every(node=>node['Actual Loops']===0)).toBe(true);
   expect(nodes.some(node=>node['CTE Name']==='source_identities')).toBe(true);
  });
 },30_000);
 test('fails closed for missing presentation identity and keeps helper inaccessible',async()=>{
  await withTransaction(pool,async client=>{
   await baseline(client);const f=await fixture(client);
   await client.query(`delete from private.platform_v2_headword_groups where dictionary_id=$1`,[f.dictionary]);
   expect((await lookup(client,f.user,selection([f.dictionary]))).error).toBe('presentation_identity_incomplete');
   const {rows}=await client.query(`select has_function_privilege('service_role','private.lookup_platform_v2_library_browse_entries_v1(uuid,boolean,text,text,text,integer,integer,jsonb)','EXECUTE') allowed`);
   expect(rows[0].allowed).toBe(false);
  });
 },30_000);
});
