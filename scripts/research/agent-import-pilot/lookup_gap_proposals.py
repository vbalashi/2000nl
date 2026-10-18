"""Operator read-only dictionary lookup for exact-source-anchored gap proposals."""
import argparse,json
from pathlib import Path
from lookup import lookup
from agent_tools import norm

def main(args):
    for video in sorted(args.root.glob('video-*')):
        p=video/'collection-review/gap-audit-validated.json'
        if not p.exists():continue
        data=json.loads(p.read_text());queries=list(dict.fromkeys(q for g in data['proposals'] for q in [g['canonicalForm'],g['surface']]))
        if len(queries)>24 or any(not q.strip() or len(q)>160 for q in queries):raise ValueError('gap_query_scope')
        target=video/'collection-review/gap-lookup.json'
        if target.exists():continue
        result=lookup(queries,args.email,args.reference,video/'collection-review/gap-lookup-batches')
        result['scope']='existing principal-scoped lookup top10; inspect selected tier completeness, no all-dictionary absence claim'
        target.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
        print(json.dumps({'video':video.name,'proposals':len(data['proposals']),'queries':len(queries),'queriesWithResults':sum(bool(r['result'].get('items')) for r in result['rows'])}),flush=True)
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('root',type=Path);p.add_argument('--email',required=True);p.add_argument('--reference',type=Path,required=True);main(p.parse_args())
