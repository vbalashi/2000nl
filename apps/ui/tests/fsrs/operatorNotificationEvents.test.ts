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
 test('feedback event contains only the report identifier',async()=>{
  await withTransaction(pool,async client=>{
   await client.query('update private.operator_notification_settings set enabled=true where singleton');
   const user=randomUUID(), report=randomUUID(), feedback=randomUUID();
   await ensureUserWithSettings(client,user);
   await client.query(`insert into public.feedback_items(id,reporter_user_id,reporter_pseudonym,report_id,source_client,app_build_version,kind,problem_type,target_kind,target,comment_present,sanitized_summary)
    values($1,$2,'usr_0123456789abcdef01234567',$3,'web','1','content-quality','other','entry','{}',true,'private text')`,[feedback,user,report]);
   const rows=(await client.query('select kind,feedback_id,admission_email from private.operator_notification_events where feedback_id=$1',[feedback])).rows;
   expect(rows).toEqual([{kind:'feedback',feedback_id:feedback,admission_email:null}]);
  });
 });
 test('disabled mode does not enqueue and rejected requests do not send mail',async()=>{
  await withTransaction(pool,async client=>{
   const user=randomUUID(),operator=randomUUID(),email=`${randomUUID()}@example.test`;
   await ensureUserWithSettings(client,user);await ensureUserWithSettings(client,operator);
   await client.query('update auth.users set email=$2,email_confirmed_at=now() where id=$1',[user,email]);
   await client.query("insert into public.admin_operators(email,user_id,is_active,permissions) values($1,$2,true,ARRAY['admission.manage'])",[`op-${email}`,operator]);
   await client.query("insert into private.admission_requests(email,user_id,status) values($1,$2,'pending')",[email,user]);
   expect((await client.query('select id from private.operator_notification_events where admission_email=$1',[email])).rows).toHaveLength(0);
   await client.query('update private.operator_notification_settings set enabled=true where singleton');
   await client.query("select public.admin_admission_mutate($1,'reject',ARRAY[$2],null,$3)",[operator,email,randomUUID()]);
   expect((await client.query('select id from private.operator_notification_events where admission_email=$1',[email])).rows).toHaveLength(0);
   await client.query("select public.admin_admission_mutate($1,'approve',ARRAY[$2],null,$3)",[operator,email,randomUUID()]);
   expect((await client.query('select kind from private.operator_notification_events where admission_email=$1',[email])).rows.map(row=>row.kind)).toEqual(['admission-approved']);
  });
 });
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
 test('expired final lease fails and retention begins at completion',async()=>{
  await withTransaction(pool,async client=>{
   await client.query('update private.operator_notification_settings set enabled=true where singleton');
   const user=randomUUID(),report=randomUUID(),feedback=randomUUID();
   await ensureUserWithSettings(client,user);
   await client.query(`insert into public.feedback_items(id,reporter_user_id,reporter_pseudonym,report_id,source_client,app_build_version,kind,problem_type,target_kind,target,comment_present,sanitized_summary)
    values($1,$2,'usr_0123456789abcdef01234567',$3,'web','1','content-quality','other','entry','{}',false,'')`,[feedback,user,report]);
   const event=(await client.query('select id from private.operator_notification_events where feedback_id=$1',[feedback])).rows[0].id;
   await client.query("update private.operator_notification_events set state='leased',attempts=10,lease_id=$2,lease_until=clock_timestamp()-interval '1 second',created_at=clock_timestamp()-interval '100 days' where id=$1",[event,randomUUID()]);
   const claimed=(await client.query('select public.operator_notification_claim_v1(10) event')).rows;
   expect(claimed.some(row=>row.event.id===event)).toBe(false);
   expect((await client.query('select state,finished_at from private.operator_notification_events where id=$1',[event])).rows[0]).toMatchObject({state:'failed',finished_at:expect.any(Date)});
   await client.query('select public.operator_notification_cleanup_v1()');
   expect((await client.query('select id from private.operator_notification_events where id=$1',[event])).rows).toHaveLength(1);
   await client.query("update private.operator_notification_events set finished_at=clock_timestamp()-interval '91 days' where id=$1",[event]);
   await client.query('select public.operator_notification_cleanup_v1()');
   expect((await client.query('select id from private.operator_notification_events where id=$1',[event])).rows).toHaveLength(0);
  });
 });
 test('settlement cannot requeue a final attempt',async()=>{
  await withTransaction(pool,async client=>{
   await client.query('update private.operator_notification_settings set enabled=true where singleton');
   const user=randomUUID(),report=randomUUID(),feedback=randomUUID(),lease=randomUUID();
   await ensureUserWithSettings(client,user);
   await client.query(`insert into public.feedback_items(id,reporter_user_id,reporter_pseudonym,report_id,source_client,app_build_version,kind,problem_type,target_kind,target,comment_present,sanitized_summary)
    values($1,$2,'usr_0123456789abcdef01234567',$3,'web','1','content-quality','other','entry','{}',false,'')`,[feedback,user,report]);
   const event=(await client.query('select id from private.operator_notification_events where feedback_id=$1',[feedback])).rows[0].id;
   await client.query("update private.operator_notification_events set state='leased',attempts=10,lease_id=$2,lease_until=clock_timestamp()+interval '1 minute' where id=$1",[event,lease]);
   expect((await client.query("select public.operator_notification_settle_v1($1,$2,'retry',30) ok",[event,lease])).rows[0].ok).toBe(true);
   expect((await client.query('select state from private.operator_notification_events where id=$1',[event])).rows[0].state).toBe('failed');
  });
 });

 test('revoked operator cannot use an existing Telegram decision',async()=>{
  await withTransaction(pool,async client=>{
   await client.query('update private.operator_notification_settings set enabled=true where singleton');
   const user=randomUUID(),operator=randomUUID(),email=`${randomUUID()}@example.test`;
   await ensureUserWithSettings(client,user);await ensureUserWithSettings(client,operator);
   await client.query('update auth.users set email=$2,email_confirmed_at=now() where id=$1',[user,email]);
   await client.query("insert into public.admin_operators(email,user_id,is_active,permissions) values($1,$2,true,ARRAY['admission.manage'])",[`op-${email}`,operator]);
   await client.query("insert into private.admission_requests(email,user_id,status) values($1,$2,'pending')",[email,user]);
   const event=(await client.query('select id from private.operator_notification_events where admission_email=$1',[email])).rows[0].id;
   await client.query('update public.admin_operators set is_active=false where user_id=$1',[operator]);
   await client.query('savepoint denied');
   await expect(client.query("select public.operator_notification_decide_v1($1,$2,'approve',$3)",[event,operator,randomUUID()])).rejects.toMatchObject({code:'42501'});
   await client.query('rollback to savepoint denied');
   expect((await client.query('select status from private.admission_requests where email=$1',[email])).rows[0].status).toBe('pending');
  });
 });

});
