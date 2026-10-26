import {Pool} from 'pg';
import {afterAll,beforeAll,describe,expect,test} from 'vitest';
import {getDbUrl,runMigrations,withTransaction} from './dbTestUtils';
const url=getDbUrl();
(url?describe:describe.skip)('metadata-only runtime health',()=>{
 const pool=new Pool({connectionString:url});beforeAll(()=>runMigrations(pool));afterAll(()=>pool.end());
 test('service-role readiness does not grant article reads or expose schema definitions',async()=>withTransaction(pool,async c=>{
  await c.query('set local role service_role');expect((await c.query('select platform_rpc_contract_ready_v1() ready')).rows[0].ready).toBe(true);
  expect((await c.query("select has_function_privilege(current_user,'public.fetch_dictionary_entry_by_id_gated(uuid)','EXECUTE') allowed")).rows[0].allowed).toBe(false);
  await c.query('reset role');for(const role of ['anon','authenticated'])expect((await c.query("select has_function_privilege($1,'public.platform_rpc_contract_ready_v1()','EXECUTE') allowed",[role])).rows[0].allowed).toBe(false);
 }));
});
