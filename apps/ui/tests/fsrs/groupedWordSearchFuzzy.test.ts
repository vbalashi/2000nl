import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { ensureUserWithSettings, getDbUrl, runMigrations, withTransaction } from "./dbTestUtils";
const url=getDbUrl();
describe.skipIf(!url)("indexed fuzzy headword search",()=>{
  const pool=new Pool({connectionString:url});
  beforeAll(async()=>{await runMigrations(pool);},120000);
  afterAll(async()=>{await pool.end();});
  test("finds ontmut -> ontmoeten; exact hits precede fuzzy hits across cursor pages and inaccessible dictionaries stay hidden",async()=>{
    const reader=randomUUID();const other=randomUUID();
    await withTransaction(pool,async client=>{
      await ensureUserWithSettings(client,reader);await ensureUserWithSettings(client,other);
      const dict=async(owner:string)=> (await client.query(`insert into dictionaries(language_code,slug,name,kind,visibility,owner_user_id)
        values('nl',$1,'Search fixture','user','private',$2) returning id`,[`fuzzy-${randomUUID()}`,owner])).rows[0].id;
      const allowed=await dict(reader);const hidden=await dict(other);
      const add=async(dictionaryId:string,headword:string)=>{
        const id=(await client.query(`insert into word_entries(dictionary_id,language_code,headword,meaning_id,part_of_speech,raw)
          values($1,'nl',$2,1,'ww',$3::jsonb) returning id`,[dictionaryId,headword,JSON.stringify({meanings:[{definition:'synthetic meaning',examples:[]}]})])).rows[0].id;
        await client.query('select refresh_dictionary_search_document($1,2)',[id]);return id;
      };
      await add(allowed,'ontmoeten');const denied=await add(hidden,'ontmut');
      const read=async(query:string,limit=100,cursor:string|null=null)=> (await client.query(`select search_dictionary_groups_v1($1,'nl',null,'headwords',$2,$3) as result`,[query,limit,cursor])).rows[0].result.groups[0];
      const fuzzy=await read('ontmut');
      expect(fuzzy.items.map((item:any)=>item.entry.headword)).toEqual(['ontmoeten']);
      expect(fuzzy.items[0].match.relation).toBe('fuzzy');
      expect(fuzzy.items.some((item:any)=>item.entry.id===denied)).toBe(false);
      await add(allowed,'ontmut');
      const first=await read('ontmut',1);
      expect(first.items[0].entry.headword).toBe('ontmut');expect(first.items[0].match.relation).toBe('exact');
      expect(first.page.hasMore).toBe(true);
      const second=await read('ontmut',1,first.page.nextCursor);
      expect(second.items[0].entry.headword).toBe('ontmoeten');expect(second.page.hasMore).toBe(false);
      // The threshold is function-local, independent of the caller's setting.
      await client.query("select set_config('pg_trgm.similarity_threshold','0.9',true)");
      expect((await read('ontmut')).items.map((item:any)=>item.entry.headword)).toEqual(['ontmut','ontmoeten']);
      expect((await client.query("select current_setting('pg_trgm.similarity_threshold') as threshold")).rows[0].threshold).toBe('0.9');
      expect((await read('ont')).items).toHaveLength(0);
    },reader);
  });
});
