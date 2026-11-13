import {afterEach,expect,test,vi} from "vitest";
import {performPlatformV2Lookup} from "@/lib/platform/platformV2LookupService";
import {fetchPlatformV2TrainingEntry,prefetchPlatformV2TrainingEntry,consumePrefetchedPlatformV2TrainingEntry,clearPlatformV2TrainingClientCaches} from "@/lib/platform/platformV2TrainingClient";
import {buildTrainingSenseCardModel} from "@/components/training/v2/trainingSenseCardModel";
vi.mock("@/lib/platform/platformV2Http",()=>({platformV2AuthenticatedJsonHeaders:async()=>({authorization:"Bearer test"})}));
afterEach(()=>{clearPlatformV2TrainingClientCaches();vi.unstubAllGlobals();vi.unstubAllEnvs();});
const entry=(ordinal:number,kind:string)=>{
 const id=`75400000-0000-4000-8000-${String(ordinal).padStart(12,"0")}`;
 return {id,dictionary_id:"dictionary",language_code:"nl",headword:"bank",meaning_id:ordinal,meanings_count:99,
  raw:{meanings:[{definition:`Visible definition ${ordinal}`}]},
  dictionary:{id:"dictionary",language_code:"nl",slug:"demo",name:"Demo",kind,visibility:"system",schema_key:"nl-example-v2",schema_version:1},
  platform_v2_identity:{entryId:id,headwordGroupId:"article",meaningOrdinal:ordinal,reportContentRevision:null,
   contentNodeBindings:[{contentNodeId:`definition-${ordinal}`,sourcePath:"raw.meanings[0].definition",kind:"definition",parentContentNodeId:null,sourceTextFingerprint:`fingerprint-${ordinal}`} ]}};
};
test.each((["first-fetch","prefetch"] as const).flatMap(path=>[
 {path,kind:"user",ordinals:[1,3],expected:undefined},
 {path,kind:"user",ordinals:[1,2],expected:undefined},
 {path,kind:"curated",ordinals:[1,2,3],expected:{ordinal:1,total:3}},
]))("lookup → $path without permit → card model: $kind / $ordinals",async({path,kind,ordinals,expected})=>{
 const items=ordinals.map(n=>entry(n,kind));
 const rpc=vi.fn(async(name:string)=> name==="read_platform_v2_training_group"
  ? {data:{items,page:{selectedTierComplete:true,nextGroupCursor:null}},error:null}
  : {data:[],error:null});
 const query:any={select:()=>query,eq:()=>query,in:()=>query,then:(resolve:any)=>Promise.resolve({data:[],error:null}).then(resolve)};
 const supabase={rpc,from:()=>query};
 vi.stubGlobal("fetch",vi.fn(async(_url,init)=>{
  const request=JSON.parse(init.body);
  const response=await performPlatformV2Lookup({kind:"authenticated",auth:{user:{id:"viewer"},principal:{authKind:"first_party",scopes:new Set(["platform:write"])},supabase} as any,service:{supabase} as any},request);
  return Response.json(response.payload,{status:response.status});
 }));
 const input={entryId:items[0].id,cardTypeId:"word-to-definition",contentLanguageCode:"nl",translationTargetLanguageCode:null,cacheOwnerId:`${path}:${kind}:${ordinals.join()}`};
 const fetched=path==="prefetch" ? await prefetchPlatformV2TrainingEntry(input) : await fetchPlatformV2TrainingEntry(input);
 const selected=path==="prefetch" ? await consumePrefetchedPlatformV2TrainingEntry(input) : fetched;
 expect(selected?.state).toBe("ready");
 if(selected?.state!=="ready")throw new Error("lookup must remain renderable");
 expect(selected.group.entryCount).toBe(items.length);
 expect(selected.entry.meaningCount).toBe(expected?.total);
 const model=buildTrainingSenseCardModel({...selected,interfaceLanguage:"en"});
 expect(model.entryId).toBe(items[0].id);
 expect(model.meaning).toEqual(expected);
 expect(rpc.mock.calls.some(([name])=>name==="read_current_training_entry_v1")).toBe(false);
});
