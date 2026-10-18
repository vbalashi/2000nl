"""Bounded transfer slice: phrase discovery, frozen resolver, nested draft agent.
No collection writes. Operator read lookup is a separate preparation step.
"""
import argparse,asyncio,hashlib,json,os,subprocess,time
from datetime import datetime,timezone
from contextvars import ContextVar
from pathlib import Path
import httpx2
from openai import AsyncOpenAI
from agents import Agent,Runner,RunConfig,ModelSettings,FunctionTool,OpenAIResponsesModel,set_tracing_disabled
from agents.model_settings import ModelRetrySettings
from agent_compare import WireLedger
from agent_tools import compact,norm,specs,DecisionBatch
from hardened_tools import HardenedToolBox,RepairRequired
from personal_draft import PhraseBatch,PersonalDraft,PHRASE_PROMPT,DRAFT_PROMPT,validate_phrases,validate_draft
BASE='https://dilumio-01-resource.openai.azure.com/openai/v1';MODEL='gpt-6-luna'
RC=RunConfig(tracing_disabled=True,trace_include_sensitive_data=False)
def dump(path,value):path.write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n')
def settings():return ModelSettings(max_tokens=4096,reasoning={'effort':'low'},store=False,parallel_tool_calls=True,response_include=['reasoning.encrypted_content'],retry=ModelRetrySettings(max_retries=0))
def agent(client,name,prompt,output,tools=None):return Agent(name=name,instructions=prompt,model=OpenAIResponsesModel(MODEL,client),output_type=output,tools=tools or [],model_settings=settings())
def fixture(root):
    data=json.loads((root/'prepared.json').read_text());rows=json.loads((root/'lookup.json').read_text())['rows']
    if (root/'phrase-lookup.json').exists():rows+=json.loads((root/'phrase-lookup.json').read_text())['rows']
    entries={};queries={}
    for row in rows:
        items=[i for i in row['result'].get('items',[]) if i.get('dictionary_slug')=='nl-vandale']
        entries.update({i['id']:compact(i) for i in items});queries[norm(row['query'])]={'entryIds':[i['id'] for i in items],'complete':not row['result'].get('page',{}).get('nextGroupCursor')}
    groups={'multi':[],'empty':[]};counts={'empty':0,'single':0,'multi':0};cases=[]
    for c in data['candidates']:
        n=len(queries.get(norm(c['lemma']),{}).get('entryIds',[]));counts['empty' if n==0 else 'single' if n==1 else 'multi']+=1
        if c['pos'] not in ['NOUN','VERB','ADJ','ADV']:continue
        if n==0:groups['empty'].append(c)
        if n>1:groups['multi'].append(c)
    selected=groups['multi'][:4]+groups['empty'][:4]
    def case(cid,surface,kind,query,sid,context):return {'candidateId':cid,'surface':surface,'kind':kind,'context':context,'sentenceIds':[sid],'initialQuery':query,'initialEntryIds':queries.get(norm(query),{}).get('entryIds',[]),'initialSearchComplete':queries.get(norm(query),{}).get('complete',False)}
    for c in selected:
        o=c['occurrences'][0];cases.append(case(c['candidateId'],o['surface'],'word',c['lemma'],o['sentenceId'],o['text']))
    phrases=json.loads((root/'phrases.json').read_text())['proposals'];sent={s['sentenceId']:s for s in data['sentences']}
    for i,p in enumerate(phrases):
        s=sent[p['sentenceId']];cases.append(case(f'p{i+1}',p['surface'],'expression',p['canonicalForm'],s['sentenceId'],s['text']))
    result={'fixtureVersion':'transfer-v1','sourceRevision':data['sourceHash'],'sentences':data['sentences'],'entries':entries,'queries':queries,'cases':cases,'selectionPolicy':'first4 multi-result content lemmas + first4 missing content lemmas + <=4 discovered phrases; no gold labels','lookupCandidateCounts':counts,'remainingCandidateCount':len(data['candidates'])-len(selected)}
    checkpoint=root/'transfer-fixture.json'
    if checkpoint.exists() and json.loads(checkpoint.read_text())!=result:raise RuntimeError('frozen_fixture_changed')
    dump(checkpoint,result);return result

class PhaseLedger(WireLedger):
    def __init__(self,*args,**kwargs):
        self.labels=ContextVar('transfer_label',default='unset')
        super().__init__(*args,**kwargs)
    @property
    def label(self):return self.labels.get()
    @label.setter
    def label(self,value):self.labels.set(value)
    async def request(self,request):
        first=next((r for r in self.rows if r['event']=='request'),None)
        if first and (datetime.now(timezone.utc)-datetime.fromisoformat(first['utc'])).total_seconds()>1200:raise RuntimeError('phase_twenty_minute_deadline')
        await super().request(request)

async def main(args):
    args.phase.mkdir(parents=True,exist_ok=True);os.chmod(args.phase,0o700);set_tracing_disabled(True)
    ledger=PhaseLedger(args.phase,BASE,MODEL,max_requests=48)
    token=json.loads(subprocess.check_output(['az','account','get-access-token','--resource','https://cognitiveservices.azure.com/','--output','json'],text=True))['accessToken']
    root=args.video;video=root.name;data=json.loads((root/'prepared.json').read_text());t=time.monotonic()
    phase_config={'phase':'transfer-v1','model':MODEL,'baseUrl':BASE,'maxNewHttpRequests':48,'maxPhaseSeconds':1200,'maxRequestBytes':98304,'maxCumulativeRequestBytes':786432,'maxOutputTokens':4096,'retries':0,'traceExport':False,'productionWrites':False}
    dump(args.phase/'phase-config.json',phase_config)
    async with httpx2.AsyncClient(event_hooks={'request':[ledger.request],'response':[ledger.response]},timeout=60,follow_redirects=False) as http:
        client=AsyncOpenAI(base_url=BASE+'/',api_key=token,http_client=http,max_retries=0,timeout=60)
        if args.stage=='finalize':
            if (root/'resolver-2-finalized.json').exists():print('Using frozen finalization receipt');return
            f=fixture(root);saved=json.loads((root/'drafts.json').read_text())
            request=next(r for r in reversed(ledger.rows) if r['event']=='request' and r['label']==video+'/resolver-2')
            n=request['index'];previous=json.loads((args.phase/f'request-{n:02}.json').read_text());response=json.loads((args.phase/f'response-{n:02}.json').read_text())
            history=previous['input']+response['output']
            for call in response['output']:
                if call['type']!='function_call':continue
                if call['name']!='personal_draft_propose':raise RuntimeError('cannot_finalize_unexecuted_read_tool')
                cid=json.loads(call['arguments'])['candidateId']
                if cid not in saved['drafts']:raise RuntimeError('missing_draft_receipt')
                history.append({'type':'function_call_output','call_id':call['call_id'],'output':json.dumps(saved['drafts'][cid],ensure_ascii=False)})
            box=HardenedToolBox(f,[c['candidateId'] for c in f['cases'][6:12]])
            box.calls=[json.loads(line) for line in (root/'resolver-2-tools.jsonl').read_text().splitlines()]
            ledger.label=video+'/finalize'
            prompt=Path(args.prompt).read_text()+'\nAll search and draft tools have finished; tool budget is now zero. Return one decision per candidate from the original task using only these existing receipts. Drafts remain unreviewed proposals, not existing dictionary IDs. Unknown names may remain needs_user. Do not invent a resolved target to finish. No further tools are available.\n'
            r=await Runner.run(agent(client,'FinalizeImport',prompt,DecisionBatch),history,max_turns=1,run_config=RC)
            result=box.validate(r.final_output);dump(root/'resolver-2-finalized.json',{'result':result,'wallSeconds':time.monotonic()-t,'recovery':'one no-tools SDK response from saved tool outputs; failed resolver attempts retained'})
            print(json.dumps({'video':video,'finalizedCases':len(result['decisions']),'wallSeconds':time.monotonic()-t}));return
        if args.stage=='discover':
            out=root/'phrases.json'
            if out.exists():print('Using frozen phrase proposals');return
            ledger.label=video+'/discovery'
            r=await Runner.run(agent(client,'PhraseDiscovery',PHRASE_PROMPT,PhraseBatch),json.dumps({'language':'nl','sentences':data['sentences']},ensure_ascii=False),max_turns=1,run_config=RC)
            value=validate_phrases(r.final_output,data['sentences']);value['sourceRevision']=data['sourceHash'];value['wallSeconds']=time.monotonic()-t;dump(out,value)
            print(json.dumps({'video':video,'phrases':len(value['proposals']),'wallSeconds':value['wallSeconds']}));return
        f=fixture(root);saved_drafts=json.loads((root/'drafts.json').read_text()) if (root/'drafts.json').exists() else {'drafts':{},'events':[]};drafts=saved_drafts['drafts'];results=[];draft_events=saved_drafts['events']
        prompt=Path(args.prompt).read_text()+'''\nAdditional optional tool personal_draft_propose calls a separate generator agent. For a meaningful expression with no adequate existing target, first search a justified alternative/full expression; then request a minimal draft. Do not generate for parser noise or proper names. Generated drafts do not have existing entry IDs: selectedEntryIds stays empty and the outcome stays unresolved/not_found. Do not select a literal component as the expression target. A tool draft is unreviewed and unsaved. Maximum four draft candidates across this video. If an existing entry adequately covers the expression, resolve it and do not generate.\n'''
        for b in range(0,len(f['cases']),6):
            label=video+f'/resolver-{b//6+1}';out=root/f'resolver-{b//6+1}.json'
            if out.exists():
                prior=json.loads(out.read_text())
                if 'error' not in prior:results.append(prior);continue
                archive=root/f'resolver-{b//6+1}-attempt1.json'
                if archive.exists():raise RuntimeError('failed_task_already_retried_once')
                out.rename(archive)
            box=HardenedToolBox(f,[c['candidateId'] for c in f['cases'][b:b+6]],root/f'resolver-{b//6+1}-tools.jsonl');tools=[]
            async def propose(cid,caller):
                if cid not in box.cases:return {'error':'candidate_outside_task'}
                if cid in drafts:return drafts[cid]
                c=box.cases[cid]
                if c['kind']!='expression':return {'error':'draft_scope_expression_only'}
                if len(drafts)>=4:return {'error':'draft_budget_exhausted'}
                searches=[r for r in box.calls if r['tool']=='dictionary_search' and r['arguments']['candidateId']==cid and not r['result'].get('error')]
                if not searches:return {'error':'search_before_draft_required'}
                refs=sorted(box.allowed[cid]);payload={'candidateId':cid,'surface':c['surface'],'canonicalForm':c['initialQuery'],'context':c['context'],'sourceRevision':f['sourceRevision'],'allowedRelatedEntryRefs':[box.encode.get(x,x) for x in refs],'existingEntries':[box.translate(box.entries[x],box.encode) for x in refs[:10]],'searchReceipts':[box.translate(r['result'],box.encode) for r in searches[-2:]]}
                previous=ledger.label;ledger.label=video+'/draft/'+cid
                try:
                    r=await Runner.run(agent(client,'PersonalDraftGenerator',DRAFT_PROMPT,PersonalDraft),json.dumps(payload,ensure_ascii=False),max_turns=1,run_config=RC)
                    value=validate_draft(r.final_output,cid,payload['allowedRelatedEntryRefs'])
                    value['relatedCanonicalEntryIds']=[box.decode.get(x,x) for x in value['relatedEntryRefs']]
                    value['source']={'video':video,'sourceRevision':f['sourceRevision'],'sentenceIds':c['sentenceIds'],'context':c['context']}
                    drafts[cid]=value;draft_events.append({'candidateId':cid,'caller':caller,'status':value['status']});dump(root/'drafts.json',{'drafts':drafts,'events':draft_events});return value
                finally:ledger.label=previous
            for spec in specs():
                async def invoke(ctx,raw,name=spec['name']):
                    try:return json.dumps(box.invoke(name,json.loads(raw)),ensure_ascii=False)
                    except Exception as e:return json.dumps({'error':'invalid_tool_arguments','detail':type(e).__name__})
                tools.append(FunctionTool(name=spec['name'],description=spec['description'],params_json_schema=spec['parameters'],on_invoke_tool=invoke))
            async def generate(ctx,raw):
                try:return json.dumps(await propose(json.loads(raw)['candidateId'],'resolver_tool_call'),ensure_ascii=False)
                except Exception as e:return json.dumps({'error':'draft_generation_failed','detail':type(e).__name__})
            tools.append(FunctionTool(name='personal_draft_propose',description='Ask a separate bounded generator agent for one unreviewed, unsaved private expression draft after dictionary search. Does not create an entry or collection member.',params_json_schema={'type':'object','properties':{'candidateId':{'type':'string'}},'required':['candidateId'],'additionalProperties':False},on_invoke_tool=generate))
            resolver=agent(client,'DutchImportResolver',prompt,DecisionBatch,tools);history=json.dumps(box.input(),ensure_ascii=False);start=time.monotonic();ledger.label=label
            try:
                remaining=6
                for attempt in range(2):
                    before=sum(x['event']=='request' and x['label']==label for x in ledger.rows)
                    r=await Runner.run(resolver,history,max_turns=remaining,run_config=RC)
                    used=sum(x['event']=='request' and x['label']==label for x in ledger.rows)-before
                    remaining-=used
                    try:value=box.validate(r.final_output);break
                    except RepairRequired as e:
                        if remaining<=0:raise RuntimeError('repair_turn_budget_exhausted')
                        history=r.to_input_list()+[{'role':'user','content':str(e)}]
                else:raise RuntimeError('repair_cap')
                record={'label':label,'result':value,'wallSeconds':time.monotonic()-start,'toolCalls':len(box.calls),'repairRejections':box.rejections}
                # Explicit code-routed fallback tests generator for pending phrases if resolver did not call it.
                for d in value['decisions']:
                    if d['outcome']=='not_found' and box.cases[d['candidateId']]['kind']=='expression' and d['candidateId'] not in drafts:
                        await propose(d['candidateId'],'coordinator_unresolved_queue')
            except Exception as e:record={'label':label,'error':str(e)[:600],'acceptedDecisions':list(box.accepted.values()),'wallSeconds':time.monotonic()-start,'toolCalls':len(box.calls)}
            dump(out,record);results.append(record);print(json.dumps({k:v for k,v in record.items() if k not in ['result','acceptedDecisions']}),flush=True)
        dump(root/'transfer-result.json',{'sourceRevision':f['sourceRevision'],'selectionPolicy':f['selectionPolicy'],'lookupCandidateCounts':f['lookupCandidateCounts'],'remainingCandidateCount':f['remainingCandidateCount'],'cases':len(f['cases']),'tasks':results,'drafts':drafts,'draftEvents':draft_events,'wallSeconds':time.monotonic()-t,'referenceAccuracy':None})
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('stage',choices=['discover','resolve','finalize']);p.add_argument('video',type=Path);p.add_argument('phase',type=Path);p.add_argument('--prompt',default='docs/research/agent-import-742/agent-flow/prompts/resolver-v3.txt');asyncio.run(main(p.parse_args()))
