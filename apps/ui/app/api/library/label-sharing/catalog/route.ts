import {NextRequest} from 'next/server';
import {getAuthenticatedSupabase,jsonNoStore,requirePlatformScope} from '@/lib/platform/serverSupabase';
import {parseLabelSharingCatalog} from '@/lib/collections/sharing/labelSharingContract';
export const dynamic='force-dynamic';
export async function GET(request:NextRequest){
 const auth=await getAuthenticatedSupabase(request);if(auth instanceof Response)return auth;
 if(auth.principal.authKind!=='first_party')return jsonNoStore({error:'first_party_required'},403);
 const denied=requirePlatformScope(auth,'platform:read');if(denied)return denied;
 if(request.nextUrl.searchParams.size)return jsonNoStore({error:'invalid_share_request'},400);
 try{
  const {data,error}=await auth.supabase.rpc('read_label_sharing_catalog_v1').abortSignal(AbortSignal.timeout(10000));
  if(error)return jsonNoStore({error:'label_sharing_catalog_unavailable'},503);
  const parsed=parseLabelSharingCatalog(data);
  return parsed?jsonNoStore(parsed):jsonNoStore({error:'share_contract_invalid'},502);
 }catch{return jsonNoStore({error:'label_sharing_catalog_unavailable'},503);}
}
