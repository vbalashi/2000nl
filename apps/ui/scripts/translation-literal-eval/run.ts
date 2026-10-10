/* eslint-disable no-console */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { cases, heldOut, fresh } from "./cases";
import { buildDictionaryMeaningTranslationRequest, buildDictionaryMeaningTranslationMessages, parseDictionaryMeaningTranslationResult } from "../../lib/translation/dictionaryMeaningTranslationContract";
import { dictionaryTranslationProfile } from "../../lib/translation/dictionaryTranslationProfile";
import { withTranslationRetries, safeProviderRequestId, retryAfterMs, type TranslationAttemptLog } from "../../lib/translation/translationRetry";
import { safeTranslationProviderError, normalizeTranslationProviderError } from "../../lib/translation/translationProviderFailure";
const arg=(flag:string,fallback:string)=>process.argv[process.argv.indexOf(flag)+1]??fallback;
const runId=process.argv.includes("--run")?arg("--run",""):"";
if(!/^[a-z0-9-]+$/.test(runId))throw new Error("missing_run_id");
const isFresh=process.argv.includes("--fresh");
const isHeld=isFresh||process.argv.includes("--held-out");
if(process.argv.includes("--profile")) process.env.DICTIONARY_TRANSLATION_PROFILE=arg("--profile", "");
const profile=dictionaryTranslationProfile();
if(process.argv.includes("--reasoning")){
 const effort=arg("--reasoning","");if(!["low","medium","high"].includes(effort)||profile.model!=="gpt-6-luna")throw new Error("invalid_reasoning_effort");
 Object.assign(profile.requestSettings,{reasoning_effort:effort});
}
if(process.argv.includes("--max-output")){
 const n=Number(arg("--max-output",""));if(!Number.isInteger(n)||n<2200||n>4400)throw new Error("invalid_token_limit");
 Object.assign(profile.requestSettings,{max_completion_tokens:n});
}
const root=path.resolve(process.cwd(),"../..");
const dir=path.join(root,"Research/translation-eval/literal-v1",runId);
const hash=(x:unknown)=>crypto.createHash("sha256").update(JSON.stringify(x)).digest("hex");
const normalJobs=(isFresh?fresh:isHeld?heldOut:cases).flatMap(c=>["ru","en"].map(lang=>({
 id:`${c[0]}-${lang}`, category:c[6],
 request:buildDictionaryMeaningTranslationRequest({
  entryId:`synthetic-${c[0]}`,sourceContentFingerprint:`synthetic-${c[0]}-v1`,sourceLanguageCode:"nl",targetLanguageCode:lang,
  word:{headword:c[1],part_of_speech:c[2],raw:{meanings:[{definition:c[3],...(c[4]?{idioms:[{expression:c[4],explanation:c[5]}]}:{})}]}}
 })
})));
const stress=process.argv.includes("--stress");
const jobs=stress ? ["ru","en"].map(lang=>({id:`long-${lang}`,category:"bounded-full-meaning",request:buildDictionaryMeaningTranslationRequest({entryId:"synthetic-long",sourceContentFingerprint:"synthetic-long-v1",sourceLanguageCode:"nl",targetLanguageCode:lang,word:{headword:"koe",part_of_speech:"zn",raw:{meanings:[{definition:"een volwassen vrouwelijk rund dat melk geeft",examples:Array.from({length:12},(_,i)=>`Voorbeeld ${i+1}: de boer brengt de koe elke ochtend naar het weiland, waar het dier rustig graast terwijl hij het hek zorgvuldig sluit en daarna het voer voor de andere dieren klaarzet.`),idioms:[{expression:"over koetjes en kalfjes praten",explanation:"gezellig praten over dingen die niet belangrijk zijn",examples:["Tijdens de koffie praatten de buren over koetjes en kalfjes."]}],note:"Deze uitdrukking wordt gebruikt voor een informeel en vriendelijk gesprek zonder belangrijk onderwerp."}]}}})})) : normalJobs;
fs.mkdirSync(dir,{recursive:true});
const prepared=jobs.map(j=>({...j,messages:buildDictionaryMeaningTranslationMessages(j.request)}));
const manifest={schemaVersion:"translation-literal-eval-v1",runId,profile,heldOut:isHeld,jobs:prepared,inputHash:hash(prepared),settingsHash:hash(profile),createdAt:new Date().toISOString(),criteria:{alternatives:"zero is correct; useful exact-sense equivalents only",literal:"image accurate, helpful, omitted for transparent/identical",natural:"meaning and participants preserved"},humanApproved:false};
const mp=path.join(dir,"manifest.json");if(fs.existsSync(mp)){if(JSON.parse(fs.readFileSync(mp,"utf8")).inputHash!==manifest.inputHash || hash(JSON.parse(fs.readFileSync(mp,"utf8")).profile)!==hash(profile))throw new Error("input_changed");}else fs.writeFileSync(mp,JSON.stringify(manifest,null,2));
if(!process.argv.includes("--live")){console.log(JSON.stringify({runId,jobs:jobs.length,providerCalls:0}));process.exit(0);}
const env:Record<string,string|undefined>={...process.env};
for(const filename of [path.join(os.homedir(),".config/ot-learning/azure.env"),"/Users/khrustal/dev/2000nl/.env.local"]){if(fs.existsSync(filename))for(const line of fs.readFileSync(filename,"utf8").split(/\r?\n/)){const m=line.match(/^([A-Z_][A-Z_0-9]*)=(.*)$/);if(m&&!env[m[1]])env[m[1]]=m[2].trim().replace(/^(["'])(.*)\1$/,"$2");}}
const prefix=profile.envPrefix,endpoint=env[`${prefix}_ENDPOINT`],key=env[`${prefix}_API_KEY_PRIMARY`]??env[`${prefix}_API_KEY`]??env.AZURE_OPENAI_API_KEY;
if(!endpoint||!key)throw new Error("profile_configuration_missing");
const url=new URL(endpoint);if(url.protocol!=="https:"||!url.hostname.endsWith(".openai.azure.com")||url.search||url.hash)throw new Error("unsafe_endpoint");
const route=url.pathname.replace(/\/$/,"");const target=`${url.origin}${/\/openai\/v1$/i.test(route)?route:route+(/\/openai$/i.test(route)?"/v1":"/openai/v1")}/chat/completions`;
let cursor=0,done=0;
async function worker(){for(;;){const j=prepared[cursor++];if(!j)return;const dest=path.join(dir,j.id+".json");if(fs.existsSync(dest))continue;const attempts:TranslationAttemptLog[]=[];let raw:string|null=null,usage:unknown=null;const started=Date.now();let result:unknown=null,failure:unknown=null;
 try{result=await withTranslationRetries(async d=>{d.model=profile.model;let response:Response;try{response=await fetch(target,{method:"POST",headers:{"Content-Type":"application/json","api-key":key!},body:JSON.stringify({model:profile.model,...profile.requestSettings,messages:j.messages,response_format:{type:"json_object"}}),signal:AbortSignal.timeout(60_000)});}catch(e){d.reason=e instanceof Error&&e.name==="TimeoutError"?"timeout":"network";throw safeTranslationProviderError(d.reason==="timeout"?"provider_timeout":"provider_network_error",null);}
 d.status=response.status;d.requestId=safeProviderRequestId(response.headers.get("apim-request-id"));d.retryAfterMs=retryAfterMs(response.headers.get("retry-after"));if(!response.ok){d.reason="http_status";throw safeTranslationProviderError("provider_http_error",null);}d.stage="response";const data=await response.json();usage=data.usage??null;d.inputTokens=data.usage?.prompt_tokens;d.outputTokens=data.usage?.completion_tokens;raw=data.choices?.[0]?.message?.content??null;if(data.choices?.[0]?.finish_reason!=="stop"){d.reason="incomplete";throw safeTranslationProviderError("provider_response_error",null);}if(!raw){d.reason="empty_content";throw safeTranslationProviderError("provider_empty_response",null);}d.stage="contract";return parseDictionaryMeaningTranslationResult(raw,j.request);},{maxRetries:3,log:e=>attempts.push(e),classify:e=>normalizeTranslationProviderError(e,"provider_response_error").failure.code});}catch(e){failure=normalizeTranslationProviderError(e,"provider_response_error").failure;}
 fs.writeFileSync(dest,JSON.stringify({id:j.id,inputHash:hash(j),outcome:failure?"failed":"ready",result,raw,responseHash:hash(raw),usage,elapsedMs:Date.now()-started,attempts,failure},null,2));console.log(JSON.stringify({runId,completed:++done,id:j.id,outcome:failure?"failed":"ready"}));}}
Promise.all([worker(),worker(),worker(),worker()]).catch(()=>{console.error("evaluation_failed_redacted");process.exitCode=1;});
