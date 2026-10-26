import {NextRequest} from 'next/server';
import {getAuthenticatedSupabase,jsonNoStore,requirePlatformScope} from '@/lib/platform/serverSupabase';
import {collectionSharingWritesEnabled} from './rollout';
export async function authorizeNoteRequest(request:NextRequest,write:boolean){
 const auth=await getAuthenticatedSupabase(request);if(auth instanceof Response)return auth;
 if(auth.principal.authKind!=='first_party')return jsonNoStore({error:'first_party_required'},403);
 const denied=requirePlatformScope(auth,write?'platform:write':'platform:read');if(denied)return denied;
 if(write&&!collectionSharingWritesEnabled())return jsonNoStore({error:'sharing_writes_disabled'},503);
 return auth;
}
