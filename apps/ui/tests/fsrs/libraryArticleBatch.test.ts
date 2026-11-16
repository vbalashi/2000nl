import {afterAll,beforeAll,describe,expect,test} from "vitest";
import {randomUUID} from "node:crypto";
import {Pool,type PoolClient} from "pg";
import {ensureUserWithSettings,getDbUrl,insertWord,runMigrations,withTransaction} from "./dbTestUtils";
const url=getDbUrl();
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





describe.skipIf(!url)('Library bounded article batch',()=>{
 const pool=new Pool({connectionString:url});
 beforeAll(async()=>{await runMigrations(pool);},120000);
 afterAll(async()=>{await pool.end();});
 test('matches exact article projection, canonicalizes siblings, preserves request order and count/cursor contracts',async()=>{
  const user=randomUUID();await withTransaction(pool,async c=>{
   await ensureUserWithSettings(c,user);
   const dictionary=(await c.query("insert into dictionaries(language_code,slug,name,kind,visibility,publication_state) values('nl',$1,'Batch fixture','curated','system','general') returning id",[randomUUID()])).rows[0].id;
   const articles:string[][]=[];
   for(let g=0;g<3;g++){
    const ids:string[]=[];
    for(let n=1;n<=3;n++){
     const id=await insertWord(c,'batchfiets');
     await c.query("update word_entries set dictionary_id=$2,meaning_id=$3,part_of_speech=$4,raw=$5 where id=$1",[id,dictionary,g*3+n,g===1?'ww':'zn',{meanings:[{definition:'Een fiets voor de batch.'}]}]);ids.push(id);
    }
    await bindSourceEntries(c,ids);articles.push(ids);
    for(const id of ids)await c.query('select refresh_dictionary_search_document($1,2)',[id]);
   }
   const batch=async(ids:string[])=>(await c.query('select read_platform_v2_library_groups($1,$2) p',[user,ids])).rows[0].p;
   const requested=[articles[2][1],articles[0][0],articles[2][0]];
   const result=await batch(requested);expect(result.error).toBeUndefined();expect(result.items).toHaveLength(6);
   const exact=(await c.query('select read_platform_v2_library_group($1,$2,50) p',[user,articles[2][1]])).rows[0].p;
   expect(result.items.slice(0,3)).toEqual(exact.items);
   expect(new Set(result.items.map((e:any)=>e.platform_v2_identity.headwordGroupId)).size).toBe(2);
   const page=(await c.query("select search_library_category_v1($1,'batchfiets','nl',array[$2::uuid],'{}',null,'headwords',2,null) p",[user,dictionary])).rows[0].p.groups[0];
   expect(page.total).toBe(9);expect(page.wordGroupCount).toBe(3);expect(page.items).toHaveLength(2);
   expect(page.items.every((h:any)=>typeof h.headwordGroupId==='string')).toBe(true);
   const next=(await c.query("select search_library_category_v1($1,'batchfiets','nl',array[$2::uuid],'{}',null,'headwords',2,$3) p",[user,dictionary,page.page.nextCursor])).rows[0].p.groups[0];
   expect(next.total).toBe(9);expect(next.items).toHaveLength(2);
   expect(new Set([...page.items,...next.items].map((h:any)=>h.entry.id)).size).toBe(4);
   expect((await batch(Array(26).fill(articles[0][0]))).error).toBe('invalid_article_batch');
   expect((await batch([randomUUID()])).error).toBe('entry_not_accessible');
   // Archived meanings and retired source bindings never leak through siblings.
   const archived=(await c.query("insert into word_entries(dictionary_id,language_code,headword,meaning_id,raw,archived_at) values($1,'nl','archived-batch',1,'{}',now()) returning id",[dictionary])).rows[0].id;
   const live=await insertWord(c,'archived-batch');
   await c.query('update word_entries set dictionary_id=$2 where id=$1',[live,dictionary]);
   await bindSourceEntries(c,[live,archived]);
   expect((await batch([live])).items.map((e:any)=>e.id)).toEqual([live]);
   expect((await batch([archived])).error).toBe('entry_not_accessible');
   const sibling=articles[0][2];
   await c.query("update private.source_entry_bindings set binding_state='retired' where word_entry_id=$1",[sibling]);
   expect((await batch([articles[0][0]])).items.map((e:any)=>e.id)).not.toContain(sibling);
   expect((await batch([sibling])).error).toBe('presentation_identity_incomplete');
   await c.query("update private.source_entry_bindings set binding_state='active' where word_entry_id=$1",[sibling]);
   // A batch is not a loop over the old exact reader.
   await c.query(`create or replace function public.read_platform_v2_library_group(p_user_id uuid,p_entry_id uuid,p_group_entry_bound integer default 50) returns jsonb language plpgsql as $$ begin raise exception 'unexpected_per_article_rpc'; end $$`);
   expect((await batch(requested)).items).toHaveLength(6);
  },user);
 });
 test('enforces the per-article meaning bound and raw payload byte bound',async()=>{
  const user=randomUUID();await withTransaction(pool,async c=>{
   await ensureUserWithSettings(c,user);
   const dictionary=(await c.query("insert into dictionaries(language_code,slug,name,kind,visibility,publication_state) values('nl',$1,'Bound fixture','curated','system','general') returning id",[randomUUID()])).rows[0].id;
   const ids=(await c.query("insert into word_entries(dictionary_id,language_code,headword,meaning_id,raw) select $1,'nl','bound-batch',n,jsonb_build_object('meanings',jsonb_build_array(jsonb_build_object('definition','Definition '||n))) from generate_series(1,51) n returning id",[dictionary])).rows.map(r=>r.id);
   await bindSourceEntries(c,ids);
   const read=async()=>(await c.query('select read_platform_v2_library_groups($1,$2) p',[user,[ids[0]]])).rows[0].p;
   expect((await read()).error).toBe('group-too-large');
   await c.query("update private.source_entry_bindings set binding_state='retired' where word_entry_id=$1",[ids[50]]);
   expect((await read()).items).toHaveLength(50);
   await c.query("update word_entries set raw=jsonb_build_object('meanings',jsonb_build_array(jsonb_build_object('definition',repeat('x',2097152)))) where id=$1",[ids[0]]);
   expect((await read()).error).toBe('article_batch_too_large');
  },user);
 },30000);
 test('private received reads have exact-reader parity, exclude unshared siblings, and fail closed after revocation',async()=>{
  const owner=randomUUID(),viewer=randomUUID();await withTransaction(pool,async c=>{
   await ensureUserWithSettings(c,owner);await ensureUserWithSettings(c,viewer);
   const add=async(word:string)=>(await c.query('select create_user_dictionary_entry($1,null,$2) id',[owner,{headword:word,languageCode:'nl',definition:'Privé.'}])).rows[0].id;
   const shared=await add('privé batch'),hidden=await add('privé hidden');
   const list=(await c.query("insert into user_word_lists(user_id,name) values($1,'Batch sharing') returning id",[owner])).rows[0].id;
   await c.query('insert into user_word_list_items(list_id,word_id) values($1,$2)',[list,shared]);
   const root=(await c.query('insert into private.collection_sharing_roots(owner_user_id,collection_id,is_open) values($1,$2,true) returning id,access_lifetime',[owner,list])).rows[0];
   await c.query('insert into private.collection_sharing_subscriptions(user_id,root_id,access_lifetime) values($1,$2,$3)',[viewer,root.id,root.access_lifetime]);
   const read=async(ids:string[])=>(await c.query('select read_platform_v2_library_groups($1,$2) p',[viewer,ids])).rows[0].p;
   expect((await read([shared])).items.map((e:any)=>e.id)).toEqual([shared]);
   expect((await read([shared,hidden])).error).toBe('entry_not_accessible');
   const exact=(await c.query('select read_platform_v2_library_group($1,$2,50) p',[viewer,shared])).rows[0].p;
   expect(await read([shared])).toEqual(exact);
   await c.query('update private.collection_sharing_subscriptions set is_active=false where user_id=$1 and root_id=$2',[viewer,root.id]);
   const denied=await read([shared]);expect(denied.error).toBe('entry_not_accessible');expect(denied.items).toBeUndefined();
   for(const role of ['anon','authenticated'])expect((await c.query("select has_function_privilege($1,'public.read_platform_v2_library_groups(uuid,uuid[])','execute') yes",[role])).rows[0].yes).toBe(false);
  },owner);
 });
});
