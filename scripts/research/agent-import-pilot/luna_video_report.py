"""Sanitized observed usage/step counts and before-after deltas; no gold claims."""
import argparse,collections,json,statistics
from datetime import datetime,timezone,timedelta
from pathlib import Path
from summarize_cost import estimate

def core(u):return u['caseId'],tuple(u['tokenIds'])
def compare(before,after):
    old={core(u):u for u in before};new={core(u):u for u in after};added=new.keys()-old.keys();removed=old.keys()-new.keys()
    overlap=[{'caseId':k[0],'oldCanonical':old[k]['canonical'],'newCanonical':new[j]['canonical'],'oldTokenIds':list(k[1]),'newTokenIds':list(j[1])} for k in sorted(removed) for j in sorted(added) if k[0]==j[0] and len(set(k[1])&set(j[1]))/len(set(k[1])|set(j[1]))>=.5]
    return {'before':len(before),'after':len(after),'unchangedCore':len(old.keys()&new.keys()),'addedCores':len(added),'removedCores':len(removed),'overlapChanges':overlap,'added':[{'caseId':k[0],'canonical':new[k]['canonical'],'tokenIds':list(k[1])} for k in sorted(added)],'removed':[{'caseId':k[0],'canonical':old[k]['canonical'],'tokenIds':list(k[1])} for k in sorted(removed)],'sameCoreCanonicalChanges':[{'caseId':k[0],'before':old[k]['canonical'],'after':new[k]['canonical']} for k in sorted(old.keys()&new.keys()) if old[k]['canonical']!=new[k]['canonical']]}

def report(root):
    phases={};allrows=[];step_rows=[]
    for name in ['model-phase','model-phase-20']:
        phase=root/name
        if not (phase/'wire.jsonl').exists():continue
        rows=[json.loads(line) for line in (phase/'wire.jsonl').read_text().splitlines()];allrows+=rows;cost=estimate(rows);requests={r['index']:r for r in rows if r['event']=='request'};responses={r['index']:r for r in rows if r['event']=='response'}
        cost['firstRequestUtc']=min((r['utc'] for r in requests.values()),default=None);cost['lastRequestUtc']=max((r['utc'] for r in requests.values()),default=None)
        cost['lastResponseEndUtc']=max(((datetime.fromisoformat(requests[r['index']]['utc'])+timedelta(seconds=r['wallSeconds'])).isoformat() for r in responses.values()),default=None)
        cost['requestsWithoutRecordedResponse']=len(requests.keys()-responses.keys());cost['unpricedUnknownAttempts']=cost['requestsWithoutRecordedResponse']+cost['unknownUsageResponses'];phases[name]=cost
        if name=='model-phase-20':
            for label in sorted({r['label'] for r in requests.values()}):
                req=[r for r in requests.values() if r['label']==label];resp=[r for r in responses.values() if r['label']==label];calls=[]
                for row in resp:
                    body=json.loads((phase/f"response-{row['index']:02}.json").read_text());calls += [c for c in body.get('output',[]) if c.get('type')=='function_call']
                keys=[json.dumps([c['name'],json.loads(c['arguments'])],sort_keys=True) for c in calls]
                step_rows.append({'task':label,'modelRequests':len(req),'modelResponses':len(resp),'toolCalls':len(calls),'toolNames':dict(collections.Counter(c['name'] for c in calls)),'repeatedIdenticalToolCalls':len(keys)-len(set(keys)),'httpSeconds':sum(r['wallSeconds'] for r in resp),'outputTokens':sum(r.get('usage',{}).get('output_tokens',0) for r in resp)})
    videos={}
    for video in sorted(root.glob('video-*')):
        if not (video/'prepared.json').exists():continue
        data=json.loads((video/'prepared.json').read_text());meta=json.loads((video/'metadata.json').read_text());first=video/'luna-high/baseline.json';second=video/'luna-high-review20/reviewed.json';item={'title':meta['title'],'videoId':meta['id'],'durationSeconds':meta['duration'],'sourceRevision':data['sourceHash'],'sourceSentences':len(data['sentences']),'wordCandidates':len(data['candidates']),'firstPassComplete':first.exists(),'targetedReviewComplete':second.exists()}
        if (video/'captions.json').exists():cap=json.loads((video/'captions.json').read_text());item['sourceKind']='author captions';item['providerLanguage']=cap.get('providerLanguage',cap['language'])
        else:
            item['sourceKind']='own AudioFilms ASR';job=json.loads((video/'asr-status.json').read_text())['body'];item['asrStartedUtc']=job.get('startedAt');item['asrCompletedUtc']=job.get('completedAt')
        if first.exists():item['firstUnits']=len(json.loads(first.read_text())['units'])
        if second.exists():
            after=json.loads(second.read_text());item['reviewedSentences']=len(after['reviewedCases']);item['delta']=compare(json.loads(first.read_text())['units'],after['units'])
        traces=[json.loads(line) for path in (video/'luna-high-review20').glob('*tools.jsonl') for line in path.read_text().splitlines()];item['toolErrors']=[{'name':r['name'],'error':r['result']['error']} for r in traces if r['result'].get('error')];videos[video.name]=item
    firstrows=[r for r in allrows if '/extract-' in r['label']];naturalrows=[json.loads(line) for line in (root/'model-phase-20/wire.jsonl').read_text().splitlines()] if (root/'model-phase-20/wire.jsonl').exists() else []
    intended_cost=estimate(firstrows+naturalrows)
    turns=[r['modelRequests'] for r in step_rows];responses=[r for r in allrows if r['event']=='response'];requests=[r for r in allrows if r['event']=='request'];out={'collectedAtUtc':datetime.now(timezone.utc).isoformat(),'model':'gpt-6-luna','reasoning':'high','productionWrites':0,'videos':videos,'phases':phases,'natural20TurnTasks':step_rows,'observedNaturalRequestRange':[min(turns),max(turns)] if turns else None,'observedNaturalRequestMedian':statistics.median(turns) if turns else None,'intendedFirstPlusNaturalReviewCost':intended_cost,'modelRequests':len(requests),'modelResponses':len(responses),'estimatedPublishedUsdKnownUsage':sum(p['estimatedPublishedUsd'] for p in phases.values()),'unknownUnpricedAttempts':sum(p['unpricedUnknownAttempts'] for p in phases.values()),'observedResponseModels':sorted({r.get('model') for r in responses if r.get('model')}),'httpStatuses':sorted({r['status'] for r in responses}),'firstModelRequestUtc':min((r['utc'] for r in requests),default=None),'lastModelRequestUtc':max((r['utc'] for r in requests),default=None),'usageTotalDiscrepancies':sum(r['usage'].get('total_tokens')!=r['usage']['input_tokens']+r['usage']['output_tokens'] for r in responses if r.get('usage')),'priceCheckedDate':'2026-10-19','rateUnit':'USD per million tokens','rates':{'ordinaryInput':.1,'cacheRead':.01,'cacheWrite':.125,'output':.5},'priceStatus':'published Global Standard short context estimate; no invoice reconciliation, unknown requests excluded not free','source':'https://azure.microsoft.com/en-us/blog/gpt-6-astra-sol-and-luna-for-production-agents-in-microsoft-foundry/','limits':['no independent human gold','added/removed cores are changes, not correctness labels','second pass targets at most32 sentences per video','first run4/recovery costs included separately from natural20','word candidates extracted deterministically, not all independently sense-resolved','no collection or personal article writes']}
    return out
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('root',type=Path);p.add_argument('--out',type=Path,required=True);a=p.parse_args();out=report(a.root);a.out.write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'complete':[v['targetedReviewComplete'] for v in out['videos'].values()],'calls':out['modelRequests'],'naturalRange':out['observedNaturalRequestRange'],'knownEstimate':out['estimatedPublishedUsdKnownUsage'],'unknownUnpriced':out['unknownUnpricedAttempts']}))
