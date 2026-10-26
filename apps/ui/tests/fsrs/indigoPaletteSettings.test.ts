import {afterAll,beforeAll,describe,expect,test} from 'vitest';
import {randomUUID} from 'crypto';
import {Pool} from 'pg';
import {getDbUrl,runMigrations,withTransaction} from './dbTestUtils';
const databaseUrl=getDbUrl();
const describeDb=databaseUrl?describe:describe.skip;
describeDb('Indigo account palette storage',()=>{
 const pool=new Pool({connectionString:databaseUrl});
 beforeAll(async()=>{await runMigrations(pool);});
 afterAll(async()=>{await pool.end();});
 test('preserves default and other settings, permits Indigo only on the owned row',async()=>{
  await withTransaction(pool,async client=>{
   const owner=randomUUID(),other=randomUUID();
   await client.query('insert into auth.users(id,email) values($1,$2),($3,$4)',[owner,`${owner}@test.local`,other,`${other}@test.local`]);
   await client.query('set local role authenticated');
   await client.query("select set_config('request.jwt.claim.sub',$1,true)",[owner]);
   const before=await client.query('select practice_palette,theme_preference,reading_size_phone from user_settings where user_id=$1',[owner]);
   expect(before.rows[0].practice_palette).toBe('lavender');
   await client.query("update user_settings set practice_palette='indigo' where user_id=$1",[owner]);
   const after=await client.query('select practice_palette,theme_preference,reading_size_phone from user_settings where user_id=$1',[owner]);
   expect(after.rows[0]).toEqual({...before.rows[0],practice_palette:'indigo'});
   const foreign=await client.query("update user_settings set practice_palette='indigo' where user_id=$1",[other]);
   expect(foreign.rowCount).toBe(0);
   for(const palette of ['blue','graphite','lavender']) await client.query('update user_settings set practice_palette=$2 where user_id=$1',[owner,palette]);
   await client.query('savepoint invalid_palette');
   await expect(client.query("update user_settings set practice_palette='not-a-palette' where user_id=$1",[owner])).rejects.toMatchObject({code:'23514'});
   await client.query('rollback to savepoint invalid_palette');
  });
 });
});
