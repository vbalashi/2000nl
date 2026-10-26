import {NextRequest} from 'next/server';
import {getAuthenticatedSupabase,jsonNoStore,requirePlatformScope} from '@/lib/platform/serverSupabase';
import {readBoundedJson} from '@/lib/http/readBoundedJson';
import {copyUuid} from '@/lib/platform/independentEntryCopyContract';
import {parseSelectedMembership} from '@/lib/collections/sharing/selectedMembershipContract';
export const runtime='nodejs';export const dynamic='force-dynamic';export const revalidate=0;
export async function POST(request:NextRequest){
 const auth=await getAuthenticatedSupabase(request);if(auth instanceof Response)return auth;
 if(auth.principal.authKind!=='first_party')return jsonNoStore({error:'first_party_required'},403);
 const denied=requirePlatformScope(auth,'platform:read');if(denied)return denied;
 const body=await readBoundedJson(request,22000);if('error'in body)return jsonNoStore({error:'invalid_membership_request'},body.error==='too_large'?413:400);
 const input=body.body as any;
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length!==2||!copyUuid(input.collectionId)||!Array.isArray(input.entryIds)||input.entryIds.length>500||!input.entryIds.every(copyUuid)||new Set(input.entryIds.map((id:string)=>id.toLowerCase())).size!==input.entryIds.length)return jsonNoStore({error:'invalid_membership_request'},400);
 const id=input.collectionId.toLowerCase(),ids=input.entryIds.map((id:string)=>id.toLowerCase());
 try{
  const {data,error}=await auth.supabase.rpc('read_selected_collection_membership_v1',{p_collection_id:id,p_entry_ids:ids}).abortSignal(AbortSignal.timeout(10000));
  if(error)return jsonNoStore({error:'membership_unavailable'},503);
  if(data===null)return jsonNoStore({error:'collection_unavailable'},404);
  const parsed=parseSelectedMembership(data,id,ids);return parsed?jsonNoStore({collectionId:id,includedEntryIds:parsed}):jsonNoStore({error:'membership_contract_invalid'},502);
 }catch{return jsonNoStore({error:'membership_unavailable'},503);}
}
