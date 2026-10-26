import {NextRequest} from 'next/server';
import {getAuthenticatedSupabase,jsonNoStore,requirePlatformScope} from '@/lib/platform/serverSupabase';
import {parseSharingOverview} from '@/lib/collections/sharing/ownedCatalogContract';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const revalidate=0;
export async function GET(request:NextRequest){
 const auth=await getAuthenticatedSupabase(request);if(auth instanceof Response)return auth;
 if(auth.principal.authKind!=='first_party')return jsonNoStore({error:'first_party_required'},403);
 const denied=requirePlatformScope(auth,'platform:read');if(denied)return denied;
 try{
  const {data,error}=await auth.supabase.rpc('read_collection_sharing_overview_v1').abortSignal(AbortSignal.timeout(10000));
  if(error)return jsonNoStore({error:'sharing_overview_unavailable'},503);
  const overview=parseSharingOverview(data);
  return overview?jsonNoStore(overview):jsonNoStore({error:'sharing_overview_contract_invalid'},502);
 }catch{return jsonNoStore({error:'sharing_overview_unavailable'},503);}
}
