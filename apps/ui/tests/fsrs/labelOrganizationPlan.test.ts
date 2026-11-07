import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {beforeAll,afterAll,describe,test,expect} from 'vitest';
import {getDbUrl,runMigrations,ensureUserWithSettings,withTransaction} from './dbTestUtils';
const url=getDbUrl();
(url?describe:describe.skip)('label organization confirmation plan',()=>{
 const pool=new Pool({connectionString:url});beforeAll(()=>runMigrations(pool));afterAll(()=>pool.end());
 test('preview rolls back organization and confirm is replayable',async()=>{
  await withTransaction(pool,async c=>{
   const owner=randomUUID(),label=randomUUID();await ensureUserWithSettings(c,owner);
   await c.query("select set_config('request.jwt.claim.sub',$1,true)",[owner]);
   const operation={type:'create',id:label,name:'planned'};
   const plan=(await c.query('select prepare_label_organization_v1($1,$2) value',[0,operation])).rows[0].value;
   expect(plan.planId).toMatch(/^[0-9a-f-]{36}$/);
   expect((await c.query('select count(*)::int n from private.collection_labels where id=$1',[label])).rows[0].n).toBe(0);
   const result=(await c.query('select confirm_label_organization_v1($1) value',[plan.planId])).rows[0].value;
   expect(result.revision).toBe(1);
   expect((await c.query('select confirm_label_organization_v1($1) value',[plan.planId])).rows[0].value).toEqual(result);
   expect((await c.query('select name from private.collection_labels where id=$1',[label])).rows[0].name).toBe('planned');
   const pending=(await c.query('select prepare_label_organization_v1($1,$2) value',[1,{type:'update',id:label,name:'pending'}])).rows[0].value;
   await c.query('select mutate_collection_labels_v1($1,$2,$3)',[owner,1,{type:'update',id:label,name:'intervening'}]);
   await c.query('savepoint changed_plan');
   await expect(c.query('select confirm_label_organization_v1($1)',[pending.planId])).rejects.toThrow('label_audience_changed');
   await c.query('rollback to savepoint changed_plan');
   expect((await c.query('select name from private.collection_labels where id=$1',[label])).rows[0].name).toBe('intervening');

  });
 });
});
