#!/usr/bin/env python3
"""Run one smoke against a disposable, loopback-only Supabase project."""
import hashlib, json, os, pathlib, re, secrets, shutil, signal, socket, subprocess, sys, tempfile, time, urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[2]
os.chdir(ROOT)
os.umask(0o077)

def run(*args, **kw):
    return subprocess.run(args, check=True, **kw)

def output(*args):
    return subprocess.check_output(args, text=True).strip()

def available(port):
    s = socket.socket()
    try:
        s.bind(('127.0.0.1', port))
        return True
    except OSError:
        return False
    finally:
        s.close()

for name in ('.env', '.env.local', '.env.development', '.env.development.local'):
    if (ROOT / 'apps/ui' / name).exists():
        sys.exit('Refusing to load a local environment file; use a clean worktree')

if output('supabase', '--version') != '2.101.0':
    sys.exit('The isolated smoke requires Supabase CLI 2.101.0')
for n in range(200):
    base = 20000 + secrets.randbelow(3000) * 10
    if all(available(base + i) for i in range(10)):
        break
else:
    sys.exit('No free local port block')
for n in range(100):
    web_port = 20000 + secrets.randbelow(30000)
    if web_port not in range(base, base + 10) and available(web_port):
        break
else:
    sys.exit('No free local web port')
project = 'qa164-' + secrets.token_hex(8)
network = project + '-net'
if output('docker', 'ps', '-aq', '--filter', 'name=' + project) or output('docker', 'volume', 'ls', '-q', '--filter', 'name=' + project) or output('docker', 'network', 'ls', '-q', '--filter', 'name=^' + network + '$'):
    sys.exit('Unexpected existing project resource')
tmp = pathlib.Path(tempfile.mkdtemp(prefix='2000nl-real-smoke-'))
(tmp / 'supabase').mkdir()
config = (ROOT / 'supabase/config.toml').read_text().replace('2000nl-public', project)
for i in range(10):
    config = config.replace(str(55320 + i), str(base + i))
(tmp / 'supabase/config.toml').write_text(config)
server = None
network_created = False
project_started = False
result = 1
try:
    run('docker', 'network', 'create', '--driver', 'bridge', '--opt', 'com.docker.network.bridge.host_binding_ipv4=127.0.0.1', network, stdout=subprocess.DEVNULL)
    network_created = True
    # Claim the unique project before starting, so a partial startup is cleaned up.
    project_started = True
    with (tmp / 'start.log').open('w') as log:
        run('supabase', '--workdir', str(tmp), '--network-id', network, 'start', stdout=log, stderr=log)
    containers = output('docker', 'ps', '-aq', '--filter', 'name=' + project).splitlines()
    if not containers:
        raise RuntimeError('No owned containers found')
    details = json.loads(output('docker', 'inspect', *containers))
    for c in details:
        if project not in c['Name']:
            raise RuntimeError('Container ownership mismatch')
        for bindings in (c['NetworkSettings'].get('Ports') or {}).values():
            for binding in bindings or []:
                if binding['HostIp'] != '127.0.0.1':
                    raise RuntimeError('Container exposed outside loopback')
    status = json.loads(output('supabase', '--workdir', str(tmp), 'status', '-o', 'json'))
    if status['API_URL'] != f'http://127.0.0.1:{base + 1}':
        raise RuntimeError('Unexpected API target')
    contract = json.loads((ROOT / 'packages/shared/deployment/db-contract.json').read_text())
    if hashlib.sha256((ROOT / contract['baseline']['file']).read_bytes()).hexdigest() != contract['baseline']['sha256']:
        raise RuntimeError('Baseline checksum mismatch')
    env = {'PATH': os.environ['PATH'], 'PGPASSWORD': 'postgres'}
    psql = ['psql', '-X', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', str(base + 2), '-U', 'postgres', '-d', 'postgres']
    if subprocess.check_output([*psql, '-At', '-c', "select to_regclass('public.word_entries') is not null"], env=env, text=True).strip() != 'f':
        raise RuntimeError('Refusing to bootstrap a populated database')
    with (tmp / 'bootstrap.log').open('w') as log:
        for f in ['db/migrations/bootstrap.sql', 'db/test-fixtures/search_multisource.sql', 'db/test-fixtures/training_smoke.sql']:
            run(*psql, '-f', f, env=env, stdout=log, stderr=log)
        run(*psql, '-c', 'SELECT public.refresh_dictionary_search_document(id, 2) FROM public.word_entries', env=env, stdout=log, stderr=log)
        run(*psql, '-f', contract['postflightProbe'], env=env, stdout=log, stderr=log)
        commit = output('git', 'rev-parse', 'HEAD')
        cid = contract['contractId']; migration = contract['migrations'][-1]['migrationId']
        if not re.fullmatch('[a-z0-9-]+', cid) or not re.fullmatch('[0-9a-f]{40}', commit) or not isinstance(migration, int):
            raise RuntimeError('Invalid contract metadata')
        run(*psql, '-c', f"INSERT INTO public.app_db_contract_state(singleton,contract_id,migration_id,app_commit) VALUES(true,'{cid}',{migration},'{commit}')", env=env, stdout=log, stderr=log)
    # Fault injection is confined to this freshly created project and used only to
    # verify that a missing application permission makes the smoke fail.
    if os.environ.get('REAL_SMOKE_REVOKE_ADD') == '1':
        run(*psql, '-c', 'REVOKE EXECUTE ON FUNCTION public.add_entry_to_user_list(uuid,uuid,uuid) FROM PUBLIC, authenticated', env=env, stdout=subprocess.DEVNULL)
    status_file = tmp / 'status.json'; status_file.write_text(json.dumps(status))
    qa_file = tmp / 'qa.json'
    minimal = {k: os.environ[k] for k in ('PATH', 'HOME', 'TMPDIR', 'CI') if k in os.environ}
    minimal.update({'SMOKE_STATUS_FILE': str(status_file), 'SMOKE_QA_FILE': str(qa_file), 'SMOKE_WEB_PORT': str(web_port), 'SMOKE_DB_PORT': str(base + 2)})
    run('node', str(ROOT / 'scripts/ci/real-supabase-smoke.mjs'), 'seed', env=minimal)
    with (tmp / 'server.log').open('w') as log:
        server = subprocess.Popen(['node', str(ROOT / 'scripts/ci/real-supabase-smoke.mjs'), 'server'], env=minimal, stdout=log, stderr=log, start_new_session=True)
        for _ in range(120):
            if server.poll() is not None:
                raise RuntimeError('Local UI server exited')
            try:
                with urllib.request.urlopen(f'http://127.0.0.1:{web_port}/api/health?deep=1', timeout=3) as response:
                    health = json.load(response)
                if health['status'] == 'ok' and health['database']['target'] == 'local':
                    break
            except Exception:
                pass
            time.sleep(1)
        else:
            raise RuntimeError('Local health check failed')
        run('node', str(ROOT / 'scripts/ci/real-supabase-smoke.mjs'), 'test', env=minimal)
    result = 0
except Exception as e:
    print(f'Isolated smoke failed: {type(e).__name__}: {e}', file=sys.stderr)
finally:
    if server and server.poll() is None:
        os.killpg(server.pid, signal.SIGTERM)
        try: server.wait(timeout=15)
        except subprocess.TimeoutExpired:
            os.killpg(server.pid, signal.SIGKILL); server.wait()
    if project_started:
        with (tmp / 'stop.log').open('w') as log:
            stopped = subprocess.run(['supabase', '--workdir', str(tmp), 'stop', '--project-id', project, '--no-backup'], stdout=log, stderr=log)
        if stopped.returncode or output('docker', 'ps', '-aq', '--filter', 'name=' + project):
            print('Failed to clean up the owned Supabase project', file=sys.stderr); result = 1
    if network_created:
        removed = subprocess.run(['docker', 'network', 'rm', network], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        if removed.returncode:
            print('Failed to clean up the owned network', file=sys.stderr); result = 1
    shutil.rmtree(tmp)
sys.exit(result)
