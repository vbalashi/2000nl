import {NextRequest} from 'next/server';
import {getAuthenticatedSupabase,jsonNoStore,requirePlatformScope} from '@/lib/platform/serverSupabase';
import {readBoundedJson} from '@/lib/http/readBoundedJson';
import {copyUuid} from '@/lib/platform/independentEntryCopyContract';
import {parseCollectionCompositionOperation,parseCollectionCompositionPlan} from '@/lib/collections/sharing/collectionCompositionContract';
export const dynamic='force-dynamic';
export async function POST(request:NextRequest){
 const auth=await getAuthenticatedSupabase(request);if(auth instanceof Response)return auth;
 if(auth.principal.authKind!=='first_party')return jsonNoStore({error:'first_party_required'},403);
 const denied=requirePlatformScope(auth,'platform:write');if(denied)return denied;
 if(request.nextUrl.searchParams.size)return jsonNoStore({error:'invalid_collection_operation'},400);
 const body=await readBoundedJson(request,32768);if('error'in body)return jsonNoStore({error:'invalid_collection_operation'},body.error==='too_large'?413:400);
 const value=body.body;
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join(',')!=='collectionId,operation')return jsonNoStore({error:'invalid_collection_operation'},400);
 const input=value as {collectionId:unknown;operation:unknown};const operation=parseCollectionCompositionOperation(input.operation);
 if(!copyUuid(input.collectionId)||!operation)return jsonNoStore({error:'invalid_collection_operation'},400);
 const id=input.collectionId.toLowerCase();
 try{
  const {data,error}=await auth.supabase.rpc('prepare_collection_composition_v1',{p_collection_id:id,p_operation:operation}).abortSignal(AbortSignal.timeout(10000));
  if(error)return jsonNoStore({error:error.code==='42501'?'collection_unavailable':'collection_plan_unavailable'},error.code==='42501'?404:503);
  const parsed=parseCollectionCompositionPlan(data,id,operation.action);return parsed?jsonNoStore(parsed):jsonNoStore({error:'collection_plan_contract_invalid'},502);
 }catch{return jsonNoStore({error:'collection_plan_unavailable'},503);}
}
