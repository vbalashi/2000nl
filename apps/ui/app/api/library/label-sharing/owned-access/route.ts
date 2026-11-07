import {NextRequest} from 'next/server';
import {getAuthenticatedSupabase,jsonNoStore,requirePlatformScope} from '@/lib/platform/serverSupabase';
import {readBoundedJson} from '@/lib/http/readBoundedJson';
import {normalizeOwnedCollectionIds,parseOwnedCollectionAccessMetadata} from '@/lib/collections/sharing/ownedCollectionAccessContract';
export const dynamic='force-dynamic';
export async function POST(request:NextRequest){
 const auth=await getAuthenticatedSupabase(request);if(auth instanceof Response)return auth;
 if(auth.principal.authKind!=='first_party')return jsonNoStore({error:'first_party_required'},403);
 const denied=requirePlatformScope(auth,'platform:read');if(denied)return denied;
 if(request.nextUrl.searchParams.size)return jsonNoStore({error:'invalid_share_request'},400);
 const body=await readBoundedJson(request,16384);if('error'in body)return jsonNoStore({error:'invalid_share_request'},body.error==='too_large'?413:400);
 const value=body.body;
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==1||!('collectionIds'in value))return jsonNoStore({error:'invalid_share_request'},400);
 const ids=normalizeOwnedCollectionIds(value.collectionIds);if(!ids)return jsonNoStore({error:'invalid_share_request'},400);
 try{
  const {data,error}=await auth.supabase.rpc('read_owned_collection_access_metadata_v1',{p_collection_ids:ids}).abortSignal(AbortSignal.timeout(10000));
  if(error)return jsonNoStore({error:'owned_collection_access_unavailable'},503);
  const parsed=parseOwnedCollectionAccessMetadata(data,ids);return parsed?jsonNoStore(parsed):jsonNoStore({error:'share_contract_invalid'},502);
 }catch{return jsonNoStore({error:'owned_collection_access_unavailable'},503);}
}
