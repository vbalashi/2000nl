import {NextRequest} from 'next/server';
import {getAuthenticatedSupabase,jsonNoStore,requirePlatformScope} from '@/lib/platform/serverSupabase';
import {copyUuid} from '@/lib/platform/independentEntryCopyContract';
import {parseReceivedSource} from '@/lib/collections/sharing/receivedSourceContract';
export const runtime='nodejs';export const dynamic='force-dynamic';export const revalidate=0;
/** Current metadata for exactly one selected live received collection. */
export async function GET(request:NextRequest){
 const auth=await getAuthenticatedSupabase(request);if(auth instanceof Response)return auth;
 if(auth.principal.authKind!=='first_party')return jsonNoStore({error:'first_party_required'},403);
 const denied=requirePlatformScope(auth,'platform:read');if(denied)return denied;
 const params=request.nextUrl.searchParams,id=params.get('id');
 if([...params.keys()].length!==1||params.getAll('id').length!==1||!copyUuid(id))return jsonNoStore({error:'invalid_collection_id'},400);
 try{
  const {data,error}=await auth.supabase.rpc('read_received_collection_source_v1',{p_collection_id:id}).abortSignal(AbortSignal.timeout(10000));
  if(error)return jsonNoStore({error:'received_source_unavailable'},503);
  if(data===null)return jsonNoStore({error:'received_source_not_found'},404);
  const source=parseReceivedSource(data,id);
  return source?jsonNoStore(source):jsonNoStore({error:'received_source_contract_invalid'},502);
 }catch{return jsonNoStore({error:'received_source_unavailable'},503);}
}
