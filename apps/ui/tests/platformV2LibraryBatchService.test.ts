import {expect,test,vi} from 'vitest';
import {buildLibraryHeadwordGroupResults} from '@/components/training/wordlist/libraryHeadwordGroupResults';
import {performPlatformV2Lookup} from '@/lib/platform/platformV2LookupService';
const request={query:'',cardTypeId:'word-to-definition',contentLanguageCode:'nl',translationTargetLanguageCode:null,intent:'dictionary-lookup' as const};
function fixture(count:number){
 const entries=Array.from({length:count},(_,i)=>({id:`entry-${i}`,dictionary_id:'dictionary',language_code:'nl',headword:`fiets${i}`,meaning_id:1,part_of_speech:'zn',gender:'de',
  raw:{meanings:[{definition:'Een fiets.'}]},dictionary:{id:'dictionary',language_code:'nl',slug:'fixture',name:'Fixture',kind:'curated',visibility:'system',schema_key:'nl-example-v2',schema_version:1},
  platform_v2_identity:{entryId:`entry-${i}`,headwordGroupId:`group-${i}`,meaningOrdinal:1,reportContentRevision:null,contentNodeBindings:[{contentNodeId:`node-${i}`,sourcePath:'raw.meanings[0].definition',kind:'definition',parentContentNodeId:null,sourceTextFingerprint:`fingerprint-${i}`}]} }));
 const serviceRpc=vi.fn((name:string)=>Promise.resolve({data:name==='read_platform_v2_library_groups'?{items:entries,page:{selectedTierComplete:true,nextGroupCursor:null}}:null,error:null}));
 const userRpc=vi.fn(()=>Promise.resolve({data:[],error:null}));
 const context:any={kind:'authenticated',libraryArticleEntryIds:entries.map(e=>e.id),auth:{user:{id:'reader'},principal:{userId:'reader',authKind:'first_party',scopes:new Set(['platform:read'])},supabase:{rpc:userRpc}},service:{supabase:{rpc:serviceRpc}}};
 return {context,serviceRpc,userRpc,entries};
}
test.each([1,25])('projects %i canonical articles with one bounded content RPC and batched state/progress',async count=>{
 const {context,serviceRpc,userRpc}=fixture(count);
 const result=await performPlatformV2Lookup(context,request);expect(result.status).toBe(200);
 expect((result.payload as any).groups).toHaveLength(count);
 expect(serviceRpc.mock.calls.map(c=>c[0])).toEqual(['read_platform_v2_library_groups']);
 expect(userRpc.mock.calls).toHaveLength(2);
});
test('batch access denial does not project or fetch personalized state',async()=>{
 const {context,serviceRpc,userRpc}=fixture(1);serviceRpc.mockResolvedValueOnce({data:{error:'entry_not_accessible'} as any,error:null});
 expect((await performPlatformV2Lookup(context,request)).status).toBe(404);expect(userRpc).not.toHaveBeenCalled();
});
test('the server-only batch cannot be used as a catalog or connected lookup',async()=>{
 const {context,serviceRpc}=fixture(1);context.auth.principal.authKind='connected_client';
 expect((await performPlatformV2Lookup(context,request)).status).toBe(400);expect(serviceRpc).not.toHaveBeenCalled();
});

test('reference-only list articles keep exact source identities across dictionaries and homographs',async()=>{
 const {context,serviceRpc,entries}=fixture(3);
 for(const [index,entry] of entries.entries()){
  entry.headword='same spelling';entry.raw={cross_reference:'target',meanings:[]} as any;
  entry.dictionary_id=index===2?'another-dictionary':'dictionary';entry.dictionary.id=entry.dictionary_id;
 }
 const result=await performPlatformV2Lookup(context,request);expect(result.status).toBe(200);
 const rows=buildLibraryHeadwordGroupResults((result.payload as any).groups,entries.map(entry=>entry.id));
 expect(rows.map(row=>[row.headwordGroupId,row.selectedEntryId])).toEqual([['group-0','entry-0'],['group-1','entry-1'],['group-2','entry-2']]);
 expect(rows.every(row=>row.group.entries[0].kind==='cross-reference')).toBe(true);
 expect(serviceRpc).toHaveBeenCalledTimes(1);
});
