import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { ensureUserWithSettings, getDbUrl, runMigrations, withTransaction } from './dbTestUtils';
const dbUrl=getDbUrl();
const describeIfDb=dbUrl?describe:describe.skip;
describeIfDb('operator notification events',()=>{
 const pool=new Pool({connectionString:dbUrl});
 beforeAll(async()=>{await runMigrations(pool);},120000);
 afterAll(async()=>{await pool.end();});
 test('approval is atomic and replay cannot create another approval email',async()=>{
  await withTransaction(pool,async client=>{
   await client.query('update private.operator_notification_settings set enabled=true where singleton');
   const user=randomUUID(),operator=randomUUID(),email=`${randomUUID()}@example.test`;
   await ensureUserWithSettings(client,user);await ensureUserWithSettings(client,operator);
   await client.query('update auth.users set email=$2,email_confirmed_at=now() where id=$1',[user,email]);
   await client.query("insert into public.admin_operators(email,user_id,is_active,permissions) values($1,$2,true,ARRAY['admission.manage'])",[`op-${email}`,operator]);
   await client.query("insert into private.admission_requests(email,user_id,status) values($1,$2,'pending')",[email,user]);
   await client.query('update private.admission_requests set user_id=$2 where email=$1',[email,user]);
   const events=await client.query("select id from private.operator_notification_events where admission_email=$1",[email]);
   expect(events.rows).toHaveLength(1);
   const event=events.rows[0].id;
   await client.query('savepoint before_denied');
   await expect(client.query("select public.operator_notification_decide_v1($1,$2,'approve',$3)",[event,user,randomUUID()])).rejects.toThrow();
   await client.query('rollback to savepoint before_denied');
   const claimed=(await client.query('select public.operator_notification_claim_v1(10) event')).rows.map(row=>row.event).find(row=>row.id===event);
   expect(claimed).toMatchObject({kind:'admission-request',email,attempts:1});
   expect((await client.query("select public.operator_notification_settle_v1($1,$2,'sent',null) ok",[event,randomUUID()])).rows[0].ok).toBe(false);
   expect((await client.query("select public.operator_notification_settle_v1($1,$2,'sent',null) ok",[event,claimed.leaseId])).rows[0].ok).toBe(true);
   expect((await client.query("select public.operator_notification_decide_v1($1,$2,'approve',$3) result",[event,operator,randomUUID()])).rows[0].result).toBe('decided');
   expect((await client.query("select public.operator_notification_decide_v1($1,$2,'reject',$3) result",[event,operator,randomUUID()])).rows[0].result).toBe('already_decided');
   expect((await client.query("select kind from private.operator_notification_events where admission_email=$1 order by created_at",[email])).rows.map(x=>x.kind)).toEqual(['admission-request','admission-approved']);
  });
 });
});
