import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { Pool } from "pg";
import { getDbUrl, runMigrations } from "./dbTestUtils";
const url = getDbUrl();
const owner = "37400000-0000-4000-8000-000000000001", other = "37400000-0000-4000-8000-000000000002";
const key = (n: number) => n.toString(16).padStart(64, "0");
const limits = { accountRequests:20, globalRequests:200, accountCharacters:492000, globalCharacters:4920000, accountConcurrency:2, globalConcurrency:2 };
describe.skipIf(!url)("provider generation admission and fenced recovery", () => {
  let pool: Pool;
  beforeAll(async () => {
    pool = new Pool({ connectionString:url, max:8 }); await runMigrations(pool);
    await pool.query("insert into auth.users(id,email) values($1,'provider-owner@example.invalid'),($2,'provider-other@example.invalid') on conflict(id) do nothing",[owner,other]);
  },120000);
  beforeEach(async () => { await pool.query("truncate private.provider_work,private.provider_admission_windows"); });
  afterAll(async () => { if(pool){await pool.query("delete from auth.users where id=any($1::uuid[])",[[owner,other]]);await pool.end();} });
  async function begin(id=1,account=owner,overrides={},kind="text") {
    return (await pool.query("select public.begin_provider_work_v1($1,$2,$3,100,$4) result",[kind,key(id),account,{...limits,...overrides}])).rows[0].result;
  }
  async function finish(id:number,token:string,result:unknown={value:"synthetic"},error:string|null=null,kind="text") {
    return (await pool.query("select public.finish_provider_work_v1($1,$2,$3,$4,$5) result",[kind,key(id),token,result,error])).rows[0].result;
  }
  test("browser roles cannot read/write artifacts or invoke the server-only functions",async()=>{
    for(const role of ["anon","authenticated"]){
      for(const table of ["private.provider_work","private.provider_admission_windows"])
        expect((await pool.query("select has_table_privilege($1,$2,'select,insert,update,delete') allowed",[role,table])).rows[0].allowed).toBe(false);
      for(const fn of ["public.begin_provider_work_v1(text,text,uuid,integer,jsonb)","public.finish_provider_work_v1(text,text,uuid,jsonb,text)","public.read_provider_work_v1(text,text)"])
        expect((await pool.query("select has_function_privilege($1,$2,'execute') allowed",[role,fn])).rows[0].allowed).toBe(false);
    }
    const client=await pool.connect();try{await client.query("begin;set local role service_role");
      expect((await client.query("select public.begin_provider_work_v1('text',$1,$2,100,$3) result",[key(99),owner,limits])).rows[0].result.status).toBe("claimed");
    }finally{await client.query("rollback");client.release();}
  });
  test("two simultaneous claims of one identity yield one owner and one charge",async()=>{
    const claims=await Promise.all([begin(),begin()]);
    expect(claims.map(c=>c.status).sort()).toEqual(["claimed","pending"]);
    expect((await pool.query("select requests,input_characters from private.provider_admission_windows where subject=$1",[owner])).rows[0]).toMatchObject({requests:1,input_characters:"100"});
  });
  test("distinct concurrent claims share global slots across accounts, release on success/failure",async()=>{
    const claims=await Promise.all([begin(1),begin(2,other),begin(3,owner)]);
    expect(claims.filter(c=>c.status==="claimed")).toHaveLength(2);expect(claims.filter(c=>c.status==="limited")).toHaveLength(1);
    const index=claims.findIndex(c=>c.status==="claimed");
    expect(await finish(index+1,claims[index].leaseToken)).toBe(true);
    const retry=await begin(4,other);expect(retry.status).toBe("claimed");
    expect(await finish(4,retry.leaseToken,null,"provider_timeout")).toBe(true);
    expect((await begin(5,other)).status).toBe("claimed");
  });
  test("account capacity and minute budgets are independent; failures keep their spent reservation",async()=>{
    const a=await begin(1,owner,{accountConcurrency:1,accountRequests:1});expect(a.status).toBe("claimed");
    expect((await begin(2,owner,{accountConcurrency:1,accountRequests:1})).status).toBe("limited");
    expect((await begin(3,other,{accountConcurrency:1,accountRequests:1})).status).toBe("claimed");
    await finish(1,a.leaseToken,null,"provider_network_error");
    expect((await begin(2,owner,{accountConcurrency:1,accountRequests:1})).status).toBe("limited");
    await pool.query("update private.provider_admission_windows set window_started_at=clock_timestamp()-interval '61 seconds' where subject=$1",[owner]);
    expect((await begin(2,owner,{accountConcurrency:1,accountRequests:1})).status).toBe("claimed");
  });
  test("character and global request budgets reject without partial charging",async()=>{
    expect((await begin(1,owner,{globalCharacters:99})).status).toBe("limited");
    expect((await pool.query("select count(*) n from private.provider_admission_windows")).rows[0].n).toBe("0");
    const first=await begin(1,owner,{globalRequests:1});await finish(1,first.leaseToken);
    expect((await begin(2,other,{globalRequests:1})).status).toBe("limited");
    expect((await pool.query("select requests from private.provider_admission_windows where subject='global'")).rows[0].requests).toBe(1);
  });
  test("expired pending recovers with a new fence; old success and old failure cannot publish",async()=>{
    const first=await begin();
    await pool.query("update private.provider_work set lease_expires_at=clock_timestamp()-interval '30 seconds'");
    const next=await begin();expect(next.status).toBe("claimed");expect(next.leaseToken).not.toBe(first.leaseToken);
    expect(await finish(1,first.leaseToken)).toBe(false);expect(await finish(1,first.leaseToken,null,"provider_timeout")).toBe(false);
    expect(await finish(1,next.leaseToken)).toBe(true);
    expect(await begin()).toMatchObject({status:"ready",result:{value:"synthetic"}});
  });
  test("transient failure backs off, retries three times, then recovers after bounded cooldown",async()=>{
    for(let attempt=1;attempt<=3;attempt++){
      const claimed=await begin();expect(claimed.status).toBe("claimed");expect(claimed.attempt).toBe(attempt);
      await finish(1,claimed.leaseToken,null,"provider_timeout");
      const waiting=await begin();expect(waiting.status).toBe("failed");expect(waiting.retryAfterMs).toBeGreaterThan(attempt===3?800000:1000);
      await pool.query("update private.provider_work set available_at=clock_timestamp()-interval '1 second'");
    }
    const recovered=await begin();expect(recovered.status).toBe("claimed");
    expect((await pool.query("select attempt from private.provider_work")).rows[0].attempt).toBe(1);
    await finish(1,recovered.leaseToken);expect((await begin()).status).toBe("ready");
  });
  test("wrong owner cannot reuse a text/draft identity; TTS shared result charges only its generator",async()=>{
    const a=await begin();await finish(1,a.leaseToken);
    await expect(begin(1,other)).rejects.toThrow("provider_work_forbidden");
    const audio=await begin(9,owner,{},"tts-public");await finish(9,audio.leaseToken,{audioBase64:"YWJj"},null,"tts-public");
    expect(await begin(9,other,{},"tts-public")).toMatchObject({status:"ready",result:{audioBase64:"YWJj"}});
    expect((await pool.query("select count(*) n from private.provider_admission_windows where family='audio' and subject=$1",[other])).rows[0].n).toBe("0");
  });
  test("retention reaps abandoned pending and invalidates stale tokens; admission excludes stale history",async()=>{
    const old=await begin();
    await pool.query("update private.provider_work set lease_expires_at=clock_timestamp()-interval '2 days'");
    await pool.query(`insert into private.provider_work(kind,identity,account_id,status,attempt,lease_token,lease_expires_at,available_at)
      select 'text',lpad(to_hex(1000+n),64,'0'),$1,'pending',1,gen_random_uuid(),clock_timestamp()-interval '2 days',clock_timestamp()-interval '2 days' from generate_series(1,10000) n`,[owner]);
    expect((await begin(2)).status).toBe("claimed");
    const job=(await pool.query("select command from cron.job where jobname='provider-work-retention'")).rows[0].command;
    await pool.query(job);expect(await finish(1,old.leaseToken)).toBe(false);
    expect((await pool.query("select count(*) n from private.provider_work")).rows[0].n).toBe("9002");
    const plan=(await pool.query("set enable_seqscan=off; explain select count(*) from private.provider_work where status='pending' and family='translation' and lease_expires_at>clock_timestamp()"));
    expect(JSON.stringify(plan)).toContain("provider_work_active");
  });
});
