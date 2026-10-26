import {NextRequest} from 'next/server';
import {getAuthenticatedSupabase,jsonNoStore,requirePlatformScope} from '@/lib/platform/serverSupabase';
import {copyUuid} from '@/lib/platform/independentEntryCopyContract';
import {readBoundedJson} from '@/lib/http/readBoundedJson';
import {collectionSharingWritesEnabled} from '@/lib/collections/sharing/rollout';
import {parseReceivedLabelMutation,parseReceivedLabelState,parseReceivedLabelResult,matchesReceivedLabelMutation} from '@/lib/collections/sharing/receivedLabelsContract';
export const runtime='nodejs';export const dynamic='force-dynamic';export const revalidate=0;
type Context={params:Promise<{collectionId:string}>};
async function run(request:NextRequest,context:Context,write:boolean){
 const auth=await getAuthenticatedSupabase(request);if(auth instanceof Response)return auth;
 if(auth.principal.authKind!=='first_party')return jsonNoStore({error:'first_party_required'},403);
 const denied=requirePlatformScope(auth,write?'platform:write':'platform:read');if(denied)return denied;
 const {collectionId}=await context.params;
 if(!copyUuid(collectionId)||request.nextUrl.searchParams.size)return jsonNoStore({error:'invalid_label_operation'},400);
 const id=collectionId.toLowerCase();let mutation=null;
 if(write){
  if(!collectionSharingWritesEnabled())return jsonNoStore({error:'sharing_writes_disabled'},503);
  if(request.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json')return jsonNoStore({error:'invalid_label_operation'},415);
  const body=await readBoundedJson(request,64*1024);if('error'in body)return jsonNoStore({error:'invalid_label_operation'},body.error==='too_large'?413:400);
  mutation=parseReceivedLabelMutation(body.body);if(!mutation)return jsonNoStore({error:'invalid_label_operation'},400);
 }
 try{
  const {data,error}=await auth.supabase.rpc(mutation?'set_received_collection_labels_v1':'read_received_collection_label_state_v1',mutation?{p_collection_id:id,p_expected_revision:mutation.expectedRevision,p_label_ids:mutation.labelIds}:{p_collection_id:id}).abortSignal(AbortSignal.timeout(10000));
  if(error){const code=error.message;return jsonNoStore({error:code==='label_catalog_conflict'?'label_catalog_conflict':code==='collection_not_found'?'collection_not_found':'received_labels_unavailable'},code==='label_catalog_conflict'?409:code==='collection_not_found'?404:503);}
  if(mutation){const result=parseReceivedLabelResult(data,id);return result&&matchesReceivedLabelMutation(result,mutation)?jsonNoStore(result):jsonNoStore({error:'received_labels_contract_invalid'},502);}
  const result=parseReceivedLabelState(data,id);
  return result?jsonNoStore(result):jsonNoStore({error:'received_labels_contract_invalid'},502);
 }catch{return jsonNoStore({error:'received_labels_unavailable'},503);}
}
export const GET=(request:NextRequest,context:Context)=>run(request,context,false);
export const PUT=(request:NextRequest,context:Context)=>run(request,context,true);
