import {NextRequest} from 'next/server';
import {getAuthenticatedSupabase,jsonNoStore,requirePlatformScope} from '@/lib/platform/serverSupabase';
import {copyUuid} from '@/lib/platform/independentEntryCopyContract';
import {parseLabelShareState} from '@/lib/collections/sharing/labelSharingContract';
export const dynamic='force-dynamic';
export async function GET(request:NextRequest){
 const auth=await getAuthenticatedSupabase(request);if(auth instanceof Response)return auth;
 if(auth.principal.authKind!=='first_party')return jsonNoStore({error:'first_party_required'},403);
 const denied=requirePlatformScope(auth,'platform:read');if(denied)return denied;
 const id=request.nextUrl.searchParams.get('labelId');
 if(!copyUuid(id)||request.nextUrl.searchParams.size!==1)return jsonNoStore({error:'invalid_share_request'},400);
 try{
  const {data,error}=await auth.supabase.rpc('read_label_share_v1',{p_label_id:id.toLowerCase()}).abortSignal(AbortSignal.timeout(10000));
  if(error)return jsonNoStore({error:error.code==='42501'?'share_unavailable':'sharing_unavailable'},error.code==='42501'?404:503);
  const parsed=parseLabelShareState(data);
  return parsed&&parsed.labelId===id.toLowerCase()?jsonNoStore(parsed):jsonNoStore({error:'share_contract_invalid'},502);
 }catch{return jsonNoStore({error:'sharing_unavailable'},503);}
}
