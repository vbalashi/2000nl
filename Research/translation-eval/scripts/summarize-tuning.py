"""Summarize frozen agent reviews, keeping exact reviews separate from automatic checks."""
from pathlib import Path
import json, hashlib, statistics, collections
root=Path(__file__).resolve().parents[1]
evidence=root/'evidence/model-tuning-2026-10-10'
rows=[]
for review_path in sorted(evidence.glob('heldout-*-review.json')):
    review=json.loads(review_path.read_text()); run=root/'runs'/review['runId']
    manifest_bytes=(run/'manifest.json').read_bytes(); manifest=json.loads(manifest_bytes)
    if hashlib.sha256(manifest_bytes).hexdigest()!=review['manifestHash']: raise ValueError('changed_manifest')
    groups=collections.defaultdict(list); latency=[]; tokens_in=tokens_out=0; missing=0
    for item in review['items']:
        response_bytes=(run/'responses'/(item['jobId']+'.json')).read_bytes()
        if hashlib.sha256(response_bytes).hexdigest()!=item['responseHash']: raise ValueError('changed_response')
        response=json.loads(response_bytes); groups[item['jobId'].rsplit('-',1)[0]].append(item)
        latency.append(response['elapsedMs']);usage=response.get('usage') or {}
        if not isinstance(usage.get('prompt_tokens'),int) or not isinstance(usage.get('completion_tokens'),int):missing+=1
        else:tokens_in+=usage['prompt_tokens'];tokens_out+=usage['completion_tokens']
    certain=[i for i in review['items'] if i['jobId'].rsplit('-',1)[0] not in ['hoeven_ru','idiom_weather_en']]
    rows.append({'runId':review['runId'],'manifestHash':review['manifestHash'],'reviewHash':hashlib.sha256(review_path.read_bytes()).hexdigest(),
      'model':manifest['modelProfile']['model'],'promptId':manifest['promptId'],'promptFingerprint':manifest['promptFingerprint'],
      'reviewMethod':review['method'],'accept':sum(i['decision']=='accept' for i in review['items']),
      'needsWork':sum(i['decision']=='needs-work' for i in review['items']),
      'allRepeatsAcceptedCases':sum(all(i['decision']=='accept' for i in g) for g in groups.values()),
      'mixedDecisionCases':sum(len(set(i['decision'] for i in g))>1 for g in groups.values()),
      'sensitivityExcludingHoevenAndWeather':{'accept':sum(i['decision']=='accept' for i in certain),'total':len(certain)},
      'failureCodeCounts':dict(collections.Counter(c for i in review['items'] for c in i['failureCodes'])),
      'inputTokens':tokens_in,'outputTokens':tokens_out,'missingUsage':missing,'medianLatencyMs':statistics.median(latency),'maxLatencyMs':max(latency),'monetaryCost':None})
summary={'schemaVersion':'translation-model-tuning-summary-v1','reviewMethod':'agent','independentBlindReview':False,'tuningCalls':36,'validationCalls':108,'totalCalls':144,'rows':rows,'runtimePromotion':False,'defaultModelChange':False}
print(json.dumps(summary,ensure_ascii=False,indent=2))
