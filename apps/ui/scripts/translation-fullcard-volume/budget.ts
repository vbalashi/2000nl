/* eslint-disable no-console */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { execFileSync } from 'node:child_process';
import { buildDictionaryMeaningTranslationRequest, buildDictionaryMeaningTranslationMessages } from '../../lib/translation/dictionaryMeaningTranslationContract';
import { dictionaryTranslationProfile } from '../../lib/translation/dictionaryTranslationProfile';
import { OpenAITranslator } from '../../lib/translation/openaiTranslator';
import { loadTranslationConfigFromEnv } from '../../lib/translation/translationProvider';
const root=path.resolve(process.cwd(),'../..');
const baseline='/Users/khrustal/adhoc/2000nl-research-archives/655-fullcard-volume-v1';
const out='/Users/khrustal/adhoc/2000nl-research-archives/655-fullcard-budget-v1';
const CAP=32768,TIMEOUT=180000;
const hash=(s:string)=>crypto.createHash('sha256').update(s).digest('hex');
const save=(p:string,v:unknown)=>fs.writeFileSync(p,JSON.stringify(v,null,2)+'\n',{flag:'wx',mode:0o600});
const read=(p:string)=>JSON.parse(fs.readFileSync(p,'utf8'));
process.env.DICTIONARY_TRANSLATION_PROFILE='luna6';
function prepare(){
 fs.mkdirSync(out,{recursive:true,mode:0o700});if(fs.existsSync(path.join(out,'manifest.json')))throw new Error('manifest_exists');
 const prior=read(path.join(baseline,'manifest.json'));const jobs=prior.jobs.filter((j:{band:string})=>j.band==='long-tail');if(jobs.length!==25)throw new Error('expected_25');
 const snapshots=[];fs.mkdirSync(path.join(out,'cards'));
 for(const job of jobs){const card=read(path.join(baseline,'cards',job.id+'.json'));
  if(hash(fs.readFileSync(path.join(baseline,'cards',job.id+'.json'),'utf8'))!==job.snapshotHash)throw new Error('baseline_changed');
  const rebuilt=buildDictionaryMeaningTranslationRequest({entryId:card.request.entryId,sourceContentFingerprint:card.request.sourceContentFingerprint,sourceLanguageCode:'nl',targetLanguageCode:'ru',word:card.word});
  if(JSON.stringify(rebuilt)!==JSON.stringify(card.request)||JSON.stringify(buildDictionaryMeaningTranslationMessages(rebuilt))!==JSON.stringify(card.messages))throw new Error('runtime_request_changed');
  const expectedBody={...card.expectedBody,max_completion_tokens:CAP};save(path.join(out,'cards',job.id+'.json'),{...card,expectedBody,baselineBody:card.expectedBody,baselineResponse:read(path.join(baseline,'responses',job.id+'.json'))});
  snapshots.push({...job,snapshotHash:hash(fs.readFileSync(path.join(out,'cards',job.id+'.json'),'utf8')),baselineSnapshotHash:job.snapshotHash});
 }
 const files=['apps/ui/scripts/translation-fullcard-volume/budget.ts','apps/ui/lib/translation/dictionaryMeaningTranslationContract.ts','apps/ui/lib/translation/dictionaryTranslationProfile.ts','apps/ui/lib/translation/openaiTranslator.ts','apps/ui/lib/translation/translationProvider.ts','apps/ui/lib/translation/translationRetry.ts','apps/ui/lib/translation/translationProviderFailure.ts',...['system','user'].map(s=>'apps/ui/lib/translation/prompts/openai_dictionary_meaning_luna6_v8_'+s+'.txt')];
 fs.mkdirSync(path.join(out,'source'));const sourceHashes:Record<string,string>={};for(const f of files){const s=fs.readFileSync(path.join(root,f),'utf8');sourceHashes[f]=hash(s);save(path.join(out,'source',f.replaceAll('/','__')+'.json'),{path:f,text:s,sha256:hash(s)});}
 const m={schemaVersion:'translation-fullcard-budget-v1',createdAt:new Date().toISOString(),sourceCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),baselineManifestHash:hash(fs.readFileSync(path.join(baseline,'manifest.json'),'utf8')),profile:{...dictionaryTranslationProfile(),requestSettings:{...dictionaryTranslationProfile().requestSettings,max_completion_tokens:CAP}},sourceHashes,jobs:snapshots,protocol:{cases:25,target:'ru',concurrency:4,timeoutMs:TIMEOUT,maxRetries:3,maxProviderCalls:100,changesOnly:['max_completion_tokens 2200 ->32768','timeout15000 ->180000'],transportOverride:'Production OpenAITranslator builds baseline body; experiment-only fetch wrapper verifies it and changes only completion cap before actual send. Constructor timeout override. No runtime file edits.',selection:'Exact same25 full long-tail cards; all14 earlier failures and11 earlier ready. No selection by new outcome.',rubric:'Review complete outputs field by field, natural and literal meaning, participants, examples, alternatives/base; intelligible literal image accepted without etymological expansion. Missing fields are delivery failures; source errors separate. Agent nonblind, no human approval.',purpose:'Measure completion/readiness, actual input/output/reasoning and latency with room to complete; compare same cases. Both cap and timeout change, so do not isolate their effects causally.',productionMutations:false}};
 save(path.join(out,'manifest.json'),m);save(path.join(out,'protocol-freeze.json'),{manifestHash:hash(fs.readFileSync(path.join(out,'manifest.json'),'utf8')),providerCalls:0});
 save(path.join(out,'pricing-reference.json'),{checkedDate:'2026-10-11',source:'https://developers.openai.com/api/docs/models/gpt-6-luna',pricingSource:'https://developers.openai.com/api/docs/pricing',model:'gpt-6-luna',currency:'USD',unit:'1M tokens',standard:{input:0.10,cachedInput:0.01,cacheWrite:0.125,outputIncludingReasoning:0.50},billing:'Public OpenAI reference; actual Azure invoice tariff unverified. Show uncached reference estimate and cache-aware estimate where usage permits; unavailable usage separate. No audio or review model calls.'});
 console.log(JSON.stringify({prepared:25,cap:CAP,timeoutMs:TIMEOUT,out}));
}
async function execute(){
 const m=read(path.join(out,'manifest.json'));if(hash(fs.readFileSync(path.join(out,'manifest.json'),'utf8'))!==read(path.join(out,'protocol-freeze.json')).manifestHash)throw new Error('manifest_changed');
 for(const [f,h]of Object.entries(m.sourceHashes))if(hash(fs.readFileSync(path.join(root,f),'utf8'))!==h)throw new Error('source_changed');
 const env:Record<string,string>={};for(const file of ['/Users/khrustal/dev/2000nl/.env.local','/Users/khrustal/.config/ot-learning/azure.env'])for(const line of fs.readFileSync(file,'utf8').split(/\r?\n/)){const v=line.match(/^([A-Z_][A-Z_0-9]*)=(.*)$/);if(v)env[v[1]]=v[2].trim().replace(/^(["'])(.*)\1$/,'$2');}
 process.env.AZURE_OPENAI_GPT6_LUNA_ENDPOINT=env.AZURE_OPENAI_GPT6_LUNA_ENDPOINT;process.env.AZURE_OPENAI_GPT6_LUNA_API_KEY=env.AZURE_OPENAI_GPT6_LUNA_API_KEY_PRIMARY??env.AZURE_OPENAI_GPT6_LUNA_API_KEY??env.AZURE_OPENAI_API_KEY;process.env.TRANSLATION_PROVIDER='openai';
 const cfg=loadTranslationConfigFromEnv({purpose:'dictionary'});if(!cfg.apiKeys.openai||cfg.models?.openai!=='gpt-6-luna')throw new Error('missing_profile');
 const translator=new OpenAITranslator({apiKey:cfg.apiKeys.openai,apiUrl:cfg.apiUrls?.openai,model:cfg.models.openai,timeoutMs:TIMEOUT});
 const store=new AsyncLocalStorage<{id:string;attempt:number;expectedBody:any;baselineBody:any}>();const realFetch=globalThis.fetch,realInfo=console.info;const lock=path.join(out,'execute.lock');fs.writeFileSync(lock,String(process.pid),{flag:'wx'});
 let calls=0,done=0;fs.mkdirSync(path.join(out,'attempts'));fs.mkdirSync(path.join(out,'responses'));
 globalThis.fetch=async(input,init)=>{const ctx=store.getStore();if(!ctx)throw new Error('unexpected_fetch');const original=JSON.parse(String(init?.body));if(JSON.stringify(original)!==JSON.stringify(ctx.baselineBody))throw new Error('baseline_body_changed');const body={...original,max_completion_tokens:CAP};if(JSON.stringify(body)!==JSON.stringify(ctx.expectedBody))throw new Error('override_mismatch');if(++calls>100)throw new Error('call_cap');const a=++ctx.attempt,name=ctx.id+'-'+a,start=Date.now();
  save(path.join(out,'attempts',name+'-request.json'),{id:ctx.id,attempt:a,startedAt:new Date().toISOString(),body,bodyHash:hash(JSON.stringify(body))});
  try{const res=await realFetch(input,{...init,body:JSON.stringify(body)});const raw=await res.clone().text();let data:unknown;try{data=JSON.parse(raw);}catch{data=null;}save(path.join(out,'attempts',name+'-response.json'),{id:ctx.id,attempt:a,status:res.status,elapsedMs:Date.now()-start,data,raw:data===null?raw:null});return res;}
  catch(error){save(path.join(out,'attempts',name+'-response.json'),{id:ctx.id,attempt:a,status:null,elapsedMs:Date.now()-start,errorName:error instanceof Error?error.name:'unknown'});throw error;}
 };
 console.info=(...args:unknown[])=>{const ctx=store.getStore();if(ctx&&args[0]==='[translation] attempt')save(path.join(out,'attempts',ctx.id+'-'+ctx.attempt+'-diagnostic.json'),args[1]);else realInfo(...args);};
 try{let index=0;await Promise.all(Array.from({length:4},async()=>{while(index<m.jobs.length){const job=m.jobs[index++],file=path.join(out,'cards',job.id+'.json');if(hash(fs.readFileSync(file,'utf8'))!==job.snapshotHash)throw new Error('card_changed');const c=read(file),ctx={id:job.id,attempt:0,expectedBody:c.expectedBody,baselineBody:c.baselineBody},start=Date.now();
  await store.run(ctx,async()=>{try{const {meta,...result}=await translator.translateDictionaryMeaning(c.request);save(path.join(out,'responses',job.id+'.json'),{id:job.id,outcome:'ready',result,model:meta.model,attempts:ctx.attempt,elapsedMs:Date.now()-start,responseHash:hash(JSON.stringify(result))});}catch(e){save(path.join(out,'responses',job.id+'.json'),{id:job.id,outcome:'failed',safeError:e instanceof Error?e.message:'unknown',attempts:ctx.attempt,elapsedMs:Date.now()-start});}});done++;console.log(JSON.stringify({done,total:25,id:job.id,calls,outcome:read(path.join(out,'responses',job.id+'.json')).outcome}));
 }}));save(path.join(out,'execution.json'),{completedAt:new Date().toISOString(),cases:done,calls});}finally{globalThis.fetch=realFetch;console.info=realInfo;fs.unlinkSync(lock);}
}
const mode=process.argv[2];if(mode==='prepare')prepare();else if(mode==='execute')execute().catch(()=>{console.error('experiment_failed_see_evidence');process.exitCode=1;});else throw new Error('use_prepare_or_execute');
