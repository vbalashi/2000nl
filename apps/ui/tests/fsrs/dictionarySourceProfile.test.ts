import {randomUUID} from "node:crypto";
import {Pool} from "pg";
import {afterAll,beforeAll,describe,expect,test} from "vitest";
import {dictionarySourceProfile} from "@/lib/dictionary/sourceProfile";
import {getDbUrl,runMigrations,withTransaction,ensureUserWithSettings,insertWord} from "./dbTestUtils";

const url=getDbUrl();
(url ? describe : describe.skip)("dictionary source metadata and retaining schema",()=>{
 const pool=new Pool({connectionString:url});
 beforeAll(()=>runMigrations(pool));afterAll(()=>pool.end());
 test("keeps configured catalog/schema/wire values and numeric storage",async()=>{
  const profile=dictionarySourceProfile();
  const result=(await pool.query("select dictionary_source_settings_v1() value")).rows[0].value;
  for(const key of ["catalogKey","fullListSlug","fullListName","schemaKeyV1","schemaKeyV2","sourceRankKey"] as const) expect(result[key]).toBe(profile[key]);
  expect((await pool.query("select count(*)::int n from pg_attribute where attrelid in ('public.word_entries'::regclass,'private.active_word_entries'::regclass) and attname='source_rank' and atttypid='integer'::regtype and not attisdropped")).rows[0].n).toBe(2);
 });
 test.each(["authenticated","service_role"])("%s reads metadata but cannot access the private settings table",async role=>{
  await withTransaction(pool,async c=>{await c.query(`set local role ${role}`);expect((await c.query("select dictionary_source_settings_v1() value")).rows[0].value.catalogKey).toBeTruthy();});
  await expect(withTransaction(pool,async c=>{await c.query(`set local role ${role}`);await c.query("select * from private.dictionary_source_settings");})).rejects.toThrow(/permission denied/);
 });
 test.each(["anon","authenticated"])("%s cannot read raw notes retained from ambient Supabase grants",async role=>{
  await expect(withTransaction(pool,async c=>{
   await c.query(`set local role ${role}`);
   await c.query("select notes from public.user_word_notes limit 1");
  })).rejects.toThrow(/permission denied/);
 });
 test("anonymous cannot call metadata reader and unknown metadata cannot be stored",async()=>{
  await expect(withTransaction(pool,async c=>{await c.query("set local role anon");await c.query("select dictionary_source_settings_v1()");})).rejects.toThrow(/permission denied/);
  await expect(withTransaction(pool,async c=>{await c.query("update private.dictionary_source_settings set settings=settings || '{\"unexpectedSecret\":\"fixture\"}'::jsonb");})).rejects.toThrow(/check constraint/);
  expect((await pool.query("select has_function_privilege('service_role','public.fetch_dictionary_entry_by_id_gated(uuid)','EXECUTE') allowed")).rows[0].allowed).toBe(false);
 });
 test("projection preserves identity/rank and follows the configured wire key without reviving archived entries",async()=>{
  const user=randomUUID();
  await withTransaction(pool,async c=>{
   await ensureUserWithSettings(c,user);const entry=(await c.query("select create_user_dictionary_entry($1,null,$2) id",[user,JSON.stringify({headword:`source-rank-${randomUUID()}`,languageCode:"nl",definition:"A source rank fixture"})])).rows[0].id;
   await c.query("update word_entries set source_rank=17 where id=$1",[entry]);
   const project=async()=> (await c.query("select private.project_training_scheduler_candidate_v1($1,$2,'word-to-definition','new','{}'::jsonb,false,0,10,1,0,0) value",[user,entry])).rows[0].value;
   const original=await project();expect(original.id).toBe(entry);expect(original[dictionarySourceProfile().sourceRankKey]).toBe(17);
   await c.query("update private.dictionary_source_settings set settings=jsonb_set(settings,'{sourceRankKey}','\"rankReference\"')");
   const configured=await project();expect(configured.rankReference).toBe(17);expect(configured).not.toHaveProperty(dictionarySourceProfile().sourceRankKey);
   expect((await c.query("select id,source_rank from word_entries where id=$1",[entry])).rows[0]).toEqual({id:entry,source_rank:17});
   await c.query("select delete_user_dictionary_entry($1,$2)",[user,entry]);expect(await project()).toBeNull();
  },user);
 });
 test("default assignment follows configured catalog while existing entries keep their dictionary",async()=>{
  await withTransaction(pool,async c=>{
   const existing=await insertWord(c,`existing-source-${randomUUID()}`);
   const original=(await c.query("select dictionary_id from word_entries where id=$1",[existing])).rows[0].dictionary_id;
   const slug=`source-${randomUUID()}`;
   const dictionary=(await c.query("insert into dictionaries(language_code,slug,name,kind,visibility,schema_key,schema_version) values('nl',$1,'Configured source','curated','public',(dictionary_source_settings_v1()->>'schemaKeyV1'),1) returning id",[slug])).rows[0].id;
   await c.query("update private.dictionary_source_settings set settings=jsonb_set(settings,'{catalogKey}',to_jsonb($1::text))",[slug]);
   const next=await insertWord(c,`configured-source-${randomUUID()}`);
   expect((await c.query("select dictionary_id from word_entries where id=$1",[next])).rows[0].dictionary_id).toBe(dictionary);
   expect((await c.query("select dictionary_id from word_entries where id=$1",[existing])).rows[0].dictionary_id).toBe(original);
  });
 });
});
