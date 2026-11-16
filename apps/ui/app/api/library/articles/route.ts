import {NextRequest} from 'next/server';
import {readBoundedJson} from '@/lib/http/readBoundedJson';
import {getAuthenticatedSupabase,getPlatformServiceSupabase,jsonNoStore,requirePlatformScope} from '@/lib/platform/serverSupabase';
import {platformV2LookupEnabled} from '@/lib/platform/platformV2Rollout';
import {performPlatformV2Lookup} from '@/lib/platform/platformV2LookupService';
import {copyUuid} from '@/lib/platform/independentEntryCopyContract';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const revalidate=0;
export async function POST(request:NextRequest){
 const auth=await getAuthenticatedSupabase(request);if(auth instanceof Response)return auth;
 if(auth.principal.authKind!=='first_party')return jsonNoStore({error:'first_party_required'},403);
 const denied=requirePlatformScope(auth,'platform:read');if(denied)return denied;
 if(!platformV2LookupEnabled())return jsonNoStore({error:'platform_v2_lookup_not_enabled'},503);
 const parsed=await readBoundedJson(request,8192);if('error'in parsed)return jsonNoStore({error:'invalid_article_batch'},parsed.error==='too_large'?413:400);
 const body=parsed.body as {entryIds?:unknown;languageCode?:unknown}|null;
 if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!['entryIds','languageCode'].includes(k))||
  !Array.isArray(body.entryIds)||body.entryIds.length<1||body.entryIds.length>25||!body.entryIds.every(copyUuid)||
  typeof body.languageCode!=='string'||!/^[a-z]{2,3}(?:-[A-Za-z0-9]+)*$/.test(body.languageCode))
  return jsonNoStore({error:'invalid_article_batch'},400);
 const service=getPlatformServiceSupabase();if(service instanceof Response)return service;
 const result=await performPlatformV2Lookup({kind:'authenticated',auth,service,signal:request.signal,
  libraryArticleEntryIds:[...new Set(body.entryIds.map(id=>id.toLowerCase()))]},
  {query:'',cardTypeId:'word-to-definition',contentLanguageCode:body.languageCode,translationTargetLanguageCode:null,intent:'dictionary-lookup'});
 // Bound the projected response as well as the raw SQL payload.
 if(Buffer.byteLength(JSON.stringify(result.payload),'utf8')>8*1024*1024)return jsonNoStore({error:'article_batch_too_large'},413);
 const response=jsonNoStore(result.payload,result.status);
 if(result.serverTiming)response.headers.set('server-timing',result.serverTiming);
 return response;
}
