import {NextRequest} from 'next/server';
import {getAuthenticatedSupabase,jsonNoStore,requirePlatformScope} from '@/lib/platform/serverSupabase';
import {readBoundedJson} from '@/lib/http/readBoundedJson';
import {isCanonicalShareCode} from '@/lib/collections/sharing/shareCode';
import {parseSharedResourcePreview} from '@/lib/collections/sharing/labelSharingContract';
export const dynamic='force-dynamic';
export async function POST(request:NextRequest){
 const auth=await getAuthenticatedSupabase(request);if(auth instanceof Response)return auth;
 if(auth.principal.authKind!=='first_party')return jsonNoStore({error:'first_party_required'},403);
 const denied=requirePlatformScope(auth,'platform:read');if(denied)return denied;
 if(request.nextUrl.searchParams.size)return jsonNoStore({error:'invalid_share_request'},400);
 if(request.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json')return jsonNoStore({error:'json_required'},415);
 const body=await readBoundedJson(request,4096);
 if('error'in body)return jsonNoStore({error:'invalid_share_request'},body.error==='too_large'?413:400);
 const value=body.body;
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==1||!isCanonicalShareCode((value as {code?:unknown}).code))return jsonNoStore({error:'invalid_share_request'},400);
 try{
  const {data,error}=await auth.supabase.rpc('preview_shared_resource_v1',{p_code:(value as {code:string}).code}).abortSignal(AbortSignal.timeout(10000));
  if(error)return jsonNoStore({error:error.code==='42501'?'share_unavailable':'sharing_unavailable'},error.code==='42501'?404:503);
  const parsed=parseSharedResourcePreview(data);return parsed?jsonNoStore(parsed):jsonNoStore({error:'share_contract_invalid'},502);
 }catch{return jsonNoStore({error:'sharing_unavailable'},503);}
}
