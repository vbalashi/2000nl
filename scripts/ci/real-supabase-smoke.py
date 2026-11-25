#!/usr/bin/env python3
"""Run one smoke against a disposable, loopback-only Supabase project."""
import hashlib, json, os, pathlib, pwd, re, secrets, shutil, signal, socket, stat, subprocess, sys, tempfile, time, urllib.request
from smoke_docker_guard import snapshot, validate_cleanup, validate_network, validate_database, reconcile_partial, require_confirmed_start
from smoke_diagnostics import run_logged

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

def inventory(project, network_id):
    network = json.loads(output('docker', 'network', 'inspect', network_id))[0]
    ids = output('docker', 'ps', '-aq', '--filter', 'name=' + project).splitlines()
    names = output('docker', 'volume', 'ls', '-q', '--filter', 'name=' + project).splitlines()
    containers = json.loads(output('docker', 'inspect', *ids)) if ids else []
    volumes = json.loads(output('docker', 'volume', 'inspect', *names)) if names else []
    return snapshot(project, network_id, network, containers, volumes), containers


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
# Never honor a caller's Docker context, host, credentials, or API overrides.
# These fixed local sockets are the only supported daemon entry points.
fault_injection = os.environ.get('REAL_SMOKE_REVOKE_ADD') == '1'
inherited = {k: os.environ[k] for k in ('PATH', 'HOME', 'TMPDIR', 'CI', 'LANG') if k in os.environ}
# setup-cli selects Supabase's GitHub registry on Actions. Keep only that trusted value.
if os.environ.get('SUPABASE_INTERNAL_IMAGE_REGISTRY') == 'ghcr.io':
    inherited['SUPABASE_INTERNAL_IMAGE_REGISTRY'] = 'ghcr.io'
home = pathlib.Path(pwd.getpwuid(os.getuid()).pw_dir)
candidates = ([home / '.colima/default/docker.sock', home / '.docker/run/docker.sock']
              if sys.platform == 'darwin' else [pathlib.Path('/var/run/docker.sock')])
socket_path = next((p for p in candidates if p.exists() and stat.S_ISSOCK(p.stat().st_mode)), None)
if socket_path is None:
    sys.exit('No approved local Docker socket found')
tmp = pathlib.Path(tempfile.mkdtemp(prefix='2000nl-real-smoke-'))
(tmp / 'docker').mkdir()
os.environ.clear()
os.environ.update(inherited)
os.environ.update({'DOCKER_HOST': 'unix://' + str(socket_path), 'DOCKER_CONFIG': str(tmp / 'docker')})
project = 'qa164-' + secrets.token_hex(8)
network = project + '-net'
if output('docker', 'ps', '-aq', '--filter', 'name=' + project) or output('docker', 'volume', 'ls', '-q', '--filter', 'name=' + project) or output('docker', 'network', 'ls', '-q', '--filter', 'name=^' + network + '$'):
    shutil.rmtree(tmp)
    sys.exit('Unexpected existing project resource')
(tmp / 'supabase').mkdir()
config = (ROOT / 'supabase/config.toml').read_text().replace('2000nl-public', project)
for i in range(10):
    config = config.replace(str(55320 + i), str(base + i))
(tmp / 'supabase/config.toml').write_text(config)
server = None
network_id = None
network_attempted = False
project_started = False
startup_confirmed = False
owned = None
preserve_recovery = False
result = 1
try:
    network_attempted = True
    network_id = output('docker', 'network', 'create', '--driver', 'bridge', '--label', '2000nl.smoke.owner=' + project, '--opt', 'com.docker.network.bridge.host_binding_ipv4=127.0.0.1', network)
    if not re.fullmatch('[0-9a-f]{64}', network_id):
        raise RuntimeError('Unexpected network ID')
    validate_network(json.loads(output('docker', 'network', 'inspect', network_id))[0], network_id, project)
    project_started = True
    with (tmp / 'start.log').open('w') as log:
        run('supabase', '--workdir', str(tmp), '--network-id', network, 'start', stdout=log, stderr=log)
    startup_confirmed = True
    owned, details = inventory(project, network_id)
    if not owned[0] or not owned[1]:
        raise RuntimeError('Incomplete owned project inventory')
    for c in details:
        if project not in c['Name']:
            raise RuntimeError('Container ownership mismatch')
        for bindings in (c['NetworkSettings'].get('Ports') or {}).values():
            for binding in bindings or []:
                if binding['HostIp'] != '127.0.0.1':
                    raise RuntimeError('Container exposed outside loopback')
    db = [c for c in details if c.get('Name') == '/supabase_db_' + project]
    if len(db) != 1:
        raise RuntimeError('Expected exactly one owned database container')
    db_id = db[0]['Id']
    validate_database(db[0], db_id, project, network_id, base + 2)
    status = json.loads(output('supabase', '--workdir', str(tmp), 'status', '-o', 'json'))
    if status['API_URL'] != f'http://127.0.0.1:{base + 1}':
        raise RuntimeError('Unexpected API target')
    contract = json.loads((ROOT / 'packages/shared/deployment/db-contract.json').read_text())
    if hashlib.sha256((ROOT / contract['baseline']['file']).read_bytes()).hexdigest() != contract['baseline']['sha256']:
        raise RuntimeError('Baseline checksum mismatch')
    # Execute every bootstrap command inside the verified immutable database
    # container. Host-port availability is never used to choose a write target.
    validate_database(json.loads(output('docker', 'inspect', db_id))[0], db_id, project, network_id, base + 2)
    run('docker', 'exec', db_id, 'mkdir', '-p', '/tmp/2000nl-smoke/db')
    for directory in ('migrations', 'deploy-contract', 'test-fixtures'):
        run('docker', 'cp', str(ROOT / 'db' / directory), db_id + ':/tmp/2000nl-smoke/db/')
    psql = ['docker', 'exec', '-i', '-e', 'PGPASSWORD=postgres', '-w', '/tmp/2000nl-smoke', db_id, 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', '5432', '-U', 'postgres', '-d', 'postgres']
    if output(*psql, '-At', '-c', "select to_regclass('public.word_entries') is not null") != 'f':
        raise RuntimeError('Refusing to bootstrap a populated database')
    bootstrap_log = tmp / 'bootstrap.log'
    for f in ['db/migrations/bootstrap.sql', 'db/test-fixtures/search_multisource.sql', 'db/test-fixtures/training_smoke.sql']:
        run_logged([*psql, '-f', f], bootstrap_log)
    run_logged([*psql, '-c', 'SELECT public.refresh_dictionary_search_document(id, 2) FROM public.word_entries'], bootstrap_log)
    run_logged([*psql, '-f', contract['postflightProbe']], bootstrap_log)
    commit = output('git', 'rev-parse', 'HEAD')
    cid = contract['contractId']; migration = contract['migrations'][-1]['migrationId']
    if not re.fullmatch('[a-z0-9-]+', cid) or not re.fullmatch('[0-9a-f]{40}', commit) or not isinstance(migration, int):
        raise RuntimeError('Invalid contract metadata')
    run_logged([*psql, '-c', f"INSERT INTO public.app_db_contract_state(singleton,contract_id,migration_id,app_commit) VALUES(true,'{cid}',{migration},'{commit}')"], bootstrap_log)
    # Fault injection is confined to this freshly created project and used only to
    # verify that a missing application permission makes the smoke fail.
    if fault_injection:
        run(*psql, '-c', 'REVOKE EXECUTE ON FUNCTION public.add_entry_to_user_list(uuid,uuid,uuid) FROM PUBLIC, authenticated', stdout=subprocess.DEVNULL)
    status_file = tmp / 'status.json'; status_file.write_text(json.dumps(status))
    qa_file = tmp / 'qa.json'
    minimal = {k: os.environ[k] for k in ('PATH', 'HOME', 'TMPDIR', 'CI', 'DOCKER_HOST', 'DOCKER_CONFIG') if k in os.environ}
    minimal.update({'SMOKE_STATUS_FILE': str(status_file), 'SMOKE_QA_FILE': str(qa_file), 'SMOKE_WEB_PORT': str(web_port), 'SMOKE_DB_PORT': str(base + 2), 'SMOKE_DB_CONTAINER': db_id})
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
    if network_attempted:
        try:
            # An unsuccessful create/start may still complete on the daemon after
            # the client returns. Never infer quiescence from a single inventory.
            require_confirmed_start(network_id, project_started, startup_confirmed)
            current, _ = inventory(project, network_id)
            if project_started:
                if owned is None:
                    owned = reconcile_partial(current, startup_confirmed)
                validate_cleanup(owned, current)
            elif current != (frozenset(), {}):
                raise ValueError('Unexpected resources before startup')
            # Stop by immutable container ID, then remove only the previously
            # fingerprinted volumes. Refuse cleanup on any inventory mismatch.
            if current[0]:
                run('docker', 'rm', '-f', *sorted(current[0]), stdout=subprocess.DEVNULL)
            check_network = json.loads(output('docker', 'network', 'inspect', network_id))[0]
            validate_network(check_network, network_id, project)
            if check_network.get('Containers'):
                raise ValueError('Network still has attachments')
            for name, fingerprint in current[1].items():
                volume = json.loads(output('docker', 'volume', 'inspect', name))[0]
                labels = volume.get('Labels') or {}
                if (volume.get('CreatedAt'), volume.get('Driver'), tuple(sorted(labels.items()))) != fingerprint:
                    raise ValueError('Volume identity changed before removal')
                run('docker', 'volume', 'rm', name, stdout=subprocess.DEVNULL)
            run('docker', 'network', 'rm', network_id, stdout=subprocess.DEVNULL)
            if (output('docker', 'ps', '-aq', '--filter', 'name=' + project)
                    or output('docker', 'volume', 'ls', '-q', '--filter', 'name=' + project)
                    or output('docker', 'network', 'ls', '-q', '--filter', 'id=' + network_id)):
                raise ValueError('Owned resources remain after cleanup')
        except Exception as cleanup_error:
            print(f'Cleanup refused or incomplete for disposable project {project}: {cleanup_error}', file=sys.stderr)
            (tmp / 'RECOVERY.txt').write_text(f'Project: {project}\nNetwork ID: {network_id or "unknown"}\nReason: {cleanup_error}\n')
            print(f'Protected recovery details retained in {tmp}', file=sys.stderr)
            preserve_recovery = True
            result = 1
    if not preserve_recovery:
        shutil.rmtree(tmp)
sys.exit(result)
