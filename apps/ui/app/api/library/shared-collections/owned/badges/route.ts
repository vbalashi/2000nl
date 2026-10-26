import {NextRequest} from 'next/server';
import {getAuthenticatedSupabase,jsonNoStore,requirePlatformScope} from '@/lib/platform/serverSupabase';
import {parsePublicationBadgeRequest,parsePublicationBadges} from '@/lib/collections/sharing/publicationBadgesContract';
import {readBoundedJson} from '@/lib/http/readBoundedJson';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const revalidate=0;
/** Bounded read for already visible owner rows; no code, subscriber or foreign metadata. */
export async function POST(request:NextRequest){
 const auth=await getAuthenticatedSupabase(request);if(auth instanceof Response)return auth;
 if(auth.principal.authKind!=='first_party')return jsonNoStore({error:'first_party_required'},403);
 const denied=requirePlatformScope(auth,'platform:read');if(denied)return denied;
 if(request.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json')return jsonNoStore({error:'invalid_publication_badge_request'},415);
 const body=await readBoundedJson(request,8192);
 if('error'in body)return jsonNoStore({error:'invalid_publication_badge_request'},body.error==='too_large'?413:400);
 const ids=parsePublicationBadgeRequest(body.body);if(!ids)return jsonNoStore({error:'invalid_publication_badge_request'},400);
 try{
  const {data,error}=await auth.supabase.rpc('read_owned_collection_publication_badges_v1',{p_collection_ids:ids}).abortSignal(AbortSignal.timeout(10000));
  if(error)return jsonNoStore({error:'publication_badges_unavailable'},503);
  const openIds=parsePublicationBadges(data,ids);
  return openIds?jsonNoStore({openIds}):jsonNoStore({error:'publication_badges_contract_invalid'},502);
 }catch{return jsonNoStore({error:'publication_badges_unavailable'},503);}
}
