import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { ensureUserWithSettings, getDbUrl, insertWord, runMigrations, withTransaction } from "./dbTestUtils";
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


const url=getDbUrl();
(url?describe:describe.skip)("Training directional knowledge choice",()=>{
 const pool=new Pool({connectionString:url});
 beforeAll(()=>runMigrations(pool));afterAll(()=>pool.end());
 async function fixture(c:PoolClient,user:string){
  await ensureUserWithSettings(c,user);
  const entry=await insertWord(c,`known-choice-${randomUUID()}`);
  const session=(await c.query("select start_training_session($1,ARRAY['word-to-definition','definition-to-word']::text[],NULL,'curated','both','{}'::jsonb,'5') value",[user])).rows[0].value;
  const member=(await c.query("select entry_id,card_type_id from training_session_members where session_id=$1 order by ordinal limit 1",[session.sessionId])).rows[0];
  const progress=(await c.query("select get_meaning_learning_progress_v1($1) value",[member.entry_id])).rows[0].value;
  await c.query("select set_config('request.jwt.claim.role','service_role',true)");
  return {entry:member.entry_id as string,direction:member.card_type_id as string,session:session.sessionId as string,revision:progress.revision as string,createdEntry:entry};
 }
 const save=(c:PoolClient,user:string,f:Awaited<ReturnType<typeof fixture>>,known:string[],event=randomUUID())=>c.query("select set_training_known_directions_as_principal_v1($1,$2,$3,$4,$5,$6,$7) value",[user,f.entry,f.session,f.direction,known,f.revision,event]);
 test("saves both directions once, consumes only current member and creates no review grade",async()=>{
  const user=randomUUID();await withTransaction(pool,async c=>{
   const f=await fixture(c,user),event=randomUUID();
   const before=(await c.query("select card_type_id,fsrs_reps,fsrs_last_grade,next_review_at from user_card_status where user_id=$1 and entry_id=$2 order by card_type_id",[user,f.entry])).rows;
   const known=['word-to-definition','definition-to-word'];const result=(await save(c,user,f,known,event)).rows[0].value;
   expect(result.status).toBe('accepted');expect(result.progress.directions.every((d:{knownMarkId:string})=>d.knownMarkId)).toBe(true);
   expect((await save(c,user,f,known,event)).rows[0].value.status).toBe('duplicate');
   expect((await c.query("select count(*)::int n from training_session_members where session_id=$1 and consumed_at is not null",[f.session])).rows[0].n).toBe(1);
   const after=(await c.query("select card_type_id,fsrs_reps,fsrs_last_grade,next_review_at from user_card_status where user_id=$1 and entry_id=$2 order by card_type_id",[user,f.entry])).rows;
   for(const row of before)expect(after).toContainEqual(row);
   expect((await c.query("select count(*)::int n from user_review_log where user_id=$1",[user])).rows[0].n).toBe(0);
   await c.query('savepoint conflict');await expect(save(c,user,f,[],event)).rejects.toThrow('known_choice_idempotency_conflict');await c.query('rollback to savepoint conflict');
  },user);
 });
 test("supports one direction and no selected directions",async()=>{
  for(const selectCurrent of [true,false]){const user=randomUUID();await withTransaction(pool,async c=>{
   const f=await fixture(c,user);const value=(await save(c,user,f,selectCurrent?[f.direction]:[])).rows[0].value;
   expect(value.progress.directions.filter((d:{knownMarkId:string})=>d.knownMarkId)).toHaveLength(selectCurrent?1:0);
   expect(value.consumption.status).toMatch(/^consumed/);
  },user);}
 });
 test("rejects stale state atomically and does not consume on failure",async()=>{
  const user=randomUUID();await withTransaction(pool,async c=>{
   const f=await fixture(c,user);await c.query("select perform_platform_v2_card_action($1,'mark-known',$2,'definition-to-word','untracked',NULL,NULL,NULL,$3,NULL,'first_party',NULL)",[user,f.entry,randomUUID()]);
   await c.query('savepoint stale');await expect(save(c,user,f,[f.direction])).rejects.toThrow('meaning_progress_conflict');await c.query('rollback to savepoint stale');
   expect((await c.query("select count(*)::int n from training_session_members where session_id=$1 and consumed_at is not null",[f.session])).rows[0].n).toBe(0);
  },user);
 });
 test("legacy exclusion becomes Known in both directions and exact undo preserves pre-existing Known",async()=>{
  const user=randomUUID();await withTransaction(pool,async c=>{
   await ensureUserWithSettings(c,user);const entry=await insertWord(c,`legacy-choice-${randomUUID()}`);
   await c.query("select set_config('request.jwt.claim.role','service_role',true)");
   await c.query("select perform_platform_v2_card_action($1,'mark-known',$2,'word-to-definition','untracked',NULL,NULL,NULL,$3,NULL,'first_party',NULL)",[user,entry,randomUUID()]);
   await bindSourceEntries(c,[entry]);
   const event=randomUUID();
   const exclude=()=>c.query("select perform_training_headword_exclusion_as_principal_v1($1,'exclude-headword',$2,$3,NULL,NULL,NULL) value",[user,event,entry]);
   const mark=(await exclude()).rows[0].value;
   const progress=()=>c.query("select get_meaning_learning_progress_v1($1) value",[entry]);
   const converted=(await progress()).rows[0].value;
   expect(converted.exclusionId).toBeNull();expect(converted.directions.every((d:{knownMarkId:string})=>d.knownMarkId)).toBe(true);
   expect((await exclude()).rows[0].value.status).toBe('duplicate');
   const undoEvent=randomUUID();const restore=()=>c.query("select perform_training_headword_exclusion_as_principal_v1($1,'restore-headword',$2,$3,NULL,$4,NULL) value",[user,undoEvent,entry,mark.exclusionId]);
   expect((await restore()).rows[0].value.status).toBe('accepted');expect((await restore()).rows[0].value.status).toBe('duplicate');
   const restored=(await progress()).rows[0].value;
   expect(restored.directions.find((d:{cardTypeId:string})=>d.cardTypeId==='word-to-definition').knownMarkId).toBeTruthy();
   expect(restored.directions.find((d:{cardTypeId:string})=>d.cardTypeId==='definition-to-word').knownMarkId).toBeNull();
  },user);
 });
 test("bounded conversion ignores restored historical exclusions and is repeatable",async()=>{
  const user=randomUUID();await withTransaction(pool,async c=>{
   await ensureUserWithSettings(c,user);const entry=await insertWord(c,`convert-choice-${randomUUID()}`),other=await insertWord(c,`restored-choice-${randomUUID()}`);
   await c.query("select set_config('request.jwt.claim.role','service_role',true)");
   await bindSourceEntries(c,[entry]);await bindSourceEntries(c,[other]);
   for(const id of [entry,other]){const mark=(await c.query("select private.perform_legacy_meaning_exclusion_as_principal_v1($1,'exclude-headword',$2,$3,NULL,NULL,NULL) value",[user,randomUUID(),id])).rows[0].value;if(id===other)await c.query("select private.perform_legacy_meaning_exclusion_as_principal_v1($1,'restore-headword',$2,$3,NULL,$4,NULL)",[user,randomUUID(),id,mark.exclusionId]);}
   expect((await c.query("select convert_meaning_exclusions_to_known_as_principal_v1(100) n")).rows[0].n).toBe(1);
   expect((await c.query("select convert_meaning_exclusions_to_known_as_principal_v1(100) n")).rows[0].n).toBe(0);
   expect((await c.query("select count(*)::int n from user_card_known_marks where user_id=$1 and entry_id=$2 and cleared_at is null",[user,entry])).rows[0].n).toBe(2);
   expect((await c.query("select count(*)::int n from user_card_known_marks where user_id=$1 and entry_id=$2",[user,other])).rows[0].n).toBe(0);
  },user);
 });
 test("preserves rated memory fields and refuses out-of-order consumption before writing marks",async()=>{
  const user=randomUUID();await withTransaction(pool,async c=>{
   const f=await fixture(c,user);
   await c.query("insert into user_card_status(user_id,entry_id,card_type_id,fsrs_enabled,fsrs_stability,fsrs_difficulty,fsrs_reps,fsrs_last_grade,next_review_at) values($1,$2,$3,true,12.4,4.1,5,3,'2026-11-01T00:00:00Z') on conflict(user_id,entry_id,card_type_id) do update set fsrs_stability=12.4,fsrs_difficulty=4.1,fsrs_reps=5,fsrs_last_grade=3,next_review_at='2026-11-01T00:00:00Z'",[user,f.entry,f.direction]);
   f.revision=(await c.query("select get_meaning_learning_progress_v1($1) value",[f.entry])).rows[0].value.revision;
   const other=f.direction==='word-to-definition'?'definition-to-word':'word-to-definition';
   await c.query('savepoint outoforder');await expect(save(c,user,{...f,direction:other},[other])).rejects.toThrow('training_session_member_unavailable');await c.query('rollback to savepoint outoforder');
   expect((await c.query("select count(*)::int n from user_card_known_marks where user_id=$1",[user])).rows[0].n).toBe(0);
   const state=(await save(c,user,f,[f.direction])).rows[0].value.progress.directions.find((d:{cardTypeId:string})=>d.cardTypeId===f.direction);
   expect(state).toMatchObject({gradedAttempts:5,stability:12.4,difficulty:4.1,lastGrade:3});
   expect(new Date(state.nextReviewAt).toISOString()).toBe('2026-11-01T00:00:00.000Z');
  },user);
 });
 test("client roles cannot call the principal mutation",async()=>{
  const user=randomUUID();await withTransaction(pool,async c=>{
   const f=await fixture(c,user);await c.query("select set_config('request.jwt.claim.role','authenticated',true)");
   await c.query('savepoint denied');await expect(save(c,user,f,[])).rejects.toThrow('unauthorized');await c.query('rollback to savepoint denied');
  },user);
 });
});
