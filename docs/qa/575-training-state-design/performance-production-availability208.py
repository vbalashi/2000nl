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
   if 'statement timeout' in process.stderr: raise RuntimeError('statement_timeout_3s')
   if 'lock timeout' in process.stderr: raise RuntimeError('lock_timeout_250ms')
   raise RuntimeError('bounded_production_query_failed')
  return process.stdout
 header = "begin read only;set local statement_timeout='3s';set local lock_timeout='250ms';\n"
 ordinary_owner = "select user_id as owner from user_card_status where fsrs_reps>0 or last_reviewed_at is not null group by user_id order by count(*) desc limit 1 \\gset\n"
 # Idiom scope may use a different existing learner, chosen only inside SQL.
 # If no answered idiom state exists, safely fall back to ordinary principal.
 idiom_owner = "select coalesce((select s.user_id from user_training_exercise_state s join private.platform_v2_training_exercise_targets t on t.id=s.target_id where t.family='idiom' and (s.fsrs_reps>0 or s.last_reviewed_at is not null) group by s.user_id order by count(*) desc limit 1),(select user_id from user_card_status where fsrs_reps>0 or last_reviewed_at is not null group by user_id order by count(*) desc limit 1)) as owner \\gset\n"
 auth = "select set_config('request.jwt.claim.sub',:'owner',true) as ignored \\gset\n"
 facts = json.loads(run(header + ordinary_owner + auth + "select jsonb_build_object('rpcAvailable',to_regprocedure('public.read_training_recipe_availability_v1(uuid,text[],uuid,text,jsonb,text)') is not null,'entries',(select count(*) from word_entries),'activeBindings',(select count(*) from private.source_entry_bindings where binding_state='active'),'activeContentNodes',(select count(*) from private.platform_v2_content_nodes where binding_state='active'),'ordinaryStates',(select count(*) from user_card_status where user_id=:'owner'),'ordinaryAnsweredStates',(select count(*) from user_card_status where user_id=:'owner' and (fsrs_reps>0 or last_reviewed_at is not null)),'ordinaryAnsweredReverseStates',(select count(*) from user_card_status where user_id=:'owner' and card_type_id='definition-to-word' and (fsrs_reps>0 or last_reviewed_at is not null)),'postgresVersion',current_setting('server_version'));rollback;"))
 if not facts['rpcAvailable']: raise RuntimeError('rpc208_not_installed')
 facts.update(json.loads(run(header + idiom_owner + auth + "select jsonb_build_object('selectedIdiomAnsweredStates',(select count(*) from user_training_exercise_state s join private.platform_v2_training_exercise_targets t on t.id=s.target_id where s.user_id=:'owner' and t.family='idiom' and (s.fsrs_reps>0 or s.last_reviewed_at is not null)),'idiomUsesSamePrincipal',(select user_id from user_card_status where fsrs_reps>0 or last_reviewed_at is not null group by user_id order by count(*) desc limit 1)=:'owner'::uuid);rollback;")))
 all_scope = {'dateWindow': 'all', 'dictionaryScope': {'mode': 'all', 'languageCode': 'nl'}}
 cases = [
  ('meaning-all-direct', ['word-to-definition'], all_scope, 'meaning', ordinary_owner),
  ('meaning-all-both', ['word-to-definition', 'definition-to-word'], all_scope, 'meaning', ordinary_owner),
  ('meaning-nouns-both', ['word-to-definition', 'definition-to-word'], dict(all_scope, partOfSpeech=['zn']), 'meaning', ordinary_owner),
  ('meaning-verbs-both', ['word-to-definition', 'definition-to-word'], dict(all_scope, partOfSpeech=['ww']), 'meaning', ordinary_owner),
  ('context-reverse', ['definition-to-word'], dict(all_scope, presentationMode='word-in-context'), 'meaning', ordinary_owner),
  ('idiom-direct', ['idiom:direct'], all_scope, 'idiom', idiom_owner),
  ('idiom-both', ['idiom:direct', 'idiom:reverse'], all_scope, 'idiom', idiom_owner),
 ]
 results = []
 for name, modes, scope, family, selector in cases:
  # Every literal here is a fixed benchmark enum or generated JSON; no owner in output.
  modes_sql = 'array[' + ','.join("'" + mode + "'" for mode in modes) + ']'
  scope_sql = "'" + json.dumps(scope).replace("'", "''") + "'::jsonb"
  query = "select read_training_recipe_availability_v1(:'owner'::uuid," + modes_sql + ",null,'curated'," + scope_sql + ",'" + family + "')"
  try:
   sample_output = run(header + selector + auth + '\n'.join('explain(analyze,format json,timing off) ' + query + ';' for _ in range(11)) + '\nrollback;')
   decoder = json.JSONDecoder(); remaining = sample_output.strip(); plans = []
   while remaining:
    plan, end = decoder.raw_decode(remaining); plans.append(plan[0]); remaining = remaining[end:].lstrip()
   execution = [plan['Execution Time'] for plan in plans]; warm = sorted(execution[1:])
   counts = json.loads(run(header + selector + auth + query + ';rollback;'))
   # Drop all unexpected fields; trusted RPC remains scheduling authority.
   counts = {key: counts[key] for key in ['dueToday', 'totalReviews', 'newCards', 'studyDay', 'timezone', 'asOf']}
   results.append(dict(name=name, warmSamples=len(warm), firstExecutionMs=execution[0], medianExecutionMs=statistics.median(warm), p95ExecutionMs=warm[math.ceil(.95*len(warm))-1], medianPlanningMs=statistics.median(plan['Planning Time'] for plan in plans[1:]), counters=counts, rawExecutionMs=execution))
  except RuntimeError as error:
   results.append(dict(name=name, error=str(error), warmSamples=0))
 print(json.dumps(dict(capturedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(), deployedVersion=health['version'], deployedCommit=health['commit'], dbContract=208, facts=facts, results=results), indent=2))
except Exception as error:
 category = str(error) if isinstance(error, RuntimeError) else type(error).__name__
 print(json.dumps({'error': 'production_rpc208_probe_failed_no_secrets_logged', 'category': category}))
 raise SystemExit(1)
