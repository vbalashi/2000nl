/* eslint-disable no-console */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { execFileSync } from 'node:child_process';
import { buildDictionaryMeaningTranslationRequest, buildDictionaryMeaningTranslationMessages, DICTIONARY_MEANING_TRANSLATION_LIMITS } from '../../lib/translation/dictionaryMeaningTranslationContract';
import { dictionaryTranslationProfile } from '../../lib/translation/dictionaryTranslationProfile';
import { OpenAITranslator } from '../../lib/translation/openaiTranslator';
import { loadTranslationConfigFromEnv } from '../../lib/translation/translationProvider';
import { contentFingerprint, normalizeDictionaryContent } from '../../lib/platform/projections/dictionaryContent';
import { dictionaryLexicalRelationTexts } from '../../lib/dictionary/lexicalRelations';

const root=path.resolve(process.cwd(),'../..');
const out='/Users/khrustal/adhoc/2000nl-research-archives/655-fullcard-volume-v1';
const poolFile='/Users/khrustal/dev/2000nl/.worktrees/657-translation-eval/Research/translation-eval/runs/corpus-100-v1/source-pool.json';
const hash=(s:string)=>crypto.createHash('sha256').update(s).digest('hex');
const save=(p:string,v:unknown)=>fs.writeFileSync(p,JSON.stringify(v,null,2)+'\n',{flag:'wx',mode:0o600});
const read=(p:string)=>JSON.parse(fs.readFileSync(p,'utf8'));
process.env.DICTIONARY_TRANSLATION_PROFILE='luna6';
function candidates(word:any){
 const m=word.raw.meanings[0],a:{fieldId:string;role:string;text:string}[]=[];
 const add=(fieldId:string,role:string,text:unknown)=>{if(typeof text==='string'&&text.trim())a.push({fieldId,role,text:text.trim()});};
 add('definition','definition',m.definition);add('usage-pattern','usage-pattern',m.context);
 for(const [i,v] of (m.idioms??[]).entries()){add(`idiom:${i}`,'idiom',typeof v==='string'?v:v.expression);add(`idiom:${i}:explanation`,'idiom-explanation',v.explanation);}
 for(const kind of ['synonym','antonym'])for(const [i,v]of dictionaryLexicalRelationTexts(m[kind+'s']).entries())add(`${kind}:${i}`,kind,v);
 for(const [i,v]of(m.idioms??[]).entries())for(const [j,e]of(v.examples??[]).entries())add(`idiom:${i}:example:${j}`,'example',e);
 for(const [i,e]of(m.examples??[]).entries())add(`example:${i}`,'example',e);
 add('usage-note','usage-note',m.note);return a;
}
function prepare(){
 fs.mkdirSync(out,{recursive:true,mode:0o700});
 if(fs.existsSync(path.join(out,'manifest.json')))throw new Error('manifest_exists');
 const pool=read(poolFile);const prepared=[];
 for(const row of pool){
  if(row.dictionarySlug!=='nl-vandale'||row.sourceProvider!=='vandale'||row.raw.meanings?.length!==1)continue;
  const word={id:row.entryId,headword:row.headword,gender:row.gender,part_of_speech:row.part_of_speech,language_code:'nl',raw:row.raw};
  const request=buildDictionaryMeaningTranslationRequest({entryId:row.entryId,sourceContentFingerprint:contentFingerprint(normalizeDictionaryContent(word as any)),sourceLanguageCode:'nl',targetLanguageCode:'ru',word});
  if(!request.content.length)continue;
  const source=candidates(word),sent=new Map(request.content.map(c=>[c.fieldId,c.text]));
  const metrics={sourceCharacters:source.reduce((n,c)=>n+[...c.text].length,0),sentCharacters:request.content.reduce((n,c)=>n+[...c.text].length,0),sourceFields:source.length,sentFields:request.content.length,sourceExamples:source.filter(c=>c.role==='example').length,sentExamples:request.content.filter(c=>c.role==='example').length,sourceIdioms:source.filter(c=>c.role==='idiom').length,sentIdioms:request.content.filter(c=>c.role==='idiom').length,omittedFields:source.filter(c=>!sent.has(c.fieldId)).map(c=>c.fieldId),truncatedFields:source.filter(c=>sent.has(c.fieldId)&&sent.get(c.fieldId)!==c.text).map(c=>c.fieldId),roleCounts:Object.fromEntries([...new Set(source.map(c=>c.role))].map(role=>[role,source.filter(c=>c.role===role).length]))};
  prepared.push({word,request,metrics,sourceFields:source});
 }
 const bands=[{id:'small',min:0,max:70},{id:'medium',min:71,max:120},{id:'large',min:121,max:200},{id:'long-tail',min:201,max:Infinity}];
 const used=new Set<string>();const jobs:any[]=[];
 for(const b of bands){
  const rows=prepared.filter(c=>c.metrics.sentCharacters>=b.min&&c.metrics.sentCharacters<=b.max);
  rows.sort((a,b2)=>b.id==='long-tail'?b2.metrics.sentCharacters-a.metrics.sentCharacters||hash(a.word.id).localeCompare(hash(b2.word.id)):hash(a.word.id+'volume-v1').localeCompare(hash(b2.word.id+'volume-v1')));
  let n=0;for(const c of rows){if(used.has(c.word.headword))continue;used.add(c.word.headword);jobs.push({id:`card${String(jobs.length+1).padStart(3,'0')}`,band:b.id,...c});if(++n===25)break;}
  if(n!==25)throw new Error('insufficient_band_'+b.id);
 }
 const sourcePaths=['apps/ui/scripts/translation-fullcard-volume/run.ts','apps/ui/lib/translation/dictionaryMeaningTranslationContract.ts','apps/ui/lib/translation/dictionaryTranslationProfile.ts','apps/ui/lib/translation/openaiTranslator.ts','apps/ui/lib/translation/translationProvider.ts','apps/ui/lib/translation/translationRetry.ts','apps/ui/lib/translation/translationProviderFailure.ts','apps/ui/lib/translation/prompts/promptLoader.ts','apps/ui/lib/platform/projections/dictionaryContent.ts','apps/ui/lib/dictionary/lexicalRelations.ts',...['system','user'].map(s=>'apps/ui/lib/translation/prompts/openai_dictionary_meaning_luna6_v8_'+s+'.txt')];
 fs.mkdirSync(path.join(out,'source'),{recursive:true});const sourceHashes:Record<string,string>={};
 for(const p of sourcePaths){const text=fs.readFileSync(path.join(root,p),'utf8');sourceHashes[p]=hash(text);save(path.join(out,'source',p.replaceAll('/','__')+'.json'),{path:p,text,sha256:hash(text)});}
 fs.mkdirSync(path.join(out,'cards'));for(const j of jobs){const messages=buildDictionaryMeaningTranslationMessages(j.request);save(path.join(out,'cards',j.id+'.json'),{...j,messages,expectedBody:{messages,model:'gpt-6-luna',...dictionaryTranslationProfile().requestSettings}});}
 const manifest={schemaVersion:'translation-fullcard-volume-v1',createdAt:new Date().toISOString(),ownerIssue:655,sourceCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),sourcePoolHash:hash(fs.readFileSync(poolFile,'utf8')),sourcePoolRows:pool.length,eligiblePoolRows:prepared.length,profile:dictionaryTranslationProfile(),limits:DICTIONARY_MEANING_TRANSLATION_LIMITS,sourceHashes,jobs:jobs.map(j=>({id:j.id,band:j.band,headword:j.word.headword,entryId:j.word.id,metrics:j.metrics,snapshotHash:hash(fs.readFileSync(path.join(out,'cards',j.id+'.json'),'utf8'))})),protocol:{target:'ru',cases:100,concurrency:4,timeoutMs:15000,maxRetries:3,maxProviderCalls:400,semanticRetries:0,mutations:'none; translator only, no cache/DB writes',selection:'25 per sent-character band <=70 /71-120 /121-200 />200; last band takes 25 longest unique headwords in the frozen pool; others deterministic hash selection',rubric:'Review all requested fields, primary/alternatives/base/note. Wrong meaning/participants/negation = major; awkward wording = minor; missing/unfinished output = delivery failure. Source error separate. Useful intelligible literal image accepted; no etymology requirement; absent duplicate literal accepted.',analysis:'Descriptive association only; stratified sample and different senses do not establish causality. Per-card and per-content-field errors separately; source omissions separated from model errors. No production changes. Nonblind agent review, no human approval.'}};
 save(path.join(out,'manifest.json'),manifest);save(path.join(out,'protocol-freeze.json'),{manifestHash:hash(fs.readFileSync(path.join(out,'manifest.json'),'utf8')),createdAt:new Date().toISOString(),providerCalls:0});
 console.log(JSON.stringify({prepared:jobs.length,bands:bands.map(b=>{const a=jobs.filter(j=>j.band===b.id);return {id:b.id,n:a.length,min:Math.min(...a.map(j=>j.metrics.sentCharacters)),max:Math.max(...a.map(j=>j.metrics.sentCharacters)),examples:a.reduce((n,j)=>n+j.metrics.sentExamples,0),idioms:a.reduce((n,j)=>n+j.metrics.sentIdioms,0)};}),out}));
}
async function execute(){
 const manifest=read(path.join(out,'manifest.json'));const freeze=read(path.join(out,'protocol-freeze.json'));
 if(hash(fs.readFileSync(path.join(out,'manifest.json'),'utf8'))!==freeze.manifestHash)throw new Error('manifest_changed');
 for(const [p,h]of Object.entries(manifest.sourceHashes))if(hash(fs.readFileSync(path.join(root,p),'utf8'))!==h)throw new Error('runtime_source_changed');
 for(const line of fs.readFileSync('/Users/khrustal/dev/2000nl/.env.local','utf8').split(/\r?\n/)){const m=line.match(/^([A-Z_][A-Z_0-9]*)=(.*)$/);if(m&&!process.env[m[1]])process.env[m[1]]=m[2].trim().replace(/^(["'])(.*)\1$/,'$2');}
 const shared:Record<string,string>={};for(const line of fs.readFileSync('/Users/khrustal/.config/ot-learning/azure.env','utf8').split(/\r?\n/)){const m=line.match(/^([A-Z_][A-Z_0-9]*)=(.*)$/);if(m)shared[m[1]]=m[2].trim().replace(/^(["'])(.*)\1$/,'$2');}
 process.env.AZURE_OPENAI_GPT6_LUNA_ENDPOINT=shared.AZURE_OPENAI_GPT6_LUNA_ENDPOINT;process.env.AZURE_OPENAI_GPT6_LUNA_API_KEY=shared.AZURE_OPENAI_GPT6_LUNA_API_KEY_PRIMARY??shared.AZURE_OPENAI_GPT6_LUNA_API_KEY??shared.AZURE_OPENAI_API_KEY;
 process.env.TRANSLATION_PROVIDER='openai';process.env.DICTIONARY_TRANSLATION_PROFILE='luna6';
 const cfg=loadTranslationConfigFromEnv({purpose:'dictionary'});if(!cfg.apiKeys.openai||cfg.models?.openai!=='gpt-6-luna')throw new Error('profile_missing');
 const translator=new OpenAITranslator({apiKey:cfg.apiKeys.openai,apiUrl:cfg.apiUrls?.openai,model:cfg.models.openai});
 const store=new AsyncLocalStorage<{id:string;attempt:number;expectedBody:any}>();const originalFetch=globalThis.fetch;const originalInfo=console.info;
 const lock=path.join(out,'execute.lock');fs.writeFileSync(lock,String(process.pid),{flag:'wx'});
 let calls=0,done=0;fs.mkdirSync(path.join(out,'responses'),{recursive:true});fs.mkdirSync(path.join(out,'attempts'),{recursive:true});
 globalThis.fetch=async(input,init)=>{
  const ctx=store.getStore();if(!ctx)throw new Error('unexpected_fetch');const body=JSON.parse(String(init?.body));
  if(JSON.stringify(body)!==JSON.stringify(ctx.expectedBody))throw new Error('application_body_mismatch');
  if(++calls>400)throw new Error('call_cap');const attempt=++ctx.attempt;const name=ctx.id+'-'+attempt;const start=Date.now();
  save(path.join(out,'attempts',name+'-request.json'),{id:ctx.id,attempt,startedAt:new Date().toISOString(),body,bodyHash:hash(JSON.stringify(body))});
  try{const response=await originalFetch(input,init);const raw=await response.clone().text();let data:unknown;try{data=JSON.parse(raw);}catch{data=null;}
   save(path.join(out,'attempts',name+'-response.json'),{id:ctx.id,attempt,status:response.status,elapsedMs:Date.now()-start,data,raw:data===null?raw:null});return response;
  }catch(error){save(path.join(out,'attempts',name+'-response.json'),{id:ctx.id,attempt,status:null,elapsedMs:Date.now()-start,errorName:error instanceof Error?error.name:'unknown'});throw error;}
 };
 console.info=(...args:unknown[])=>{const ctx=store.getStore();if(args[0]==='[translation] attempt'&&ctx)save(path.join(out,'attempts',ctx.id+'-'+ctx.attempt+'-diagnostic.json'),args[1]);else originalInfo(...args);};
 try{
  let index=0;await Promise.all(Array.from({length:4},async()=>{while(index<manifest.jobs.length){const job=manifest.jobs[index++];if(fs.existsSync(path.join(out,'responses',job.id+'.json')))throw new Error('response_exists_no_implicit_resume');
   const filename=path.join(out,'cards',job.id+'.json');if(hash(fs.readFileSync(filename,'utf8'))!==job.snapshotHash)throw new Error('snapshot_changed');const card=read(filename);const ctx={id:job.id,attempt:0,expectedBody:card.expectedBody};const start=Date.now();
   await store.run(ctx,async()=>{try{const result=await translator.translateDictionaryMeaning(card.request);const {meta,...translation}=result;save(path.join(out,'responses',job.id+'.json'),{id:job.id,outcome:'ready',result:translation,model:meta.model,elapsedMs:Date.now()-start,attempts:ctx.attempt,responseHash:hash(JSON.stringify(translation))});}catch(error){save(path.join(out,'responses',job.id+'.json'),{id:job.id,outcome:'failed',safeError:error instanceof Error?error.message:'unknown',elapsedMs:Date.now()-start,attempts:ctx.attempt});}});
   done++;console.log(JSON.stringify({done,total:100,id:job.id,band:job.band,outcome:read(path.join(out,'responses',job.id+'.json')).outcome,calls}));
  }}));
  save(path.join(out,'execution.json'),{completedAt:new Date().toISOString(),cards:done,calls});
 }finally{globalThis.fetch=originalFetch;console.info=originalInfo;fs.unlinkSync(lock);}
}
const mode=process.argv[2];if(mode==='prepare')prepare();else if(mode==='execute')execute().catch(()=>{console.error('execution_failed_see_saved_evidence');process.exitCode=1;});else throw new Error('use_prepare_or_execute');
