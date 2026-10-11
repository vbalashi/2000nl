/* eslint-disable no-console */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { OpenAITranslator } from "../../lib/translation/openaiTranslator";
import { loadTranslationConfigFromEnv } from "../../lib/translation/translationProvider";
import { buildDictionaryMeaningTranslationMessages } from "../../lib/translation/dictionaryMeaningTranslationContract";
import { dictionaryTranslationProfile } from "../../lib/translation/dictionaryTranslationProfile";
const base = "/Users/khrustal/adhoc/2000nl-research-archives/655-fullcard-budget-v1";
const out = "/Users/khrustal/adhoc/2000nl-research-archives/655-explanation-repair-v2";
const read = (p: string) => JSON.parse(fs.readFileSync(p, "utf8"));
const save = (name: string, value: unknown) => fs.writeFileSync(path.join(out,name), JSON.stringify(value,null,2)+"\n", { flag: "wx", mode: 0o600 });
const hash = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
async function run() {
 fs.mkdirSync(out, { mode: 0o700 });
 process.env.DICTIONARY_TRANSLATION_PROFILE="luna6";
 const env: Record<string,string> = {};
 for (const file of ["/Users/khrustal/dev/2000nl/.env.local","/Users/khrustal/.config/ot-learning/azure.env"]) {
  for (const line of fs.readFileSync(file,"utf8").split(/\r?\n/)) { const m=line.match(/^([A-Z_][A-Z_0-9]*)=(.*)$/); if(m)env[m[1]]=m[2].trim().replace(/^(["'])(.*)\1$/,"$2"); }
 }
 process.env.AZURE_OPENAI_GPT6_LUNA_ENDPOINT=env.AZURE_OPENAI_GPT6_LUNA_ENDPOINT;
 process.env.AZURE_OPENAI_GPT6_LUNA_API_KEY=env.AZURE_OPENAI_GPT6_LUNA_API_KEY_PRIMARY??env.AZURE_OPENAI_GPT6_LUNA_API_KEY??env.AZURE_OPENAI_API_KEY;
 process.env.TRANSLATION_PROVIDER="openai";
 const cfg=loadTranslationConfigFromEnv({purpose:"dictionary"});
 const translator=new OpenAITranslator({apiKey:cfg.apiKeys.openai!,apiUrl:cfg.apiUrls?.openai,model:cfg.models?.openai});
 const files=["lib/translation/openaiTranslator.ts","lib/translation/dictionaryExplanationRepair.ts","lib/translation/dictionaryTranslationProfile.ts","lib/translation/prompts/openai_dictionary_explanation_repair_v1.txt", "scripts/translation-fullcard-volume/repair.ts"];
 save("protocol.json",{createdAt:new Date().toISOString(),profile:dictionaryTranslationProfile(),method:"Replay all25 frozen primary responses through production translator. Only missing-explanation responses may make live calls; max12 transport calls. No fresh primary generation, DB/cache writes, or semantic retry.",sources:files.map(file=>{const text=fs.readFileSync(file,"utf8");return{file,text,sha256:hash(text)};})});
 const realFetch=globalThis.fetch, realInfo=console.info;
 let current="", first=true, calls=0; const logs:unknown[]=[]; const results:unknown[]=[];
 console.info=(...args)=>{logs.push({id:current,args});};
 globalThis.fetch=async(input,init)=>{
  if(first){first=false;const card=read(path.join(base,"cards",current+".json"));const body=JSON.parse(String(init?.body));if(JSON.stringify(body.messages)!==JSON.stringify(buildDictionaryMeaningTranslationMessages(card.request)))throw new Error("primary_messages_changed");return new Response(JSON.stringify(read(path.join(base,"attempts",current+"-1-response.json")).data),{status:200});}
  if(++calls>12)throw new Error("live_call_cap");
  const name=current+"-repair-"+calls;save(name+"-request.json",{body:JSON.parse(String(init?.body))});const start=Date.now();
  try{const response=await realFetch(input,init);save(name+"-response.json",{status:response.status,elapsedMs:Date.now()-start,data:await response.clone().json()});return response;}
  catch(error){save(name+"-response.json",{elapsedMs:Date.now()-start,errorName:error instanceof Error?error.name:"unknown"});throw error;}
 };
 try{
  for(let n=76;n<=100;n++){
   current="card"+String(n).padStart(3,"0");first=true;
   const card=read(path.join(base,"cards",current+".json"));const start=calls;
   try{
    const {meta,...result}=await translator.translateDictionaryMeaning(card.request);
    const prior=JSON.parse(read(path.join(base,"attempts",current+"-1-response.json")).data.choices[0].message.content);
    const preserved=prior.contentTranslations.every((item:{fieldId:string})=>JSON.stringify(result.contentTranslations.find(i=>i.fieldId===item.fieldId))===JSON.stringify(item));
    // Normalized parser key order can differ, so compare semantic JSON objects below.
    for(const item of prior.contentTranslations){const actual=result.contentTranslations.find(i=>i.fieldId===item.fieldId);if(!actual||Object.keys(item).some(k=>actual[k as keyof typeof actual]!==item[k]))throw new Error("previous_translation_changed");}
    save(current+"-result.json",{result,model:meta.model,liveCalls:calls-start,preservedValues:true,exactSerialization:preserved});results.push({id:current,outcome:"ready",liveCalls:calls-start});
   }catch(error){save(current+"-result.json",{outcome:"failed",safeError:error instanceof Error?error.message:"unknown"});results.push({id:current,outcome:"failed",liveCalls:calls-start});}
   realInfo(JSON.stringify(results.at(-1)));
  }
  save("logs.json",logs);save("summary.json",{results,liveCalls:calls});
 }finally{globalThis.fetch=realFetch;console.info=realInfo;}
}
run().catch(()=>{console.error("repair_experiment_failed_see_evidence");process.exitCode=1;});
