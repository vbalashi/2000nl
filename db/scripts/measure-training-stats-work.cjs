// Run from repo root after FSRS migrations bootstrap an owned disposable DB.
// Requires pg_stat_statements in that DB; never resets shared statistics.
// Fixture writes and temporary baseline functions are rolled back on exit.
// Timing is exploratory; nested hit totals overlap and are not unique IO.
const {Pool}=require(process.cwd()+'/apps/ui/node_modules/pg');
const fs=require('fs');
const connectionString=process.env.FSRS_TEST_DB_URL;
if (!connectionString) throw new Error('FSRS_TEST_DB_URL required; use an owned disposable DB');
const target=new URL(connectionString);
if (!['postgres:', 'postgresql:'].includes(target.protocol) ||
    !['localhost','127.0.0.1','[::1]'].includes(target.hostname) ||
    !/^2000nl_fsrs_[a-z0-9_]+$/.test(target.pathname.slice(1)) || target.search)
  throw new Error('unsafe_stats_measurement_database');
const pool=new Pool({connectionString});
(async()=>{const c=await pool.connect();try {
await c.query('begin');await c.query("set local pg_stat_statements.track='all'");
await c.query("insert into auth.users(id,email) values('73700000-0000-0000-0000-000000000001','stats737@local')");
await c.query("select set_config('request.jwt.claim.sub','73700000-0000-0000-0000-000000000001',true)");
await c.query("insert into user_settings(user_id,daily_new_limit) values('73700000-0000-0000-0000-000000000001',7) on conflict(user_id) do update set daily_new_limit=7");
await c.query(fs.readFileSync('apps/ui/tests/fsrs/fixtures/stats737Baseline.sql','utf8'));
await c.query("select 'private.training_stats_totals_v1(uuid,text[],uuid,text)'::regprocedure");
let call;
const args="('73700000-0000-0000-0000-000000000001',ARRAY['word-to-definition'],'00000000-0000-0000-0000-000000000737','user','UTC')";
async function snap(){return (await c.query('select queryid::text,query,calls::float,total_exec_time,shared_blks_hit::float,shared_blks_read::float from pg_stat_statements where dbid=(select oid from pg_database where datname=current_database()) and not toplevel')).rows;}
async function measure(label){for(let i=0;i<3;i++)await c.query(call);let b=new Map((await snap()).map(x=>[x.queryid,x]));let t=performance.now();for(let i=0;i<20;i++)await c.query(call);let wall=performance.now()-t;let rows=(await snap()).map(x=>({...x,calls:x.calls-(b.get(x.queryid)?.calls||0),ms:x.total_exec_time-(b.get(x.queryid)?.total_exec_time||0),hits:x.shared_blks_hit-(b.get(x.queryid)?.shared_blks_hit||0),reads:x.shared_blks_read-(b.get(x.queryid)?.shared_blks_read||0)})).filter(x=>x.calls>0); console.log(JSON.stringify({label,repetitions:20,wallMs:wall,nestedCalls:rows.reduce((s,x)=>s+x.calls,0),nestedHits:rows.reduce((s,x)=>s+x.hits,0),nestedReads:rows.reduce((s,x)=>s+x.reads,0),queries:rows.filter(x=>x.ms>0.01).map(x=>({calls:x.calls,ms:x.ms,hits:x.hits,query:x.query.slice(0,85)}))}));}
for(const volume of [0,30000]){
if(volume){
await c.query("insert into languages(code,name) values('nl','Dutch') on conflict do nothing");
await c.query("create temporary table stats737_entries as select gen_random_uuid() as id,generate_series(1,500) as n");
await c.query("insert into word_entries(id,language_code,headword,part_of_speech,is_nt2_2000,raw) select id,'nl','stats737-'||n,'noun',true,'{}' from stats737_entries");
await c.query("insert into user_word_lists(id,user_id,language_code,primary_language_code,name) values('00000000-0000-0000-0000-000000000737','73700000-0000-0000-0000-000000000001','nl','nl','measure')");
await c.query("insert into user_word_list_items(list_id,word_id) select '00000000-0000-0000-0000-000000000737',id from stats737_entries");
await c.query("insert into user_card_status(user_id,entry_id,card_type_id,fsrs_enabled,next_review_at) select '73700000-0000-0000-0000-000000000001',id,'word-to-definition',true,now()-interval '1 hour' from stats737_entries");
await c.query("insert into user_review_log(user_id,word_id,mode,grade,review_type,reviewed_at,interval_after) select '73700000-0000-0000-0000-000000000001',id,'word-to-definition',3,case when n%2=0 then 'review' else 'new' end,now()-(g%30)*interval '1 day',2 from stats737_entries cross join generate_series(1,60) g");
await c.query('analyze user_review_log');await c.query('analyze user_card_status');await c.query('analyze word_entries');
}
call='select private.stats737_baseline'+args;await measure(`old-${volume}`);call='select public.get_detailed_training_stats'+args;await measure(`candidate-${volume}`);
}
}finally{await c.query('rollback');c.release();await pool.end();}})().catch(e=>{console.error(e);process.exitCode=1});
