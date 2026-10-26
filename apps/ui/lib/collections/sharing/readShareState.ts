import 'server-only';
import { NextRequest } from 'next/server';
import { getAuthenticatedSupabase,jsonNoStore,requirePlatformScope } from '@/lib/platform/serverSupabase';
import { copyUuid } from '@/lib/platform/independentEntryCopyContract';
import { parseCollectionShareForward,parseCollectionShareManagement } from './shareManagementContract';
/** Caller-bound reads only. Owner secrets never fall back to a recipient projection. */
export async function readCollectionShareState(request:NextRequest,collectionId:string,mode:'owner'|'forward'){
 const auth=await getAuthenticatedSupabase(request);if(auth instanceof Response)return auth;
 if(auth.principal.authKind!=='first_party')return jsonNoStore({error:'first_party_required'},403);
 const denied=requirePlatformScope(auth,'platform:read');if(denied)return denied;
 if(!copyUuid(collectionId)||request.nextUrl.searchParams.size)return jsonNoStore({error:'invalid_share_request'},400);
 const id=collectionId.toLowerCase();
 try{
  const {data,error}=await auth.supabase.rpc(mode==='owner'?'read_collection_share_management_v1':'read_collection_share_forward_v1',{p_collection_id:id}).abortSignal(AbortSignal.timeout(10000));
  if(error)return jsonNoStore({error:error.code==='42501'?'share_unavailable':'share_read_unavailable'},error.code==='42501'?404:503);
  const parsed=mode==='owner'?parseCollectionShareManagement(data,id):parseCollectionShareForward(data,id);
  return parsed?jsonNoStore(parsed):jsonNoStore({error:'share_contract_invalid'},502);
 }catch{return jsonNoStore({error:'share_read_unavailable'},503);}
}
