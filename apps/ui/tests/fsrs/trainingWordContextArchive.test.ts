import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { ensureUserWithSettings, getDbUrl, runMigrations, withTransaction } from "./dbTestUtils";
const url=getDbUrl();
async function role(c:PoolClient,user:string) {
  await c.query("reset role");await c.query("select set_config('request.jwt.claim.sub',$1,true)",[user]);
  await c.query("set local role authenticated");
}
async function rejected(c:PoolClient,call:()=>Promise<unknown>,message:RegExp) {
  await c.query("savepoint expected_failure");await expect(call()).rejects.toThrow(message);
  await c.query("rollback to savepoint expected_failure");
}
async function run(c:PoolClient,user:string,entries:string[],nodes:string[]) {
  const id=(await c.query(`insert into training_sessions(user_id,session_size,card_type_ids,card_filter,
    planned_new,planned_total,requested_total,exercise_family,training_filter)
    values($1,'5',ARRAY['definition-to-word'],'new',2,2,5,'meaning','{"presentationMode":"word-in-context"}') returning id`,[user])).rows[0].id as string;
  for(const [index,entry]of entries.entries())await c.query(`insert into training_session_members(session_id,ordinal,entry_id,card_type_id,queue_source,context_content_node_id,context_source_text_fingerprint)
    values($1,$2,$3,'definition-to-word','new',$4,$5)`,[id,index+1,entry,nodes[index],`context-${entry}`]);
  return id;
}
async function fixture(c:PoolClient) {
  const user=randomUUID();await ensureUserWithSettings(c,user);
  await c.query("select set_config('request.jwt.claim.sub',$1,true)",[user]);
  const entries:string[]=[],nodes:string[]=[];
  for(let i=0;i<2;i++) {
    const entry=(await c.query("select create_user_dictionary_entry($1,null,$2) id",[user,JSON.stringify({headword:`context-archive-${randomUUID()}`,languageCode:"nl",definition:`Definition ${i}`,partOfSpeech:"noun"})])).rows[0].id as string;
    const node=(await c.query(`insert into private.platform_v2_content_nodes(entry_id,kind,binding_state,first_source_revision,last_source_revision,source_text_fingerprint,diagnostic_locator,canonical_source_text)
      values($1,'example','active','v1','v1',$2,'raw.example.source','Private context source text') returning id`,[entry,`context-${entry}`])).rows[0].id as string;
    entries.push(entry);nodes.push(node);
  }
  const session=await run(c,user,entries,nodes);await role(c,user);
  return {user,entries,nodes,session};
}
async function read(c:PoolClient,f:{user:string;session:string},entry:string) {
  return (await c.query("select read_training_word_context_member($1,$2,$3) value",[f.user,f.session,entry])).rows[0].value;
}
async function hint(c:PoolClient,f:{user:string;session:string},entry:string) {
  return (await c.query("select mark_training_word_context_hint_opened($1,$2,$3) value",[f.user,f.session,entry])).rows[0].value;
}
async function ack(c:PoolClient,f:{user:string;session:string},entry:string,card='definition-to-word') {
  return (await c.query("select acknowledge_current_training_card_v1($1,$2,$3,$4,1,'untracked') value",[f.user,f.session,entry,card])).rows[0].value;
}
(url?describe:describe.skip)("word-context archive fence",()=>{
  const pool=new Pool({connectionString:url});beforeAll(()=>runMigrations(pool));afterAll(()=>pool.end());
  test("active queued context metadata remains readable without creating a display grant",async()=>{
    await withTransaction(pool,async c=>{
      const f=await fixture(c);
      for(const [index,entry]of f.entries.entries())expect(await read(c,f,entry)).toEqual({entryId:entry,contentNodeId:f.nodes[index],sourceTextFingerprint:`context-${entry}`});
      expect(await hint(c,f,f.entries[0])).toBe(true);
      await c.query("reset role");expect((await c.query("select count(*)::int n from private.training_current_card_permits where user_id=$1",[f.user])).rows[0].n).toBe(0);
    });
  });
  test("archive closes unseen queued metadata and hint evidence",async()=>{
    await withTransaction(pool,async c=>{
      const f=await fixture(c);await c.query("select delete_user_dictionary_entry($1,$2)",[f.user,f.entries[0]]);
      expect(await read(c,f,f.entries[0])).toBeNull();expect(await hint(c,f,f.entries[0])).toBe(false);
      await c.query("reset role");expect((await c.query("select context_hint_opened from training_session_members where session_id=$1 and entry_id=$2",[f.session,f.entries[0]])).rows[0].context_hint_opened).toBe(false);
    });
  });
  test("only the exact displayed reverse target can read and record a hint after archive",async()=>{
    await withTransaction(pool,async c=>{
      const f=await fixture(c);await ack(c,f,f.entries[0]);
      for(const entry of f.entries)await c.query("select delete_user_dictionary_entry($1,$2)",[f.user,entry]);
      expect(await read(c,f,f.entries[0])).toMatchObject({entryId:f.entries[0],contentNodeId:f.nodes[0]});
      expect(await hint(c,f,f.entries[0])).toBe(true);
      expect(await read(c,f,f.entries[1])).toBeNull();expect(await hint(c,f,f.entries[1])).toBe(false);
      await c.query("reset role");
      await c.query("update private.platform_v2_content_nodes set source_text_fingerprint='changed' where id=$1",[f.nodes[0]]);
      await role(c,f.user);expect(await read(c,f,f.entries[0])).toBeNull();expect(await hint(c,f,f.entries[0])).toBe(false);
    });
  });
  test("wrong account/run, supersession and expired display permits fail closed",async()=>{
    await withTransaction(pool,async c=>{
      const f=await fixture(c);await ack(c,f,f.entries[0]);await c.query("select delete_user_dictionary_entry($1,$2)",[f.user,f.entries[0]]);
      await c.query("reset role");const other=randomUUID();await ensureUserWithSettings(c,other);await role(c,other);
      await rejected(c,()=>read(c,f,f.entries[0]),/unauthorized/);
      await rejected(c,()=>hint(c,f,f.entries[0]),/unauthorized/);
      await role(c,f.user);
      const wrong={...f,session:randomUUID()};expect(await read(c,wrong,f.entries[0])).toBeNull();
      await rejected(c,()=>hint(c,wrong,f.entries[0]),/training_session_superseded/);
      await c.query("reset role");
      await c.query("update private.training_current_card_permits set issued_at=now()-interval '2 hours',expires_at=now()-interval '1 hour' where user_id=$1",[f.user]);
      await role(c,f.user);expect(await read(c,f,f.entries[0])).toBeNull();expect(await hint(c,f,f.entries[0])).toBe(false);
      await c.query("reset role");const next=await run(c,f.user,f.entries,f.nodes);await role(c,f.user);
      expect(await read(c,f,f.entries[0])).toBeNull();await rejected(c,()=>hint(c,f,f.entries[0]),/training_session_superseded/);
      expect(await read(c,{...f,session:next},f.entries[0])).toBeNull();expect(await hint(c,{...f,session:next},f.entries[0])).toBe(false);
    });
  });
});
