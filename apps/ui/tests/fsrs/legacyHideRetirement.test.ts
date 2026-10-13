import {randomUUID} from 'node:crypto';
import {Pool, type PoolClient} from 'pg';
import {afterAll,beforeAll,describe,expect,test} from 'vitest';
import {ensureUserWithSettings,getDbUrl,insertWord,runMigrations,withTransaction} from './dbTestUtils';
const dbUrl=getDbUrl();
describe.skipIf(!dbUrl)('legacy hide retirement',()=>{
 const pool=new Pool({connectionString:dbUrl});
 beforeAll(async()=>{await runMigrations(pool);},120_000);
 afterAll(async()=>{await pool.end();});
 async function fixture(c:PoolClient){
  const user=randomUUID();await ensureUserWithSettings(c,user);
  await c.query("select set_config('request.jwt.claim.sub',$1,true)",[user]);
  const entry=await insertWord(c,`hide-retirement-${randomUUID()}`);
  await c.query("insert into user_card_status(user_id,entry_id,card_type_id,hidden,click_count) values($1,$2,'word-to-definition',false,0)",[user,entry]);
  return {user,entry};
 }
 async function review(c:PoolClient,user:string,entry:string,result:string,turn:string|null=null){
  return c.query("select handle_card_review($1,$2,'word-to-definition',$3,$4)",[user,entry,result,turn]);
 }
 test.each([false,true])('rejects hide without side effects, including consumed turn=%s',async(consumed)=>withTransaction(pool,async c=>{
  const {user,entry}=await fixture(c),turn=randomUUID();
  if(consumed)await review(c,user,entry,'success',turn);
  const before=(await c.query('select to_jsonb(s) as value from user_card_status s where user_id=$1 and entry_id=$2',[user,entry])).rows;
  const history=(await c.query('select count(*) from user_review_log where user_id=$1',[user])).rows;
  const events=(await c.query('select count(*) from user_events where user_id=$1',[user])).rows;
  await c.query('savepoint rejected_hide');
  try{await expect(review(c,user,entry,'hide',consumed?turn:null)).rejects.toMatchObject({code:'22023',message:'legacy_hide_disabled'});}
  finally{await c.query('rollback to savepoint rejected_hide');}
  expect((await c.query('select to_jsonb(s) as value from user_card_status s where user_id=$1 and entry_id=$2',[user,entry])).rows).toEqual(before);
  expect((await c.query('select count(*) from user_review_log where user_id=$1',[user])).rows).toEqual(history);
  expect((await c.query('select count(*) from user_events where user_id=$1',[user])).rows).toEqual(events);
 }));
 test.each(['fail','hard','success','easy'])('preserves ordinary result %s',async result=>withTransaction(pool,async c=>{
  const {user,entry}=await fixture(c);await review(c,user,entry,result,randomUUID());
  const state=(await c.query('select hidden,fsrs_reps from user_card_status where user_id=$1 and entry_id=$2',[user,entry])).rows[0];
  expect(state).toEqual({hidden:false,fsrs_reps:1});
  expect(Number((await c.query('select count(*) from user_review_log where user_id=$1',[user])).rows[0].count)).toBe(1);
 }));
 test('preserves freeze without a fabricated grade',async()=>withTransaction(pool,async c=>{
  const {user,entry}=await fixture(c);await review(c,user,entry,'freeze');
  const state=(await c.query('select hidden,frozen_until is not null as frozen,fsrs_reps from user_card_status where user_id=$1 and entry_id=$2',[user,entry])).rows[0];
  expect(state).toEqual({hidden:false,frozen:true,fsrs_reps:0});
 }));
});
