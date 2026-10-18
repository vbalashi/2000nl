"""Read-only chunked existing-RPC adapter; not a new production batch endpoint."""
import argparse,hashlib,json,subprocess,time
from pathlib import Path

def literal(value):return "'"+value.replace("'","''")+"'"
def lookup(queries,email,reference,output,batch_size=16):
    if len(queries)>500:raise ValueError('Pilot limit: 500 unique queries; use a reviewed local snapshot for larger runs')
    if not 1<=batch_size<=16:raise ValueError('Pilot limit: batch size 1..16')
    scope=hashlib.sha256(('pilot-all-accessible-nl-v1:'+email.lower()+':'+str(reference.resolve())).encode()).hexdigest()
    rows=[]; timings=[]; output.mkdir(parents=True,exist_ok=True)
    for start in range(0,len(queries),batch_size):
        chunk=queries[start:start+batch_size]; cache=output/f'batch-{start:04}.json'
        if cache.exists():
            saved=json.loads(cache.read_text())
            if saved.get('scopeFingerprint')!=scope or [r['query'] for r in saved['rows']]!=chunk:
                raise ValueError('Checkpoint input/principal mismatch; use a separate run directory')
            rows.extend(saved['rows']);continue
        sql=f'''begin read only; set local statement_timeout='30s';
        with principal as (select id from auth.users where lower(email)=lower({literal(email)})),
        queries as (select jsonb_array_elements_text({literal(json.dumps(chunk))}::jsonb) as q)
        select jsonb_build_object('query',q,'result',r.result - 'items' || jsonb_build_object('items',
        (select coalesce(jsonb_agg((j - 'raw') || jsonb_build_object('meanings',j#>'{{raw,meanings}}')),'[]'::jsonb)
        from jsonb_array_elements(r.result->'items') j)))
        from queries cross join principal cross join lateral
        (select public.lookup_platform_v2_entries(principal.id,false,q,'nl',null,10,100) as result) r;
        rollback;'''
        t=time.perf_counter();proc=subprocess.run([str(reference/'db/scripts/psql_supabase.sh'),'-X','-q','-A','-t'],input=sql,text=True,capture_output=True,timeout=45,cwd=reference)
        if proc.returncode:raise RuntimeError(proc.stderr[:500])
        values=[json.loads(line) for line in proc.stdout.splitlines() if line.startswith('{')]
        assert len(values)==len(chunk),'Missing/ambiguous account or incomplete batch'
        elapsed=time.perf_counter()-t
        cache.write_text(json.dumps({'rows':values,'wallSeconds':elapsed,'scopeFingerprint':scope},ensure_ascii=False));rows.extend(values);timings.append(elapsed)
        print(json.dumps({'completed':min(start+batch_size,len(queries)),'total':len(queries),'batchWallSeconds':elapsed}),flush=True)
    return {'rows':rows,'newBatchSeconds':timings}
if __name__=='__main__':
    ap=argparse.ArgumentParser();ap.add_argument('prepared',type=Path);ap.add_argument('output',type=Path);ap.add_argument('--email',required=True);ap.add_argument('--reference',type=Path,required=True);args=ap.parse_args()
    data=json.loads(args.prepared.read_text());queries=[]
    for c in data['candidates']:
        queries.append(c['lemma'])
        queries.extend(f.lower() for f in c['forms'] if f.lower()!=c['lemma'])
    queries.extend(c['query'] for c in data['expressionProposals'])
    queries=list(dict.fromkeys(queries))
    result=lookup(queries,args.email,args.reference,args.output/'lookup-batches')
    (args.output/'lookup.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
