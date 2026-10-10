"""Read curated, ownerless public/system dictionary sources; never learner data."""
from pathlib import Path
import os, subprocess, json, argparse
p=argparse.ArgumentParser();p.add_argument('--env',type=Path,required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args()
e=os.environ.copy()
for line in a.env.read_text().splitlines():
    if '=' in line and not line.lstrip().startswith('#'):
        k,v=line.split('=',1);e.setdefault(k.strip(),v.strip().strip('\"\''))
e['PGDATABASE']=e['DATABASE_URL'];e['PGCONNECT_TIMEOUT']='8'
sql="""BEGIN READ ONLY;
SET LOCAL statement_timeout='20s';
SELECT json_build_object('entryId',w.id,'dictionarySlug',d.slug,'sourceProvider',d.source_provider,'headword',w.headword,'gender',w.gender,'part_of_speech',w.part_of_speech,'meaningOrdinal',w.meaning_id,'raw',w.raw)
FROM public.word_entries w JOIN public.dictionaries d ON d.id=w.dictionary_id
WHERE d.kind='curated' AND d.owner_user_id IS NULL AND d.visibility IN ('system','public') AND w.language_code='nl'
ORDER BY md5(w.id::text || 'translation-full100-v1') LIMIT 5000;
ROLLBACK;"""
r=subprocess.run(['psql','--dbname',e['DATABASE_URL'],'-X','-q','-t','-A','-v','ON_ERROR_STOP=1'],input=sql,text=True,env=e,capture_output=True)
if r.returncode:
    import urllib.parse
    u=urllib.parse.urlsplit(e['DATABASE_URL']);message=r.stderr
    for value in [e['DATABASE_URL'],u.password,u.username,u.hostname]:
        if value:message=message.replace(value,'[redacted]')
    raise SystemExit('read_only_corpus_query_failed: '+message[:500])
rows=[json.loads(x) for x in r.stdout.splitlines() if x.strip()]
a.output.parent.mkdir(parents=True,exist_ok=True)
with a.output.open('x') as f:json.dump(rows,f,ensure_ascii=False)
print(json.dumps({'rows':len(rows),'scope':'ownerless curated public/system NL dictionary only','mutations':0}))
