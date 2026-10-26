import {randomUUID} from "node:crypto";
import {Pool,type PoolClient} from "pg";
import {afterAll,beforeAll,describe,expect,test} from "vitest";
import {ensureUserWithSettings,getDbUrl,runMigrations,withTransaction} from "./dbTestUtils";
const url=getDbUrl();
async function principal(c:PoolClient,id:string) {await c.query("select set_config('request.jwt.claim.sub',$1,true)",[id]);}
(url?describe:describe.skip)("shared word-context authority",()=>{
  const pool=new Pool({connectionString:url});beforeAll(()=>runMigrations(pool));afterAll(()=>pool.end());
  test("revoke leaves only the exact displayed reverse context and never promotes a prefetch",async()=>{
    await withTransaction(pool,async c=>{
      const owner=randomUUID(),viewer=randomUUID();for(const id of [owner,viewer])await ensureUserWithSettings(c,id);
      await principal(c,owner);
      const entries:string[]=[],nodes:string[]=[];
      const list=(await c.query("insert into user_word_lists(user_id,name) values($1,'shared contexts') returning id",[owner])).rows[0].id;
      for(let n=0;n<2;n++) {
        const entry=(await c.query("select create_user_dictionary_entry($1,null,$2) id",[owner,{headword:randomUUID(),languageCode:"nl",definition:`definition ${n}`}])).rows[0].id;
        const node=(await c.query("insert into private.platform_v2_content_nodes(entry_id,kind,binding_state,first_source_revision,last_source_revision,source_text_fingerprint,diagnostic_locator,canonical_source_text) values($1,'example','active','v1','v1',$2,'raw.example.source','teacher context') returning id",[entry,`context-${entry}`])).rows[0].id;
        entries.push(entry);nodes.push(node);await c.query("insert into user_word_list_items(list_id,word_id) values($1,$2)",[list,entry]);
      }
      const code=(await c.query("select private.mutate_collection_share_v1($1,'open',$2,0) payload",[randomUUID(),list])).rows[0].payload.invitationCode;
      await principal(c,viewer);await c.query("select private.accept_collection_share_v1($1,$2)",[randomUUID(),code]);
      const run=(await c.query("insert into training_sessions(user_id,session_size,card_type_ids,card_filter,planned_new,planned_total,requested_total,exercise_family,training_filter) values($1,'5',array['definition-to-word'],'new',2,2,5,'meaning','{\"presentationMode\":\"word-in-context\"}') returning id",[viewer])).rows[0].id;
      for(const [n,entry]of entries.entries())await c.query("insert into training_session_members(session_id,ordinal,entry_id,card_type_id,queue_source,context_content_node_id,context_source_text_fingerprint) values($1,$2,$3,'definition-to-word','new',$4,$5)",[run,n+1,entry,nodes[n],`context-${entry}`]);
      const read=async(entry:string)=>(await c.query("select read_training_word_context_member($1,$2,$3) payload",[viewer,run,entry])).rows[0].payload;
      const hint=async(entry:string)=>(await c.query("select mark_training_word_context_hint_opened($1,$2,$3) payload",[viewer,run,entry])).rows[0].payload;
      await c.query("set local role authenticated");
      for(const entry of entries)expect(await read(entry)).toMatchObject({entryId:entry});
      await c.query("reset role");expect((await c.query("select count(*)::int n from private.training_current_card_permits where user_id=$1",[viewer])).rows[0].n).toBe(0);
      await c.query("set local role authenticated");
      await c.query("select acknowledge_current_training_card_v1($1,$2,$3,'definition-to-word',1,'untracked')",[viewer,run,entries[0]]);
      await c.query("reset role");await principal(c,owner);await c.query("select private.mutate_collection_share_v1($1,'close',$2,1)",[randomUUID(),list]);
      await principal(c,viewer);await c.query("set local role authenticated");
      expect(await read(entries[0])).toMatchObject({entryId:entries[0],contentNodeId:nodes[0]});expect(await hint(entries[0])).toBe(true);
      expect(await read(entries[1])).toBeNull();expect(await hint(entries[1])).toBe(false);
      await c.query("reset role");
      expect((await c.query("select context_hint_opened from training_session_members where session_id=$1 and entry_id=$2",[run,entries[1]])).rows[0].context_hint_opened).toBe(false);
      await c.query("update private.platform_v2_content_nodes set source_text_fingerprint='changed' where id=$1",[nodes[0]]);
      await c.query("set local role authenticated");expect(await read(entries[0])).toBeNull();expect(await hint(entries[0])).toBe(false);
      await c.query("reset role");expect((await c.query("select count(*)::int n from user_card_status where user_id=$1",[viewer])).rows[0].n).toBe(0);
    });
  });
});
