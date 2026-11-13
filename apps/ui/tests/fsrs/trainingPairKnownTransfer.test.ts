import {randomUUID} from 'node:crypto';
import {Pool,type PoolClient} from 'pg';
import {beforeAll,afterAll,describe,test,expect} from 'vitest';
import {getDbUrl,runMigrations,withTransaction,ensureUserWithSettings,insertWord} from './dbTestUtils';
import {bindSourceEntries} from './knownChoiceFixtures';
const url=getDbUrl();
(url?describe:describe.skip)('ordinary pair Known transfer',()=>{
 const pool=new Pool({connectionString:url});beforeAll(()=>runMigrations(pool));afterAll(()=>pool.end());
 const revision=async(c:PoolClient,u:string,e:string,d:string)=>(await c.query("select COALESCE((select state_revision::text from user_card_status where user_id=$1 and entry_id=$2 and card_type_id=$3),'untracked') value",[u,e,d])).rows[0].value;
 const mark=async(c:PoolClient,u:string,e:string,d:string)=>c.query("select perform_platform_v2_card_action_as_principal($1,'mark-known',$2,$3,$4,null,null,null,$5,null,'first_party',null,null::uuid)",[u,e,d,await revision(c,u,e,d),randomUUID()]);
 const pair=async(c:PoolClient,u:string,e:string,action:string,id:string|null,event=randomUUID(),legacy=false)=>(await c.query(`select ${legacy?'private.perform_legacy_pair_exclusion_as_principal_v1':'public.perform_training_pair_exclusion_as_principal_v1'}($1,$2,$3,$4,'word-to-definition',null,$5,null) value`,[u,action,event,e,id])).rows[0].value;
 const head=async(c:PoolClient,u:string,e:string,action:string,id:string|null,event=randomUUID(),legacy=false)=>(await c.query(`select ${legacy?'private.perform_legacy_meaning_exclusion_as_principal_v1':'public.perform_training_headword_exclusion_as_principal_v1'}($1,$2,$3,$4,null,$5,null) value`,[u,action,event,e,id])).rows[0].value;
 const fixture=async(c:PoolClient,u:string,owned=false)=>{await ensureUserWithSettings(c,u);const e=owned?(await c.query('select create_user_dictionary_entry($1,null,$2) id',[u,JSON.stringify({headword:`pair-owned-${randomUUID()}`,languageCode:'nl',definition:'Own fixture'})])).rows[0].id:await insertWord(c,`pair-known-${randomUUID()}`);if(!owned)await bindSourceEntries(c,[e]);await c.query("select set_config('request.jwt.claim.role','service_role',true)");return e;};
 const active=async(c:PoolClient,u:string,e:string)=>(await c.query('select id,card_type_id from user_card_known_marks where user_id=$1 and entry_id=$2 and cleared_at is null order by card_type_id',[u,e])).rows;
 test.each(['headword','pair'])('overlapping conversions share ownership; undo %s first preserves other intent',async first=>{
  const u=randomUUID();await withTransaction(pool,async c=>{
   const e=await fixture(c,u),headEvent=randomUUID(),pairEvent=randomUUID();
   const h=await head(c,u,e,'exclude-headword',null,headEvent,true),p=await pair(c,u,e,'exclude-pair',null,pairEvent,true);
   const events=(await c.query('select * from private.training_pair_exclusion_events where user_id=$1',[u])).rows;
   expect((await c.query('select convert_meaning_exclusions_to_known_as_principal_v1(100) n')).rows[0].n).toBe(2);
   expect((await c.query('select convert_meaning_exclusions_to_known_as_principal_v1(100) n')).rows[0].n).toBe(0);
   expect((await c.query('select * from private.training_pair_exclusion_events where user_id=$1',[u])).rows).toEqual(events);
   expect((await pair(c,u,e,'exclude-pair',null,pairEvent)).status).toBe('duplicate');
   expect((await head(c,u,e,'exclude-headword',null,headEvent)).status).toBe('duplicate');
   const marks=await active(c,u,e);expect(marks).toHaveLength(2);
   if(first==='headword')await head(c,u,e,'restore-headword',h.exclusionId);else await pair(c,u,e,'restore-pair',p.exclusionId);
   expect(await active(c,u,e)).toEqual(marks);
   if(first==='headword')await pair(c,u,e,'restore-pair',p.exclusionId);else await head(c,u,e,'restore-headword',h.exclusionId);
   expect(await active(c,u,e)).toEqual([]);
   expect((await c.query('select count(*)::int n from user_review_log where user_id=$1',[u])).rows[0].n).toBe(0);
  },u);
 });
 test('pair exact undo preserves pre-existing Known, retry receipt survives archive',async()=>{
  const u=randomUUID();await withTransaction(pool,async c=>{
   const e=await fixture(c,u,true);await mark(c,u,e,'definition-to-word');const original=await active(c,u,e),event=randomUUID();
   const p=await pair(c,u,e,'exclude-pair',null,event);expect(await active(c,u,e)).toHaveLength(2);
   const undo=randomUUID();await pair(c,u,e,'restore-pair',p.exclusionId,undo);expect(await active(c,u,e)).toEqual(original);
   await c.query('select delete_user_dictionary_entry($1,$2)',[u,e]);
   expect((await pair(c,u,e,'restore-pair',p.exclusionId,undo)).status).toBe('duplicate');
   expect((await pair(c,u,e,'exclude-pair',null,event)).status).toBe('duplicate');
   await c.query('savepoint fresh');await expect(pair(c,u,e,'restore-pair',p.exclusionId)).rejects.toThrow('exclusion_target_unavailable');await c.query('rollback to savepoint fresh');
  },u);
 });
 test('stale pair undo never removes a replacement Known mark',async()=>{
  const u=randomUUID();await withTransaction(pool,async c=>{
   const e=await fixture(c,u),p=await pair(c,u,e,'exclude-pair',null);
   const k=(await c.query("select * from user_card_known_marks where user_id=$1 and entry_id=$2 and card_type_id='word-to-definition' and cleared_at is null",[u,e])).rows[0];
   await c.query("select perform_platform_v2_card_action_as_principal($1,'undo-known',$2,'word-to-definition',$3,$4,$5,null,$6,null,'first_party',null,null::uuid)",[u,e,await revision(c,u,e,'word-to-definition'),k.id,k.revision.toString(),randomUUID()]);
   await mark(c,u,e,'word-to-definition');const before=await active(c,u,e);
   await c.query('savepoint stale');await expect(pair(c,u,e,'restore-pair',p.exclusionId)).rejects.toThrow('stale_exclusion_mark');await c.query('rollback to savepoint stale');
   expect(await active(c,u,e)).toEqual(before);
  },u);
 });
 test('mandatory transfer is atomic on inaccessible data and converts audio only to its own Known',async()=>{
  const u=randomUUID();await withTransaction(pool,async c=>{
   const e=await fixture(c,u),other=(await c.query('select create_user_dictionary_entry($1,null,$2) id',[u,JSON.stringify({headword:`pair-invalid-${randomUUID()}`,languageCode:'nl',definition:'Own fixture'})])).rows[0].id;
   await head(c,u,e,'exclude-headword',null,randomUUID(),true);await pair(c,u,other,'exclude-pair',null,randomUUID(),true);
   await c.query("select private.perform_legacy_pair_exclusion_as_principal_v1($1,'exclude-pair',$2,$3,'listen-recognize',null,null,null)",[u,randomUUID(),e]);
   const audio=(await c.query("select * from private.training_pair_exclusions where user_id=$1 and pair_key like '%listen-recognize'",[u])).rows;
   await c.query('savepoint source_state');await c.query('select delete_user_dictionary_entry($1,$2)',[u,other]);
   const sql=`DO $$ DECLARE n integer; BEGIN LOOP n:=public.convert_meaning_exclusions_to_known_as_principal_v1(100);EXIT WHEN n=0;END LOOP;END $$`;
   await c.query('savepoint batch');await expect(c.query(sql)).rejects.toThrow('exclusion_target_unavailable');await c.query('rollback to savepoint batch');
   expect(await active(c,u,e)).toHaveLength(0);
   expect((await c.query('select count(*)::int n from private.training_headword_exclusions where user_id=$1 and restored_at is null',[u])).rows[0].n).toBe(1);
   await c.query('rollback to savepoint source_state');await c.query(sql);await c.query(sql);
   expect((await active(c,u,e)).map(m=>m.card_type_id)).toEqual(['definition-to-word','listen-recognize','word-to-definition']);expect((await active(c,u,other)).map(m=>m.card_type_id)).toEqual(['definition-to-word','word-to-definition']);
   const convertedAudio=(await c.query("select * from private.training_pair_exclusions where user_id=$1 and pair_key like '%listen-recognize'",[u])).rows;
   expect(convertedAudio).toHaveLength(1);expect(convertedAudio[0].id).toBe(audio[0].id);expect(convertedAudio[0].restored_at).not.toBeNull();
   await c.query('set local role service_role');await c.query('savepoint acl');await expect(c.query('select convert_meaning_exclusions_to_known_as_principal_v1(1)')).rejects.toMatchObject({code:'42501'});await c.query('rollback to savepoint acl');await c.query('reset role');
  },u);
 });
 test.each(['word-to-definition','definition-to-word','listen-recognize','listen-type'])('preserves persisted pair scope when initiated from %s',async direction=>{
  const u=randomUUID();await withTransaction(pool,async c=>{
   const e=await fixture(c,u),event=randomUUID();
   const old=(await c.query("select private.perform_legacy_pair_exclusion_as_principal_v1($1,'exclude-pair',$2,$3,$4,null,null,null) value",[u,event,e,direction])).rows[0].value;
   if(!direction.startsWith('listen-'))for(const d of ['word-to-definition','definition-to-word'])expect((await c.query("select private.training_pair_excluded_v1($1,'meaning',$2,null,null,$3) yes",[u,e,d])).rows[0].yes).toBe(true);
   expect((await c.query('select convert_meaning_exclusions_to_known_as_principal_v1(100) n')).rows[0].n).toBe(1);
   expect((await active(c,u,e)).map(m=>m.card_type_id)).toEqual(direction.startsWith('listen-')?[direction]:['definition-to-word','word-to-definition']);
   expect((await c.query('select card_type_id from private.ordinary_pair_known_conversions where exclusion_id=$1',[old.exclusionId])).rows[0].card_type_id).toBe(direction.startsWith('listen-')?direction:'both-directions');
   const replay=(await c.query("select perform_training_pair_exclusion_as_principal_v1($1,'exclude-pair',$2,$3,$4,null,null,null) value",[u,event,e,direction])).rows[0].value;
   expect(replay).toEqual({...old,status:'duplicate'});
  },u);
 });
 test('unknown persisted pair identity fails atomically',async()=>{
  const u=randomUUID();await withTransaction(pool,async c=>{
   const e=await fixture(c,u);
   await c.query("insert into private.training_pair_exclusions(user_id,pair_key,family,entry_id,created_at) values($1,'unknown-key','meaning',$2,now())",[u,e]);
   await c.query('savepoint proof');await expect(c.query('select convert_meaning_exclusions_to_known_as_principal_v1(100)')).rejects.toThrow('legacy_pair_identity_unproven');await c.query('rollback to savepoint proof');
   expect(await active(c,u,e)).toEqual([]);
  },u);
 });
 test.each([['idiom','direct'],['idiom','reverse'],['translation','recall']])('%s/%s preserves the complete content pair scope, keeps memory, and undoes its own marks',async(family,direction)=>{
  const u=randomUUID();await withTransaction(pool,async c=>{
   const e=await fixture(c,u),node=randomUUID(),target=randomUUID(),fingerprint=`fp-${node}`;
   await c.query("insert into private.platform_v2_content_nodes(id,entry_id,kind,binding_state,first_source_revision,last_source_revision,source_text_fingerprint,diagnostic_locator) values($1,$2,$3,'active','test','test',$4,'synthetic')",[node,e,family==='idiom'?'idiom':'example',fingerprint]);
   await c.query("insert into private.platform_v2_training_exercise_targets(id,entry_id,content_node_id,family,direction,source_revision,source_text_fingerprint) values($1,$2,$3,$4,$5,'test',$6)",[target,e,node,family,direction,fingerprint]);
   await c.query("insert into user_training_exercise_state(user_id,target_id,fsrs_reps,fsrs_stability,fsrs_difficulty,fsrs_last_grade) values($1,$2,5,12.4,4.1,3)",[u,target]);
   await c.query("insert into user_card_status(user_id,entry_id,card_type_id,in_learning,fsrs_enabled) values($1,$2,'word-to-definition',true,true) on conflict(user_id,entry_id,card_type_id) do update set in_learning=true",[u,e]);
   const snapshot=async()=> (await c.query('select to_jsonb(s) state from user_training_exercise_state s where user_id=$1',[u])).rows;
   const ordinary=async()=> (await c.query('select to_jsonb(s) state from user_card_status s where user_id=$1',[u])).rows;
   const before=await snapshot(),sourceBefore=await ordinary(),event=randomUUID();
   const old=(await c.query("select private.perform_legacy_pair_exclusion_as_principal_v1($1,'exclude-pair',$2,null,null,$3,null,null) value",[u,event,target])).rows[0].value;
   expect((await c.query('select convert_meaning_exclusions_to_known_as_principal_v1(100) n')).rows[0].n).toBe(1);
   expect(await snapshot()).toEqual(before);expect(await ordinary()).toEqual(sourceBefore);expect(await active(c,u,e)).toEqual([]);
   const k=(await c.query('select * from private.training_exercise_known_marks where user_id=$1',[u])).rows;
   const choices=(await c.query('select get_training_exercise_known_choices_v1($1) value',[e])).rows[0].value;expect(choices).toHaveLength(1);expect(choices[0]).toMatchObject({exclusionId:old.exclusionId,family,directions:family==='idiom'?['direct','reverse']:['recall']});
   const other=randomUUID();await ensureUserWithSettings(c,other);
   await c.query("select set_config('request.jwt.claim.sub',$1,true)",[other]);
   expect((await c.query('select get_training_exercise_known_choices_v1($1) value',[e])).rows[0].value).toEqual([]);
   await c.query("select set_config('request.jwt.claim.sub',$1,true)",[u]);
   await c.query('set local role authenticated');
   expect((await c.query('select get_training_exercise_known_choices_v1($1) value',[e])).rows[0].value).toHaveLength(1);
   await c.query('savepoint private_known');await expect(c.query('select * from private.training_exercise_known_marks')).rejects.toMatchObject({code:'42501'});await c.query('rollback to savepoint private_known');await c.query('reset role');

   expect(k).toHaveLength(family==='idiom'?2:1);const originalMark=k.find(m=>m.target_id===target)!;expect(originalMark).toBeDefined();
   expect((await c.query('select get_training_exercise_known_state_v1($1) value',[target])).rows[0].value).toMatchObject({knownMarkId:originalMark.id,direction,family});
   expect((await c.query("select perform_training_pair_exclusion_as_principal_v1($1,'exclude-pair',$2,null,null,$3,null,null) value",[u,event,target])).rows[0].value).toEqual({...old,status:'duplicate'});
   expect((await c.query("select private.training_history_is_conversion_event_v1($1,$2,$3,'mark-known',$4) yes",[u,e,originalMark.mark_event_id,originalMark.marked_at])).rows[0].yes).toBe(true);
   await c.query('savepoint replacement');
   await c.query('select private.set_training_exercise_known_v1($1,$2,false,$3)',[u,target,originalMark.id]);
   const replacement=(await c.query('select private.set_training_exercise_known_v1($1,$2,true,null) id',[u,target])).rows[0].id;
   await c.query('savepoint stale_content');
   await expect(c.query("select perform_training_pair_exclusion_as_principal_v1($1,'restore-pair',$2,null,null,$3,$4,null)",[u,randomUUID(),target,old.exclusionId])).rejects.toThrow('stale_exclusion_mark');
   await c.query('rollback to savepoint stale_content');
   expect((await c.query('select get_training_exercise_known_state_v1($1) value',[target])).rows[0].value.knownMarkId).toBe(replacement);
   await c.query('rollback to savepoint replacement');
   await c.query("select perform_training_pair_exclusion_as_principal_v1($1,'restore-pair',$2,null,null,$3,$4,null)",[u,randomUUID(),target,old.exclusionId]);
   expect((await c.query('select private.training_exercise_is_known_v1($1,$2) known',[u,target])).rows[0].known).toBe(false);
   expect(await snapshot()).toEqual(before);expect(await ordinary()).toEqual(sourceBefore);
  },u);
 });
 test('pair conversion marks and undo are hidden technical history, original events remain',async()=>{
  const u=randomUUID();await withTransaction(pool,async c=>{
   const e=await fixture(c,u),p=await pair(c,u,e,'exclude-pair',null);const marks=(await c.query('select * from user_card_known_marks where user_id=$1 and entry_id=$2',[u,e])).rows;
   for(const k of marks)expect((await c.query("select private.training_history_is_conversion_event_v1($1,$2,$3,'mark-known',$4) yes",[u,e,k.mark_event_id,k.marked_at])).rows[0].yes).toBe(true);
   await pair(c,u,e,'restore-pair',p.exclusionId);
   const after=(await c.query('select * from user_card_known_marks where user_id=$1 and entry_id=$2',[u,e])).rows;
   for(const k of after)expect((await c.query("select private.training_history_is_conversion_event_v1($1,$2,$3,'undo-known',$4) yes",[u,e,k.undo_event_id,k.cleared_at])).rows[0].yes).toBe(true);
   expect((await c.query('select count(*)::int n from private.training_pair_exclusion_events where user_id=$1',[u])).rows[0].n).toBe(2);
  },u);
 });
});
