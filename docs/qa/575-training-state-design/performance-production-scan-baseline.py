#!/usr/bin/env python3
"""Bounded read-only production RPC208 benchmark. Run on NUC over SSH.
Requires exact deployed commit; emits sanitized counters/timings only.
No installation, schema/learner changes, temp fixture or planner session creation.
"""
import argparse, datetime, json, math, os, re, statistics, subprocess, time, urllib.parse, urllib.request
IMAGE = 'postgres@sha256:ef257d85f76e48da1c64832459b59fcaba1a4dac97bf5d7450c77753542eee94'
parser = argparse.ArgumentParser()
parser.add_argument('--expected-commit', required=True)
parser.add_argument('--verified-health-file')
args = parser.parse_args()
try:
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
 results={'databaseHostClass': 'supabase-cloud' if 'supabase' in url.hostname else 'other-remote' if url.hostname not in ['localhost','127.0.0.1'] else 'local'}
 for name, query in [('entries', 'select count(*) from word_entries'),('bindings',"select count(*) from private.source_entry_bindings where binding_state='active'"),('nodes', 'select count(*) from private.platform_v2_content_nodes'),('examples',"select count(*) from private.platform_v2_content_nodes where kind='example' and binding_state='active' and diagnostic_locator ~ '^raw\\.meanings\\[[0-9]+\\]\\.examples\\[[0-9]+\\]$'")]:
  try:
   plans=json.loads(run(header+ordinary_owner+auth+'set local jit=off;explain(analyze,buffers,timing on,format json) '+query+';rollback;'))
   plan=plans[0]; results[name]={'executionMs':plan['Execution Time'],'planningMs':plan['Planning Time'],'plan':plan['Plan']}
  except RuntimeError as error: results[name]={'error':str(error)}
 def sanitize(v):
  if isinstance(v,str):return re.sub(r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}','[uuid]',v,flags=re.I)
  if isinstance(v,list):return [sanitize(x) for x in v]
  if isinstance(v,dict):return {k:sanitize(x) for k,x in v.items()}
  return v
 print(json.dumps(sanitize(results),indent=2))
except Exception as error:
 print(json.dumps({'error':'bounded_scan_diagnosis_failed','category':str(error) if isinstance(error,RuntimeError) else type(error).__name__}));raise SystemExit(1)
