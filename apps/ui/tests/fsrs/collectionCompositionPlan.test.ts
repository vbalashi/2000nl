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
   for(const operation of [{action:'delete',userId:owner},{action:'remove',entryIds:[]}]){
    await c.query('savepoint invalid_plan');
    await expect(c.query('select prepare_collection_composition_v1($1,$2)',[list,operation])).rejects.toThrow('invalid_collection_operation');
    await c.query('rollback to savepoint invalid_plan');
   }
   const plan=(await c.query('select prepare_collection_composition_v1($1,$2) value',[list,{action:'remove',entryIds:[entry]}])).rows[0].value;
   const outsider=randomUUID();await ensureUserWithSettings(c,outsider);
   await c.query("select set_config('request.jwt.claim.sub',$1,true)",[outsider]);
   await c.query('set local role authenticated');
   expect((await c.query('select read_collection_composition_plan_v1($1) value',[plan.planId])).rows[0].value).toEqual({planId:plan.planId,status:'unknown'});
   await c.query('savepoint outsider_confirm');
   await expect(c.query('select confirm_collection_composition_v1($1)',[plan.planId])).rejects.toThrow('collection_plan_unavailable');
   await c.query('rollback to savepoint outsider_confirm');await c.query('reset role');
   await c.query("select set_config('request.jwt.claim.sub',$1,true)",[owner]);

   expect((await c.query('select count(*)::int n from user_word_list_items where list_id=$1',[list])).rows[0].n).toBe(1);
   await c.query('set local role authenticated');
   for (const table of ['user_word_lists','user_word_list_items']) {
    for (const privilege of ['INSERT','UPDATE','DELETE','TRUNCATE']) {
     expect((await c.query('select has_table_privilege(current_user,$1,$2) allowed',[table,privilege])).rows[0].allowed).toBe(false);
    }
   }
   expect((await c.query('select read_collection_composition_plan_v1($1) value',[plan.planId])).rows[0].value.status).toBe('pending');
   const receipt=(await c.query('select confirm_collection_composition_v1($1) value',[plan.planId])).rows[0].value;
   expect(receipt.status).toBe('committed');
   expect((await c.query('select confirm_collection_composition_v1($1) value',[plan.planId])).rows[0].value).toEqual(receipt);
   expect((await c.query('select read_collection_composition_plan_v1($1) value',[plan.planId])).rows[0].value).toEqual(receipt);
   await c.query('reset role');
   expect((await c.query('select count(*)::int n from user_word_list_items where list_id=$1',[list])).rows[0].n).toBe(0);
   await c.query('insert into user_word_list_items(list_id,word_id) values($1,$2)',[list,entry]);
   const stale=(await c.query('select prepare_collection_composition_v1($1,$2) value',[list,{action:'remove',entryIds:[entry]}])).rows[0].value;
   const second=await insertWord(c,'intervening');
   await c.query('insert into user_word_list_items(list_id,word_id) values($1,$2)',[list,second]);
   await c.query('savepoint stale_composition');
   await expect(c.query('select confirm_collection_composition_v1($1)',[stale.planId])).rejects.toThrow('collection_audience_changed');
   await c.query('rollback to savepoint stale_composition');
   expect((await c.query('select count(*)::int n from user_word_list_items where list_id=$1',[list])).rows[0].n).toBe(2);

  });
 });
});
