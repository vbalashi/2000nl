import 'server-only';
import {NextRequest} from 'next/server';
import {getAuthenticatedSupabase,jsonNoStore,requirePlatformScope} from '@/lib/platform/serverSupabase';
import {readBoundedJson} from '@/lib/http/readBoundedJson';
import {copyUuid} from '@/lib/platform/independentEntryCopyContract';
import {collectionSharingWritesEnabled} from './rollout';
import {isCanonicalShareCode} from './shareCode';
import {parseShareCommand,parseShareCommandReceipt,parseSharePreview} from './shareCommandContract';
async function authorize(request:NextRequest,write:boolean){
 const auth=await getAuthenticatedSupabase(request);if(auth instanceof Response)return auth;
 if(auth.principal.authKind!=='first_party')return jsonNoStore({error:'first_party_required'},403);
 return requirePlatformScope(auth,write?'platform:write':'platform:read')??auth;
}
function failure(error:{code?:string;message?:string}|null){
 const message=error?.message;
 if(message==='sharing_writes_disabled')return jsonNoStore({error:message},503);
 if(['share_operation_conflict','share_revision_conflict','share_copy_required'].includes(message??''))return jsonNoStore({error:message},409);
 if(['55P03','40P01'].includes(error?.code??''))return jsonNoStore({error:'share_retry_required'},409);
 if(error?.code==='42501')return jsonNoStore({error:'share_unavailable'},404);
 if(message==='invalid_share_command')return jsonNoStore({error:message},400);
 return jsonNoStore({error:'sharing_unavailable'},503);
}
async function body(request:NextRequest){
 if(request.nextUrl.searchParams.size)return jsonNoStore({error:'invalid_share_request'},400);
 if(request.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json')return jsonNoStore({error:'json_required'},415);
 const result=await readBoundedJson(request,4096);
 return 'error'in result?jsonNoStore({error:'invalid_share_request'},result.error==='too_large'?413:400):result.body;
}
export const postShareCommand=(request:NextRequest)=>runShareCommand(request,false);
export const postShareReconciliation=(request:NextRequest)=>runShareCommand(request,true);
async function runShareCommand(request:NextRequest,readOnly:boolean){
 const auth=await authorize(request,!readOnly);if(auth instanceof Response)return auth;
 const value=await body(request);if(value instanceof Response)return value;
 const command=parseShareCommand(value);if(!command)return jsonNoStore({error:'invalid_share_command'},400);
 const reconcileOnly=readOnly||(!['close','unsubscribe'].includes(command.action)&&!collectionSharingWritesEnabled());
 try{
  const {data,error}=await auth.supabase.rpc('command_collection_share_v1',{
   p_operation_id:command.operationId,p_action:command.action,p_collection_id:'collectionId'in command?command.collectionId:null,
   p_expected_revision:'expectedRevision'in command?command.expectedRevision:null,p_code:'code'in command?command.code:null,p_reconcile_only:reconcileOnly,
  }).abortSignal(AbortSignal.timeout(10000));
  if(error)return failure(error);
  if(reconcileOnly&&parseShareCommandReceipt(data,command.operationId)?.status==='unknown')return readOnly?jsonNoStore({operationId:command.operationId,status:'unknown'}):jsonNoStore({error:'sharing_writes_disabled'},503);
  const parsed=parseShareCommandReceipt(data,command.operationId,command);
  return parsed?jsonNoStore(parsed):jsonNoStore({error:'share_contract_invalid'},502);
 }catch{return failure(null);}
}
export async function postSharePreview(request:NextRequest){
 const auth=await authorize(request,false);if(auth instanceof Response)return auth;
 const value=await body(request);if(value instanceof Response)return value;
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==1||!isCanonicalShareCode((value as {code?:unknown}).code))return jsonNoStore({error:'invalid_share_request'},400);
 try{
  const {data,error}=await auth.supabase.rpc('preview_collection_share_v1',{p_code:(value as {code:string}).code}).abortSignal(AbortSignal.timeout(10000));
  if(error)return failure(error);const parsed=parseSharePreview(data);
  return parsed?jsonNoStore(parsed):jsonNoStore({error:'share_contract_invalid'},502);
 }catch{return failure(null);}
}
export async function getShareReceipt(request:NextRequest,operationId:string){
 const auth=await authorize(request,false);if(auth instanceof Response)return auth;
 if(!copyUuid(operationId)||request.nextUrl.searchParams.size)return jsonNoStore({error:'invalid_share_request'},400);
 const id=operationId.toLowerCase();
 try{
  const {data,error}=await auth.supabase.rpc('read_collection_share_command_v1',{p_operation_id:id}).abortSignal(AbortSignal.timeout(10000));
  if(error)return failure(error);const parsed=parseShareCommandReceipt(data,id);
  return parsed?jsonNoStore(parsed):jsonNoStore({error:'share_contract_invalid'},502);
 }catch{return failure(null);}
}
