"""Estimate published Azure Luna Global Standard token cost; never an invoice.
Pass explicit wire ledgers. Cache writes/reads partition input, not extra tokens.
"""
import argparse,json
from pathlib import Path
RATES={'ordinaryInput':0.10,'cacheRead':0.01,'cacheWrite':0.125,'output':0.50}
SOURCE='https://azure.microsoft.com/en-us/blog/gpt-6-astra-sol-and-luna-for-production-agents-in-microsoft-foundry/'
def estimate(rows):
    responses=[r for r in rows if r['event']=='response']
    result={'requests':sum(r['event']=='request' for r in rows),'responses':len(responses),'unknownUsageResponses':sum(not r.get('usage') for r in responses)}
    counts=dict.fromkeys(['input','ordinaryInput','cacheRead','cacheWrite','output'],0)
    for r in responses:
        u=r.get('usage')
        if not u:continue
        details=u.get('input_tokens_details',{});i=u['input_tokens'];read=details.get('cached_tokens',0);write=details.get('cache_write_tokens',0)
        if min(i,read,write)<0 or read+write>i:raise ValueError('inconsistent_cache_partition')
        for key,n in [('input',i),('ordinaryInput',i-read-write),('cacheRead',read),('cacheWrite',write),('output',u['output_tokens'])]:counts[key]+=n
    result['tokens']=counts
    result['estimatedPublishedUsd']=sum(counts[k]*v for k,v in RATES.items())/1e6
    return result
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('ledgers',type=Path,nargs='+');p.add_argument('--output',type=Path,required=True);args=p.parse_args()
    groups={};allrows=[]
    for ledger in args.ledgers:
        rows=[json.loads(s) for s in ledger.read_text().splitlines()];allrows.extend(rows)
        for mode in sorted({r['label'].split('-')[0] for r in rows}):groups[f'{ledger.parent.as_posix()}/{mode}']=estimate([r for r in rows if r['label'].startswith(mode+'-')])
    out={'rateCheckedDate':'2026-10-18','currency':'USD','ratesPerMillion':RATES,'source':SOURCE,'assumptions':['gpt-6-luna Global Standard short context','cache read and cache write are disjoint input subsets; remainder charged ordinary input','output includes reasoning; no extra reasoning charge','published list estimate only; effective Sponsorship billing not reconciled','excludes hosting, lookup infrastructure, subtitle retrieval, transcription, article generation and managed sandbox/tools'], 'groups':groups,'total':estimate(allrows)}
    args.output.write_text(json.dumps(out,indent=2)+'\n');print(json.dumps(out,indent=2))
