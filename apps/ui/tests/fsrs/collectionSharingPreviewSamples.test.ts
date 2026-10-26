import {randomUUID} from 'crypto';
import {Pool,type PoolClient} from 'pg';
import {afterAll,beforeAll,describe,expect,test} from 'vitest';
import {ensureUserWithSettings,getDbUrl,runMigrations,withTransaction} from './dbTestUtils';
const url=getDbUrl();
const principal=(c:PoolClient,id:string)=>c.query("select set_config('request.jwt.claim.sub',$1,true)",[id]);
(url?describe:describe.skip)('invitation bounded instructional preview',()=>{
 const pool=new Pool({connectionString:url});beforeAll(()=>runMigrations(pool));afterAll(()=>pool.end());
 test('valid invitation shows three bounded definitions without joining or general entry access',async()=>withTransaction(pool,async c=>{
  const owner=randomUUID(),viewer=randomUUID();for(const id of [owner,viewer])await ensureUserWithSettings(c,id);await principal(c,owner);
  const list=(await c.query("insert into user_word_lists(user_id,name) values($1,'Preview lesson') returning id",[owner])).rows[0].id;
  const entries:string[]=[];
  for(let i=0;i<5;i++){
   const id=(await c.query('select create_user_dictionary_entry($1,null,$2) id',[owner,{headword:`word-${i}`,languageCode:'nl',definition:i===0?'a'.repeat(350):`Definition ${i}`,notes:'private overlay marker'}])).rows[0].id;entries.push(id);
   await c.query("insert into user_word_list_items(list_id,word_id,added_at) values($1,$2,'2026-01-01'::timestamptz+$3*interval '1 second')",[list,id,i]);
  }
  const sibling=(await c.query('select create_user_dictionary_entry($1,null,$2) id',[owner,{headword:'secret-sibling',languageCode:'nl',definition:'sibling secret'}])).rows[0].id;
  const closed=(await c.query("insert into dictionaries(language_code,slug,name,kind,visibility,owner_user_id) values('nl',$1,'closed','curated','private',$2) returning id",[randomUUID(),owner])).rows[0].id;
  const closedEntry=(await c.query("insert into word_entries(dictionary_id,language_code,headword,raw) values($1,'nl','closed-source','{\"definition\":\"closed secret\"}') returning id",[closed])).rows[0].id;
  await c.query("insert into user_word_list_items(list_id,word_id,added_at) values($1,$2,'2025-01-01')",[list,closedEntry]);
  await c.query('set local role authenticated');
  const opened=(await c.query("select command_collection_share_v1($1,'open',$2,0) payload",[randomUUID(),list])).rows[0].payload;
  await principal(c,viewer);
  const read=async(code:string)=>(await c.query('select preview_collection_share_v1($1) payload',[code])).rows[0].payload;
  const preview=await read(opened.invitationCode);
  expect(preview.entryCount).toBe(5);expect(preview.samples).toEqual([{headword:'word-0',definition:'a'.repeat(300)+'…'},{headword:'word-1',definition:'Definition 1'},{headword:'word-2',definition:'Definition 2'}]);
  expect(Object.keys(preview.samples[0]).sort()).toEqual(['definition','headword']);
  expect(JSON.stringify(preview)).not.toContain('secret');expect(JSON.stringify(preview)).not.toContain('private overlay');expect(JSON.stringify(preview)).not.toContain(entries[0]);
  expect((await c.query('select read_received_collection_catalog_v1() payload')).rows[0].payload.collections).toEqual([]);
  expect((await c.query('select fetch_dictionary_entry_by_id_gated($1) payload',[entries[0]])).rows[0].payload).toBeNull();
  expect((await c.query('select fetch_dictionary_entry_by_id_gated($1) payload',[sibling])).rows[0].payload).toBeNull();
  await principal(c,owner);await c.query('select delete_user_dictionary_entry($1,$2)',[owner,entries[0]]);await principal(c,viewer);
  const afterArchive=await read(opened.invitationCode);expect(afterArchive.entryCount).toBe(4);expect(afterArchive.samples.map((sample:{headword:string})=>sample.headword)).toEqual(['word-1','word-2','word-3']);
  await principal(c,owner);await c.query("select command_collection_share_v1($1,'rotate',$2,1)",[randomUUID(),list]);await principal(c,viewer);
  await c.query('savepoint stale');await expect(read(opened.invitationCode)).rejects.toThrow('share_unavailable');await c.query('rollback to savepoint stale');
 }));
});
