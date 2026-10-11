/* eslint-disable no-console */
import fs from 'node:fs';
import path from 'node:path';
import { parseDictionaryMeaningTranslationResult } from '../../lib/translation/dictionaryMeaningTranslationContract';
const base='/Users/khrustal/adhoc/2000nl-research-archives/655-fullcard-budget-v1';
const read=(p:string)=>JSON.parse(fs.readFileSync(path.join(base,p),'utf8'));
const manifest=read('manifest.json');let ready=0,invalid=0;
for(const j of manifest.jobs){
 const c=read(`cards/${j.id}.json`),r=read(`responses/${j.id}.json`),d=read(`attempts/${j.id}-${r.attempts}-response.json`).data;
 if(d.model!=='gpt-6-luna-2026-09-22'||d.choices[0].finish_reason!=='stop'||d.usage.completion_tokens>=32768)throw new Error('unexpected_model_or_finish');
 const raw=JSON.parse(d.choices[0].message.content);const wanted=c.request.content.map((x:{fieldId:string})=>x.fieldId);const ids=raw.contentTranslations.map((x:{fieldId:string})=>x.fieldId);
 let parsed;try{parsed=parseDictionaryMeaningTranslationResult(d.choices[0].message.content,c.request);}catch{
  if(r.outcome!=='failed'||!['card080','card092','card098'].includes(j.id)||wanted.filter((x:string)=>!ids.includes(x)).length!==1)throw new Error('unexpected_failure');invalid++;continue;
 }
 if(r.outcome!=='ready'||JSON.stringify(parsed)!==JSON.stringify(r.result))throw new Error('replay_changed');ready++;
}
if(ready!==22||invalid!==3)throw new Error('wrong_counts');
console.log(JSON.stringify({parserReplay:'PASS',cases:25,ready,invalid,lengthFailures:0,timeouts:0}));
