import {afterAll,beforeAll,describe,expect,test} from "vitest";
import {randomUUID} from "node:crypto";
import {Pool} from "pg";
import {ensureUserWithSettings,getDbUrl,runMigrations,withTransaction} from "./dbTestUtils";
const url=getDbUrl();
describe.skipIf(!url)("Library abbreviation and prefix filters",()=>{
 const pool=new Pool({connectionString:url});
 beforeAll(()=>runMigrations(pool),120000);afterAll(()=>pool.end());
 test("both labels work through ordinary, collection, material and category search",async()=>{
  const user=randomUUID();
  await withTransaction(pool,async c=>{
   await ensureUserWithSettings(c,user);
   const dictionary=(await c.query(`insert into dictionaries(language_code,slug,name,kind,visibility,schema_key,schema_version)
    values('nl',$1,'Filter fixture','curated','system',public.dictionary_source_settings_v1()->>'schemaKeyV1',1) returning id`,[`filters-${randomUUID()}`])).rows[0].id;
   const list=(await c.query("insert into user_word_lists(user_id,name) values($1,'Filter fixture') returning id",[user])).rows[0].id;
   const scheme=`fixture-${randomUUID()}`;
   const run=(await c.query(`insert into private.dictionary_import_runs(dictionary_id,identity_scheme_version,artifact_format_version,manifest_checksum,input_checksum,source_record_count,artifact_count,status)
    values($1,$2,'test-v1','test-manifest','test-input',3,3,'completed') returning id`,[dictionary,scheme])).rows[0].id;
   const entries:Record<string,string>={};
   for(const [part,code] of [["abbreviation","afk"],["prefix","vv"],["noun","zn"]]){
    const headword=`filterfixture${code}`;
    const raw={headword,part_of_speech:code,meanings:[{definition:`Een ${headword} voor selectie.`,examples:[`Dit is een ${headword}.`]}]};
    const entry=(await c.query(`insert into word_entries(dictionary_id,language_code,headword,meaning_id,part_of_speech,raw)
      values($1,'nl',$2,1,$3,$4) returning id`,[dictionary,headword,code,raw])).rows[0].id;
    entries[part]=entry;
    await c.query(`insert into private.source_entry_bindings(dictionary_id,identity_scheme_version,source_entry_key,source_group_key,sense_ordinal,word_entry_id,binding_state,first_seen_run_id,last_seen_run_id,manifest_checksum,content_fingerprint_version,content_fingerprint,identity_evidence,reconciliation_decision)
     values($1,$2,$3,$3,1,$4,'active',$5,$5,'test-manifest','test-v1','test-fingerprint','{"kind":"test"}','{"decision":"create"}')`,[dictionary,scheme,headword,entry,run]);
    await c.query("select refresh_dictionary_search_document($1,2)",[entry]);
    await c.query("insert into user_word_list_items(list_id,word_id) values($1,$2)",[list,entry]);
   }
   const material={kind:"collection",id:list,collectionType:"user"};
   for(const part of ["abbreviation","prefix"]){
    const filter={parts:[part],article:null};
    const ordinary=(await c.query("select lookup_platform_v2_library_filtered_entries($1,null,'nl',$2,null,100,100,$3) result",[user,[dictionary],filter])).rows[0].result;
    expect(ordinary.error).toBeUndefined();expect(JSON.stringify(ordinary)).toContain(entries[part]);
    expect(JSON.stringify(ordinary)).not.toContain(entries.noun);
    const scoped=(await c.query("select lookup_platform_v2_library_material_entries($1,null,'nl',null,null,100,100,$2,$3) result",[user,filter,material])).rows[0].result;
    expect(scoped.error).toBeUndefined();expect(JSON.stringify(scoped)).toContain(entries[part]);expect(JSON.stringify(scoped)).not.toContain(entries.noun);
    const collection=(await c.query("select fetch_library_collection_entries($1,'user',$2,null,'nl',1,100) result",[list,filter])).rows[0].result;
    expect(JSON.stringify(collection)).toContain(entries[part]);expect(JSON.stringify(collection)).not.toContain(entries.noun);
    for(const category of ["headwords","alphabetical","examples","definitions"]){
     const result=(await c.query("select search_library_category_v1($1,$5,'nl',$2,$3,null,$4,100,null) result",[user,[dictionary],filter,category,`filterfixture${part==="prefix"?"vv":"afk"}`])).rows[0].result;
     expect(result.error).toBeUndefined();expect(result.groups[0].items.length).toBeGreaterThan(0);
     expect(result.groups[0].items.every((hit:{entry:{id:string}})=>hit.entry.id===entries[part])).toBe(true);
    }
   }
  },user);
 });
});
