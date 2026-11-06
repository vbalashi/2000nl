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
  const dictionary=await configured(c),id=await account(c),first=await settings(c,id),item=first.training_setups.trainings[0];
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
  await c.query('update private.starter_training_config set dictionary_id=null');const id=await account(c);expect(await state(c,id)).toEqual({status:'pending',last_failure:'primary_dictionary_unavailable'});
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
  const id=await account(c);expect(await state(c,id)).toEqual({status:'pending',last_failure:'spoken_frequency_unavailable'});
  await c.query("insert into private.vocabulary_frequency_ranks values('nl','spoken','starter100',100)");
  await c.query("select set_config('request.jwt.claim.sub',$1,true)",[id]);
  await c.query('set local role authenticated');
  expect((await c.query('select public.retry_starter_training_v1() result')).rows[0].result).toBe('complete');
  await c.query('reset role');expect((await settings(c,id)).training_setups.trainings).toHaveLength(1);
 }));

});
