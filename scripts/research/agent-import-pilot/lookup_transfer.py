"""Bounded lookup coverage for longer transfer sources; omitted queries stay queued."""
import argparse,json
from pathlib import Path
from lookup import lookup

def query_plan(data,limit=500):
    if not 1<=limit<=500:raise ValueError('invalid_query_limit')
    queries=[c['lemma'] for c in data['candidates']]
    queries += [p['query'] for p in data['expressionProposals'] if p['kind']=='particle_verb_candidate']
    queries += [form.lower() for c in data['candidates'] for form in c['forms']]
    queries += [p['query'] for p in data['expressionProposals']]
    queries=list(dict.fromkeys(queries));return {'queries':queries[:limit],'deferredQueries':queries[limit:],'requestedUniqueQueries':len(queries),'queryLimit':limit,'policy':'all source candidates retained; prioritize lemmas, particle proposals, forms, then syntactic phrases'}
if __name__=='__main__':
    a=argparse.ArgumentParser();a.add_argument('video',type=Path);a.add_argument('--email',required=True);a.add_argument('--reference',type=Path,required=True);args=a.parse_args();data=json.loads((args.video/'prepared.json').read_text());plan=query_plan(data)
    path=args.video/'lookup-plan.json'
    if path.exists() and json.loads(path.read_text())!=plan:raise RuntimeError('changed_lookup_plan')
    path.write_text(json.dumps(plan,ensure_ascii=False,indent=2)+'\n');result=lookup(plan['queries'],args.email,args.reference,args.video/'lookup-batches');(args.video/'lookup.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'queried':len(plan['queries']),'deferred':len(plan['deferredQueries'])}))
