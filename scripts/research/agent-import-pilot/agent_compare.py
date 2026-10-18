"""Bounded Azure Responses vs local OpenAI Agents SDK comparison. Read tools only."""
import argparse,asyncio,hashlib,json,os,subprocess,time
from datetime import datetime,timezone
from pathlib import Path
from urllib.parse import urlparse
import httpx2
from openai import AsyncOpenAI
from agents import Agent,Runner,RunConfig,ModelSettings,FunctionTool,OpenAIResponsesModel,set_tracing_disabled
from agents.model_settings import ModelRetrySettings
from agent_tools import ToolBox,DecisionBatch,specs
from hardened_tools import HardenedToolBox,RepairRequired

class WireLedger:
    def __init__(self,root,base,model,max_requests=18,prior_ledger=None):
        self.root=root;self.base=base.rstrip('/')+'/responses';self.model=model;self.max_requests=max_requests
        self.path=root/'wire.jsonl';self.rows=[];self.sent_bytes=0;self.start=time.monotonic();self.label='unset'
        self.prior_rows=[json.loads(s) for s in prior_ledger.read_text().splitlines()] if prior_ledger else []
        self.prior_calls=sum(r['event']=='request' for r in self.prior_rows)
        self.sent_bytes=sum(r.get('requestBytes',0) for r in self.prior_rows if r['event']=='request')
        if self.path.exists():self.rows=[json.loads(s) for s in self.path.read_text().splitlines()];self.sent_bytes+=sum(r.get('requestBytes',0) for r in self.rows if r['event']=='request')
    async def request(self,request):
        if str(request.url)!=self.base or request.method!='POST':raise RuntimeError('unapproved_network_destination')
        count=sum(r['event']=='request' for r in self.rows)
        data=json.loads(request.content)
        if data['model']!=self.model or data.get('store') is not False:raise RuntimeError('model_or_storage_policy_mismatch')
        if count+self.prior_calls>=self.max_requests or time.monotonic()-self.start>600:raise RuntimeError('run_call_or_deadline_cap')
        if len(request.content)>98304 or self.sent_bytes+len(request.content)>786432:raise RuntimeError('request_byte_budget')
        if data.get('max_output_tokens',0)>4096:raise RuntimeError('output_cap')
        n=count+1;self.sent_bytes+=len(request.content);request.extensions['pilot_index']=n;request.extensions['pilot_start']=time.monotonic()
        (self.root/f'request-{n:02}.json').write_bytes(request.content)
        self.append({'event':'request','index':n,'label':self.label,'utc':datetime.now(timezone.utc).isoformat(),'model':data['model'],'requestBytes':len(request.content),'sha256':hashlib.sha256(request.content).hexdigest(),'maxOutputTokens':data.get('max_output_tokens'),'url':str(request.url)})
    async def response(self,response):
        raw=await response.aread();n=response.request.extensions['pilot_index'];(self.root/f'response-{n:02}.json').write_bytes(raw)
        try:data=json.loads(raw)
        except ValueError:data={}
        self.append({'event':'response','index':n,'label':self.label,'status':response.status_code,'wallSeconds':time.monotonic()-response.request.extensions['pilot_start'],'responseId':data.get('id'),'requestId':response.headers.get('apim-request-id') or response.headers.get('x-request-id'),'model':data.get('model'),'responseStatus':data.get('status'),'usage':data.get('usage'),'error':data.get('error')})
    def append(self,row):
        self.rows.append(row)
        with self.path.open('a') as f:f.write(json.dumps(row,ensure_ascii=False)+'\n')

async def run_direct(client,model,prompt,box,baseline=False):
    history=[{'role':'user','content':json.dumps(box.input(),ensure_ascii=False)}]
    for turn in range(1 if baseline else 4):
        resp=await client.responses.create(model=model,instructions=prompt,input=history,tools=[] if baseline else specs(),
            store=False,max_output_tokens=4096,reasoning={'effort':'low'},include=['reasoning.encrypted_content'],
            text={'format':{'type':'json_schema','name':'DecisionBatch','schema':DecisionBatch.model_json_schema(),'strict':True}},
            parallel_tool_calls=True)
        history.extend(item.model_dump(exclude_none=True) for item in resp.output)
        calls=[item for item in resp.output if item.type=='function_call']
        if calls:
            for call in calls:
                try:result=box.invoke(call.name,json.loads(call.arguments))
                except Exception as e:result={'error':'invalid_tool_arguments','detail':type(e).__name__}
                history.append({'type':'function_call_output','call_id':call.call_id,'output':json.dumps(result,ensure_ascii=False)})
        elif resp.status=='completed':
            try:return box.validate(DecisionBatch.model_validate_json(resp.output_text))
            except RepairRequired as e:history.append({'role':'user','content':str(e)})
        else:raise RuntimeError('incomplete_or_failed_response:'+str(resp.status))
    raise RuntimeError('turn_cap_exhausted')

async def run_sdk(client,model,prompt,box):
    tools=[]
    for spec in specs():
        async def invoke(ctx,raw,name=spec['name']):
            try:return json.dumps(box.invoke(name,json.loads(raw)),ensure_ascii=False)
            except Exception as e:return json.dumps({'error':'invalid_tool_arguments','detail':type(e).__name__})
        tools.append(FunctionTool(name=spec['name'],description=spec['description'],params_json_schema=spec['parameters'],on_invoke_tool=invoke))
    agent=Agent(name='DutchImportResolver',instructions=prompt,model=OpenAIResponsesModel(model,client),tools=tools,
        output_type=DecisionBatch,model_settings=ModelSettings(max_tokens=4096,reasoning={'effort':'low'},store=False,
        parallel_tool_calls=True,response_include=['reasoning.encrypted_content'],retry=ModelRetrySettings(max_retries=0)))
    history=json.dumps(box.input(),ensure_ascii=False)
    for attempt in range(2 if isinstance(box,HardenedToolBox) else 1):
        result=await Runner.run(agent,history,max_turns=3 if isinstance(box,HardenedToolBox) else 4,
            run_config=RunConfig(tracing_disabled=True,trace_include_sensitive_data=False))
        try:return box.validate(result.final_output)
        except RepairRequired as e:history=result.to_input_list()+[{'role':'user','content':str(e)}]
    raise RuntimeError('validation_repair_cap_exhausted')

async def main(args):
    args.output.mkdir(parents=True,exist_ok=True);os.chmod(args.output,0o700)
    fixture=json.loads(args.fixture.read_text());prompt=args.prompt.read_text()
    config={'model':args.model,'baseUrl':args.base_url,'maxHttpRequests':12 if args.hardened else 18,'maxModelResponsesPerTask':6 if args.hardened else 4,'maxOutputTokensPerRequest':4096,'maxRequestBytes':98304,'maxCumulativeRequestBytes':786432,'timeoutSeconds':600,'retries':0,'sdkTraceExport':False,'storeResponses':False,'readOnlyFrozenTools':True,'fixtureSha256':hashlib.sha256(args.fixture.read_bytes()).hexdigest(),'promptSha256':hashlib.sha256(args.prompt.read_bytes()).hexdigest(),'batchIndices':args.batch_indices,'priorLedgerSha256':hashlib.sha256(args.prior_ledger.read_bytes()).hexdigest() if args.prior_ledger else None,'priceStatus':'not verified; hard call/byte/output limits, not a claimed currency cap'}
    if args.hardened:config['hardened']=True
    cp=args.output/'run-config.json'
    if cp.exists() and json.loads(cp.read_text())!=config:raise RuntimeError('resume_config_mismatch')
    cp.write_text(json.dumps(config,indent=2));set_tracing_disabled(True)
    # Retrieve existing Entra credential in memory; never persist or print it.
    token=json.loads(subprocess.check_output(['az','account','get-access-token','--resource','https://cognitiveservices.azure.com/','--output','json'],text=True))['accessToken']
    ledger=WireLedger(args.output,args.base_url,args.model,max_requests=12 if args.hardened else 18,prior_ledger=args.prior_ledger)
    async with httpx2.AsyncClient(event_hooks={'request':[ledger.request],'response':[ledger.response]},timeout=60,follow_redirects=False) as http:
        client=AsyncOpenAI(base_url=args.base_url.rstrip('/')+'/',api_key=token,http_client=http,max_retries=0,timeout=60)
        # Same fixture, prompt, model and output contract for each condition.
        for mode in args.modes.split(','):
            for b in [int(n)-1 for n in args.batch_indices.split(',')]:
                label=f'{mode}-batch{b+1}';out=args.output/f'{label}.json'
                if out.exists():print(json.dumps({'cachedTask':label}),flush=True);continue
                ids=[c['candidateId'] for c in fixture['cases'][b*6:(b+1)*6]]
                box=(HardenedToolBox if args.hardened else ToolBox)(fixture,ids,args.output/f'{label}-tools.jsonl');ledger.label=label;t=time.monotonic()
                try:
                    result=await asyncio.wait_for(run_sdk(client,args.model,prompt,box) if mode=='sdk' else run_direct(client,args.model,prompt,box,mode=='baseline'),timeout=180)
                    byid={d['candidateId']:d for d in result['decisions']};evaluation=[]
                    for c in fixture['cases'][b*6:(b+1)*6]:
                        d=byid[c['candidateId']];expected=c['expectedEntryIds']
                        evaluation.append({'candidateId':c['candidateId'],'agreesWithSupervisedReference':set(d['selectedEntryIds'])==set(expected) and ((d['outcome']=='resolved')==bool(expected)),'outcome':d['outcome']})
                    value={'label':label,'wallSeconds':time.monotonic()-t,'toolCalls':len(box.calls),'result':result,'evaluation':evaluation,'repairRejections':getattr(box,'rejections',[])}
                except Exception as e:
                    value={'label':label,'wallSeconds':time.monotonic()-t,'toolCalls':len(box.calls),'errorType':type(e).__name__,'error':str(e)[:1400],'acceptedDecisions':list(getattr(box,'accepted',{}).values()),'repairRejections':getattr(box,'rejections',[])}
                out.write_text(json.dumps(value,ensure_ascii=False,indent=2));print(json.dumps({k:v for k,v in value.items() if k not in ['result','evaluation','acceptedDecisions']},ensure_ascii=False),flush=True)
                # Do not repeatedly spend after a routing/compatibility failure.
                if value.get('error') and any(s in value['error'] for s in ['Unauthorized','authentication','404','not supported','model_or_storage','unapproved_network']):return
    summary={}
    for mode in args.modes.split(','):
        data=[json.loads(p.read_text()) for p in args.output.glob(f'{mode}-batch[12].json')]
        ev=[e for v in data for e in v.get('evaluation',[])];wire=[r for r in ledger.rows if r['event']=='response' and r['label'].startswith(mode+'-')]
        usage=[r['usage'] for r in wire if r.get('usage')];summary[mode]={'tasks':len(data),'taskErrors':sum('error'in d for d in data),'referenceAgreements':sum(e['agreesWithSupervisedReference'] for e in ev),'evaluatedCases':len(ev),'modelHttpRequests':sum(r['event']=='request' and r['label'].startswith(mode+'-') for r in ledger.rows),'toolCalls':sum(d['toolCalls'] for d in data),'wallSeconds':sum(d['wallSeconds'] for d in data),'inputTokens':sum(u.get('input_tokens',0) for u in usage),'outputTokens':sum(u.get('output_tokens',0) for u in usage),'cachedInputTokens':sum(u.get('input_tokens_details',{}).get('cached_tokens',0) for u in usage),'reasoningOutputTokens':sum(u.get('output_tokens_details',{}).get('reasoning_tokens',0) for u in usage),'unknownUsageResponses':sum(not r.get('usage') for r in wire)}
    (args.output/'summary.json').write_text(json.dumps(summary,indent=2));print(json.dumps(summary),flush=True)

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('fixture',type=Path);p.add_argument('output',type=Path);p.add_argument('--prompt',type=Path,required=True);p.add_argument('--model',required=True);p.add_argument('--base-url',required=True);p.add_argument('--batch-indices',default='1,2');p.add_argument('--prior-ledger',type=Path);p.add_argument('--hardened',action='store_true');p.add_argument('--modes',default='baseline,direct,sdk');args=p.parse_args();asyncio.run(main(args))
