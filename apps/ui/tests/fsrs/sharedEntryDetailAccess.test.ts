import { randomUUID } from "node:crypto";
import { projectPlatformV2WordDetails,platformV2HeaderEvidence,platformV2ContentRevision,platformV2CrossReferenceQuery,extractPlatformV2ContentSections } from "@/lib/platform/platformV2RichContent";
import { normalizeDictionaryContent,contentFingerprint } from "@/lib/platform/projections/dictionaryContent";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { ensureUserWithSettings, getDbUrl, runMigrations, withTransaction } from "./dbTestUtils";
const url=getDbUrl();
async function user(c:PoolClient,id:string) { await c.query("select set_config('request.jwt.claim.sub',$1,true)",[id]); }
async function fixture(c:PoolClient) {
  const owner=randomUUID(),viewer=randomUUID(),outsider=randomUUID();
  for(const id of [owner,viewer,outsider]) await ensureUserWithSettings(c,id);
  await user(c,owner);
  const selected=(await c.query("select create_user_dictionary_entry($1,null,$2) id",[owner,{headword:"bank",languageCode:"nl",definition:"visible meaning",example:{source:"visible example",translation:"visible translation"},notes:"visible note",generation:{kind:"llm",provider:"fixture",source:{contextText:"PRIVATE_CONTEXT_MARKER",connectedClientId:"PRIVATE_CLIENT_MARKER",sourceContext:{artifact:{text:"PRIVATE_ARTIFACT_MARKER"}}}}}])).rows[0].id;
  const dictionary=(await c.query("select dictionary_id from word_entries where id=$1",[selected])).rows[0].dictionary_id;
  await c.query("update dictionaries set description='private dictionary context' where id=$1",[dictionary]);
  const sibling=(await c.query("insert into word_entries(dictionary_id,language_code,headword,meaning_id,raw) values($1,'nl','bank',2,'{\"definition\":\"hidden sibling\"}') returning id",[dictionary])).rows[0].id;
  const lists:string[]=[],codes:string[]=[];
  for(const name of ["first","second"]) {
    const list=(await c.query("insert into user_word_lists(user_id,name) values($1,$2) returning id",[owner,name])).rows[0].id;
    lists.push(list); await c.query("insert into user_word_list_items(list_id,word_id) values($1,$2)",[list,selected]);
    const opened=(await c.query("select private.mutate_collection_share_v1($1,'open',$2,0) result",[randomUUID(),list])).rows[0].result;
    codes.push(opened.invitationCode);
  }
  await user(c,viewer);
  for(const code of codes) await c.query("select private.accept_collection_share_v1($1,$2)",[randomUUID(),code]);
  return {owner,viewer,outsider,selected,sibling,dictionary,lists};
}
const fetchEntry=async(c:PoolClient,id:string)=>(await c.query("select fetch_dictionary_entry_by_id_gated($1) entry",[id])).rows[0].entry;

(url?describe:describe.skip)("selected shared entry exact reads",()=>{
  const pool=new Pool({connectionString:url}); beforeAll(()=>runMigrations(pool)); afterAll(()=>pool.end());
  test("real authenticated fetch filters sibling counts and keeps dictionary access closed",async()=>{
    await withTransaction(pool,async c=>{
      const f=await fixture(c);
      await c.query("grant select on dictionaries to authenticated");
      await c.query("set local role authenticated");
      const entry=await fetchEntry(c,f.selected);
      expect(entry).toMatchObject({id:f.selected,meanings_count:1});
      expect(JSON.stringify(entry)).toContain("visible meaning");
      expect(JSON.stringify(entry)).not.toContain("hidden sibling");
      for(const marker of ["PRIVATE_CONTEXT_MARKER","PRIVATE_CLIENT_MARKER","PRIVATE_ARTIFACT_MARKER"]) expect(JSON.stringify(entry)).not.toContain(marker);
      expect(entry.raw).not.toHaveProperty("generation");
      expect(entry.raw).toMatchObject({definition:"visible meaning",example:{source:"visible example",translation:"visible translation"},notes:"visible note"});
      expect(await fetchEntry(c,f.sibling)).toBeNull();
      expect((await c.query("select can_browse_dictionary($1,$2) allowed",[f.viewer,f.dictionary])).rows[0].allowed).toBe(false);
      expect((await c.query("select id from dictionaries where id=$1",[f.dictionary])).rows).toEqual([]);
      await user(c,f.outsider); expect(await fetchEntry(c,f.selected)).toBeNull();
      await user(c,f.owner); expect(await fetchEntry(c,f.selected)).toMatchObject({meanings_count:2,raw:{generation:{source:{contextText:"PRIVATE_CONTEXT_MARKER"}}}});
      await c.query("reset role");
      await c.query("select private.mutate_collection_share_v1($1,'close',$2,1)",[randomUUID(),f.lists[0]]);
      await user(c,f.viewer); expect(await fetchEntry(c,f.selected)).toMatchObject({meanings_count:1});
      await user(c,f.owner); await c.query("select private.mutate_collection_share_v1($1,'close',$2,1)",[randomUUID(),f.lists[1]]);
      await user(c,f.viewer); expect(await fetchEntry(c,f.selected)).toBeNull();
    });
  });

  test("received material membership follows live subscriptions without granting unrelated lists",async()=>{
    await withTransaction(pool,async c=>{
      const f=await fixture(c);
      const material={kind:"collection",collectionType:"user",id:f.lists[0]};
      const members=async(principal:string)=>(await c.query("select entry_id from private.library_material_entry_ids_v1($1,$2)",[principal,material])).rows;
      expect(await members(f.viewer)).toEqual([{entry_id:f.selected}]);
      expect(await members(f.owner)).toEqual([{entry_id:f.selected}]);
      expect(await members(f.outsider)).toEqual([]);
      await user(c,f.owner);
      await c.query("select private.mutate_collection_share_v1($1,'close',$2,1)",[randomUUID(),f.lists[0]]);
      expect(await members(f.viewer)).toEqual([]);
      // The other subscribed collection still grants article reading, but cannot
      // grant membership in the closed collection selected as material.
      expect((await c.query("select private.entry_access_v1($1,$2,'browse') allowed",[f.viewer,f.selected])).rows[0].allowed).toBe(true);
      expect(await members(f.owner)).toEqual([{entry_id:f.selected}]);
    });
  });

  test("received material browse/search hydrate only authorized personal meanings",async()=>{
    await withTransaction(pool,async c=>{
      const f=await fixture(c);
      const material={kind:"collection",collectionType:"user",id:f.lists[0]};
      const read=async(principal:string,query:string)=>(await c.query("select lookup_platform_v2_library_material_entries($1,$2,'nl',null,null,10,50,'{}',$3) payload",[principal,query,material])).rows[0].payload;
      for(const query of ["","bank"]) {
        const payload=await read(f.viewer,query);
        expect(payload.error).toBeUndefined();
        expect(payload.items.map((item:{id:string})=>item.id)).toEqual([f.selected]);
        expect(payload.page.unavailableEntryCount).toBe(0);
        expect(payload.items[0].dictionary.is_editable).toBe(false);
        expect(JSON.stringify(payload)).not.toContain("PRIVATE_CONTEXT_MARKER");
        expect(JSON.stringify(payload)).not.toContain("hidden sibling");
      }
      expect((await read(f.outsider,"")).error).toBe("material_not_accessible");
      await user(c,f.owner);
      await c.query("select private.mutate_collection_share_v1($1,'close',$2,1)",[randomUUID(),f.lists[0]]);
      expect((await read(f.viewer,"")).error).toBe("material_not_accessible");
    });
  });

  test("general Library browse/search includes selected shared author entries only",async()=>{
    await withTransaction(pool,async c=>{
      const f=await fixture(c);
      const read=async(principal:string,query:string)=>(await c.query("select lookup_platform_v2_library_filtered_entries($1,$2,'nl',null,null,50,50,'{}') payload",[principal,query])).rows[0].payload;
      for(const query of ["","bank"]) {
        const payload=await read(f.viewer,query);
        expect(payload.error).toBeUndefined();
        const ids=payload.items.map((item:{id:string})=>item.id);
        expect(ids).toContain(f.selected); expect(ids).not.toContain(f.sibling);
        expect(JSON.stringify(payload)).not.toContain("PRIVATE_CONTEXT_MARKER");
        expect(JSON.stringify(payload)).not.toContain("hidden sibling");
      }
      // Exercise both indexed and legacy personal-entry discovery explicitly.
      for(const indexed of [true,false]) {
        if(indexed) for(const id of [f.selected,f.sibling]) await c.query("select refresh_dictionary_search_document($1,2)",[id]);
        else await c.query("delete from dictionary_search_documents where entry_id=any($1)",[[f.selected,f.sibling]]);
        const ids=(await read(f.viewer,"bank")).items.map((item:{id:string})=>item.id);
        expect(ids).toContain(f.selected); expect(ids).not.toContain(f.sibling);
      }
      await c.query("update word_entries set part_of_speech='noun',gender='de' where id=$1",[f.selected]);
      for(const article of ["de","het"]) {
        const payload=(await c.query("select lookup_platform_v2_library_filtered_entries($1,'bank','nl',null,null,50,50,$2) payload",[f.viewer,{parts:["noun"],article}])).rows[0].payload;
        expect(payload.items.some((item:{id:string})=>item.id===f.selected)).toBe(article==="de");
      }
      const catalogueDictionary=(await c.query("insert into dictionaries(language_code,slug,name,kind,visibility,publication_state) values('nl',$1,'catalogue fixture','curated','public','general') returning id",[randomUUID()])).rows[0].id;
      const catalogueEntry=(await c.query("insert into word_entries(dictionary_id,language_code,headword,raw) values($1,'nl','catalogue-marker','{\"definition\":\"catalogue fixture\"}') returning id",[catalogueDictionary])).rows[0].id;
      await c.query("select refresh_dictionary_search_document($1,2)",[catalogueEntry]);
      const scope={materialSelection:{schemaVersion:1,allowedLanguageCodes:null,disabledDictionaryIds:[]},dictionaryIds:null,parts:[],article:null};
      const catalog=(await c.query("select private.lookup_platform_v2_library_entries_base_v1(null,true,'bank','nl',null,50,50,$1) payload",[scope])).rows[0].payload;
      expect(catalog.error).toBeUndefined();
      expect(catalog.items.some((item:{id:string})=>item.id===f.selected)).toBe(false);
      expect((await read(f.outsider,"bank")).items.map((item:{id:string})=>item.id)).not.toContain(f.selected);
      await user(c,f.owner);
      for(const list of f.lists) await c.query("select private.mutate_collection_share_v1($1,'close',$2,1)",[randomUUID(),list]);
      expect((await read(f.viewer,"bank")).items.map((item:{id:string})=>item.id)).not.toContain(f.selected);
    });
  });

  test("ordinary recipe and selector admit live selected entries without personal sibling access or implicit learning",async()=>{
    await withTransaction(pool,async c=>{
      const f=await fixture(c);
      const candidates=async(principal:string,list:string|null,filter={})=>(await c.query("select entry_id from private.training_recipe_eligible_cards_v1($1,array['word-to-definition'],$2,'user','new','auto',array[]::uuid[],array[]::text[],$3,false,false)",[principal,list,filter])).rows.map((row:{entry_id:string})=>row.entry_id);
      expect(await candidates(f.viewer,f.lists[0])).toEqual([f.selected]);
      expect(await candidates(f.outsider,f.lists[0])).toEqual([]);
      const filter={dictionaryScope:{mode:"selected",languageCode:"nl",dictionaryIds:[f.dictionary]}};
      expect(await candidates(f.viewer,null,filter)).toEqual([f.selected]);
      const selected=(await c.query("select entry_id from private.training_scheduler_candidates_v2($1,array['word-to-definition'],$2,'user','new','auto',array[]::uuid[],array[]::text[],'{}',false,false)",[f.viewer,f.lists[0]])).rows;
      expect(selected).toEqual([{entry_id:f.selected}]);
      const availability=(await c.query("select read_training_recipe_availability_v1($1,array['word-to-definition'],$2,'user','{}','meaning') payload",[f.viewer,f.lists[0]])).rows[0].payload;
      expect(availability.newCards).toBe(1);
      expect((await c.query("select count(*)::int n from user_card_status where user_id=$1",[f.viewer])).rows[0].n).toBe(0);
      await user(c,f.owner);
      for(const list of f.lists) await c.query("select private.mutate_collection_share_v1($1,'close',$2,1)",[randomUUID(),list]);
      expect(await candidates(f.viewer,f.lists[0])).toEqual([]);
      expect(await candidates(f.viewer,null,filter)).toEqual([]);
    });
  });

  test("received ordinary collection launches and next-card reads reject last-path revoke",async()=>{
    await withTransaction(pool,async c=>{
      const f=await fixture(c);
      await c.query("set local role authenticated");
      const dictionaryLaunch=(await c.query("select start_training_session($1,array['word-to-definition'],null,'curated','new',$2,'5',$3) payload",[f.viewer,{dictionaryScope:{mode:"selected",languageCode:"nl",dictionaryIds:[f.dictionary]}},randomUUID()])).rows[0].payload;
      expect(dictionaryLaunch.plannedTotal).toBe(1);
      const launch=(await c.query("select start_training_session($1,array['word-to-definition'],$2,'user','new','{}','5',$3) payload",[f.viewer,f.lists[0],randomUUID()])).rows[0].payload;
      expect(launch.plannedTotal).toBe(1);
      const next=async()=>(await c.query("select get_next_training_session_card($1,$2,array[]::text[]) payload",[f.viewer,launch.sessionId])).rows[0]?.payload;
      const card=await next(); expect(card.id).toBe(f.selected); expect(card.meanings_count).toBe(1);
      expect(JSON.stringify(card)).not.toContain("PRIVATE_CONTEXT_MARKER");
      await c.query("reset role");
      expect((await c.query("select count(*)::int n from user_card_status where user_id=$1",[f.viewer])).rows[0].n).toBe(0);
      await user(c,f.owner);
      await c.query("select private.mutate_collection_share_v1($1,'close',$2,1)",[randomUUID(),f.lists[0]]);
      await user(c,f.viewer); expect((await next()).id).toBe(f.selected);
      await user(c,f.owner);
      await c.query("select private.mutate_collection_share_v1($1,'close',$2,1)",[randomUUID(),f.lists[1]]);
      await user(c,f.viewer);
      expect(await next()).toMatchObject({trainingSessionUnavailable:true,entryId:f.selected,reason:"dictionary-access-revoked"});
      await c.query("select mark_training_session_member_unavailable($1,$2,$3,'word-to-definition','dictionary-access-revoked')",[f.viewer,launch.sessionId,f.selected]);
      expect(await next()).toBeUndefined();
    });
  });

  test("display permit survives revoke only for its exact source and keeps private provenance closed",async()=>{
    await withTransaction(pool,async c=>{
      const f=await fixture(c);
      await c.query("insert into user_word_list_items(list_id,word_id) values($1,$2)",[f.lists[0],f.sibling]);
      const launch=(await c.query("select start_training_session($1,array['word-to-definition'],$2,'user','new','{}','5',$3) payload",[f.viewer,f.lists[0],randomUUID()])).rows[0].payload;
      const card=(await c.query("select get_next_training_session_card($1,$2,array[]::text[]) payload",[f.viewer,launch.sessionId])).rows[0].payload;
      const version=(await c.query("select content_version from word_entries where id=$1",[card.id])).rows[0].content_version;
      const acknowledge=async(id:string)=>(await c.query("select acknowledge_current_training_card_v1($1,$2,$3,'word-to-definition',$4,'untracked') permit",[f.viewer,launch.sessionId,id,version])).rows[0].permit;
      await c.query("set local role authenticated");
      const permit=await acknowledge(card.id);
      await c.query("reset role"); await user(c,f.owner);
      for(const list of f.lists) await c.query("select private.mutate_collection_share_v1($1,'close',$2,1)",[randomUUID(),list]);
      await user(c,f.viewer); await c.query("set local role authenticated");
      expect(await acknowledge(card.id)).toEqual(permit);
      const payload=(await c.query("select read_current_training_entry_v1($1,$2,$3) payload",[f.viewer,launch.sessionId,permit.permitId])).rows[0].payload;
      expect(payload.items.map((item:{id:string})=>item.id)).toEqual([card.id]);
      expect(payload.items[0].dictionary.is_editable).toBe(false);
      expect(JSON.stringify(payload)).not.toContain("PRIVATE_CONTEXT_MARKER");
      expect((await c.query("select fetch_dictionary_entry_by_id_gated($1) payload",[card.id])).rows[0].payload).toBeNull();
      const queued=card.id===f.selected?f.sibling:f.selected;
      await c.query("savepoint unseen");
      await expect(acknowledge(queued)).rejects.toThrow("current_training_entry_unavailable");
      await c.query("rollback to savepoint unseen");
      await c.query("reset role");
      await c.query("update word_entries set raw=jsonb_set(raw,'{definition}','\"changed\"') where id=$1",[card.id]);
      const stale=(await c.query("select read_current_training_entry_v1($1,$2,$3) payload",[f.viewer,launch.sessionId,permit.permitId])).rows[0].payload;
      expect(stale.error).toBe("current_training_permit_invalid");
    });
  });

  test.each(["start-learning","review-card"])("a revoked displayed shared meaning completes %s once without lending permission to Library",async(action)=>{
    await withTransaction(pool,async c=>{
      const f=await fixture(c);
      let revision="untracked";
      if(action==="review-card") revision=(await c.query("insert into user_card_status(user_id,entry_id,card_type_id,fsrs_enabled,fsrs_reps,fsrs_stability,fsrs_difficulty,fsrs_last_interval,last_reviewed_at,next_review_at) values($1,$2,'word-to-definition',true,2,5,5,1,now()-interval '1 day',now()-interval '1 hour') returning state_revision",[f.viewer,f.selected])).rows[0].state_revision;
      const launch=(await c.query("select start_training_session($1,array['word-to-definition'],$2,'user',$4,'{}','5',$3) payload",[f.viewer,f.lists[0],randomUUID(),action==="review-card"?"review":"new"])).rows[0].payload;
      const permit=(await c.query("select acknowledge_current_training_card_v1($1,$2,$3,'word-to-definition',1,$4) payload",[f.viewer,launch.sessionId,f.selected,revision])).rows[0].payload;
      await user(c,f.owner);
      for(const list of f.lists) await c.query("select private.mutate_collection_share_v1($1,'close',$2,1)",[randomUUID(),list]);
      await user(c,f.viewer); await c.query("select set_config('request.jwt.claim.role','service_role',true)");
      await c.query("set local role service_role");
      await c.query("savepoint library");
      await expect(c.query("select perform_platform_v2_card_action_as_principal($1,$4,$2,'word-to-definition',$5,null,null,$6,$3,null,'first_party',null)",[f.viewer,f.selected,randomUUID(),action,revision,action==="review-card"?"success":null])).rejects.toThrow("entry_not_accessible");
      await c.query("rollback to savepoint library");
      const event=randomUUID();
      const act=async()=>(await c.query("select perform_platform_v2_card_action_as_principal($1,$5,$2,'word-to-definition',$6,null,null,$7,$3,null,'first_party',null,$4) payload",[f.viewer,f.selected,event,launch.sessionId,action,revision,action==="review-card"?"success":null])).rows[0].payload;
      const accepted=await act(); expect(accepted.status).toBe("accepted");
      expect(accepted.card.stateRevision).not.toBe("untracked");
      expect((await act()).status).toBe("duplicate");
      await c.query("reset role");
      expect((await c.query("select count(*)::int n from user_card_action_events where user_id=$1 and client_event_id=$2",[f.viewer,event])).rows[0].n).toBe(1);
      const state=(await c.query("select fsrs_enabled,in_learning,fsrs_reps from user_card_status where user_id=$1 and entry_id=$2 and card_type_id='word-to-definition'",[f.viewer,f.selected])).rows[0];
      if(action==="start-learning") expect(state).toMatchObject({fsrs_enabled:true,in_learning:true});
      else {
        expect(state.fsrs_reps).toBe(3);
        expect((await c.query("select count(*)::int n from user_review_log where user_id=$1 and word_id=$2 and grade=3",[f.viewer,f.selected])).rows[0].n).toBe(1);
      }
      const current=(await c.query("select read_current_training_entry_v1($1,$2,$3) payload",[f.viewer,launch.sessionId,permit.permitId])).rows[0].payload;
      expect(current.error).toBe("current_training_permit_invalid");
    });
  });

  test("live shared Library actions keep Known and enrollment account-local",async()=>{
    await withTransaction(pool,async c=>{
      const f=await fixture(c);
      await c.query("select set_config('request.jwt.claim.role','service_role',true)");await c.query("set local role service_role");
      const mark=(await c.query("select perform_platform_v2_card_action_as_principal($1,'mark-known',$2,'word-to-definition','untracked',null,null,null,$3,null,'first_party',null) payload",[f.viewer,f.selected,randomUUID()])).rows[0].payload;
      expect(mark.status).toBe("accepted"); expect(mark.card.knownMark.markId).toBeTruthy();
      const undo=(await c.query("select perform_platform_v2_card_action_as_principal($1,'undo-known',$2,'word-to-definition',$3,$4,$5,null,$6,null,'first_party',null) payload",[f.viewer,f.selected,mark.card.stateRevision,mark.card.knownMark.markId,mark.card.knownMark.revision,randomUUID()])).rows[0].payload;
      expect(undo.status).toBe("accepted"); expect(undo.card.knownMark).toBeNull();
      // Existing Known familiarity enrolls the meaning's other directions;
      // undo therefore restores learning rather than offering start again.
      expect(undo.card.scheduler.phase).toBe("learning");
      await c.query("reset role");
      expect((await c.query("select count(*)::int n from user_card_status where user_id=$1",[f.owner])).rows[0].n).toBe(0);
      expect((await c.query("select count(*)::int n from user_card_status where user_id=$1 and entry_id=$2",[f.viewer,f.sibling])).rows[0].n).toBe(0);
    });
  });

  test("shared progress is account-local, bounded to selected entries and retained after revoke",async()=>{
    await withTransaction(pool,async c=>{
      const f=await fixture(c);
      for(const [principal,reps] of [[f.owner,7],[f.viewer,2]] as const) await c.query("insert into user_card_status(user_id,entry_id,card_type_id,fsrs_enabled,fsrs_reps,fsrs_stability,fsrs_difficulty) values($1,$2,'word-to-definition',true,$3,5,5)",[principal,f.selected,reps]);
      await c.query("set local role authenticated");
      const read=async()=>(await c.query("select get_meanings_learning_progress_v1($1) payload",[[f.selected]])).rows[0].payload;
      let progress=await read(); expect(progress).toHaveLength(1);
      expect(progress[0].directions.find((item:{cardTypeId:string})=>item.cardTypeId==="word-to-definition").gradedAttempts).toBe(2);
      const states=(await c.query("select entry_id,fsrs_reps from get_platform_v2_card_states_for_entries($1,$2,array['word-to-definition'])",[f.viewer,[f.selected,f.sibling]])).rows;
      expect(states).toEqual([{entry_id:f.selected,fsrs_reps:2}]);
      await c.query("savepoint private_sibling");
      await expect(c.query("select get_meanings_learning_progress_v1($1)",[[f.selected,f.sibling]])).rejects.toThrow("meaning_unavailable");
      await c.query("rollback to savepoint private_sibling");
      await user(c,f.outsider);
      expect((await c.query("select entry_id from get_platform_v2_card_states_for_entries($1,$2,array['word-to-definition'])",[f.outsider,[f.selected]])).rows).toEqual([]);
      await c.query("reset role");await user(c,f.owner);
      await c.query("select private.mutate_collection_share_v1($1,'close',$2,1)",[randomUUID(),f.lists[0]]);
      await user(c,f.viewer);progress=await read();expect(progress).toHaveLength(1);
      await user(c,f.owner);await c.query("select private.mutate_collection_share_v1($1,'close',$2,1)",[randomUUID(),f.lists[1]]);
      await user(c,f.viewer);await c.query("set local role authenticated");
      await c.query("savepoint revoked");await expect(read()).rejects.toThrow("meaning_unavailable");await c.query("rollback to savepoint revoked");
      expect((await c.query("select entry_id from get_platform_v2_card_states_for_entries($1,$2,array['word-to-definition'])",[f.viewer,[f.selected]])).rows).toEqual([]);
      await c.query("reset role");
      expect((await c.query("select fsrs_reps from user_card_status where user_id=$1 and entry_id=$2",[f.viewer,f.selected])).rows[0].fsrs_reps).toBe(2);
    });
  });

  test("legacy enrollment/review use live selected access without borrowing a displayed-card permit",async()=>{
    await withTransaction(pool,async c=>{
      const f=await fixture(c);await c.query("set local role authenticated");
      await c.query("select start_learning_entry_card($1,$2,'word-to-definition')",[f.viewer,f.selected]);
      await c.query("select handle_card_review($1,$2,'word-to-definition','success',$3)",[f.viewer,f.selected,randomUUID()]);
      await c.query("savepoint sibling");
      await expect(c.query("select start_learning_entry_card($1,$2,'word-to-definition')",[f.viewer,f.sibling])).rejects.toThrow("dictionary access denied");
      await c.query("rollback to savepoint sibling");
      await c.query("reset role");
      const revision=(await c.query("select state_revision,fsrs_reps from user_card_status where user_id=$1 and entry_id=$2 and card_type_id='word-to-definition'",[f.viewer,f.selected])).rows[0];
      expect(revision.fsrs_reps).toBe(1);
      // Give the legitimate displayed meaning a session; the legacy path must
      // still reject after revoke instead of borrowing that session's permit.
      const run=(await c.query("insert into training_sessions(user_id,session_size,card_type_ids,card_filter,planned_new,planned_total,requested_total,exercise_family) values($1,'5',array['word-to-definition'],'review',0,1,5,'meaning') returning id",[f.viewer])).rows[0].id;
      await c.query("insert into training_session_members(session_id,ordinal,entry_id,card_type_id,queue_source) values($1,1,$2,'word-to-definition','review')",[run,f.selected]);
      await c.query("select acknowledge_current_training_card_v1($1,$2,$3,'word-to-definition',1,$4)",[f.viewer,run,f.selected,revision.state_revision]);
      await user(c,f.owner);for(const list of f.lists) await c.query("select private.mutate_collection_share_v1($1,'close',$2,1)",[randomUUID(),list]);
      await user(c,f.viewer);await c.query("set local role authenticated");
      await c.query("savepoint revoked_legacy");
      await expect(c.query("select handle_card_review($1,$2,'word-to-definition','success',$3)",[f.viewer,f.selected,randomUUID()])).rejects.toThrow("dictionary access denied");
      await c.query("rollback to savepoint revoked_legacy");await c.query("reset role");
      expect((await c.query("select fsrs_reps from user_card_status where user_id=$1 and entry_id=$2 and card_type_id='word-to-definition'",[f.viewer,f.selected])).rows[0].fsrs_reps).toBe(1);
      expect((await c.query("select count(*)::int n from user_card_status where user_id=$1",[f.owner])).rows[0].n).toBe(0);
    });
  });

  test("shared meaning exclusion and resume preserve own state and reconcile receipts after revoke",async()=>{
    await withTransaction(pool,async c=>{
      const f=await fixture(c);
      await c.query("select set_config('request.jwt.claim.role','service_role',true)");await c.query("set local role service_role");
      const event=randomUUID();
      const exclude=async()=>(await c.query("select perform_training_headword_exclusion_as_principal_v1($1,'exclude-headword',$2,$3,null,null,null) payload",[f.viewer,event,f.selected])).rows[0].payload;
      expect((await exclude()).status).toBe("accepted");
      const before=(await c.query("select get_meaning_learning_progress_v1($1) payload",[f.selected])).rows[0].payload;
      expect(before.exclusionId).toBeTruthy();
      const resumeEvent=randomUUID();
      const resume=async()=>(await c.query("select resume_meaning_learning_as_principal_v1($1,$2,$3,$4) payload",[f.viewer,f.selected,before.revision,resumeEvent])).rows[0].payload;
      const restored=await resume();expect(restored.status).toBe("accepted");
      expect(restored.progress.exclusionId).toBeNull();
      expect(restored.progress.directions.every((item:{phase:string})=>item.phase==="learning")).toBe(true);
      await c.query("reset role");await user(c,f.owner);
      for(const list of f.lists) await c.query("select private.mutate_collection_share_v1($1,'close',$2,1)",[randomUUID(),list]);
      await user(c,f.viewer);await c.query("set local role service_role");
      expect((await exclude()).status).toBe("duplicate");expect((await resume()).status).toBe("duplicate");
      await c.query("savepoint new_exclusion");
      await expect(c.query("select perform_training_headword_exclusion_as_principal_v1($1,'exclude-headword',$2,$3,null,null,null)",[f.viewer,randomUUID(),f.selected])).rejects.toThrow("exclusion_target_unavailable");
      await c.query("rollback to savepoint new_exclusion");await c.query("reset role");
      expect((await c.query("select count(*)::int n from user_card_status where user_id=$1",[f.owner])).rows[0].n).toBe(0);
      expect((await c.query("select count(*)::int n from user_review_log where user_id=$1",[f.viewer])).rows[0].n).toBe(0);
    });
  });

  test("Library/training exact group and presentation identity preserve selected-only metadata",async()=>{
    await withTransaction(pool,async c=>{
      const f=await fixture(c);
      for(const role of ["anon","authenticated","service_role"]) for(const signature of ["entry_access_v1(uuid,uuid,text)","dictionary_metadata_for_entry_read_v1(uuid,public.dictionaries)"]) {
        expect((await c.query("select has_function_privilege($1,$2,'EXECUTE') allowed",[role,`private.${signature}`])).rows[0].allowed).toBe(false);
      }
      for(const reader of ["read_platform_v2_library_group","read_platform_v2_training_group"]) {
        const payload=(await c.query(`select ${reader}($1,$2,50) payload`,[f.viewer,f.selected])).rows[0].payload;
        expect(payload.error).toBeUndefined(); expect(payload.items).toHaveLength(1);
        expect(payload.items[0]).toMatchObject({id:f.selected,dictionary:{id:f.dictionary,is_editable:false}});
        expect(payload.items[0].dictionary).not.toHaveProperty("description");
        expect(JSON.stringify(payload)).not.toContain("private dictionary context");
        for(const marker of ["PRIVATE_CONTEXT_MARKER","PRIVATE_CLIENT_MARKER","PRIVATE_ARTIFACT_MARKER"]) expect(JSON.stringify(payload)).not.toContain(marker);
        expect(payload.items[0].raw).not.toHaveProperty("generation");
        expect((await c.query(`select ${reader}($1,$2,50) payload`,[f.viewer,f.sibling])).rows[0].payload.error).toBe("entry_not_accessible");
      }
      const own=(await c.query("select read_platform_v2_library_group($1,$2,50) payload",[f.owner,f.selected])).rows[0].payload;
      expect(own.items[0].dictionary.description).toBe("private dictionary context");
      await c.query("savepoint public_catalog");
      await expect(c.query("select private.read_platform_v2_presentation_identity_report_base_v1(null,$1,true)",[[f.selected]])).rejects.toMatchObject({message:"platform_v2_entry_not_accessible"});
      await c.query("rollback to savepoint public_catalog");
      await user(c,f.owner); await c.query("select delete_user_dictionary_entry($1,$2)",[f.owner,f.selected]);
      expect((await c.query("select read_platform_v2_library_group($1,$2,50) payload",[f.viewer,f.selected])).rows[0].payload.error).toBe("entry_not_accessible");
    });
  });

  test("notes keep own-row isolation; closed catalogues and training tiers remain independent",async()=>{
    await withTransaction(pool,async c=>{
      const f=await fixture(c);
      const closed=(await c.query("insert into dictionaries(language_code,slug,name,kind,visibility,owner_user_id) values('nl',$1,'closed','curated','private',$2) returning id",[randomUUID(),f.owner])).rows[0].id;
      const general=(await c.query("insert into dictionaries(language_code,slug,name,kind,visibility,minimum_subscription_tier) values('nl',$1,'premium','curated','public','premium') returning id",[randomUUID()])).rows[0].id;
      const source=async(dictionary:string)=>(await c.query("insert into word_entries(dictionary_id,language_code,headword,raw) values($1,'nl',$2,'{\"definition\":\"source\"}') returning id",[dictionary,randomUUID()])).rows[0].id;
      const closedEntry=await source(closed), premiumEntry=await source(general);
      await c.query("insert into user_word_list_items(list_id,word_id) values($1,$2)",[f.lists[0],closedEntry]);
      await c.query("insert into user_word_list_items(list_id,word_id) values($1,$2)",[f.lists[0],premiumEntry]);
      const material={kind:"collection",collectionType:"user",id:f.lists[0]};
      const readable=(await c.query("select entry_id from private.readable_material_entry_ids_v1($1,$2)",[f.viewer,material])).rows.map((row:{entry_id:string})=>row.entry_id);
      expect(new Set(readable)).toEqual(new Set([f.selected,premiumEntry]));
      for(const role of ["anon","authenticated","service_role"]) expect((await c.query("select has_function_privilege($1,'private.readable_material_entry_ids_v1(uuid,jsonb)','EXECUTE') allowed",[role])).rows[0].allowed).toBe(false);
      const allowed=async(entry:string,mode:string)=>(await c.query("select private.entry_access_v1($1,$2,$3) allowed",[f.viewer,entry,mode])).rows[0].allowed;
      expect(await allowed(f.selected,"browse")).toBe(true); expect(await allowed(f.selected,"train")).toBe(true);
      expect(await allowed(closedEntry,"browse")).toBe(false); expect(await allowed(closedEntry,"train")).toBe(false);
      expect(await allowed(premiumEntry,"browse")).toBe(true); expect(await allowed(premiumEntry,"train")).toBe(false);
      expect(await allowed(f.selected,"admin")).toBe(false);
      await c.query("grant select,insert,update,delete on user_word_notes to authenticated");
      await c.query("set local role authenticated");
      expect(await fetchEntry(c,closedEntry)).toBeNull();
      expect(await fetchEntry(c,premiumEntry)).toMatchObject({id:premiumEntry});
      await c.query("insert into user_word_notes(user_id,word_entry_id,notes) values($1,$2,'own addition')",[f.viewer,f.selected]);
      expect((await c.query("select notes from user_word_notes where word_entry_id=$1",[f.selected])).rows).toEqual([{notes:"own addition"}]);
      await user(c,f.outsider); expect((await c.query("select notes from user_word_notes where word_entry_id=$1",[f.selected])).rows).toEqual([]);
      await c.query("reset role"); await user(c,f.owner);
      for(const list of f.lists) await c.query("select private.mutate_collection_share_v1($1,'close',$2,1)",[randomUUID(),list]);
      await user(c,f.viewer); await c.query("set local role authenticated");
      expect((await c.query("select notes from user_word_notes where word_entry_id=$1",[f.selected])).rows).toEqual([]);
    });
  });
  test("instructional projection preserves rich paths, node atoms and semantic fingerprint",async()=>{
    await withTransaction(pool,async c=>{
      const f=await fixture(c); await user(c,f.owner);
      const old=(await fetchEntry(c,f.selected)).raw;
      const raw={...old,meanings:[{definition:"rich definition",context:"rich context",note:"meaning note",examples:["first example","second example"],
        synonyms:["vriend"],cross_references:["zitten",{headword:"stoel",sourceContext:"PRIVATE_REFERENCE_MARKER"}],translations:{en:"definition"},grammar:{number:"singular",model:"weak verb",provider:"grammar term",opaque:{text:"PRIVATE_GRAMMAR_MARKER"}},
        idioms:[{expression:"een bank",explanation:"idiom explanation",examples:["idiom example"]}],
        sourceContext:{text:"PRIVATE_NESTED_MARKER"}}],plural:"banken",morphology:{plural:"banken"},
        reference_tables:[{title:"Furniture",sourceContext:"PRIVATE_TABLE_MARKER",rows:[{label:"plural",value:"banken",sourceContext:"PRIVATE_ROW_CONTEXT_MARKER"}]}],cross_reference:{headword:"zitten",sourceContext:"PRIVATE_POINTER_MARKER"},source_identity:{homograph_number:2,sourceContext:"PRIVATE_IDENTITY_MARKER"},displayPronunciation:"bɑŋk",_metadata:{privateObservation:"PRIVATE_METADATA_MARKER"},unknownProviderBlob:{text:"PRIVATE_UNKNOWN_MARKER"}};
      await c.query("update word_entries set raw=$2 where id=$1",[f.selected,raw]);
      const own=await fetchEntry(c,f.selected);
      await user(c,f.viewer); const shared=await fetchEntry(c,f.selected);
      for(const marker of ["PRIVATE_CONTEXT_MARKER","PRIVATE_NESTED_MARKER","PRIVATE_METADATA_MARKER","PRIVATE_UNKNOWN_MARKER","PRIVATE_REFERENCE_MARKER","PRIVATE_TABLE_MARKER","PRIVATE_ROW_CONTEXT_MARKER","PRIVATE_POINTER_MARKER","PRIVATE_IDENTITY_MARKER","PRIVATE_GRAMMAR_MARKER"]) expect(JSON.stringify(shared)).not.toContain(marker);
      expect(shared.raw.meanings[0].examples).toEqual(["first example","second example"]);
      expect(shared.raw.meanings[0].idioms[0]).toEqual({expression:"een bank",explanation:"idiom explanation",examples:["idiom example"]});
      expect((await c.query("select private.platform_v2_user_entry_content_nodes($1) nodes",[shared.raw])).rows[0].nodes)
        .toEqual((await c.query("select private.platform_v2_user_entry_content_nodes($1) nodes",[own.raw])).rows[0].nodes);
      expect(contentFingerprint(normalizeDictionaryContent(shared))).toBe(contentFingerprint(normalizeDictionaryContent(own)));
      expect(projectPlatformV2WordDetails(shared,[])).toEqual(projectPlatformV2WordDetails(own,[]));
      expect(platformV2HeaderEvidence(shared)).toEqual(platformV2HeaderEvidence(own));
      const revision=(entry: typeof own)=>platformV2ContentRevision(entry.id,extractPlatformV2ContentSections(entry),projectPlatformV2WordDetails(entry,[]),platformV2CrossReferenceQuery(entry),platformV2HeaderEvidence(entry));
      expect(revision(shared)).toBe(revision(own));
      const future={...own,future_private_diagnostic:"PRIVATE_ROW_MARKER"};
      expect(JSON.stringify((await c.query("select private.entry_payload_for_reader_v1($1,$2) payload",[f.viewer,future])).rows[0].payload)).not.toContain("PRIVATE_ROW_MARKER");
      for(const role of ["anon","authenticated","service_role"]) for(const signature of ["shared_instructional_raw_v1(jsonb,text,integer)","entry_payload_for_reader_v1(uuid,jsonb)"]) {
        expect((await c.query("select has_function_privilege($1,$2,'EXECUTE') allowed",[role,`private.${signature}`])).rows[0].allowed).toBe(false);
      }
    });
  });

});
