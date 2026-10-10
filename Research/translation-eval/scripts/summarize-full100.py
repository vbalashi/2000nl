"""Verify exact full100 evidence and summarize translation-only public reference cost."""
from pathlib import Path
import json,hashlib,math,statistics,collections
r=Path(__file__).resolve().parents[1]
rates={'gpt41':(2,8),'luna56':(.2,1.2),'luna6':(.1,.5)}
def sha(b):return hashlib.sha256(b).hexdigest()
def pct(xs,p):return sorted(xs)[max(0,math.ceil(len(xs)*p)-1)]
def collect(rid):
 run=r/'runs'/rid; mb=(run/'manifest.json').read_bytes(); m=json.loads(mb)
 assert sha(mb)==(run/'manifest.sha256').read_text().strip()
 review=json.loads((run/'reviews/agent-semantic-v1.json').read_text());assert review['manifestHash']==sha(mb)
 items={x['jobId']:x for x in review['items']};assert set(items)=={j['jobId'] for j in m['jobs'] if (run/'responses'/f"{j['jobId']}.json").exists() and json.loads((run/'responses'/f"{j['jobId']}.json").read_text())['outcome']=='ready'}
 records=[]
 for job in m['jobs']:
  jid=job['jobId'];f=run/'responses'/f'{jid}.json'
  if not f.exists():continue
  b=f.read_bytes();o=json.loads(b)
  if o['outcome']!='ready':
   assert sha(b)==f.with_suffix('.json.sha256').read_text().strip()
   records.append(dict(caseId=job['caseId'],model=m['modelProfile']['id'],runId=rid,responseHash=sha(b),review=None,input=None,output=None,cached=0,reasoning=0,latency=o['elapsedMs'],outcome=o['outcome']));continue
  i=items[jid]
  assert sha(b)==i['responseHash']==(run/'responses'/f'{jid}.json.sha256').read_text().strip()
  assert o['outcome']=='ready';u=o['usage'];assert isinstance(u['prompt_tokens'],int) and isinstance(u['completion_tokens'],int)
  records.append(dict(caseId=job['caseId'],model=m['modelProfile']['id'],runId=rid,responseHash=sha(b),review=i,input=u['prompt_tokens'],output=u['completion_tokens'],cached=u.get('prompt_tokens_details',{}).get('cached_tokens',0),reasoning=u.get('completion_tokens_details',{}).get('reasoning_tokens',0),latency=o['elapsedMs']))
 return records
def aggregate(records,model):
 ri,ro=rates[model];attempts=len(records);records=[x for x in records if x['review'] is not None];n=len(records);tin=sum(x['input'] for x in records);tout=sum(x['output'] for x in records)
 out=dict(attempts=attempts,responses=n,failedAttempts=attempts-n,missingUsage=attempts-n,accept=sum(x['review']['decision']=='accept' for x in records),mainErrors=sum(min(x['review']['scores']['senseFidelity'],x['review']['scores']['contentFidelity'])<4 for x in records),failureCodes=dict(collections.Counter(c for x in records for c in x['review']['failureCodes'])),inputTokens=tin,outputTokens=tout,cachedTokens=sum(x['cached'] for x in records),reasoningTokens=sum(x['reasoning'] for x in records),referenceUSD=(tin*ri+tout*ro)/1e6,actualAzureCost=None)
 for key in ['input','output','latency']:out[key+'P50']=statistics.median(x[key] for x in records);out[key+'P95']=pct([x[key] for x in records],.95)
 # Wilson interval describes sampling uncertainty only; agent review / stratification add other limitations.
 p=out['accept']/n;z=1.96;den=1+z*z/n;cen=(p+z*z/(2*n))/den;rad=z*math.sqrt(p*(1-p)/n+z*z/(4*n*n))/den
 out['acceptWilson95']=[cen-rad,cen+rad]
 return out
summary=dict(schemaVersion='translation-full100-summary-v1',reviewMethod='non-blind agent',independentHumanApproval=False,productionChanged=False,referenceRatesUSDPerMillion={m:dict(input=x[0],output=x[1]) for m,x in rates.items()},rateDate='2026-10-10',costScope='Translation calls only, uncached public Standard short-context reference rates; no audio, review, tax or discounts. Not verified Azure invoice.',models={})
allrecords=[]
for m in rates:
 dev=collect(f'full-dev-{m}-v4');val=collect(f'full-validation-{m}-v1')+(collect('full-validation-luna56-continuation-v1') if m=='luna56' else []);assert len(dev)==30 and len(val)==70 and len({x['caseId'] for x in dev+val})==100
 summary['models'][m]=dict(development=aggregate(dev,m),heldOut=aggregate(val,m),selectedPromptFull100=aggregate(dev+val,m));allrecords+=dev+val
experiment=[]
for m in rates:
 experiment+=collect(f'full-dev-{m}-v3')+collect(f'full-dev-{m}-v4')+collect(f'full-validation-{m}-v1')+(collect('full-validation-luna56-continuation-v1') if m=='luna56' else [])
summary['experimentMissingUsage']=sum(x['input'] is None for x in experiment)
summary['experimentCalls']=len(experiment);assert len(experiment)==390
summary['experimentReferenceUSD']=sum((x['input']*rates[x['model']][0]+x['output']*rates[x['model']][1])/1e6 for x in experiment if x['input'] is not None)
recovery=collect('full100-recovery-luna56-1')
summary['recovery']=aggregate(recovery,'luna56')
summary['recovery']['excludedFromFirstAttemptMetrics']=True
summary['experimentCallsIncludingRecovery']=len(experiment)+len(recovery)
summary['experimentReferenceUSDIncludingRecoveryKnown']=summary['experimentReferenceUSD']+summary['recovery']['referenceUSD']
summary['models']['luna56']['eventualFull100']=aggregate([x for x in collect('full-dev-luna56-v4')+collect('full-validation-luna56-v1')+collect('full-validation-luna56-continuation-v1') if x['review'] is not None]+recovery,'luna56')
print(json.dumps(summary,ensure_ascii=False,indent=2))
