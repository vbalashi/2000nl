/* eslint-disable no-console */
import fs from 'node:fs';
import path from 'node:path';
import { parseDictionaryMeaningTranslationResult } from '../../lib/translation/dictionaryMeaningTranslationContract';
const base='/Users/khrustal/adhoc/2000nl-research-archives/655-fullcard-volume-v1';
const read=(p:string)=>JSON.parse(fs.readFileSync(path.join(base,p),'utf8'));
const manifest=read('manifest.json');let accepted=0,length=0,invalid=0;
for(const job of manifest.jobs){
 const card=read(`cards/${job.id}.json`),response=read(`responses/${job.id}.json`),raw=read(`attempts/${job.id}-${response.attempts}-response.json`).data;
 if(raw.model!=='gpt-6-luna-2026-09-22')throw new Error('served_model_changed');
 if(raw.choices[0].finish_reason==='length'){
  if(response.outcome!=='failed'||raw.usage.completion_tokens!==2200||raw.usage.completion_tokens_details.reasoning_tokens!==2200||raw.choices[0].message.content)throw new Error('unexpected_length_failure');
  length++;continue;
 }
 let parsed;try{parsed=parseDictionaryMeaningTranslationResult(raw.choices[0].message.content,card.request);}catch{
  if(response.outcome!=='failed'||job.id!=='card080')throw new Error('unexpected_contract_failure');invalid++;continue;
 }
 if(response.outcome!=='ready'||JSON.stringify(parsed)!==JSON.stringify(response.result))throw new Error('replay_mismatch');accepted++;
}
if(accepted!==86||length!==13||invalid!==1)throw new Error('count_mismatch');
console.log(JSON.stringify({productionParserReplay:'PASS',accepted,length,invalid,model:'gpt-6-luna-2026-09-22'}));
