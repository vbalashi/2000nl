import {NextRequest} from 'next/server';
import {getAuthenticatedSupabase,jsonNoStore,requirePlatformScope} from '@/lib/platform/serverSupabase';
import {readBoundedJson} from '@/lib/http/readBoundedJson';
import {copyUuid} from '@/lib/platform/independentEntryCopyContract';
import {parseReceivedCatalogCursor} from '@/lib/collections/sharing/receivedCatalogContract';
import {parseTrainingCollectionPage,parseTrainingCollections} from '@/lib/collections/sharing/trainingCollectionCatalogContract';
export const runtime='nodejs';export const dynamic='force-dynamic';export const revalidate=0;
const language=(value:unknown):value is string=>typeof value==='string'&&value.length>0&&value.length<=16&&value===value.trim()&&!value.includes('\0');
async function run(request:NextRequest,point:boolean){
 const auth=await getAuthenticatedSupabase(request);if(auth instanceof Response)return auth;
 if(auth.principal.authKind!=='first_party')return jsonNoStore({error:'first_party_required'},403);
 const denied=requirePlatformScope(auth,'platform:read');if(denied)return denied;
 let args:Record<string,unknown>,ids:string[]|undefined;
 if(point){
  const body=await readBoundedJson(request,8192);if('error'in body)return jsonNoStore({error:'invalid_training_catalog_request'},body.error==='too_large'?413:400);
  const input=body.body as {languageCode?:unknown;collectionIds?:unknown}|null;
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length!==2||!language(input.languageCode)||!Array.isArray(input.collectionIds)||input.collectionIds.length>100||!input.collectionIds.every(copyUuid)||new Set(input.collectionIds.map(id=>id.toLowerCase())).size!==input.collectionIds.length)return jsonNoStore({error:'invalid_training_catalog_request'},400);
  ids=input.collectionIds.map(id=>id.toLowerCase());args={p_collection_ids:ids,p_language_code:input.languageCode};
 }else{
  const params=request.nextUrl.searchParams,lang=params.get('languageCode'),query=params.get('query')??'',limit=params.get('limit')??'50',raw=params.get('cursor');let cursor=null;
  if([...params.keys()].some(key=>!['languageCode','query','limit','cursor'].includes(key)||params.getAll(key).length!==1)||!language(lang)||[...query].length>100||query.includes('\0')||limit!=='50')return jsonNoStore({error:'invalid_training_catalog_request'},400);
  if(raw){try{cursor=parseReceivedCatalogCursor(JSON.parse(raw));}catch{}if(!cursor)return jsonNoStore({error:'invalid_training_catalog_request'},400);}
  args={p_query:query,p_language_code:lang,p_cursor:cursor,p_limit:50};
 }
 try{
  const {data,error}=await auth.supabase.rpc(point?'read_training_collection_summaries_v1':'read_training_collection_catalog_v1',args).abortSignal(AbortSignal.timeout(10000));
  if(error)return jsonNoStore({error:'training_catalog_unavailable'},503);
  if(point){const rows=data&&typeof data==='object'&&!Array.isArray(data)&&Object.keys(data).length===1?parseTrainingCollections(data.collections,100):null;
   return rows&&!rows.some(row=>!ids!.includes(row.id))?jsonNoStore({collections:rows}):jsonNoStore({error:'training_catalog_contract_invalid'},502);}
  const page=parseTrainingCollectionPage(data,50);return page?jsonNoStore(page):jsonNoStore({error:'training_catalog_contract_invalid'},502);
 }catch{return jsonNoStore({error:'training_catalog_unavailable'},503);}
}
export const GET=(request:NextRequest)=>run(request,false);
export const POST=(request:NextRequest)=>run(request,true);
