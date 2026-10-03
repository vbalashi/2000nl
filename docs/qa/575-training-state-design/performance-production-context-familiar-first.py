#!/usr/bin/env python3
"""Bounded read-only production RPC208 benchmark. Run on NUC over SSH.
Requires exact deployed commit; emits sanitized counters/timings only.
No installation, schema/learner changes, temp fixture or planner session creation.
"""
import argparse, datetime, json, math, os, re, statistics, subprocess, time, urllib.parse, urllib.request
IMAGE = 'postgres@sha256:ef257d85f76e48da1c64832459b59fcaba1a4dac97bf5d7450c77753542eee94'
parser = argparse.ArgumentParser()
parser.add_argument('--expected-commit', required=True)
parser.add_argument('--list-id', required=True)
parser.add_argument('--verified-health-file')
args = parser.parse_args()
try:
 if not re.fullmatch(r'[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}', args.list_id): raise RuntimeError('invalid_list_id')
 if not re.fullmatch(r'[a-f0-9]{40}', args.expected_commit):
  raise RuntimeError('invalid_expected_commit')
 if args.verified_health_file:
  if time.time() - os.stat(args.verified_health_file).st_mtime > 600: raise RuntimeError('verified_health_file_stale')
  with open(args.verified_health_file) as response: health = json.load(response)
 else:
  with urllib.request.urlopen('https://2000.dilum.io/api/health?deep=1', timeout=15) as response: health = json.load(response)
 if health.get('commit') != args.expected_commit or health.get('checks', {}).get('databaseContract', {}).get('details', {}).get('expectedMigration') != 208 or health.get('status') != 'ok':
  raise RuntimeError('deployment_not_ready_for_rpc208')
 env = dict(item.split('=', 1) for item in json.loads(subprocess.check_output(['docker', 'inspect', '2000nl-ui-ui-1'], text=True))[0]['Config']['Env'] if '=' in item)
 if env.get('NEXT_PUBLIC_APP_COMMIT') != args.expected_commit: raise RuntimeError('container_commit_mismatch')
 if health.get('checks', {}).get('databaseContract', {}).get('details', {}).get('actualMigration') != 208: raise RuntimeError('actual_contract_not_208')
 url = urllib.parse.urlparse(env['DATABASE_URL'])
 pg = os.environ.copy()
 pg.update(PGHOST=url.hostname, PGPORT=str(url.port or 5432), PGUSER=urllib.parse.unquote(url.username), PGPASSWORD=urllib.parse.unquote(url.password), PGDATABASE=url.path.lstrip('/'), PGSSLMODE=urllib.parse.parse_qs(url.query).get('sslmode', ['require'])[0])
 def run(sql):
  command = ['docker', 'run', '--rm', '-i', '--network', 'host']
  for key in ['PGHOST', 'PGPORT', 'PGUSER', 'PGPASSWORD', 'PGDATABASE', 'PGSSLMODE']:
   command += ['--env', key]
  command += [IMAGE, 'psql', '-X', '-A', '-t', '-q', '-v', 'ON_ERROR_STOP=1']
  process = subprocess.run(command, input=sql, text=True, capture_output=True, env=pg, timeout=60)
  if process.returncode:
   if 'statement timeout' in process.stderr: raise RuntimeError('statement_timeout_15s')
   if 'lock timeout' in process.stderr: raise RuntimeError('lock_timeout_250ms')
   raise RuntimeError('bounded_production_query_failed')
  return process.stdout
 header = "begin read only;set local statement_timeout='15s';set local lock_timeout='250ms';\n"
 ordinary_owner = "select user_id as owner from user_card_status where fsrs_reps>0 or last_reviewed_at is not null group by user_id order by count(*) desc limit 1 \\gset\n"
 # Idiom scope may use a different existing learner, chosen only inside SQL.
 # If no answered idiom state exists, safely fall back to ordinary principal.
 idiom_owner = "select coalesce((select s.user_id from user_training_exercise_state s join private.platform_v2_training_exercise_targets t on t.id=s.target_id where t.family='idiom' and (s.fsrs_reps>0 or s.last_reviewed_at is not null) group by s.user_id order by count(*) desc limit 1),(select user_id from user_card_status where fsrs_reps>0 or last_reviewed_at is not null group by user_id order by count(*) desc limit 1)) as owner \\gset\n"
 auth = "select set_config('request.jwt.claim.sub',:'owner',true) as ignored \\gset\n"
 results={}
 selector=ordinary_owner+auth
 scope="'{\"dateWindow\":\"all\",\"presentationMode\":\"word-in-context\"}'::jsonb"
 query="select read_training_recipe_availability_v1(:'owner'::uuid,array['definition-to-word'],'"+args.list_id+"'::uuid,'curated',"+scope+",'meaning')"
 # Expand exact installed eligibility relation for physical-plan inspection only.
 source=run(header+"select prosrc from pg_proc where oid='private.training_recipe_eligible_cards_v1(uuid,text[],uuid,text,text,text,uuid[],text[],jsonb,boolean,boolean)'::regprocedure;rollback;")
 owner=run(header+"select user_id from user_card_status where fsrs_reps>0 or last_reviewed_at is not null group by user_id order by count(*) desc limit 1;rollback;").strip()
 replacements={'p_user_id':"'"+owner+"'::uuid",'p_card_type_ids':"array['definition-to-word']",'p_list_id':"'"+args.list_id+"'::uuid",'p_list_type':"'curated'",'p_card_filter':"'both'",'p_queue_turn':"'auto'",'p_exclude_entry_ids':'array[]::uuid[]','p_exclude_card_keys':'array[]::text[]','p_training_filter':scope,'p_filtered':'false','p_enforce_daily_limits':'false'}
 replacement="(cards.card_type_id='definition-to-word' AND cards.entry_id IN (SELECT example.entry_id FROM private.platform_v2_content_nodes example WHERE kind='example' AND binding_state='active' AND NULLIF(btrim(diagnostic_locator),'') IS NOT NULL AND diagnostic_locator ~ '^raw\\.meanings\\[[0-9]+\\]\\.examples\\[[0-9]+\\]$') AND (cards.entry_id IN (SELECT entry_id FROM public.user_card_status WHERE user_id=p_user_id AND card_type_id IN ('word-to-definition','definition-to-word') AND (COALESCE(in_learning,false) OR COALESCE(fsrs_enabled,false) OR COALESCE(fsrs_reps,0)>0 OR last_reviewed_at IS NOT NULL)) OR cards.entry_id IN (SELECT entry_id FROM public.user_card_known_marks WHERE user_id=p_user_id AND card_type_id IN ('word-to-definition','definition-to-word') AND cleared_at IS NULL)))"
 source, changed=re.subn(r"private\.training_word_context_candidate_v1\(\s*p_user_id,\s*cards\.entry_id,\s*cards\.card_type_id\)","(cards.card_type_id='definition-to-word' AND cards.entry_id IN (SELECT entry_id FROM context_eligible_entries))",source)
 if changed!=1: raise RuntimeError('exact_context_anchor_missing')
 context_sql=replacement.replace("cards.card_type_id='definition-to-word' AND cards.entry_id IN", "example.entry_id IN",1)
 # Materialize exactly intersected example/familiar entry set, once.
 context_sql="SELECT familiar.entry_id FROM (SELECT entry_id FROM public.user_card_status WHERE user_id=p_user_id AND card_type_id IN ('word-to-definition','definition-to-word') AND (COALESCE(in_learning,false) OR COALESCE(fsrs_enabled,false) OR COALESCE(fsrs_reps,0)>0 OR last_reviewed_at IS NOT NULL) UNION SELECT entry_id FROM public.user_card_known_marks WHERE user_id=p_user_id AND card_type_id IN ('word-to-definition','definition-to-word') AND cleared_at IS NULL) familiar WHERE EXISTS (SELECT 1 FROM private.platform_v2_content_nodes example WHERE example.entry_id=familiar.entry_id AND example.kind='example' AND example.binding_state='active' AND NULLIF(btrim(example.diagnostic_locator),'') IS NOT NULL AND example.diagnostic_locator ~ '^raw\\.meanings\\[[0-9]+\\]\\.examples\\[[0-9]+\\]$')"

 source=re.sub(r'\bWITH\b',lambda m:'WITH context_eligible_entries AS MATERIALIZED ('+context_sql+'),',source,count=1,flags=re.I)

 expanded=re.sub(r'\bp_[a-z_]+\b',lambda m:replacements.get(m.group(),m.group()),source).strip().rstrip(';')
 plan_header=header+selector+"set local search_path=public,private,pg_temp;set local enable_nestloop=on;set local plan_cache_mode=force_custom_plan;set local jit=off;"
 try: results['expandedPlan']=json.loads(run(plan_header+'explain(analyze,buffers,timing off,format json) select count(*) from ('+expanded+') candidates;rollback;'))
 except RuntimeError as error:
  results['expandedAnalyzeError']=str(error)
  results['expandedPlan']=json.loads(run(plan_header+'explain(format json) select count(*) from ('+expanded+') candidates;rollback;'))
 end_day="(select end_at from private.training_study_day_bounds_v1(private.training_reference_now_v1(),private.training_schedule_timezone_v1(private.training_user_timezone_v1('"+owner+"'::uuid))))"
 counters="select jsonb_build_object('dueToday',count(*) filter(where fsrs_enabled and introduced and next_review_at<"+end_day+"),'totalReviews',count(*) filter(where fsrs_enabled and introduced),'newCards',count(*) filter(where intrinsic_source='new')) from ("+expanded+") candidates"
 results['setBasedCounters']=json.loads(run(plan_header+counters+';rollback;'))
 def sanitize(value):
  if isinstance(value,str): return re.sub(r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}','[uuid]',value,flags=re.I)
  if isinstance(value,list): return [sanitize(x) for x in value]
  if isinstance(value,dict): return {k:sanitize(v) for k,v in value.items()}
  return value
 print(json.dumps(sanitize(results),indent=2))
except Exception as error:
 print(json.dumps({'error':'bounded_diagnosis_failed','category':str(error) if isinstance(error,RuntimeError) else type(error).__name__}));raise SystemExit(1)
