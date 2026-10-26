import {NextRequest} from 'next/server';
import {getAuthenticatedSupabase,jsonNoStore,requirePlatformScope} from '@/lib/platform/serverSupabase';
import {parsePersonalCatalogQuery,parsePersonalCatalogPage} from '@/lib/collections/sharing/personalCatalogContract';
export const runtime='nodejs';export const dynamic='force-dynamic';export const revalidate=0;
export async function GET(request:NextRequest){
 const auth=await getAuthenticatedSupabase(request);if(auth instanceof Response)return auth;
 if(auth.principal.authKind!=='first_party')return jsonNoStore({error:'first_party_required'},403);
 const denied=requirePlatformScope(auth,'platform:read');if(denied)return denied;
 if(request.nextUrl.search.length>16000)return jsonNoStore({error:'invalid_catalog_request'},400);
 const params=request.nextUrl.searchParams;
 if([...params.keys()].some(k=>!['query','sort','scope','labelId','cursor','limit','languageCode'].includes(k)||params.getAll(k).length!==1))return jsonNoStore({error:'invalid_catalog_request'},400);
 let cursor:unknown=null;try{if(params.has('cursor'))cursor=JSON.parse(params.get('cursor')!);}catch{return jsonNoStore({error:'invalid_catalog_cursor'},400);}
 const input=parsePersonalCatalogQuery({...Object.fromEntries(params),cursor,...(params.has('limit')?{limit:/^[1-9][0-9]{0,2}$/.test(params.get('limit')!)?Number(params.get('limit')):NaN}:{})});
 if(!input)return jsonNoStore({error:'invalid_catalog_request'},400);
 try{
  const {data,error}=await auth.supabase.rpc('read_personal_collection_catalog_v1',{p_query:input.query,p_sort:input.sort,p_scope:input.scope,p_label_id:input.labelId,p_language_code:input.languageCode,p_cursor:input.cursor,p_limit:input.limit}).abortSignal(AbortSignal.timeout(10000));
  if(error)return jsonNoStore({error:error.message==='label_not_found'?'label_not_found':'personal_catalog_unavailable'},error.message==='label_not_found'?404:503);
  const page=parsePersonalCatalogPage(data,input.limit);return page?jsonNoStore(page):jsonNoStore({error:'personal_catalog_contract_invalid'},502);
 }catch{return jsonNoStore({error:'personal_catalog_unavailable'},503);}
}
