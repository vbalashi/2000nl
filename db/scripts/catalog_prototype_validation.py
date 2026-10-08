#!/usr/bin/env python3
"""Disposable local validation of diagnostic catalog prototype; never migrates a live DB."""
import json
import hashlib
import os
from pathlib import Path
import re
import subprocess
import time
from urllib.parse import urlsplit, urlunsplit

ROOT = Path(__file__).resolve().parents[2]
SCHEMA_ROOT = Path(os.environ.get("CATALOG_PROTOTYPE_SCHEMA_ROOT", str(ROOT))).resolve()
if not (SCHEMA_ROOT / "db/migrations/bootstrap.sql").is_file():
    raise SystemExit("Selected schema checkout lacks bootstrap.sql")
BASE = os.environ.get("CATALOG_PROTOTYPE_TEST_BASE_DB_URL")
if not BASE:
    raise SystemExit("Set an explicit dedicated-container loopback database URL; canonical local DB is not a test target")
u = urlsplit(BASE)
if u.hostname not in ("127.0.0.1", "localhost", "::1") or u.port == 54322:
    raise SystemExit("Only dedicated loopback test servers are accepted; canonical 54322 is forbidden")
NAME = "catalog_prototype_" + str(os.getpid()) + "_" + str(int(time.time()))
TARGET = urlunsplit(u._replace(path="/" + NAME))
QA = "41300000-0000-0000-0000-000000000001"
OTHER = "41300000-0000-0000-0000-000000000002"
DICT = "413d0000-0000-0000-0000-000000000001"
HIDDEN = "413d0000-0000-0000-0000-000000000002"

def sql(text, target=TARGET, file=None):
    args = ["psql", "-d", target, "-X", "-q", "-At", "-v", "ON_ERROR_STOP=1"]
    if file:
        args += ["-f", str(SCHEMA_ROOT / file)]
    r = subprocess.run(args, input=None if file else text, text=True,
                       capture_output=True, cwd=SCHEMA_ROOT if file else ROOT, timeout=90)
    if r.returncode:
        raise RuntimeError("Disposable test SQL failed: " + r.stderr[-1600:])
    return r.stdout


def candidate_definition():
    source = sql("SELECT pg_get_functiondef('public.get_available_word_lists(uuid,text,text)'::regprocedure);")
    source, replacements = re.subn(r"FUNCTION public\.get_available_word_lists\(", "FUNCTION public.catalog_prototype_candidate(", source, count=1)
    if replacements != 1 or source.count("WITH curated AS (") != 1:
        raise RuntimeError("Catalog prototype transformation anchors changed")
    start = source.index("            FROM (")
    end = source.index("            ) AS source", start) + len("            ) AS source")
    source = source[:start] + "            FROM curated_source_counts source\n            WHERE source.list_id=l.id" + source[end:]
    prefix = """WITH entry_sources AS MATERIALIZED (
 SELECT id,dictionary_id FROM public.word_entries
), selected_lists AS MATERIALIZED (
 SELECT id FROM public.word_lists
 WHERE (p_list_type IS NULL OR p_list_type='curated')
   AND (v_language_code IS NULL OR language_code=v_language_code)
), curated_source_counts AS MATERIALIZED (
 SELECT item.list_id,entry.dictionary_id,count(*)::int AS item_count,
        entry.dictionary_id IS NULL OR public.can_browse_dictionary(p_user_id,entry.dictionary_id) AS accessible
 FROM public.word_list_items item
 JOIN selected_lists selected ON selected.id=item.list_id
 JOIN entry_sources entry ON entry.id=item.word_id
 GROUP BY item.list_id,entry.dictionary_id
), curated AS ("""
    source = source.replace("WITH curated AS (", prefix, 1)
    if os.environ.get("CATALOG_PROTOTYPE_TEST_FAULT") == "drop-auth-guard":
        source = re.sub(r"    IF p_user_id IS DISTINCT FROM.*?    END IF;", "", source, count=1, flags=re.S)
    return source.rstrip().rstrip(";") + ";\n"


def claims():
    return f"SELECT set_config('request.jwt.claim.sub','{QA}',true); SET LOCAL ROLE authenticated;"


def parity(label):
    result = sql(f"""BEGIN READ ONLY; SET LOCAL statement_timeout='10s'; {claims()}
DO $$ DECLARE lang text; kind text; old jsonb; candidate jsonb; n int:=0;
BEGIN
 FOREACH lang IN ARRAY ARRAY[NULL,'nl','en','zz',' nl ','']::text[] LOOP
  FOREACH kind IN ARRAY ARRAY[NULL,'curated','user','unexpected','']::text[] LOOP
   old:=public.get_available_word_lists('{QA}',lang,kind);
   candidate:=public.catalog_prototype_candidate('{QA}',lang,kind);
   IF old IS DISTINCT FROM candidate THEN RAISE EXCEPTION 'catalog parity failed lang=% type=%',lang,kind; END IF;
   n:=n+1;
  END LOOP;
 END LOOP;
 RAISE NOTICE 'parity cases=%',n;
END $$; ROLLBACK;""")
    print(json.dumps({"stage": label, "exact_json_parity_cases": 30}), flush=True)


def guards():
    sql(f"""BEGIN READ ONLY; {claims()}
DO $$ DECLARE fn text; rejected boolean;
BEGIN
 FOREACH fn IN ARRAY ARRAY['get_available_word_lists','catalog_prototype_candidate'] LOOP
  rejected:=false;
  BEGIN EXECUTE format('SELECT public.%I($1,NULL,NULL)',fn) USING '{OTHER}'::uuid;
  EXCEPTION WHEN raise_exception THEN
   IF SQLERRM <> 'unauthorized: user_id does not match authenticated user' THEN RAISE; END IF;
   rejected:=true;
  END;
  IF NOT rejected THEN RAISE EXCEPTION 'identity mismatch accepted'; END IF;
 END LOOP;
END $$; ROLLBACK;
BEGIN READ ONLY; SET LOCAL ROLE anon;
DO $$ DECLARE fn text; rejected boolean;
BEGIN
 FOREACH fn IN ARRAY ARRAY['get_available_word_lists','catalog_prototype_candidate'] LOOP
  rejected:=false;
  BEGIN EXECUTE format('SELECT public.%I($1,NULL,NULL)',fn) USING '{QA}'::uuid;
  EXCEPTION WHEN insufficient_privilege THEN rejected:=true;
  END;
  IF NOT rejected THEN RAISE EXCEPTION 'anon execute accepted'; END IF;
 END LOOP;
END $$; ROLLBACK;""")
    print(json.dumps({"stage": "auth guards", "checks": 4}), flush=True)


def cpu_pair(order):
    container = os.environ.get('CATALOG_PROTOTYPE_CPU_CONTAINER')
    if not container:
        return {'cpu_accounting': 'not requested'}
    if not re.fullmatch(r'[a-zA-Z0-9_.-]+', container):
        raise ValueError('Invalid dedicated container name')
    expected_system = sql('SELECT system_identifier FROM pg_control_system();',target=BASE).strip()
    observed_system = subprocess.check_output(['docker','exec',container,'psql','-U','postgres','-At','-c','SELECT system_identifier FROM pg_control_system();'],text=True,timeout=5).strip()
    if expected_system != observed_system:
        raise ValueError('CPU container does not own the tested database server')
    ticks = int(subprocess.check_output(['docker','exec',container,'getconf','CLK_TCK'],text=True).strip())
    p = subprocess.Popen(['psql','-d',TARGET,'-X','-q','-At','-v','ON_ERROR_STOP=1'],
                         stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,bufsize=1)
    def send(text, marker):
        p.stdin.write(text+'\n'+r'\echo '+marker+'\n');p.stdin.flush()
        lines=[]
        for line in p.stdout:
            if line.strip()==marker: return lines
            lines.append(line.strip())
        raise RuntimeError('CPU probe client ended unexpectedly')
    def cpu(pid):
        stat=subprocess.check_output(['docker','exec',container,'cat',f'/proc/{pid}/stat'],text=True,timeout=5)
        fields=stat[stat.rindex(')')+2:].split()
        return (int(fields[11])+int(fields[12]))*1000/ticks
    result=[]
    try:
        lines=send(f"BEGIN READ ONLY; SET LOCAL statement_timeout='10s'; SET LOCAL jit=off; SET LOCAL work_mem='2184kB'; {claims()} SELECT 'pid='||pg_backend_pid();",'ready')
        pid=int(next(x[4:] for x in lines if x.startswith('pid=')))
        for fn in order+order:
            before=cpu(pid)
            lines=send(f"DO $$ DECLARE started timestamptz; v jsonb; BEGIN started:=clock_timestamp(); v:=public.{fn}('{QA}','nl','curated'); PERFORM set_config('catalog.elapsed', (extract(epoch FROM clock_timestamp()-started)*1000)::text,true); END $$; SELECT 'elapsed='||current_setting('catalog.elapsed');",'measured')
            after=cpu(pid)
            wall=float(next(x[8:] for x in lines if x.startswith('elapsed=')))
            result.append({'function':fn,'wall_ms':round(wall,3),'backend_cpu_delta_ms':round(after-before,3),'pid':pid})
        send('ROLLBACK;','rolled_back')
    finally:
        if p.poll() is None:
            p.stdin.write(r'\q'+'\n');p.stdin.flush();p.communicate(timeout=10)
    return {'cpu_tick_ms':1000/ticks,'samples':result,'cpu_scope':'own backend process, includes adjacent measurement statements; not managed production CPU'}


created = False
try:
    sql(f'CREATE DATABASE "{NAME}"', target=BASE)
    created = True
    sql("", file="db/scripts/plain_postgres_supabase_compat.sql")
    sql("", file="db/migrations/bootstrap.sql")
    manifest = json.loads((SCHEMA_ROOT / "packages/shared/deployment/db-contract.json").read_text())
    bootstrap = (SCHEMA_ROOT / "db/migrations/bootstrap.sql").read_text()
    missing = []
    for entry in manifest['migrations']:
        file = entry['file']
        if not re.fullmatch(r'db/migrations/[0-9]{3}_[a-z0-9_]+\.sql', file):
            raise ValueError('Unexpected manifest migration path')
        if not re.search(r'^\\i\s+' + re.escape(file) + r'\s*$', bootstrap, re.M):
            if hashlib.sha256((SCHEMA_ROOT / file).read_bytes()).hexdigest() != entry['sha256']:
                raise ValueError('Forward fixture migration checksum mismatch')
            sql('', file=file)
            missing.append(entry['migrationId'])
    print(json.dumps({'stage':'selected schema','contract':manifest['contractId'],'explicit_fixture_forward_migrations':missing}),flush=True)
    migration = os.environ.get("CATALOG_PROTOTYPE_VALIDATE_MIGRATION")
    if migration:
        # Preserve the real baseline, then test the shipped replacement rather than
        # independently recreating its query in the test harness.
        baseline = sql("SELECT pg_get_functiondef('public.get_available_word_lists(uuid,text,text)'::regprocedure);")
        sql("", file="db/migrations/221_collection_catalog_single_entry_scan.sql")
        migrated = sql("SELECT pg_get_functiondef('public.get_available_word_lists(uuid,text,text)'::regprocedure);")
        migrated = migrated.replace("FUNCTION public.get_available_word_lists(", "FUNCTION public.catalog_prototype_candidate(", 1)
        sql(migrated.rstrip().rstrip(';') + ';\n' + baseline.rstrip().rstrip(';') + ';\n'
            + "REVOKE ALL ON FUNCTION public.catalog_prototype_candidate(uuid,text,text) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.catalog_prototype_candidate(uuid,text,text) TO authenticated;")
    else:
        sql(candidate_definition() + "\nREVOKE ALL ON FUNCTION public.catalog_prototype_candidate(uuid,text,text) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.catalog_prototype_candidate(uuid,text,text) TO authenticated;")
    sql(f"""INSERT INTO public.languages(code,name) VALUES('en','English') ON CONFLICT DO NOTHING;
INSERT INTO auth.users(id,email) VALUES('{QA}','test@2000nl.test'),('{OTHER}','other@fixture.invalid');
INSERT INTO public.dictionaries(id,language_code,slug,name,kind,visibility,minimum_subscription_tier)
VALUES('{DICT}','nl','catalog-general','General fixture','curated','system','free'),
('{HIDDEN}','nl','catalog-hidden','Hidden fixture','curated','private','free');
INSERT INTO public.word_entries(dictionary_id,language_code,headword,meaning_id,part_of_speech,raw)
SELECT CASE WHEN sample%7=0 THEN '{HIDDEN}'::uuid ELSE '{DICT}'::uuid END,
 CASE WHEN sample%11=0 THEN 'en' ELSE 'nl' END,'catalog-fixture-'||sample,sample,'noun','{{}}'::jsonb
FROM generate_series(1,50) sample;
INSERT INTO public.word_lists(language_code,slug,name) VALUES('nl','catalog-small','Fixture small'),('nl','catalog-empty','Fixture empty'),('en','catalog-english','Fixture English');
INSERT INTO public.word_list_items(list_id,word_id)
SELECT l.id,e.id FROM public.word_lists l CROSS JOIN public.word_entries e
WHERE l.slug='catalog-small';
INSERT INTO public.user_word_lists(user_id,language_code,primary_language_code,name)
VALUES('{QA}','nl','nl','Fixture mixed'),('{QA}','nl','nl','Fixture empty'),('{OTHER}','nl','nl','Other private');
INSERT INTO public.user_word_list_items(list_id,word_id)
SELECT l.id,e.id FROM public.user_word_lists l CROSS JOIN public.word_entries e
WHERE l.name IN ('Fixture mixed','Other private');""")
    parity("small, empty, mixed and inaccessible sources")
    guards()
    sql(f"""BEGIN READ ONLY; {claims()}
DO $$ DECLARE v jsonb; row jsonb;
BEGIN
 v:=public.catalog_prototype_candidate('{QA}','nl','curated');
 SELECT x INTO row FROM jsonb_array_elements(v) x WHERE x->>'name'='Fixture small';
 IF (row#>>'{{word_list_items,0,count}}')::int<>50 OR (row#>>'{{word_list_items,0,available_count}}')::int<>43
 OR (row#>>'{{word_list_items,0,unavailable_source_count}}')::int<>1 THEN RAISE EXCEPTION 'availability contract wrong'; END IF;
 v:=public.catalog_prototype_candidate('{QA}',NULL,'user');
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(v) x WHERE x->>'name'='Other private') THEN RAISE EXCEPTION 'ownership leak'; END IF;
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v) x WHERE x->>'name'='Fixture mixed' AND (x->>'is_mixed_language')::boolean) THEN RAISE EXCEPTION 'mixed flag missing'; END IF;
END $$; ROLLBACK;""")
    print(json.dumps({"stage": "explicit count, access, ownership, mixed contracts", "checks": 5}), flush=True)
    sql(f"""INSERT INTO public.word_entries(dictionary_id,language_code,headword,meaning_id,part_of_speech,raw)
SELECT '{DICT}','nl','catalog-wide-'||sample,sample,'noun',
 jsonb_build_object('payload',(SELECT string_agg(md5(sample::text||':'||chunk::text),'') FROM generate_series(1,50) chunk))
FROM generate_series(51,18184) sample;
INSERT INTO public.word_lists(language_code,slug,name) VALUES('nl','catalog-wide-a','Wide A'),('nl','catalog-wide-b','Wide B'),('nl','catalog-wide-c','Wide C');
INSERT INTO public.word_list_items(list_id,word_id)
SELECT l.id,e.id FROM public.word_lists l CROSS JOIN public.word_entries e
WHERE l.slug IN ('catalog-wide-a','catalog-wide-b','catalog-wide-c') AND e.meaning_id<=CASE l.slug WHEN 'catalog-wide-a' THEN 18184 WHEN 'catalog-wide-b' THEN 4031 ELSE 2000 END;
VACUUM (ANALYZE) public.word_entries; ANALYZE public.word_list_items;""")
    shape=sql("SELECT count(*)||','||round(avg(pg_column_size(e))) FROM public.word_entries e;").strip().split(',')
    assert int(shape[0])==18184 and float(shape[1])>1500, 'Wide fixture shape mismatch'
    parity("wide corpus 18184 entries, overlapping collections")
    samples=[]
    for order in [('get_available_word_lists','catalog_prototype_candidate'),('catalog_prototype_candidate','get_available_word_lists')]:
        body=f"BEGIN READ ONLY; SET LOCAL statement_timeout='10s'; SET LOCAL jit=off; SET LOCAL work_mem='2184kB'; {claims()}\n"
        for fn in order+order:
            body+=f"EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) SELECT public.{fn}('{QA}','nl','curated');\n"
        output=sql(body+'ROLLBACK;')
        decoder=json.JSONDecoder(); plans=[]; offset=0
        while True:
            start=output.find('[',offset)
            if start<0: break
            value,end=decoder.raw_decode(output[start:]); offset=start+end
            if value and isinstance(value[0],dict) and 'Plan' in value[0]: plans.append(value[0])
        assert len(plans)==4
        for fn,plan in zip(order+order,plans):
            samples.append({'function':fn,'execution_ms':plan['Execution Time'],'planning_ms':plan['Planning Time'],
                            'shared_hits':plan['Plan'].get('Shared Hit Blocks',0),'shared_reads':plan['Plan'].get('Shared Read Blocks',0),
                            'temp_read':plan['Plan'].get('Temp Read Blocks',0),'temp_written':plan['Plan'].get('Temp Written Blocks',0)})
    print(json.dumps({'stage':'timing with reversed order, first/repeat per client','samples':samples}),flush=True)
    for order in [('get_available_word_lists','catalog_prototype_candidate'),('catalog_prototype_candidate','get_available_word_lists')]:
        print(json.dumps({'stage':'isolated backend CPU/wall',**cpu_pair(order)}),flush=True)
finally:
    if created:
        sql(f'DROP DATABASE IF EXISTS "{NAME}"',target=BASE)
        print(json.dumps({'disposable_database_removed':NAME}),flush=True)
