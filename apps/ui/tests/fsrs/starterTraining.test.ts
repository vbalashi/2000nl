import {afterAll,beforeAll,describe,expect,test} from 'vitest';
import {randomUUID} from 'node:crypto';
import {Pool,type PoolClient} from 'pg';
import {getDbUrl,runMigrations,withTransaction} from './dbTestUtils';
const url=getDbUrl();
async function account(c:PoolClient){const id=randomUUID();await c.query('insert into auth.users(id,email) values($1,$2)',[id,`${id}@test.local`]);return id;}
async function configured(c:PoolClient){
 const id=(await c.query(`insert into dictionaries(language_code,slug,name,kind,visibility,publication_state,minimum_subscription_tier) values('nl',$1,'Fixture','curated','system','general','free') returning id`,[`starter-${randomUUID()}`])).rows[0].id;
 await c.query("delete from private.vocabulary_frequency_profiles where language_code='nl' and profile='spoken'");
 await c.query("insert into private.vocabulary_frequency_profiles(language_code,profile,revision,max_rank) values('nl','spoken','test',100)");
 await c.query("insert into private.vocabulary_frequency_ranks select 'nl','spoken','starter'||n,n from generate_series(1,100) n");
 await c.query(`insert into word_entries(dictionary_id,language_code,headword,meaning_id,raw) select $1,'nl','starter'||n,1,'{"definition":"test"}'::jsonb from generate_series(1,100) n`,[id]);
 await c.query('update private.starter_training_config set dictionary_id=$1 where singleton',[id]);return id;
}
const settings=async(c:PoolClient,id:string)=>(await c.query('select training_setups,training_setups_revision from user_settings where user_id=$1',[id])).rows[0];
const state=async(c:PoolClient,id:string)=>(await c.query('select status,last_failure from private.starter_training_initializations where user_id=$1',[id])).rows[0];
describe.skipIf(!url)('new learner starter training',()=>{
 const pool=new Pool({connectionString:url});beforeAll(()=>runMigrations(pool),120000);afterAll(()=>pool.end());
 test('persists one main recipe, survives reload and deletion',()=>withTransaction(pool,async c=>{
  const dictionary=await configured(c),id=await account(c);
  expect(await state(c,id)).toEqual({status:'pending',last_failure:null});
  await c.query('select private.initialize_starter_training_v1($1)',[id]);
  const first=await settings(c,id),item=first.training_setups.trainings[0];
  expect(first.training_setups.mainTrainingId).toBe(item.id);expect(first.training_setups_revision).toBe(1);
  expect(item).toMatchObject({name:'Dilum Nederlands — Top 100',languageCode:'nl',draft:{dictionaryIds:[dictionary],modes:['word-to-definition','definition-to-word'],sessionSize:10,vocabulary:{mode:'frequency',profile:'spoken',from:1,to:100}}});
  expect(await state(c,id)).toEqual({status:'complete',last_failure:null});
  await c.query("select set_config('request.jwt.claim.sub',$1,true)",[id]);
  const filter={dictionaryScope:{mode:'selected',languageCode:'nl',dictionaryIds:[dictionary]},vocabulary:item.draft.vocabulary};
  const candidates=(await c.query("select card_type_id from private.training_scheduler_candidates_v2($1,ARRAY['word-to-definition','definition-to-word'],null,'curated','both','auto',ARRAY[]::uuid[],ARRAY[]::text[],$2,false,false) where queue_source='new'",[id,filter])).rows;
  expect(candidates.length).toBeGreaterThan(0);expect(candidates.every((row:{card_type_id:string})=>row.card_type_id==='word-to-definition')).toBe(true);
  await c.query('select private.initialize_starter_training_v1($1)',[id]);expect(await settings(c,id)).toEqual(first);
  await c.query(`update user_settings set training_setups='{"schemaVersion":1,"trainings":[],"mainTrainingId":null}',training_setups_revision=2 where user_id=$1`,[id]);
  await c.query('select private.initialize_starter_training_v1($1)',[id]);expect((await settings(c,id)).training_setups.trainings).toEqual([]);
 }));
 test('registration survives missing configuration; retry repairs only untouched accounts',()=>withTransaction(pool,async c=>{
  await c.query('update private.starter_training_config set dictionary_id=null');const id=await account(c);await c.query('select private.initialize_starter_training_v1($1)',[id]);expect(await state(c,id)).toEqual({status:'pending',last_failure:'primary_dictionary_unavailable'});
  const other=await account(c);await c.query('update user_settings set training_setups_revision=1 where user_id=$1',[other]);await configured(c);
  expect((await c.query('select private.initialize_starter_training_v1($1) result',[id])).rows[0].result).toBe('complete');expect((await settings(c,id)).training_setups.trainings).toHaveLength(1);
  expect((await c.query('select private.initialize_starter_training_v1($1) result',[other])).rows[0].result).toBe('superseded');
 }));
 test('existing accounts without a marker are never changed',()=>withTransaction(pool,async c=>{
  await configured(c);const id=await account(c);await c.query('delete from private.starter_training_initializations where user_id=$1',[id]);const before=await settings(c,id);
  expect((await c.query('select private.initialize_starter_training_v1($1) result',[id])).rows[0].result).toBe('not_applicable');expect(await settings(c,id)).toEqual(before);
 }));
 test('frequency gaps remain pending until corrected; authenticated retry is scoped to its caller',()=>withTransaction(pool,async c=>{
  await configured(c);await c.query("delete from private.vocabulary_frequency_ranks where language_code='nl' and profile='spoken' and rank=100");
  const id=await account(c);await c.query('select private.initialize_starter_training_v1($1)',[id]);expect(await state(c,id)).toEqual({status:'pending',last_failure:'spoken_frequency_unavailable'});
  await c.query("insert into private.vocabulary_frequency_ranks values('nl','spoken','starter100',100)");
  await c.query("select set_config('request.jwt.claim.sub',$1,true)",[id]);
  await c.query('set local role authenticated');
  expect((await c.query('select public.retry_starter_training_v1() result')).rows[0].result).toBe('complete');
  await c.query('reset role');expect((await settings(c,id)).training_setups.trainings).toHaveLength(1);
 }));

 test('unrenderable material remains pending even when all ranks match',()=>withTransaction(pool,async c=>{
  const dictionary=await configured(c),id=await account(c);
  await c.query('insert into private.unrenderable_ordinary_direct_entries_v1(entry_id) select id from word_entries where dictionary_id=$1 on conflict do nothing',[dictionary]);
  expect((await c.query('select private.initialize_starter_training_v1($1) result',[id])).rows[0].result).toBe('pending');
  expect(await state(c,id)).toEqual({status:'pending',last_failure:'starter_cards_unavailable'});
 }));
 test('registration does not wait for a locked dictionary configuration',async()=>{
  const blocker=await pool.connect(),registrar=await pool.connect();
  try {
   await blocker.query('begin');await blocker.query('lock table private.starter_training_config in access exclusive mode');
   await registrar.query('begin');await registrar.query("set local statement_timeout='800ms'");
   const id=await account(registrar);expect(await state(registrar,id)).toEqual({status:'pending',last_failure:null});
  } finally {await registrar.query('rollback');await blocker.query('rollback');registrar.release();blocker.release();}
 });

 test('unexpected initializer errors leave an explicit retryable failure',()=>withTransaction(pool,async c=>{
  const id=await account(c);await c.query("select set_config('request.jwt.claim.sub',$1,true)",[id]);
  await c.query(`create or replace function private.initialize_starter_training_v1(p_user_id uuid) returns text language plpgsql as $$ begin raise exception 'fixture failure'; end $$`);
  expect((await c.query('select public.retry_starter_training_v1() result')).rows[0].result).toBe('pending');
  expect(await state(c,id)).toEqual({status:'pending',last_failure:'unexpected_error'});
 }));

 test('atomic read distinguishes pending, completed and existing accounts',()=>withTransaction(pool,async c=>{
  await configured(c);const id=await account(c);
  await c.query("select set_config('request.jwt.claim.sub',$1,true)",[id]);
  const snapshot=async()=>(await c.query('select public.read_account_starter_snapshot_v1() value')).rows[0].value;
  expect(await snapshot()).toMatchObject({revision:0,starterStatus:'pending',document:{trainings:[]}});
  await c.query('select public.retry_starter_training_v1()');
  const complete=await snapshot();expect(complete.starterStatus).toBe('complete');expect(complete.document.trainings).toHaveLength(1);
  await c.query('delete from private.starter_training_initializations where user_id=$1',[id]);
  expect((await snapshot()).starterStatus).toBe('not_applicable');
 }));

 test('concurrent creation never combines an empty recipe with complete status',async()=>{
  const writer=await pool.connect(),reader=await pool.connect();let id='';
  try {
   await writer.query('begin');id=await account(writer);await writer.query('commit');
   await reader.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);
   await writer.query('begin');
   await writer.query(`update user_settings set training_setups='{"schemaVersion":1,"trainings":[{"id":"x"}],"mainTrainingId":"x"}', training_setups_revision=1 where user_id=$1`,[id]);
   await writer.query("update private.starter_training_initializations set status='complete' where user_id=$1",[id]);
   const before=(await reader.query('select public.read_account_starter_snapshot_v1() value')).rows[0].value;
   expect(before).toMatchObject({starterStatus:'pending',document:{trainings:[]}});
   await writer.query('commit');
   const after=(await reader.query('select public.read_account_starter_snapshot_v1() value')).rows[0].value;
   expect(after.starterStatus).toBe('complete');expect(after.document.trainings).toHaveLength(1);
  } finally {await writer.query('rollback');await writer.query('delete from auth.users where id=$1',[id]);writer.release();reader.release();}
 });
 test('direct reader and retry respect admission denial',()=>withTransaction(pool,async c=>{
  const id=await account(c);await c.query("select set_config('request.jwt.claim.sub',$1,true)",[id]);
  await c.query("update private.admission_control set enabled=true,mode='approval-required'");
  await c.query('set local role authenticated');
  for(const fn of ['read_account_starter_snapshot_v1','retry_starter_training_v1']) {
   await c.query('savepoint denied');await expect(c.query(`select public.${fn}()`)).rejects.toThrow('unauthorized');await c.query('rollback to savepoint denied');
  }
  await c.query('reset role');expect(await state(c,id)).toEqual({status:'pending',last_failure:null});
 }));

});
