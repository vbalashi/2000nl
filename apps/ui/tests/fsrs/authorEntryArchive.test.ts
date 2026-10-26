import {afterAll,beforeAll,describe,expect,test} from "vitest";
import {randomUUID} from "node:crypto";
import {Pool,type PoolClient} from "pg";
import {getDbUrl,runMigrations,withTransaction,ensureUserWithSettings} from "./dbTestUtils";
const url=getDbUrl();
async function fixture(c:PoolClient,owner:string){
 await ensureUserWithSettings(c,owner);
 const entry=(await c.query("select create_user_dictionary_entry($1,null,$2) id",[owner,JSON.stringify({headword:`archive-${randomUUID()}`,languageCode:"nl",definition:"Archive this definition",notes:"Instruction"})])).rows[0].id;
 const list=(await c.query("insert into user_word_lists(user_id,name,language_code,primary_language_code) values($1,'Archive lesson','nl','nl') returning id",[owner])).rows[0].id;
 await c.query("insert into user_word_list_items(list_id,word_id) values($1,$2)",[list,entry]);
 await c.query("insert into user_word_notes(user_id,word_entry_id,notes) values($1,$2,'Personal overlay')",[owner,entry]);
 await c.query("insert into user_review_log(user_id,word_id,mode,grade,review_type) values($1,$2,'word-to-definition',3,'new')",[owner,entry]);
 await c.query("select refresh_dictionary_search_document($1,2)",[entry]);
 return {entry,list};
}
(url?describe:describe.skip)("author archive core",()=>{
 const pool=new Pool({connectionString:url});beforeAll(()=>runMigrations(pool));afterAll(()=>pool.end());
 test("archive is idempotent and keeps identity, history, notes and membership",async()=>{
  const owner=randomUUID();await withTransaction(pool,async c=>{
   const f=await fixture(c,owner);
   const original=(await c.query("select content_version,raw from word_entries where id=$1",[f.entry])).rows[0];
   await c.query("grant select on word_entries,user_word_notes to authenticated");
   await c.query("set local role authenticated");
   await c.query("select delete_user_dictionary_entry($1,$2)",[owner,f.entry]);
   const status=(await c.query("select read_author_entry_archive_status_v1($1,$2) value",[owner,f.entry])).rows[0].value;
   expect(status).toMatchObject({entryId:f.entry,archived:true});
   expect(Object.keys(status).sort()).toEqual(["archived","archivedAt","entryId","sourceVersion"]);
   expect(JSON.stringify(status)).not.toContain("Archive this definition");
   expect((await c.query("select notes from user_word_notes where word_entry_id=$1",[f.entry])).rows).toEqual([]);
   expect((await c.query("select id from word_entries where id=$1",[f.entry])).rows).toEqual([]);
   await c.query("select delete_user_dictionary_entry($1,$2)",[owner,f.entry]);
   await c.query("reset role");
   const retained=(await c.query("select archived_at,content_version,raw from word_entries where id=$1",[f.entry])).rows[0];
   expect(retained.archived_at).toBeTruthy();expect(retained.raw).toEqual(original.raw);expect(retained.content_version).toBe(original.content_version);
   for(const [table,column]of [["user_word_list_items","word_id"],["user_word_notes","word_entry_id"],["user_review_log","word_id"]])
    expect((await c.query(`select count(*)::int n from ${table} where ${column}=$1`,[f.entry])).rows[0].n).toBe(1);
   expect((await c.query("select count(*)::int n from dictionary_search_documents where entry_id=$1",[f.entry])).rows[0].n).toBe(0);
   await c.query("select refresh_dictionary_search_document($1,2)",[f.entry]);
   expect((await c.query("select count(*)::int n from dictionary_search_documents where entry_id=$1",[f.entry])).rows[0].n).toBe(0);
  },owner);
 });
 test("content revision changes on content update but cannot be forged",async()=>{
  const owner=randomUUID();await withTransaction(pool,async c=>{
   const f=await fixture(c,owner);
   const before=(await c.query("select content_version from word_entries where id=$1",[f.entry])).rows[0].content_version;
   await c.query("update word_entries set content_version=9999 where id=$1",[f.entry]);
   expect((await c.query("select content_version from word_entries where id=$1",[f.entry])).rows[0].content_version).toBe(before);
   await c.query("select update_user_dictionary_entry($1,$2,$3)",[owner,f.entry,JSON.stringify({headword:`changed-${randomUUID()}`,languageCode:"nl",definition:"Changed"})]);
   expect(Number((await c.query("select content_version from word_entries where id=$1",[f.entry])).rows[0].content_version)).toBe(Number(before)+1);
  },owner);
 });
 test("foreign archive denied without changing the row",async()=>{
  const owner=randomUUID(),other=randomUUID();await withTransaction(pool,async c=>{
   const f=await fixture(c,owner);await ensureUserWithSettings(c,other);
   await c.query("select set_config('request.jwt.claim.sub',$1,true)",[other]);
   await c.query("set local role authenticated");await c.query("savepoint wrong_owner");
   await expect(c.query("select delete_user_dictionary_entry($1,$2)",[other,f.entry])).rejects.toThrow(/not_editable/);
   await c.query("rollback to savepoint wrong_owner");await c.query("reset role");
   expect((await c.query("select archived_at from word_entries where id=$1",[f.entry])).rows[0].archived_at).toBeNull();
  },owner);
 });
});
