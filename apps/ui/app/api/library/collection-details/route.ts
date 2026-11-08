import {NextRequest} from 'next/server';
import {getAuthenticatedSupabase,jsonNoStore,requirePlatformScope} from '@/lib/platform/serverSupabase';
import {readBoundedJson} from '@/lib/http/readBoundedJson';
import {copyUuid} from '@/lib/platform/independentEntryCopyContract';
import {parseDetailsRecord} from '@/lib/collections/details/contract';
export const dynamic='force-dynamic';
export async function GET(request:NextRequest){
 const auth=await getAuthenticatedSupabase(request);if(auth instanceof Response)return auth;
 if(auth.principal.authKind!=='first_party')return jsonNoStore({error:'first_party_required'},403);
 const denied=requirePlatformScope(auth,'platform:read');if(denied)return denied;
 const id=request.nextUrl.searchParams.get('collectionId');if(!copyUuid(id)||request.nextUrl.searchParams.size!==1)return jsonNoStore({error:'invalid_details'},400);
 try{const {data,error}=await auth.supabase.rpc('read_collection_details_v1',{p_collection_id:id}).abortSignal(AbortSignal.timeout(10000));
  if(error)return jsonNoStore({error:'details_unavailable'},error.code==='42501'?404:503);
  const parsed=parseDetailsRecord(data);return parsed&&parsed.id===id.toLowerCase()?jsonNoStore(parsed):jsonNoStore({error:'invalid_details_contract'},502);
 }catch{return jsonNoStore({error:'details_unavailable'},503);}
}
export async function POST(request:NextRequest){
 const auth=await getAuthenticatedSupabase(request);if(auth instanceof Response)return auth;
 if(auth.principal.authKind!=='first_party')return jsonNoStore({error:'first_party_required'},403);
 const denied=requirePlatformScope(auth,'platform:write');if(denied)return denied;
 if(request.nextUrl.searchParams.size)return jsonNoStore({error:'invalid_details'},400);
 const body=await readBoundedJson(request,65536);if('error'in body)return jsonNoStore({error:'invalid_details'},body.error==='too_large'?413:400);
 const input=body.body as Record<string,unknown>|null;
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['collectionId','expectedRevision','patch'].includes(k))||!copyUuid(input.collectionId)||typeof input.expectedRevision!=='string'||!/^\d+$/.test(input.expectedRevision)||!input.patch||typeof input.patch!=='object'||Array.isArray(input.patch))return jsonNoStore({error:'invalid_details'},400);
 try{const {data,error}=await auth.supabase.rpc('update_collection_details_v1',{p_collection_id:input.collectionId,p_expected_revision:input.expectedRevision,p_patch:input.patch}).abortSignal(AbortSignal.timeout(10000));
  if(error)return jsonNoStore({error:error.code==='40001'?'details_conflict':'details_unavailable'},error.code==='40001'?409:error.code==='42501'?404:error.code==='22023'?400:503);
  const parsed=parseDetailsRecord(data);return parsed&&parsed.id===input.collectionId.toLowerCase()?jsonNoStore(parsed):jsonNoStore({error:'invalid_details_contract'},502);
 }catch{return jsonNoStore({error:'details_unavailable'},503);}
}
