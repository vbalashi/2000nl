import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { ensureUserWithSettings, getDbUrl, insertWord, runMigrations, withTransaction } from "./dbTestUtils";
const dbUrl = getDbUrl();
const describeIfDb = dbUrl ? describe : describe.skip;
async function bindSourceEntries(
  client: PoolClient,
  entryIds: string[],
  groupKey = `private-source-group-${randomUUID()}`,
) {
  const identitySchemeVersion = `platform-v2-test-${randomUUID()}`;
  const { rows: dictionaryRows } = await client.query(
    `select dictionary_id from word_entries where id = $1`,
    [entryIds[0]],
  );
  const dictionaryId = dictionaryRows[0].dictionary_id as string;
  const { rows: runRows } = await client.query(
    `insert into private.dictionary_import_runs (
       dictionary_id,
       identity_scheme_version,
       artifact_format_version,
       manifest_checksum,
       input_checksum,
       source_record_count,
       artifact_count,
       status
     )
     values ($1, $2, 'test-v1', $3, $4, $5, $5, 'completed')
     returning id`,
    [
      dictionaryId,
      identitySchemeVersion,
      randomUUID(),
      randomUUID(),
      entryIds.length,
    ],
  );
  const importRunId = runRows[0].id as string;

  for (const [index, entryId] of entryIds.entries()) {
    await client.query(
      `insert into private.source_entry_bindings (
         dictionary_id,
         identity_scheme_version,
         source_entry_key,
         source_group_key,
         sense_ordinal,
         word_entry_id,
         binding_state,
         first_seen_run_id,
         last_seen_run_id,
         manifest_checksum,
         content_fingerprint_version,
         content_fingerprint,
         identity_evidence,
         reconciliation_decision
       )
       values (
         $1,
         $2,
         $3,
         $4,
         $5,
         $6,
         'active',
         $7,
         $7,
         'test-manifest',
         'test-v1',
         $8,
         '{"kind":"test"}'::jsonb,
         '{"decision":"create"}'::jsonb
       )`,
      [
        dictionaryId,
        identitySchemeVersion,
        `source-entry-${index + 1}-${randomUUID()}`,
        groupKey,
        index + 1,
        entryId,
        importRunId,
        `fingerprint-${index + 1}`,
      ],
    );
  }

  return groupKey;
}

async function action(client:PoolClient,userId:string,entryId:string,eventId:string,markId:string|null=null) {
  await client.query("select set_config('request.jwt.claim.role','service_role',true)");
  return (await client.query(`select public.perform_training_headword_exclusion_as_principal_v1(
    $1,$2,$3,$4,null,$5,null) result`,[userId,markId?'restore-headword':'exclude-headword',eventId,entryId,markId])).rows[0].result;
}
async function excluded(client:PoolClient,userId:string,entryId:string,mode:string,family='meaning') {
  return (await client.query(`select private.training_pair_excluded_v1($1,$2,$3,null,null,$4) value`,[userId,family,entryId,mode])).rows[0].value;
}
describeIfDb('headword exclusion availability',()=>{
 const pool=new Pool({connectionString:dbUrl});
 beforeAll(async()=>{await runMigrations(pool);});
 afterAll(async()=>{await pool.end();});
 test('all meanings and both ordinary directions are excluded without changing independent exercises or progress',async()=>{
  const userId=randomUUID(),otherUser=randomUUID();
  await withTransaction(pool,async client=>{
   await ensureUserWithSettings(client,userId);
   await ensureUserWithSettings(client,otherUser);
   const entries=await Promise.all([insertWord(client,'headword-exclusion'),insertWord(client,'headword-exclusion')]);
   await bindSourceEntries(client,entries);
   const other=await insertWord(client,'headword-exclusion');
   await bindSourceEntries(client,[other]);
   await client.query(`insert into user_card_status(user_id,entry_id,card_type_id,fsrs_enabled,in_learning,next_review_at)
     values($1,$2,'word-to-definition',true,true,now())`,[userId,entries[0]]);
   const before=(await client.query('select to_jsonb(s) state from user_card_status s where user_id=$1',[userId])).rows;
   const eventId=randomUUID(),mark=await action(client,userId,entries[0],eventId);
   expect(mark).toMatchObject({status:'accepted',excluded:true,consumption:null,family:'meaning'});
   for(const entry of entries){
    expect(await excluded(client,userId,entry,'word-to-definition')).toBe(true);
    expect(await excluded(client,userId,entry,'definition-to-word')).toBe(true);
    expect(await excluded(client,userId,entry,'listen-recognize')).toBe(false);
    expect(await excluded(client,userId,entry,'listen-type')).toBe(false);
    expect(await excluded(client,userId,entry,'direct','idiom')).toBe(false);
    expect(await excluded(client,userId,entry,'reverse','translation')).toBe(false);
    expect(await excluded(client,otherUser,entry,'word-to-definition')).toBe(false);
   }
   expect(await excluded(client,userId,other,'word-to-definition')).toBe(false);
   const later=await insertWord(client,'headword-exclusion');
   await client.query(`insert into private.source_entry_bindings(
    dictionary_id,identity_scheme_version,source_entry_key,source_group_key,sense_ordinal,word_entry_id,binding_state,
    first_seen_run_id,last_seen_run_id,manifest_checksum,content_fingerprint_version,content_fingerprint,identity_evidence,reconciliation_decision)
    select dictionary_id,identity_scheme_version,$2,source_group_key,3,$3,'active',first_seen_run_id,last_seen_run_id,
     manifest_checksum,content_fingerprint_version,$2,identity_evidence,reconciliation_decision
    from private.source_entry_bindings where word_entry_id=$1 and binding_state='active'`,[entries[0],randomUUID(),later]);
   expect(await excluded(client,userId,later,'word-to-definition')).toBe(true);
   expect(await excluded(client,userId,later,'definition-to-word')).toBe(true);
   const candidates=(await client.query(`select entry_id from private.training_scheduler_candidates_v2(
    $1,ARRAY['word-to-definition','definition-to-word'],null,'curated','both','auto',
    ARRAY[]::uuid[],ARRAY[]::text[],'{}',false,false)`,[userId])).rows;
   expect(candidates.some(row=>[...entries,later].includes(row.entry_id))).toBe(false);

   expect((await client.query('select to_jsonb(s) state from user_card_status s where user_id=$1',[userId])).rows).toEqual(before);
   expect((await client.query('select count(*)::int count from user_card_known_marks where user_id=$1',[userId])).rows[0].count).toBe(0);
   // Restore can be addressed through another meaning, but requires this exact mark.
   expect((await action(client,userId,entries[1],randomUUID(),mark.exclusionId)).excluded).toBe(false);
   expect(await excluded(client,userId,entries[0],'word-to-definition')).toBe(false);
   expect((await action(client,userId,entries[0],eventId)).status).toBe('duplicate');
   expect(await excluded(client,userId,entries[1],'definition-to-word')).toBe(false);
   await client.query('savepoint stale');
   await expect(action(client,userId,entries[0],randomUUID(),mark.exclusionId)).rejects.toThrow('stale_exclusion_mark');
   await client.query('rollback to savepoint stale');
   await client.query('savepoint conflict');
   await expect(action(client,userId,entries[1],eventId)).rejects.toThrow('exclusion_idempotency_conflict');
   await client.query('rollback to savepoint conflict');
  },userId);
 });
 test('unbound entries cannot invent a headword identity',async()=>{
  const userId=randomUUID();
  await withTransaction(pool,async client=>{
   await ensureUserWithSettings(client,userId);
   const entry=await insertWord(client,'unbound-exclusion');
   await client.query('savepoint unbound');
   await expect(action(client,userId,entry,randomUUID())).rejects.toThrow('exclusion_target_unavailable');
   await client.query('rollback to savepoint unbound');
   expect((await client.query('select count(*)::int count from private.training_headword_exclusion_events where user_id=$1',[userId])).rows[0].count).toBe(0);
  },userId);
 });
 test('an in-flight headword exclusion serializes a review of a sibling meaning',async()=>{
  const userId=randomUUID(),setup=await pool.connect(),excluding=await pool.connect(),reviewing=await pool.connect();
  try {
   await setup.query('begin');await ensureUserWithSettings(setup,userId);
   const entries=[await insertWord(setup,`group-race-${randomUUID()}`),await insertWord(setup,`group-race-${randomUUID()}`)];
   await bindSourceEntries(setup,entries);await setup.query('commit');
   await excluding.query('begin');await action(excluding,userId,entries[0],randomUUID());
   await reviewing.query('begin');await reviewing.query("select set_config('request.jwt.claim.sub',$1,true)",[userId]);
   await reviewing.query("set local statement_timeout='2s'");
   let settled=false;
   const pending=reviewing.query("select public.handle_card_review($1,$2,'definition-to-word','success',$3)",[userId,entries[1],randomUUID()])
    .then(()=>{settled=true;return 'accepted';},(error:Error)=>{settled=true;return error.message;});
   await new Promise(resolve=>setTimeout(resolve,50));expect(settled).toBe(false);
   await excluding.query('commit');expect(await pending).toContain('training_pair_excluded');
   await reviewing.query('rollback');
   expect((await setup.query('select count(*)::int count from user_card_status where user_id=$1',[userId])).rows[0].count).toBe(0);
  } finally {
   await excluding.query('rollback');await reviewing.query('rollback');await setup.query('rollback');
   excluding.release();reviewing.release();setup.release();
   await pool.query('delete from auth.users where id=$1',[userId]);
   // Source bindings remain in this disposable test database only.
  }
 });

 test('Training consumes only the owned current member and reports a queued sibling unavailable',async()=>{
  const userId=randomUUID();
  await withTransaction(pool,async client=>{
   await ensureUserWithSettings(client,userId);
   const entries=[await insertWord(client,`headword-queue-${randomUUID()}`),await insertWord(client,`headword-queue-${randomUUID()}`)];
   await bindSourceEntries(client,entries);
   const session=(await client.query(`insert into training_sessions(user_id,session_size,card_type_ids,list_type,card_filter,
    training_filter,planned_new,planned_review,planned_total,requested_total) values($1,'5',ARRAY['word-to-definition'],'curated','both','{}',2,0,2,5) returning id`,[userId])).rows[0].id;
   await client.query(`insert into training_session_members(session_id,ordinal,entry_id,card_type_id,queue_source)
    values($1,1,$2,'word-to-definition','new'),($1,2,$3,'word-to-definition','new')`,[session,...entries]);
   const trainingAction=async(entry:string,event:string)=>(await client.query(`select public.perform_training_headword_exclusion_as_principal_v1(
    $1,'exclude-headword',$2,$3,'word-to-definition',null,$4) result`,[userId,event,entry,session])).rows[0].result;
   await client.query("select set_config('request.jwt.claim.role','service_role',true)");
   await client.query('savepoint out_of_order');
   await expect(trainingAction(entries[1],randomUUID())).rejects.toThrow('training_session_member_unavailable');
   await client.query('rollback to savepoint out_of_order');
   expect((await client.query('select count(*)::int count from private.training_headword_exclusions where user_id=$1',[userId])).rows[0].count).toBe(0);
   const eventId=randomUUID(),mark=await trainingAction(entries[0],eventId);
   expect(mark.consumption.status).toBe('consumed');
   expect((await trainingAction(entries[0],eventId)).status).toBe('duplicate');
   const members=(await client.query('select ordinal,consumed_at from training_session_members where session_id=$1 order by ordinal',[session])).rows;
   expect(members[0].consumed_at).not.toBeNull();expect(members[1].consumed_at).toBeNull();
   expect((await client.query('select get_next_training_session_card($1,$2) card',[userId,session])).rows[0].card)
    .toMatchObject({trainingSessionUnavailable:true,entryId:entries[1],reason:'pair-excluded'});
   expect((await client.query('select count(*)::int count from user_card_status where user_id=$1',[userId])).rows[0].count).toBe(0);
   await action(client,userId,entries[0],randomUUID(),mark.exclusionId);
   expect((await client.query('select ordinal,consumed_at from training_session_members where session_id=$1 order by ordinal',[session])).rows).toEqual(members);
  },userId);
 });

 test('dictionary access and exact mark ownership are enforced independently of browser claims',async()=>{
  const userId=randomUUID(),otherUser=randomUUID();
  await withTransaction(pool,async client=>{
   await ensureUserWithSettings(client,userId);await ensureUserWithSettings(client,otherUser);
   const entry=await insertWord(client,`private-exclusion-${randomUUID()}`);
   const dictionary=(await client.query(`insert into dictionaries(language_code,slug,name,kind,visibility,owner_user_id,
    minimum_subscription_tier,schema_key,schema_version) values('nl',$1,'Exclusion access fixture','curated','shared',null,'free','nl-vandale-v1',1) returning id`,[randomUUID()])).rows[0].id;
   await client.query('update word_entries set dictionary_id=$2 where id=$1',[entry,dictionary]);await bindSourceEntries(client,[entry]);
   await client.query('savepoint denied');
   await expect(action(client,userId,entry,randomUUID())).rejects.toThrow('exclusion_target_unavailable');
   await client.query('rollback to savepoint denied');
   await client.query(`insert into dictionary_entitlements(dictionary_id,subject_type,subject_key,permission)
    values($1,'user',$2,'read'),($1,'user',$3,'read')`,[dictionary,userId,otherUser]);
   const mark=await action(client,userId,entry,randomUUID());
   await client.query('savepoint foreign_mark');
   await expect(action(client,otherUser,entry,randomUUID(),mark.exclusionId)).rejects.toThrow('stale_exclusion_mark');
   await client.query('rollback to savepoint foreign_mark');
   await client.query(`delete from dictionary_entitlements where dictionary_id=$1 and subject_key=$2`,[dictionary,userId]);
   await client.query('savepoint revoked');
   await expect(action(client,userId,entry,randomUUID(),mark.exclusionId)).rejects.toThrow('exclusion_target_unavailable');
   await client.query('rollback to savepoint revoked');
   expect(await excluded(client,userId,entry,'word-to-definition')).toBe(true);
   const privileges=(await client.query(`select has_function_privilege('authenticated',
    'public.perform_training_headword_exclusion_as_principal_v1(uuid,text,uuid,uuid,text,uuid,uuid)','EXECUTE') browser,
    has_function_privilege('service_role','public.perform_training_headword_exclusion_as_principal_v1(uuid,text,uuid,uuid,text,uuid,uuid)','EXECUTE') server`)).rows[0];
   expect(privileges).toEqual({browser:false,server:true});
  },userId);
 });

});
