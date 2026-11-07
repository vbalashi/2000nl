import {readFileSync} from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {beforeAll,afterAll,describe,test,expect} from 'vitest';
import {getDbUrl,runMigrations,ensureUserWithSettings,withTransaction} from './dbTestUtils';
const url=getDbUrl();
(url?describe:describe.skip)('label organization confirmation plan',()=>{
 const pool=new Pool({connectionString:url});beforeAll(async()=>{await runMigrations(pool);await pool.query(readFileSync(path.resolve(process.cwd(),'../../db/deploy-contract/label-group-sharing-probe.sql'),'utf8'));});afterAll(()=>pool.end());
 test('preview rolls back organization and confirm is replayable',async()=>{
  await withTransaction(pool,async c=>{
   const owner=randomUUID(),label=randomUUID();await ensureUserWithSettings(c,owner);
   await c.query("select set_config('request.jwt.claim.sub',$1,true)",[owner]);
   const operation={type:'create',id:label,name:'planned'};
   const plan=(await c.query('select prepare_label_organization_v1($1,$2) value',[0,operation])).rows[0].value;
   expect(plan.planId).toMatch(/^[0-9a-f-]{36}$/);
   expect((await c.query('select read_label_organization_plan_v1($1) value',[plan.planId])).rows[0].value.status).toBe('pending');
   expect((await c.query('select count(*)::int n from private.collection_labels where id=$1',[label])).rows[0].n).toBe(0);
   const result=(await c.query('select confirm_label_organization_v1($1) value',[plan.planId])).rows[0].value;
   expect(result.revision).toBe(1);
   expect((await c.query('select read_label_organization_plan_v1($1) value',[plan.planId])).rows[0].value).toEqual({planId:plan.planId,status:'committed',result});
   expect((await c.query('select confirm_label_organization_v1($1) value',[plan.planId])).rows[0].value).toEqual(result);
   expect((await c.query('select name from private.collection_labels where id=$1',[label])).rows[0].name).toBe('planned');
   const pending=(await c.query('select prepare_label_organization_v1($1,$2) value',[1,{type:'update',id:label,name:'pending'}])).rows[0].value;
   await c.query('select mutate_collection_labels_v1($1,$2,$3)',[owner,1,{type:'update',id:label,name:'intervening'}]);
   await c.query('savepoint changed_plan');
   await expect(c.query('select confirm_label_organization_v1($1)',[pending.planId])).rejects.toThrow('label_audience_changed');
   await c.query('rollback to savepoint changed_plan');
   expect((await c.query('select name from private.collection_labels where id=$1',[label])).rows[0].name).toBe('intervening');
   await c.query("select mutate_label_share_v1($1,'open',0)",[label]);
   await c.query('set local role authenticated');
   await c.query('savepoint bypass');
   await expect(c.query('select mutate_collection_labels_v1($1,$2,$3)',[owner,2,{type:'update',id:label,name:'bypass'}])).rejects.toThrow('label_audience_confirmation_required');
   await c.query('rollback to savepoint bypass');
   await c.query('reset role');
   expect((await c.query("select has_function_privilege('authenticated','private.mutate_collection_labels_core_v1(uuid,bigint,jsonb)','execute') allowed")).rows[0].allowed).toBe(false);


  });
 });
});
