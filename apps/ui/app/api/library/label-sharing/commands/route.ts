import {NextRequest} from 'next/server';
import {getAuthenticatedSupabase,jsonNoStore,requirePlatformScope} from '@/lib/platform/serverSupabase';
import {readBoundedJson} from '@/lib/http/readBoundedJson';
import {parseLabelShareCommand,parseLabelShareReceipt} from '@/lib/collections/sharing/labelSharingContract';
import {collectionSharingWritesEnabled} from '@/lib/collections/sharing/rollout';
export const dynamic='force-dynamic';
export async function POST(request:NextRequest){
 const auth=await getAuthenticatedSupabase(request);if(auth instanceof Response)return auth;
 if(auth.principal.authKind!=='first_party')return jsonNoStore({error:'first_party_required'},403);
 const denied=requirePlatformScope(auth,'platform:write');if(denied)return denied;
 if(request.nextUrl.searchParams.size)return jsonNoStore({error:'invalid_share_request'},400);
 if(request.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json')return jsonNoStore({error:'json_required'},415);
 const body=await readBoundedJson(request,4096);
 if('error'in body)return jsonNoStore({error:'invalid_share_request'},body.error==='too_large'?413:400);
 const command=parseLabelShareCommand(body.body);if(!command)return jsonNoStore({error:'invalid_share_command'},400);
 const {operationId,...payload}=command;
 const reconcileOnly=!['close','unsubscribe'].includes(command.action)&&!collectionSharingWritesEnabled();
 try{
  const {data,error}=await auth.supabase.rpc('command_label_share_v1',{
   p_operation_id:operationId,p_command:payload,p_reconcile_only:reconcileOnly,
  }).abortSignal(AbortSignal.timeout(10000));
  if(error){
   if(['share_operation_conflict','share_revision_conflict','share_copy_required'].includes(error.message))return jsonNoStore({error:error.message},409);
   if(error.code==='42501')return jsonNoStore({error:'share_unavailable'},404);
   return jsonNoStore({error:'sharing_unavailable'},503);
  }
  const parsed=parseLabelShareReceipt(data,command);
  if(parsed?.status==='unknown'&&reconcileOnly)return jsonNoStore({error:'sharing_writes_disabled'},503);
  return parsed?jsonNoStore(parsed):jsonNoStore({error:'share_contract_invalid'},502);
 }catch{return jsonNoStore({error:'sharing_unavailable'},503);}
}
