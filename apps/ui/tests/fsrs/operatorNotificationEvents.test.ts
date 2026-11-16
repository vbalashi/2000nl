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
   const bots=[randomUUID(),randomUUID()];
   for(const bot of bots){
    await client.query("insert into private.operator_notification_bots(id,name,credential_state,secret_version) values($1,'synthetic','ready',$2)",[bot,'a'.repeat(32)]);
    await client.query("insert into private.operator_notification_routes(bot_id,kind,chat_id,enabled) values($1,'feedback','-100123',true)",[bot]);
   }

   await ensureUserWithSettings(client,user);
   await client.query(`insert into public.feedback_items(id,reporter_user_id,reporter_pseudonym,report_id,source_client,app_build_version,kind,problem_type,target_kind,target,comment_present,sanitized_summary)
    values($1,$2,'usr_0123456789abcdef01234567',$3,'web','1','content-quality','other','entry','{}',true,'private text')`,[feedback,user,report]);
   const rows=(await client.query('select kind,feedback_id,admission_email from private.operator_notification_events where feedback_id=$1',[feedback])).rows;
   expect(rows).toEqual([{kind:'feedback',feedback_id:feedback,admission_email:null}]);
   const deliveries=(await client.query('select * from private.operator_notification_deliveries where event_id in (select id from private.operator_notification_events where feedback_id=$1)',[feedback])).rows;
   expect(deliveries).toHaveLength(2);
   const claimed=(await client.query('select public.operator_delivery_claim_v1(50) item')).rows.map(row=>row.item).filter(item=>item.feedbackId===feedback);
   expect(claimed).toHaveLength(2);
   expect((await client.query("select public.operator_delivery_settle_v1($1,$2,'sent',null) ok",[claimed[0].id,claimed[0].leaseId])).rows[0].ok).toBe(true);
   expect((await client.query("select public.operator_delivery_settle_v1($1,$2,'retry',30) ok",[claimed[1].id,claimed[1].leaseId])).rows[0].ok).toBe(true);
   expect((await client.query('select state from private.operator_notification_deliveries where id=ANY($1::uuid[]) order by state',[claimed.map(item=>item.id)])).rows.map(row=>row.state)).toEqual(['pending','sent']);

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
   const approved=(await client.query('select public.operator_notification_claim_v1(10) event')).rows.map(row=>row.event).find(row=>row.kind==='admission-approved' && row.email===email);
   expect(approved.emailVerified).toBe(true);
   await client.query('update auth.users set email_confirmed_at=null where id=$1',[user]);
   await client.query("update private.operator_notification_events set lease_until=clock_timestamp()-interval '1 second' where id=$1",[approved.id]);
   const reclaimed=(await client.query('select public.operator_notification_claim_v1(10) event')).rows.map(row=>row.event).find(row=>row.id===approved.id);
   expect(reclaimed.emailVerified).toBe(false);
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

 test('a concurrent revocation wins before a waiting Telegram decision',async()=>{
  const operator=randomUUID(), event=randomUUID(), email=`${randomUUID()}@example.test`;
  const locker=await pool.connect(), worker=await pool.connect();
  try {
   await pool.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[operator,`op-${email}`]);
   await pool.query("insert into public.admin_operators(email,user_id,is_active,permissions) values($1,$2,true,ARRAY['admission.manage'])",[`op-${email}`,operator]);
   await pool.query("insert into private.admission_requests(email,status) values($1,'pending')",[email]);
   await pool.query("insert into private.operator_notification_events(id,kind,admission_email) values($1,'admission-request',$2)",[event,email]);
   const lockerPid=(await locker.query('select pg_backend_pid() pid')).rows[0].pid;
   const workerPid=(await worker.query('select pg_backend_pid() pid')).rows[0].pid;
   await locker.query('begin');
   await locker.query('update public.admin_operators set is_active=false where user_id=$1',[operator]);
   await worker.query('begin');
   await worker.query("set local statement_timeout='5s'");
   const decision=worker.query("select public.operator_notification_decide_v1($1,$2,'approve',$3)",[event,operator,randomUUID()]).then(()=>null,error=>error);
   let blocked=false;
   for(let attempt=0;attempt<100;attempt++){
    blocked=(await pool.query('select $1=ANY(pg_blocking_pids($2)) blocked',[lockerPid,workerPid])).rows[0].blocked;
    if(blocked)break;
    await new Promise(resolve=>setTimeout(resolve,20));
   }
   expect(blocked).toBe(true);
   await locker.query('commit');
   expect(await decision).toMatchObject({code:'42501'});
   await worker.query('rollback');
   expect((await pool.query('select status from private.admission_requests where email=$1',[email])).rows[0].status).toBe('pending');
  } finally {
   await locker.query('rollback').catch(()=>{});await worker.query('rollback').catch(()=>{});
   locker.release();worker.release();
   await pool.query('delete from private.operator_notification_events where id=$1',[event]);
   await pool.query('delete from private.admission_requests where email=$1',[email]);
   await pool.query('delete from public.admin_operators where user_id=$1',[operator]);
   await pool.query('delete from auth.users where id=$1',[operator]);
  }
 },10000);

 test('configuration requires its own permission and audits multiple bots without secrets',async()=>{
  await withTransaction(pool,async client=>{
   const operator=randomUUID();await ensureUserWithSettings(client,operator);
   await client.query("insert into public.admin_operators(email,user_id,is_active,permissions) values($1,$2,true,ARRAY['feedback.read'])",[`${operator}@example.test`,operator]);
   await client.query('savepoint denied_config');
   await expect(client.query('select public.admin_notification_create_bot_v1($1,$2,$3)',[operator,randomUUID(),'Reports'])).rejects.toMatchObject({code:'42501'});
   await client.query('rollback to savepoint denied_config');
   await client.query("update public.admin_operators set permissions=ARRAY['notifications.manage'] where user_id=$1",[operator]);
   const first=(await client.query('select public.admin_notification_create_bot_v1($1,$2,$3) bot',[operator,randomUUID(),'Reports'])).rows[0].bot;
   const second=(await client.query('select public.admin_notification_create_bot_v1($1,$2,$3) bot',[operator,randomUUID(),'Admissions'])).rows[0].bot;
   expect(first.id).not.toBe(second.id);expect(first.credentialState).toBe('missing');
   const save=(id:string|null,revision:number,topic:number|null)=>client.query('select public.admin_notification_save_route_v1($1,$2,$3,$4,$5,$6,$7,$8,$9) route',[operator,randomUUID(),id,revision,first.id,'feedback','-100123',topic,false]);
   const route=(await save(null,0,null)).rows[0].route;
   expect(route).toMatchObject({botId:first.id,topicId:null,revision:1});
   expect((await save(route.id,1,7)).rows[0].route).toMatchObject({topicId:7,revision:2});
   await client.query('savepoint stale_route');
   await expect(save(route.id,1,8)).rejects.toMatchObject({code:'40001'});
   await client.query('rollback to savepoint stale_route');

   const config=(await client.query('select public.admin_notification_configuration_v1($1,$2) config',[operator,randomUUID()])).rows[0].config;
   expect(config.bots.map((bot:{id:string})=>bot.id)).toEqual(expect.arrayContaining([first.id,second.id]));
   expect(JSON.stringify(config)).not.toMatch(/secret_version|token|secretVersion/);
   const operation=randomUUID();
   await client.query('select public.admin_notification_begin_secret_v1($1,$2,$3,1)',[operator,operation,first.id]);
   expect((await client.query('select public.admin_notification_finish_secret_v1($1,$2,$3,$4,$5) ok',[operator,randomUUID(),first.id,randomUUID(),'a'.repeat(32)])).rows[0].ok).toBe(false);
   expect((await client.query('select public.admin_notification_finish_secret_v1($1,$2,$3,$4,$5) ok',[operator,randomUUID(),first.id,operation,'a'.repeat(32)])).rows[0].ok).toBe(true);
   expect((await client.query('select public.admin_notification_finish_secret_v1($1,$2,$3,$4,$5) ok',[operator,randomUUID(),first.id,operation,'b'.repeat(32)])).rows[0].ok).toBe(false);

   expect((await client.query("select action from public.admin_audit_events where operator_user_id=$1 and action like 'notifications.%'",[operator])).rows).toHaveLength(7);
   expect((await client.query("select has_table_privilege('authenticated','private.operator_notification_bots','select') allowed")).rows[0].allowed).toBe(false);
  });
 });

});
