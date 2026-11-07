import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {beforeAll,afterAll,describe,test,expect} from 'vitest';
import {getDbUrl,runMigrations,ensureUserWithSettings,insertWord,withTransaction} from './dbTestUtils';
const url=getDbUrl();
(url?describe:describe.skip)('collection composition confirmation',()=>{
 const pool=new Pool({connectionString:url});beforeAll(()=>runMigrations(pool));afterAll(()=>pool.end());
 test('confirmed removal applies once and replays',async()=>{
  await withTransaction(pool,async c=>{
   const owner=randomUUID(),list=randomUUID();await ensureUserWithSettings(c,owner);
   await c.query("select set_config('request.jwt.claim.sub',$1,true)",[owner]);
   const entry=await insertWord(c,'composition');
   await c.query('insert into user_word_lists(id,user_id,name) values($1,$2,$3)',[list,owner,'collection']);
   await c.query('insert into user_word_list_items(list_id,word_id) values($1,$2)',[list,entry]);
   const plan=(await c.query('select prepare_collection_composition_v1($1,$2) value',[list,{action:'remove',entryIds:[entry]}])).rows[0].value;
   expect((await c.query('select count(*)::int n from user_word_list_items where list_id=$1',[list])).rows[0].n).toBe(1);
   const receipt=(await c.query('select confirm_collection_composition_v1($1) value',[plan.planId])).rows[0].value;
   expect(receipt.status).toBe('committed');
   expect((await c.query('select confirm_collection_composition_v1($1) value',[plan.planId])).rows[0].value).toEqual(receipt);
   expect((await c.query('select count(*)::int n from user_word_list_items where list_id=$1',[list])).rows[0].n).toBe(0);
  });
 });
});
