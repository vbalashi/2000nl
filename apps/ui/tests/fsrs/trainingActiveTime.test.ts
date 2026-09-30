import { afterAll,beforeAll,describe,expect,test } from "vitest";
import { randomUUID } from "node:crypto";
import { Pool,type PoolClient } from "pg";
import { ensureUserWithSettings,getDbUrl,insertWord,runMigrations,withTransaction } from "./dbTestUtils";
const dbUrl = getDbUrl();
async function fixture(client: PoolClient) {
  const userId = randomUUID(), sessionId = randomUUID();
  await ensureUserWithSettings(client,userId);
  const entryId = await insertWord(client,`active-time-${randomUUID()}`);
  await client.query(`insert into training_sessions(id,user_id,session_size,card_type_ids,card_filter,created_at)
    values($1,$2,'5',ARRAY['word-to-definition'],'both',now()-interval '2 days')`,[sessionId,userId]);
  await client.query(`insert into training_session_members(session_id,ordinal,entry_id,card_type_id,queue_source)
    values($1,1,$2,'word-to-definition','new')`,[sessionId,entryId]);
  return { userId,sessionId,entryId };
}
async function auth(client: PoolClient,userId: string) {
  await client.query(`select set_config('request.jwt.claim.sub',$1,true)`,[userId]);
  await client.query("set local role authenticated");
}
async function record(client: PoolClient,f: Awaited<ReturnType<typeof fixture>>,options: Record<string,unknown> = {}) {
  const v = { id: randomUUID(),family: "meaning",entry: f.entryId,mode: "word-to-definition",target: null,ms: 15000,at: new Date().toISOString(), ...options };
  const { rows } = await client.query(`select record_training_active_time_v1($1,$2,$3,$4,$5,$6,$7,$8) result`,[v.id,f.sessionId,v.family,v.entry,v.mode,v.target,v.ms,v.at]);
  return rows[0].result;
}
(dbUrl ? describe : describe.skip)("active study time storage",() => {
  const pool = new Pool({ connectionString: dbUrl });
  beforeAll(async () => { await runMigrations(pool); });
  afterAll(async () => { await pool.end(); });
  test("owner-bound receipts replay exactly and conflict without changing scheduling or actions",async () => {
    await withTransaction(pool,async client => {
      const f = await fixture(client), other = randomUUID(), id = randomUUID(), at = new Date().toISOString();
      await ensureUserWithSettings(client,other);
      await auth(client,f.userId);
      expect(await record(client,f,{id,at})).toEqual({accepted:true,duplicate:false});
      expect(await record(client,f,{id,at})).toEqual({accepted:true,duplicate:true});
      expect(await record(client,f,{id,at,ms:16000})).toEqual({error:"measurement_conflict"});
      await client.query("reset role");
      const { rows } = await client.query(`select count(*)::int n,sum(active_ms)::int ms from private.training_active_time_v1 where user_id=$1`,[f.userId]);
      expect(rows[0]).toEqual({n:1,ms:15000});
      const { rows: mutations } = await client.query(`select (select count(*) from user_card_action_events where user_id=$1)::int actions,
        (select count(*) from user_card_status where user_id=$1)::int statuses,
        (select count(*) from user_training_exercise_action_events where user_id=$1)::int exercises`,[f.userId]);
      expect(mutations[0]).toEqual({actions:0,statuses:0,exercises:0});
      await auth(client,other);
      expect(await record(client,f,{id,at})).toEqual({error:"measurement_not_owned"});
      const day = at.slice(0,10);
      const read = await client.query("select get_training_active_time_v1($1,$1,null) result",[day]);
      expect(read.rows[0].result.days[0].activeMilliseconds).toBe(0);
    });
  });
  test("rejects nonmembers, wrong directions/families, oversized and stale durations",async () => {
    await withTransaction(pool,async client => {
      const f = await fixture(client); await auth(client,f.userId);
      for (const options of [{entry:randomUUID()},{mode:"definition-to-word"},{family:"idiom",mode:null,target:randomUUID()}])
        expect(await record(client,f,options)).toEqual({error:"measurement_not_owned"});
      for (const ms of [0,-1,30001]) expect(await record(client,f,{ms})).toEqual({error:"invalid_measurement"});
      expect(await record(client,f,{at:new Date(Date.now()-25*3600000).toISOString()})).toEqual({error:"measurement_out_of_window"});
      expect(await record(client,f,{at:new Date(Date.now()+120000).toISOString()})).toEqual({error:"measurement_out_of_window"});
      expect(await record(client,f,{family:"sentence",mode:"word-to-definition"})).toEqual({error:"invalid_measurement"});
    });
  });
  test("validates idiom and sentence membership against the target registry",async () => {
    await withTransaction(pool,async client => {
      const f = await fixture(client);
      for (const [index,family] of ["idiom","translation"].entries()) {
        const node = randomUUID(), target = randomUUID();
        await client.query(`insert into private.platform_v2_content_nodes(id,entry_id,kind,binding_state,first_source_revision,last_source_revision,source_text_fingerprint,diagnostic_locator)
          values($1,$2,$3,'active','v1','v1','test-fingerprint','test')`,[node,f.entryId,family==="idiom"?"idiom":"example"]);
        await client.query(`insert into private.platform_v2_training_exercise_targets(id,entry_id,content_node_id,family,direction,source_revision,source_text_fingerprint)
          values($1,$2,$3,$4,$5,'v1','test-fingerprint')`,[target,f.entryId,node,family,family==="idiom"?"direct":"recall"]);
        await client.query(`insert into training_session_exercise_members(session_id,target_id,ordinal,queue_source) values($1,$2,$3,'new')`,[f.sessionId,target,index+1]);
        await auth(client,f.userId);
        expect(await record(client,f,{family:family==="translation"?"sentence":"idiom",mode:null,target})).toEqual({accepted:true,duplicate:false});
        expect(await record(client,f,{family:family==="translation"?"idiom":"sentence",mode:null,target})).toEqual({error:"measurement_not_owned"});
        await client.query("reset role");
      }
    });
  });
  test("splits a continuous interval at the learner-local 04:00 boundary",async () => {
    await withTransaction(pool,async client => {
      const f = await fixture(client);
      await client.query("update user_settings set training_schedule_timezone='Europe/Amsterdam' where user_id=$1",[f.userId]);
      const { rows } = await client.query(`select private.training_study_day_date_v1(now(),'Europe/Amsterdam')::text AS study_date,
        ((private.training_study_day_date_v1(now(),'Europe/Amsterdam')+time '04:00') at time zone 'Europe/Amsterdam')+interval '10 seconds' AS observed_at`);
      const day = rows[0].study_date, at = rows[0].observed_at.toISOString();
      await auth(client,f.userId);
      expect(await record(client,f,{ms:20000,at})).toEqual({accepted:true,duplicate:false});
      const read = await client.query("select get_training_active_time_v1($1::date-1,$1,'nl') result",[day]);
      expect(read.rows[0].result.timezone).toBe("Europe/Amsterdam");
      expect(read.rows[0].result.days.map((d: {activeMilliseconds:number}) => d.activeMilliseconds)).toEqual([10000,10000]);
      expect(typeof read.rows[0].result.coverageStartedAt).toBe("string");
      const none = await client.query("select get_training_active_time_v1($1::date-1,$1,'en') result",[day]);
      expect(none.rows[0].result.days.map((d: {activeMilliseconds:number}) => d.activeMilliseconds)).toEqual([0,0]);
      expect((await client.query("select get_training_active_time_v1($1::date,$1::date+366,null) result",[day])).rows[0].result).toEqual({error:"invalid_time_range"});
    });
  });
  test("does not expose a direct write/read bypass or anonymous RPC",async () => {
    const { rows } = await pool.query(`select
      has_table_privilege('authenticated','private.training_active_time_v1','INSERT') ins,
      has_table_privilege('authenticated','private.training_active_time_v1','UPDATE') upd,
      has_table_privilege('authenticated','private.training_active_time_v1','DELETE') del,
      has_table_privilege('authenticated','private.training_active_time_v1','SELECT') sel,
      has_function_privilege('anon','public.record_training_active_time_v1(uuid,uuid,text,uuid,text,uuid,integer,timestamptz)','EXECUTE') anon,
      (select relrowsecurity from pg_class where oid='private.training_active_time_v1'::regclass) rls`);
    expect(rows[0]).toEqual({ins:false,upd:false,del:false,sel:false,anon:false,rls:true});
    await withTransaction(pool,async client => {
      const f = await fixture(client);
      await client.query("select set_config('request.jwt.claim.sub','',true)");
      expect(await record(client,f)).toEqual({error:"unauthorized"});
    });
  });
});
