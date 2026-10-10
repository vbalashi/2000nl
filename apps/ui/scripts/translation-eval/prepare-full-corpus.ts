/* eslint-disable no-console */
import fs from 'node:fs';
import path from 'node:path';
import { buildDictionaryMeaningTranslationRequest } from '../../lib/translation/dictionaryMeaningTranslationContract';
import { hash } from './evaluate';
const research=path.resolve(process.cwd(),'../../Research/translation-eval');
const local=path.join(research,'runs/corpus-100-v1');
const pool=JSON.parse(fs.readFileSync(path.join(local,'source-pool.json'),'utf8')) as any[];
const previous=new Set('praten mooi snel belangrijk moeilijk koe woensdag bank typisch gemakkelijk vriendelijk werkelijk zeven duidelijk hoeven arm twaalf weer'.split(' '));
const rows=pool.filter(x=>x.dictionarySlug==='nl-vandale'&&!previous.has(x.headword)&&x.raw.meanings?.length===1);
rows.sort((a,b)=>hash(a.entryId+'full100-v1').localeCompare(hash(b.entryId+'full100-v1')));
const strata=[{id:'definition-idioms',n:20,dev:6,test:(m:any)=>Boolean(m.definition&&m.idioms?.length)},
{id:'multiple-examples',n:20,dev:6,test:(m:any)=>Boolean(m.definition&&m.examples?.length>=2)},
{id:'usage-pattern',n:15,dev:4,test:(m:any)=>Boolean(m.definition&&m.context)},
{id:'ordinary-example',n:25,dev:8,test:(m:any)=>Boolean(m.definition&&m.examples?.length)},
{id:'idiom-only',n:10,dev:3,test:(m:any)=>Boolean(!m.definition&&!m.context&&m.idioms?.length)},
{id:'definition-only',n:10,dev:3,test:(m:any)=>Boolean(m.definition&&!m.examples?.length&&!m.idioms?.length&&!m.context)}];
const used=new Set<string>();const selected:any[]=[];
for(const stratum of strata){
 const chosen=rows.filter(x=>!used.has(x.headword)&&stratum.test(x.raw.meanings[0])).filter((x,i,a)=>a.findIndex(y=>y.headword===x.headword)===i).slice(0,stratum.n);
 if(chosen.length!==stratum.n)throw new Error('insufficient_stratum');
 for(const [i,x] of chosen.entries()){used.add(x.headword);selected.push({...x,stratum:stratum.id,split:i<stratum.dev?'development':'validation'});}
}
for(const split of ['development','validation']){
 const subset=selected.filter(x=>x.split===split).sort((a,b)=>hash(a.entryId+'language').localeCompare(hash(b.entryId+'language')));
 for(const [i,x]of subset.entries())x.target=i<subset.length*.3?'en':'ru';
}
const cases=selected.map((x,i)=>{
 const word={headword:x.headword,gender:x.gender,part_of_speech:x.part_of_speech,raw:{meanings:x.raw.meanings}};
 const request=buildDictionaryMeaningTranslationRequest({entryId:x.entryId,sourceContentFingerprint:hash(JSON.stringify(word)),sourceLanguageCode:'nl',targetLanguageCode:x.target,word});
 const entryExpected=request.content.some(c=>c.role==='definition'||c.role==='usage-pattern');
 return {id:`full${String(i+1).padStart(3,'0')}`,allowedStems:[],baseAllowedStems:[],alternativesUseful:entryExpected,entryExpected,request,sourceStratum:x.stratum,split:x.split,sourceMeaning:word,expectationPolicy:'No lexical gold; nonempty alternatives are candidates only, semantic review required.'};
});
for(const split of ['development','validation']){
 const suiteId=`full-${split}-v1`;const suite={schemaVersion:'translation-eval-suite-v1',suiteId,split,provenance:'Read-only ownerless curated system NL dictionary; stratified rich-value sample, full production-bounded meaning, unique headwords, old research words excluded; 70 RU / 30 EN.',cases:cases.filter(x=>x.split===split)};
 fs.writeFileSync(path.join(research,'cases',suiteId+'.json'),JSON.stringify(suite,null,2)+'\n',{flag:'wx',mode:0o600});
}
const lengths=cases.map(c=>c.request.content.reduce((n,t)=>n+t.text.length,0)).sort((a,b)=>a-b);
const receipt={schemaVersion:'translation-full100-corpus-receipt-v1',cases:100,development:30,validation:70,sourcePoolHash:hash(fs.readFileSync(path.join(local,'source-pool.json'),'utf8')),sourcePoolRows:pool.length,strata:strata.map(({id,n,dev})=>({id,total:n,development:dev,validation:n-dev})),languages:{ru:70,en:30},posCounts:cases.reduce((a:Record<string,number>,c)=>{const p=c.request.headword.partOfSpeechCode??'unknown';a[p]=(a[p]??0)+1;return a;},{}),contentCharacters:{min:lengths[0],median:(lengths[49]+lengths[50])/2,p95:lengths[94],max:lengths[99]},suiteHashes:Object.fromEntries(['development','validation'].map(s=>[s,hash(fs.readFileSync(path.join(research,'cases',`full-${s}-v1.json`),'utf8'))])),privacy:'No learner/user dictionary data; corpus texts and outputs local only; safe aggregate receipt versioned',samplingCaveat:'Stratified enriched dictionary sample, not unbiased production traffic'};
fs.writeFileSync(path.join(local,'selection.json'),JSON.stringify(cases.map(c=>({id:c.id,entryId:c.request.entryId,headword:c.request.headword.text,split:c.split,target:c.request.targetLanguageCode,stratum:c.sourceStratum})),null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(receipt,null,2));
