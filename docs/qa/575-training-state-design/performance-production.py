#!/usr/bin/env python3
"""Run over SSH on NUC; emits only sanitized timings and aggregate facts.
Reads DATABASE_URL inside app container; never logs connection/owner/plan.
Uses deployed digest-pinned psql container, no installations or state writes.
"""
import json,subprocess,os,urllib.parse,statistics,datetime
IMAGE='postgres@sha256:ef257d85f76e48da1c64832459b59fcaba1a4dac97bf5d7450c77753542eee94'
try:
 raw=subprocess.check_output(['docker','inspect','2000nl-ui-ui-1'],text=True)
 cfg=json.loads(raw)[0]['Config']['Env'];env=dict(x.split('=',1)for x in cfg if '='in x)
 u=urllib.parse.urlparse(env['DATABASE_URL']);pg=os.environ.copy();pg.update(PGHOST=u.hostname,PGPORT=str(u.port or 5432),PGUSER=urllib.parse.unquote(u.username),PGPASSWORD=urllib.parse.unquote(u.password),PGDATABASE=u.path.lstrip('/'),PGSSLMODE=urllib.parse.parse_qs(u.query).get('sslmode',['require'])[0])
 def run(sql):
  p=subprocess.run(['docker','run','--rm','-i','--network','host',*[a for k in ['PGHOST','PGPORT','PGUSER','PGPASSWORD','PGDATABASE','PGSSLMODE']for a in ['--env',k]],IMAGE,'psql','-X','-A','-t','-q','-v','ON_ERROR_STOP=1'],input=sql,text=True,capture_output=True,env=pg)
  if p.returncode:
   category=next((c for c in ['syntax error','permission denied','statement timeout','could not translate','connection refused','password authentication failed','SSL error','not exist','No such image']if c in p.stderr),'other_psql_failure');raise RuntimeError(category)
  return p.stdout
 header="begin read only;set local statement_timeout='3s';set local lock_timeout='250ms';select user_id as owner from user_card_status group by user_id order by count(*) desc limit 1 \\gset\n"
 facts=json.loads(run(header+"select jsonb_build_object('entries',(select count(*) from word_entries),'coreEntries',(select count(*) from word_entries where is_nt2_2000),'nounEntries',(select count(*) from word_entries where part_of_speech='zn'),'verbEntries',(select count(*) from word_entries where part_of_speech='ww'),'selectedLearnerStates',(select count(*) from user_card_status where user_id=:'owner'),'postgresVersion',current_setting('server_version'));rollback;"))
 cases=[('stats-core-direct',"select get_detailed_training_stats(:'owner'::uuid,array['word-to-definition'],null,'curated')"),('stats-core-both',"select get_detailed_training_stats(:'owner'::uuid,array['word-to-definition','definition-to-word'],null,'curated')")]
 for size in [50,500,4031,18163]:
  for label,pos in [('all',''),('nouns',"where part_of_speech='zn'"),('verbs',"where part_of_speech='ww'")]:
   sql=f"with material as materialized(select id from word_entries {pos} order by id limit {size}),cards as(select w.id,s.* from material w cross join unnest(array['word-to-definition','definition-to-word']) mode left join user_card_status s on s.entry_id=w.id and s.user_id=:'owner'::uuid and s.card_type_id=mode) select count(*) filter(where fsrs_enabled and (fsrs_reps>0 or last_reviewed_at is not null) and next_review_at < ((date_trunc('day',now() at time zone 'Europe/Amsterdam')+interval '1 day')at time zone 'Europe/Amsterdam')) today,count(*) filter(where fsrs_enabled and (fsrs_reps>0 or last_reviewed_at is not null)) total_review,count(*) filter(where coalesce(fsrs_reps,0)=0 and last_reviewed_at is null) new from cards"
   cases.append((f'prototype-{label}-limit{size}',sql))
 results=[]
 for name,sql in cases:
  try:
   out=run(header+"select set_config('request.jwt.claim.sub',:'owner',true) as ignored \\gset\n"+'\n'.join('explain(analyze,format json,timing off) '+sql+';' for _ in range(16))+'\nrollback;')
   decoder=json.JSONDecoder();data=out.strip();plans=[]
   while data:
    val,end=decoder.raw_decode(data);plans.append(val[0]);data=data[end:].lstrip()
   times=[p['Execution Time']for p in plans];warm=sorted(times[1:]);results.append(dict(name=name,samples=len(warm),firstExecutionMs=times[0],medianExecutionMs=statistics.median(warm),p95ExecutionMs=warm[14],medianPlanningMs=statistics.median(p['Planning Time']for p in plans[1:]),rawExecutionMs=times))
  except RuntimeError:results.append(dict(name=name,error='bounded_query_failed_or_timeout',samples=0))
 print(json.dumps(dict(capturedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),facts=facts,results=results),indent=2))
except Exception as e:
 print(json.dumps({'error':'production_probe_failed_no_secrets_logged','category':str(e) if isinstance(e,RuntimeError) else type(e).__name__}));raise SystemExit(1)
