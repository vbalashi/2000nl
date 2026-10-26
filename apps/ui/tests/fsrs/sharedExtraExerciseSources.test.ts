import {randomUUID} from "node:crypto";
import {Pool,type PoolClient} from "pg";
import {afterAll,beforeAll,describe,expect,test} from "vitest";
import {ensureUserWithSettings,getDbUrl,runMigrations,withTransaction} from "./dbTestUtils";
const url=getDbUrl();
async function sharedLesson(c:PoolClient) {
      const owner=randomUUID(),viewer=randomUUID();for(const id of [owner,viewer])await ensureUserWithSettings(c,id);
      await c.query("select set_config('request.jwt.claim.sub',$1,true)",[owner]);
      const entries:string[]=[];
      for(let n=0;n<2;n++) {
        const entry=(await c.query("select create_user_dictionary_entry($1,null,$2) id",[owner,{headword:randomUUID(),languageCode:"nl",meanings:[{definition:`meaning ${n}`,examples:[`Een voorbeeld ${n}.`],idioms:[{expression:`uitdrukking ${n}`,explanation:`uitleg ${n}`}]}],partOfSpeech:"noun"}])).rows[0].id;
        entries.push(entry);
      }
      const [selected,hidden]=entries;
      const dictionary=(await c.query("select dictionary_id from word_entries where id=$1",[selected])).rows[0].dictionary_id;
      const list=(await c.query("insert into user_word_lists(user_id,name) values($1,'extra sources') returning id",[owner])).rows[0].id;
      await c.query("insert into user_word_list_items(list_id,word_id) values($1,$2)",[list,selected]);
      const code=(await c.query("select private.mutate_collection_share_v1($1,'open',$2,0) payload",[randomUUID(),list])).rows[0].payload.invitationCode;
      await c.query("select set_config('request.jwt.claim.sub',$1,true)",[viewer]);await c.query("select private.accept_collection_share_v1($1,$2)",[randomUUID(),code]);
  return {owner,viewer,entries,selected,hidden,dictionary,list};
}
(url?describe:describe.skip)("shared extra-exercise source authority",()=>{
  const pool=new Pool({connectionString:url});beforeAll(()=>runMigrations(pool));afterAll(()=>pool.end());
  test("idiom and translation sources require learned state and selected live author access",async()=>{
    await withTransaction(pool,async c=>{
      const {owner,viewer,entries,selected,hidden,dictionary,list}=await sharedLesson(c);
      const sources=async(family:string,scope:string|null=list,filter={})=>(await c.query(family==="idiom"?"select entry_id from private.training_idiom_source_nodes_v1($1,'direct',$2,'user',$3)":"select entry_id from private.training_translation_source_nodes_v1($1,$2,'user',$3)",[viewer,scope,filter])).rows.map((row:{entry_id:string})=>row.entry_id);
      for(const family of ["idiom","translation"])expect(await sources(family)).toEqual([]);
      for(const entry of entries)await c.query("insert into user_card_status(user_id,entry_id,card_type_id,fsrs_enabled) values($1,$2,'word-to-definition',true)",[viewer,entry]);
      expect((await c.query("select private.platform_v2_training_ordinary_meaning_eligible_v1($1,$2) allowed",[viewer,selected])).rows[0].allowed).toBe(true);
      expect((await c.query("select private.platform_v2_training_ordinary_meaning_eligible_v1($1,$2) allowed",[viewer,hidden])).rows[0].allowed).toBe(false);
      for(const family of ["idiom","translation"]) {
        expect(await sources(family)).toEqual([selected]);
        expect(await sources(family,null,{dictionaryScope:{mode:"selected",languageCode:"nl",dictionaryIds:[dictionary]}})).toEqual([selected]);
        expect(await sources(family,list,{partOfSpeech:["ww"]})).toEqual([]);
      }
      await c.query("select set_config('request.jwt.claim.sub',$1,true)",[owner]);await c.query("select private.mutate_collection_share_v1($1,'close',$2,1)",[randomUUID(),list]);
      for(const family of ["idiom","translation"])expect(await sources(family)).toEqual([]);
      expect((await c.query("select count(*)::int n from user_card_status where user_id=$1",[viewer])).rows[0].n).toBe(2);
    });
  });
  test.each(["idiom","translation"].flatMap(family=>[true,false].map(acknowledged=>({family,acknowledged}))))("shared $family lifecycle after revoke (display acknowledged: $acknowledged)",async({family,acknowledged})=>{
    await withTransaction(pool,async c=>{
      const f=await sharedLesson(c);
      await c.query("insert into user_card_status(user_id,entry_id,card_type_id,fsrs_enabled) values($1,$2,'word-to-definition',true)",[f.viewer,f.selected]);
      await c.query("set local role authenticated");
      const direction=family==="idiom"?"direct":"recall";
      const started=(await c.query(family==="idiom"?"select start_platform_v2_idiom_training_session($1,'direct','2',$2,$3,'user','new','{}',2) payload":"select start_platform_v2_translation_training_session_scoped($1,'2',$2,$3,'user','new','{}',2) payload",[f.viewer,randomUUID(),f.list])).rows[0].payload;
      expect(started.plannedTotal).toBe(1);expect(started.members).toHaveLength(1);expect(started.members[0].entryId).toBe(f.selected);
      const run=started.sessionId;
      const next=(await c.query(family==="idiom"?"select read_platform_v2_idiom_training_session_next($1,$2) payload":"select read_platform_v2_translation_training_session_next($1,$2) payload",[f.viewer,run])).rows[0].payload;
      expect(next.status).toBe("ready");expect(next.entryId).toBe(f.selected);
      const target=next.targetId,cardType=`${family}:${direction}`;
      await c.query("reset role");
      const targetKey=(await c.query("select target_key from private.platform_v2_training_exercise_targets where id=$1",[target])).rows[0].target_key;
      await c.query("select set_config('request.jwt.claim.role','service_role',true)");
      await c.query("set local role service_role");
      const readTarget=async()=>(await c.query("select read_platform_v2_training_exercise_target_v1($1,$2) payload",[f.viewer,targetKey])).rows[0].payload;
      expect((await readTarget()).entryId).toBe(f.selected);
      await c.query("reset role");
      await c.query("select set_config('request.jwt.claim.role','authenticated',true)");
      await c.query("set local role authenticated");
      if(acknowledged)await c.query("select acknowledge_current_training_card_v1($1,$2,$3,$4,1,'untracked',$5,$6)",[f.viewer,run,f.selected,cardType,target,direction]);
      await c.query("reset role");await c.query("select set_config('request.jwt.claim.sub',$1,true)",[f.owner]);
      await c.query("select private.mutate_collection_share_v1($1,'close',$2,1)",[randomUUID(),f.list]);
      await c.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claim.role','service_role',true)",[f.viewer]);await c.query("set local role service_role");
      expect(await readTarget()).toEqual({error:"training_exercise_target_not_found"});
      const event=randomUUID();
      const act=async()=>(await c.query(family==="idiom"?"select perform_platform_v2_idiom_exercise_action_as_principal_v1($1,$2,'untracked','success',$3,$4,$5,null) payload":"select perform_platform_v2_translation_exercise_action_as_principal_v1($1,$2,'untracked','success',$3,$4,$5,null) payload",[f.viewer,target,event,direction,run])).rows[0].payload;
      if(!acknowledged) {
        await c.query("savepoint denied_action");
        await expect(act()).rejects.toThrow("training_exercise_source_not_eligible");
        await c.query("rollback to savepoint denied_action");
        await c.query("reset role");
        expect((await c.query("select count(*)::int n from user_training_exercise_state where user_id=$1",[f.viewer])).rows[0].n).toBe(0);
        return;
      }
      expect((await act()).status).toBe("accepted");expect((await act()).status).toBe("duplicate");
      await c.query("reset role");
      const revision=(await c.query("select state_revision::text revision from user_training_exercise_state where user_id=$1 and target_id=$2",[f.viewer,target])).rows[0].revision;
      await c.query("set local role service_role");
      await c.query("savepoint second_grade");
      await expect(c.query(family==="idiom"?"select perform_platform_v2_idiom_exercise_action_as_principal_v1($1,$2,$3,'success',$4,$5,$6,null)":"select perform_platform_v2_translation_exercise_action_as_principal_v1($1,$2,$3,'success',$4,$5,$6,null)",[f.viewer,target,revision,randomUUID(),direction,run])).rejects.toThrow("training_exercise_source_not_eligible");
      await c.query("rollback to savepoint second_grade");
      await c.query("reset role");
      expect((await c.query("select fsrs_reps from user_training_exercise_state where user_id=$1 and target_id=$2",[f.viewer,target])).rows[0].fsrs_reps).toBe(1);
      expect((await c.query("select count(*)::int n from user_training_exercise_action_events where user_id=$1 and target_id=$2",[f.viewer,target])).rows[0].n).toBe(1);
      expect((await c.query("select count(*)::int n from user_training_exercise_state where user_id=$1",[f.owner])).rows[0].n).toBe(0);
    });
  });

  test.each(["idiom","translation"])("%s action revalidates a target retired while its source lock waits",async family=>{
    const a=await pool.connect(),b=await pool.connect();
    let fixture:Awaited<ReturnType<typeof sharedLesson>>|undefined;
    try {
      await a.query("begin");
      const f=await sharedLesson(a);fixture=f;
      await a.query("insert into user_card_status(user_id,entry_id,card_type_id,fsrs_enabled) values($1,$2,'word-to-definition',true)",[f.viewer,f.selected]);
      await a.query("set local role authenticated");
      const started=(await a.query(family==="idiom"?"select start_platform_v2_idiom_training_session($1,'direct','2',$2,$3,'user','new','{}',2) payload":"select start_platform_v2_translation_training_session_scoped($1,'2',$2,$3,'user','new','{}',2) payload",[f.viewer,randomUUID(),f.list])).rows[0].payload;
      const target=started.members[0].targetId;
      await a.query("commit");
      await b.query("begin");
      await b.query("select id from word_entries where id=$1 for update",[f.selected]);
      await b.query("update private.platform_v2_content_nodes set binding_state='retired' where id=(select content_node_id from private.platform_v2_training_exercise_targets where id=$1)",[target]);
      await a.query("begin");
      await a.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claim.role','service_role',true)",[f.viewer]);
      const pid=(await a.query("select pg_backend_pid() pid")).rows[0].pid;
      await a.query("set local role service_role");
      const pending=a.query(family==="idiom"?"select perform_platform_v2_idiom_exercise_action_as_principal_v1($1,$2,'untracked','success',$3,'direct',$4,null)":"select perform_platform_v2_translation_exercise_action_as_principal_v1($1,$2,'untracked','success',$3,'recall',$4,null)",[f.viewer,target,randomUUID(),started.sessionId]).then(()=>"unexpected success",error=>(error as Error).message);
      let waiting=false;
      for(let n=0;n<200;n++) {
        if((await pool.query("select cardinality(pg_blocking_pids($1))>0 blocked",[pid])).rows[0].blocked){waiting=true;break;}
        await new Promise(resolve=>setTimeout(resolve,10));
      }
      expect(waiting).toBe(true);
      await b.query("commit");
      expect(await pending).toContain("training_exercise_target_unavailable");
      await a.query("rollback");
      for(const table of ["user_training_exercise_state","user_training_exercise_action_events","platform_v2_training_exercise_action_receipts"])
        expect((await a.query(`select count(*)::int n from public.${table} where user_id=$1`,[f.viewer])).rows[0].n).toBe(0);
    } finally {
      await a.query("rollback");await b.query("rollback");
      if(fixture) {
        await a.query("begin");
        await a.query("delete from training_active_runs where user_id=$1",[fixture.viewer]);
        await a.query("delete from training_run_start_receipts where user_id=$1",[fixture.viewer]);
        await a.query("delete from training_exercise_run_start_receipts where user_id=$1",[fixture.viewer]);
        await a.query("alter table training_session_members disable trigger training_session_members_identity_immutable");
        await a.query("delete from training_sessions where user_id=$1",[fixture.viewer]);
        await a.query("alter table training_session_members enable trigger training_session_members_identity_immutable");
        await a.query("delete from auth.users where id=$1",[fixture.viewer]);
        await a.query("delete from private.platform_v2_training_exercise_targets where entry_id=any($1)",[fixture.entries]);
        await a.query("delete from word_entries where id=any($1)",[fixture.entries]);
        await a.query("delete from auth.users where id=$1",[fixture.owner]);
        await a.query("commit");
      }
      a.release();b.release();
    }
  });

});
