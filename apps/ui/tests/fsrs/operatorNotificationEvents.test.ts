import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Pool, type PoolClient } from 'pg';
import { ensureUserWithSettings, getDbUrl, runMigrations, withTransaction } from './dbTestUtils';
const dbUrl=getDbUrl();
const describeIfDb=dbUrl?describe:describe.skip;
async function sentAdmission(client:Pool|PoolClient,event:string) {
 const result={id:randomUUID(),bot:randomUUID(),route:randomUUID(),version:'a'.repeat(32),chat:'-100123',topic:7};
 await client.query("insert into private.operator_notification_bots(id,name,credential_state,secret_version) values($1,'synthetic','ready',$2)",[result.bot,result.version]);
 await client.query("insert into private.operator_notification_routes(id,bot_id,kind,chat_id,topic_id,enabled) values($1,$2,'admission-request',$3,$4,true)",[result.route,result.bot,result.chat,result.topic]);
 await client.query("insert into private.operator_notification_deliveries(id,event_id,route_id,bot_id,route_revision,secret_version,chat_id,topic_id,transport,state,finished_at) values($1,$2,$3,$4,1,$5,$6,$7,'telegram','sent',now())",[result.id,event,result.route,result.bot,result.version,result.chat,result.topic]);
 return result;
}
async function feedbackRoute(client:PoolClient) {
 const bot=randomUUID();
 await client.query("insert into private.operator_notification_bots(id,name,credential_state,secret_version) values($1,'synthetic','ready',$2)",[bot,'a'.repeat(32)]);
 await client.query("insert into private.operator_notification_routes(bot_id,kind,chat_id,enabled) values($1,'feedback','-100123',true)",[bot]);
}

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
   const event=(await client.query('select id from private.operator_notification_events where admission_email=$1',[email])).rows[0].id;
   const delivery=await sentAdmission(client,event);
   for(const [bot,version,chat,topic] of [[randomUUID(),delivery.version,delivery.chat,7],[delivery.bot,'b'.repeat(32),delivery.chat,7],[delivery.bot,delivery.version,'-100999',7],[delivery.bot,delivery.version,delivery.chat,8]] as const){
    expect((await client.query("select public.operator_delivery_decide_v1($1,$2,$3,$4,$5,$6,'approve',$7) result",[delivery.id,bot,version,chat,topic,operator,randomUUID()])).rows[0].result).toBe('expired');
   }
   const decide=(actor:string,action:string)=>client.query('select public.operator_delivery_decide_v1($1,$2,$3,$4,$5,$6,$7,$8) result',[delivery.id,delivery.bot,delivery.version,delivery.chat,7,actor,action,randomUUID()]);
   await client.query('savepoint before_denied');
   await expect(decide(user,'approve')).rejects.toMatchObject({code:'42501'});
   await client.query('rollback to savepoint before_denied');
   expect((await decide(operator,'approve')).rows[0].result).toBe('decided');
   expect((await decide(operator,'reject')).rows[0].result).toBe('already_decided');
   expect((await client.query('select kind from private.operator_notification_events where admission_email=$1 order by created_at',[email])).rows.map(row=>row.kind)).toEqual(['admission-request','admission-approved']);
   const approved=(await client.query('select public.operator_delivery_claim_v1(50) item')).rows.map(row=>row.item).find(item=>item.kind==='admission-approved' && item.email===email);
   expect(approved).toMatchObject({transport:'email',emailVerified:true,attempts:1});
   await client.query('update auth.users set email_confirmed_at=null where id=$1',[user]);
   await client.query("update private.operator_notification_deliveries set lease_until=clock_timestamp()-interval '1 second' where id=$1",[approved.id]);
   const reclaimed=(await client.query('select public.operator_delivery_claim_v1(50) item')).rows.map(row=>row.item).find(item=>item.id===approved.id);
   expect(reclaimed).toMatchObject({emailVerified:false,attempts:2});
   expect((await client.query("select public.operator_delivery_settle_v1($1,$2,'sent',null) ok",[approved.id,approved.leaseId])).rows[0].ok).toBe(false);
   expect((await client.query("select public.operator_delivery_settle_v1($1,$2,'sent',null) ok",[approved.id,reclaimed.leaseId])).rows[0].ok).toBe(true);
  });
 });

 test('expired final lease fails and retention begins at completion',async()=>{
  await withTransaction(pool,async client=>{
   await client.query('update private.operator_notification_settings set enabled=true where singleton');await feedbackRoute(client);
   const user=randomUUID(),report=randomUUID(),feedback=randomUUID();await ensureUserWithSettings(client,user);
   await client.query(`insert into public.feedback_items(id,reporter_user_id,reporter_pseudonym,report_id,source_client,app_build_version,kind,problem_type,target_kind,target,comment_present,sanitized_summary)
    values($1,$2,'usr_0123456789abcdef01234567',$3,'web','1','content-quality','other','entry','{}',false,'')`,[feedback,user,report]);
   const event=(await client.query('select id from private.operator_notification_events where feedback_id=$1',[feedback])).rows[0].id;
   const delivery=(await client.query('select id from private.operator_notification_deliveries where event_id=$1',[event])).rows[0].id;
   await client.query("update private.operator_notification_events set created_at=clock_timestamp()-interval '100 days' where id=$1",[event]);
   await client.query("update private.operator_notification_deliveries set state='leased',attempts=10,lease_id=$2,lease_until=clock_timestamp()-interval '1 second' where id=$1",[delivery,randomUUID()]);
   expect((await client.query('select public.operator_delivery_claim_v1(50) item')).rows.some(row=>row.item.id===delivery)).toBe(false);
   expect((await client.query('select state,finished_at from private.operator_notification_deliveries where id=$1',[delivery])).rows[0]).toMatchObject({state:'failed',finished_at:expect.any(Date)});
   await client.query('select public.operator_notification_cleanup_v1()');
   expect((await client.query('select id from private.operator_notification_deliveries where id=$1',[delivery])).rows).toHaveLength(1);
   await client.query("update private.operator_notification_deliveries set finished_at=clock_timestamp()-interval '91 days' where id=$1",[delivery]);
   await client.query('select public.operator_notification_cleanup_v1()');
   expect((await client.query('select id from private.operator_notification_deliveries where id=$1',[delivery])).rows).toHaveLength(0);
   expect((await client.query('select id from private.operator_notification_events where id=$1',[event])).rows).toHaveLength(0);
  });
 });

 test('Telegram dispatch keeps pending, exhausted, and old mail deliveries byte-for-byte',async()=>{
  await withTransaction(pool,async client=>{
   await client.query('update private.operator_notification_settings set enabled=true where singleton');
   const user=randomUUID(),email=`${randomUUID()}@example.test`;
   await ensureUserWithSettings(client,user);
   await client.query('insert into private.admission_requests(email,user_id,status) values($1,$2,$3)',[email,user,'pending']);
   const mailEvents=(await client.query(`insert into private.operator_notification_events(kind,admission_email,created_at)
    select 'admission-approved',$1,now()-interval '100 days' from generate_series(1,3) returning id`,[email])).rows.map(({id})=>id);
   await client.query(`update private.operator_notification_deliveries set state='leased',attempts=10,lease_id=gen_random_uuid(),
    lease_until=now()-interval '1 day' where event_id=$1`,[mailEvents[1]]);
   await client.query(`update private.operator_notification_deliveries set state='sent',finished_at=now()-interval '90 days'
    where event_id=$1`,[mailEvents[2]]);
   const notification=(await client.query(`insert into private.operator_notification_events(kind,admission_email)
     values('admission-request',$1) returning id`,[email])).rows[0].id;
   const telegram=await sentAdmission(client,notification);
   await client.query("update private.operator_notification_deliveries set state='pending',finished_at=null where id=$1",[telegram.id]);
   const mailSnapshot=()=>client.query('select to_jsonb(d) as row from private.operator_notification_deliveries d where event_id=any($1::uuid[]) order by id',[mailEvents]);
   const before=await mailSnapshot();
   const statuses=(await client.query('select public.operator_notification_status_v1() as all,public.operator_telegram_notification_status_v1() as telegram')).rows[0];
   expect(statuses.all.pending-statuses.telegram.pending).toBe(1);
   expect(statuses.all.leased-statuses.telegram.leased).toBe(1);
   const claimed=(await client.query('select public.operator_telegram_delivery_claim_v1(50) as item')).rows.map(row=>row.item);
   expect(claimed).toContainEqual(expect.objectContaining({id:telegram.id,transport:'telegram',attempts:1}));
   expect(claimed.every(item=>item.transport==='telegram')).toBe(true);
   await client.query(`update private.operator_notification_deliveries set state='sent',lease_id=null,lease_until=null,
    finished_at=now()-interval '90 days' where id=$1`,[telegram.id]);
   await client.query('select public.operator_telegram_notification_cleanup_v1()');
   expect((await client.query('select id from private.operator_notification_deliveries where id=$1',[telegram.id])).rows).toHaveLength(0);
   expect((await mailSnapshot()).rows).toEqual(before.rows);
  });
 });

 test('settlement cannot requeue a final attempt',async()=>{
  await withTransaction(pool,async client=>{
   await client.query('update private.operator_notification_settings set enabled=true where singleton');await feedbackRoute(client);
   const user=randomUUID(),report=randomUUID(),feedback=randomUUID(),lease=randomUUID();await ensureUserWithSettings(client,user);
   await client.query(`insert into public.feedback_items(id,reporter_user_id,reporter_pseudonym,report_id,source_client,app_build_version,kind,problem_type,target_kind,target,comment_present,sanitized_summary)
    values($1,$2,'usr_0123456789abcdef01234567',$3,'web','1','content-quality','other','entry','{}',false,'')`,[feedback,user,report]);
   const event=(await client.query('select id from private.operator_notification_events where feedback_id=$1',[feedback])).rows[0].id;
   const delivery=(await client.query('select id from private.operator_notification_deliveries where event_id=$1',[event])).rows[0].id;
   await client.query("update private.operator_notification_deliveries set state='leased',attempts=10,lease_id=$2,lease_until=clock_timestamp()+interval '1 minute' where id=$1",[delivery,lease]);
   expect((await client.query("select public.operator_delivery_settle_v1($1,$2,'retry',30) ok",[delivery,lease])).rows[0].ok).toBe(true);
   expect((await client.query('select state from private.operator_notification_deliveries where id=$1',[delivery])).rows[0].state).toBe('failed');
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
   const delivery=await sentAdmission(client,event);
   await client.query('update public.admin_operators set is_active=false where user_id=$1',[operator]);
   await client.query('savepoint denied');
   await expect(client.query("select public.operator_delivery_decide_v1($1,$2,$3,$4,$5,$6,'approve',$7)",[delivery.id,delivery.bot,delivery.version,delivery.chat,7,operator,randomUUID()])).rejects.toMatchObject({code:'42501'});
   await client.query('rollback to savepoint denied');
   expect((await client.query('select status from private.admission_requests where email=$1',[email])).rows[0].status).toBe('pending');
  });
 });

 test('a concurrent revocation wins before a waiting Telegram decision',async()=>{
  const operator=randomUUID(), event=randomUUID(), email=`${randomUUID()}@example.test`;
  const locker=await pool.connect(), worker=await pool.connect();
  const enabled=(await pool.query('select enabled from private.operator_notification_settings where singleton')).rows[0].enabled;
  let delivery:Awaited<ReturnType<typeof sentAdmission>>|undefined;
  try {
   await pool.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[operator,`op-${email}`]);
   await pool.query("insert into public.admin_operators(email,user_id,is_active,permissions) values($1,$2,true,ARRAY['admission.manage'])",[`op-${email}`,operator]);
   await pool.query("insert into private.admission_requests(email,status) values($1,'pending')",[email]);
   await pool.query("insert into private.operator_notification_events(id,kind,admission_email) values($1,'admission-request',$2)",[event,email]);
   await pool.query('update private.operator_notification_settings set enabled=true where singleton');
   delivery=await sentAdmission(pool,event);
   const lockerPid=(await locker.query('select pg_backend_pid() pid')).rows[0].pid;
   const workerPid=(await worker.query('select pg_backend_pid() pid')).rows[0].pid;
   await locker.query('begin');
   await locker.query('update public.admin_operators set is_active=false where user_id=$1',[operator]);
   await worker.query('begin');
   await worker.query("set local statement_timeout='5s'");
   const decision=worker.query("select public.operator_delivery_decide_v1($1,$2,$3,$4,$5,$6,'approve',$7)",[delivery.id,delivery.bot,delivery.version,delivery.chat,7,operator,randomUUID()]).then(()=>null,error=>error);
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
   if(delivery){await pool.query('delete from private.operator_notification_routes where id=$1',[delivery.route]);await pool.query('delete from private.operator_notification_bots where id=$1',[delivery.bot]);}
   await pool.query('update private.operator_notification_settings set enabled=$1 where singleton',[enabled]);
   await pool.query('delete from private.admission_requests where email=$1',[email]);
   await pool.query('delete from public.admin_operators where user_id=$1',[operator]);
   await pool.query('delete from auth.users where id=$1',[operator]);
  }
 },10000);

 test('concurrent workers skip an already locked delivery instead of claiming it twice',async()=>{
  const first=await pool.connect(),second=await pool.connect();
  const user=randomUUID(),feedback=randomUUID(),event=randomUUID(),bot=randomUUID(),route=randomUUID();
  const enabled=(await pool.query('select enabled from private.operator_notification_settings where singleton')).rows[0].enabled;
  try {
   await ensureUserWithSettings(first,user);
   await first.query(`insert into public.feedback_items(id,reporter_user_id,reporter_pseudonym,report_id,source_client,app_build_version,kind,problem_type,target_kind,target,comment_present,sanitized_summary)
    values($1,$2,'usr_0123456789abcdef01234567',$3,'web','1','content-quality','other','entry','{}',false,'')`,[feedback,user,randomUUID()]);
   await first.query("insert into private.operator_notification_bots(id,name,credential_state,secret_version) values($1,'synthetic','ready',$2)",[bot,'a'.repeat(32)]);
   await first.query("insert into private.operator_notification_routes(id,bot_id,kind,chat_id,enabled) values($1,$2,'feedback','-100123',true)",[route,bot]);
   await first.query('update private.operator_notification_settings set enabled=true where singleton');
   await first.query("insert into private.operator_notification_events(id,kind,feedback_id) values($1,'feedback',$2)",[event,feedback]);
   await first.query('begin');
   const claimed=(await first.query('select public.operator_delivery_claim_v1(50) item')).rows.map(row=>row.item).filter(item=>item.eventId===event);
   expect(claimed).toHaveLength(1);
   await second.query('begin');await second.query("set local statement_timeout='1s'");
   expect((await second.query('select public.operator_delivery_claim_v1(50) item')).rows.some(row=>row.item.eventId===event)).toBe(false);
   await first.query('commit');await second.query('commit');
   expect((await pool.query('select attempts from private.operator_notification_deliveries where event_id=$1',[event])).rows[0].attempts).toBe(1);
  } finally {
   await first.query('rollback').catch(()=>{});await second.query('rollback').catch(()=>{});first.release();second.release();
   await pool.query('delete from private.operator_notification_events where id=$1',[event]);
   await pool.query('delete from public.feedback_items where id=$1',[feedback]);
   await pool.query('delete from private.operator_notification_routes where id=$1',[route]);await pool.query('delete from private.operator_notification_bots where id=$1',[bot]);
   await pool.query('update private.operator_notification_settings set enabled=$1 where singleton',[enabled]);await pool.query('delete from auth.users where id=$1',[user]);
  }
 },10000);

 test('retention cleanup is bounded and never removes pending deliveries',async()=>{
  await withTransaction(pool,async client=>{
   const email=`${randomUUID()}@example.test`;
   await client.query("insert into private.admission_requests(email,status) values($1,'pending')",[email]);
   await client.query("insert into private.operator_notification_events(kind,admission_email,created_at) select 'admission-request',$1,clock_timestamp()-interval '40 days' from generate_series(1,1200)",[email]);
   expect((await client.query('select public.operator_notification_cleanup_v1() removed')).rows[0].removed).toBe(500);
   expect((await client.query('select count(*)::integer count from private.operator_notification_events where admission_email=$1',[email])).rows[0].count).toBe(700);
  });
 });

 test('an audit failure rolls back notification configuration instead of saving silently',async()=>{
  await withTransaction(pool,async client=>{
   const operator=randomUUID();await ensureUserWithSettings(client,operator);
   await client.query("insert into public.admin_operators(email,user_id,is_active,permissions) values($1,$2,true,ARRAY['notifications.manage'])",[`${operator}@example.test`,operator]);
   await client.query("CREATE FUNCTION pg_temp.reject_notification_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic audit unavailable'; END $$");
   await client.query('CREATE TRIGGER qualification_reject_notification_audit BEFORE INSERT ON public.admin_audit_events FOR EACH ROW EXECUTE FUNCTION pg_temp.reject_notification_audit()');
   await client.query('savepoint failed_audit');
   await expect(client.query('select public.admin_notification_create_bot_v1($1,$2,$3)',[operator,randomUUID(),'Must roll back'])).rejects.toMatchObject({code:'P0001'});
   await client.query('rollback to savepoint failed_audit');
   expect((await client.query("select count(*)::integer count from private.operator_notification_bots where name='Must roll back'")).rows[0].count).toBe(0);
  });
 });

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

   expect((await client.query('select public.admin_notification_enabled_v1($1,$2,true) enabled',[operator,randomUUID()])).rows[0].enabled).toBe(true);
   const config=(await client.query('select public.admin_notification_configuration_v1($1,$2) config',[operator,randomUUID()])).rows[0].config;
   expect(config.enabled).toBe(true);
   expect(config.bots.map((bot:{id:string})=>bot.id)).toEqual(expect.arrayContaining([first.id,second.id]));
   expect(JSON.stringify(config)).not.toMatch(/secret_version|token|secretVersion/);
   const operation=randomUUID();
   await client.query('select public.admin_notification_begin_secret_v1($1,$2,$3,1)',[operator,operation,first.id]);
   expect((await client.query('select public.admin_notification_finish_secret_v1($1,$2,$3,$4,$5) ok',[operator,randomUUID(),first.id,randomUUID(),'a'.repeat(32)])).rows[0].ok).toBe(false);
   expect((await client.query('select public.admin_notification_finish_secret_v1($1,$2,$3,$4,$5) ok',[operator,randomUUID(),first.id,operation,'a'.repeat(32)])).rows[0].ok).toBe(true);
   expect((await client.query('select public.admin_notification_finish_secret_v1($1,$2,$3,$4,$5) ok',[operator,randomUUID(),first.id,operation,'b'.repeat(32)])).rows[0].ok).toBe(false);

   expect((await client.query("select action from public.admin_audit_events where operator_user_id=$1 and action like 'notifications.%'",[operator])).rows).toHaveLength(8);
   expect((await client.query("select has_table_privilege('authenticated','private.operator_notification_bots','select') allowed")).rows[0].allowed).toBe(false);
  });
 });

});

describeIfDb('Telegram notification templates', () => {
 const pool = new Pool({connectionString:dbUrl});
 beforeAll(async () => {await runMigrations(pool);}, 120000);
 afterAll(async () => {await pool.end();});

 test('pins published versions and keeps test sends out of the working queue', async () => {
  await withTransaction(pool, async client => {
   const operator = randomUUID();
   const bot = randomUUID();
   const version = 'a'.repeat(32);
   await ensureUserWithSettings(client, operator);
   await client.query("insert into public.admin_operators(email,user_id,is_active,permissions) values($1,$2,true,ARRAY['notifications.manage'])",
    [`${operator}@example.test`,operator]);
   await client.query("insert into private.operator_notification_bots(id,name,credential_state,secret_version) values($1,'synthetic','ready',$2)",[bot,version]);
   await client.query("insert into private.operator_notification_routes(bot_id,kind,chat_id,topic_id,enabled) values($1,'admission-request','-100123',7,true)",[bot]);
   await client.query('update private.operator_notification_settings set enabled=true where singleton');
   const publish = async (body: string, revision: string) => (await client.query(
    "select public.admin_notification_publish_template_v1($1,$2,'admission-request',$3,$4) revision",
    [operator,randomUUID(),body,revision])).rows[0].revision as string;
   const enqueue = async () => {
    const user = randomUUID();
    const email = `${user}@example.test`;
    await ensureUserWithSettings(client,user);
    await client.query("insert into private.admission_requests(email,user_id,status) values($1,$2,'pending')",[email,user]);
    return (await client.query('select id from private.operator_notification_events where admission_email=$1',[email])).rows[0].id;
   };
   const original = await publish('Original {{email}}','0');
   const originalEvent = await enqueue();
   const authorizeTest = (chat: string) => client.query('select public.admin_notification_authorize_test_v1($1,$2,$3,$4) version',
    [operator,randomUUID(),bot,chat]);
   await client.query('savepoint reject_working_chat');
   await expect(authorizeTest('-100123')).rejects.toMatchObject({message:'chat_is_routed'});
   await client.query('rollback to savepoint reject_working_chat');
   expect((await authorizeTest('-100999')).rows[0].version).toBe(version);
   expect((await client.query('select count(*)::int as count from private.operator_notification_deliveries where bot_id=$1',[bot])).rows[0].count).toBe(1);
   const latest = await publish('New {{email}}',original);
   const latestEvent = await enqueue();
   const claimed = (await client.query('select public.operator_delivery_claim_v1(50) item')).rows.map(row => row.item);
   expect(claimed.find(item => item.eventId===originalEvent)?.templateBody).toBe('Original {{email}}');
   expect(claimed.find(item => item.eventId===latestEvent)?.templateBody).toBe('New {{email}}');
   const current = (await client.query('select public.admin_notification_templates_v1($1,$2) templates',[operator,randomUUID()])).rows[0].templates;
   expect(current['admission-request']).toEqual({body:'New {{email}}',revision:latest});
  });
 });
});

describeIfDb('named Telegram destinations', () => {
 const pool = new Pool({connectionString:dbUrl});
 beforeAll(async () => {await runMigrations(pool);}, 120000);
 afterAll(async () => {await pool.end();});

 test('preserves existing routes, saves test chats once and excludes working groups', async () => {
  await withTransaction(pool, async client => {
   const operator = randomUUID();
   const bot = randomUUID();
   await ensureUserWithSettings(client,operator);
   await client.query("insert into public.admin_operators(email,user_id,is_active,permissions) values($1,$2,true,ARRAY['notifications.manage'])",
    [`${operator}@example.test`,operator]);
   await client.query("insert into private.operator_notification_bots(id,name,credential_state,secret_version) values($1,'synthetic','ready',$2)",
    [bot,'a'.repeat(32)]);
   const settings = async () => (await client.query('select public.admin_notification_configuration_v2($1,$2) settings',
    [operator,randomUUID()])).rows[0].settings;
   const {rows:[route]} = await client.query(
    "insert into private.operator_notification_routes(bot_id,kind,chat_id,topic_id) values($1,'feedback','-100123',7) returning id",[bot]);
   expect((await settings()).routes.find((row:{id:string})=>row.id===route.id)).toMatchObject({chatId:'-100123',topicId:7,chatTitle:null,topicTitle:null});
   await client.query("select public.admin_notification_save_route_v2($1,$2,$3,1,$4,'feedback','-100123',7,false,'Редакция','Репорты')",
    [operator,randomUUID(),route.id,bot]);
   const save = (title:string,chat:string) => client.query('select public.admin_notification_save_test_destination_v1($1,$2,$3,$4,$5,null) id',
    [operator,randomUUID(),bot,title,chat]);
   const {rows:[destination]} = await save('Личка','100999');
   expect((await save('Тестовый чат','100999')).rows[0].id).toBe(destination.id);
   await client.query('savepoint working_chat');
   await expect(save('Рабочий','-100123')).rejects.toMatchObject({message:'chat_is_routed'});
   await client.query('rollback to savepoint working_chat');
   const config = await settings();
   expect(config.testDestinations).toContainEqual({id:destination.id,botId:bot,title:'Тестовый чат',chatId:'100999',topicId:null});
   expect(config.routes.find((row:{id:string})=>row.id===route.id)).toMatchObject({chatId:'-100123',topicId:7,chatTitle:'Редакция',topicTitle:'Репорты'});
  });
 });
});
