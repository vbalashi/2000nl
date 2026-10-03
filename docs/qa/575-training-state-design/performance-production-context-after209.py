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
 if health.get('commit') != args.expected_commit or health.get('checks', {}).get('databaseContract', {}).get('details', {}).get('expectedMigration') != 209 or health.get('status') != 'ok':
  raise RuntimeError('deployment_not_ready_for_rpc209')
 env = dict(item.split('=', 1) for item in json.loads(subprocess.check_output(['docker', 'inspect', '2000nl-ui-ui-1'], text=True))[0]['Config']['Env'] if '=' in item)
 if env.get('NEXT_PUBLIC_APP_COMMIT') != args.expected_commit: raise RuntimeError('container_commit_mismatch')
 if health.get('checks', {}).get('databaseContract', {}).get('details', {}).get('actualMigration') != 209: raise RuntimeError('actual_contract_not_209')
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
 results={'capturedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'deployedCommit':health['commit'],'dbContract':209,'samples':[]}
 selector=ordinary_owner+auth
 results['historyFacts']=json.loads(run(header+selector+"select jsonb_build_object('answeredOrdinaryStates',(select count(*) from user_card_status where user_id=:'owner' and (fsrs_reps>0 or last_reviewed_at is not null)),'answeredReverseStates',(select count(*) from user_card_status where user_id=:'owner' and card_type_id='definition-to-word' and (fsrs_reps>0 or last_reviewed_at is not null)));rollback;"))
 scope="'{\"dateWindow\":\"all\",\"presentationMode\":\"word-in-context\"}'::jsonb"
 query="select read_training_recipe_availability_v1(:'owner'::uuid,array['definition-to-word'],'"+args.list_id+"'::uuid,'curated',"+scope+",'meaning')"
 try:
  plans_output=run(header+selector+'\n'.join('explain(analyze,timing off,format json) '+query+';' for _ in range(6))+'rollback;')
  decoder=json.JSONDecoder();remaining=plans_output.strip();plans=[]
  while remaining:
   value,end=decoder.raw_decode(remaining);plans.append(value[0]);remaining=remaining[end:].lstrip()
  results['samples']=[p['Execution Time'] for p in plans]
  warm=sorted(results['samples'][1:]);results.update(warmSamples=len(warm),medianSqlMs=statistics.median(warm),minSqlMs=warm[0],maxSqlMs=warm[-1])
  results['counters']=json.loads(run(header+selector+query+';rollback;'))
 except RuntimeError as error:results['error']=str(error)
 print(json.dumps(results,indent=2))
except Exception as error:
 print(json.dumps({'error':'bounded_post209_probe_failed','category':str(error) if isinstance(error,RuntimeError) else type(error).__name__}));raise SystemExit(1)
