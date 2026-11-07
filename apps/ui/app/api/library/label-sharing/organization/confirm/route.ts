import {NextRequest} from 'next/server';
import {getAuthenticatedSupabase,jsonNoStore,requirePlatformScope} from '@/lib/platform/serverSupabase';
import {readBoundedJson} from '@/lib/http/readBoundedJson';
import {copyUuid} from '@/lib/platform/independentEntryCopyContract';
import {parseLabelsSnapshot} from '@/lib/collections/labels/model';
export const dynamic='force-dynamic';
export async function POST(request:NextRequest){
 const auth=await getAuthenticatedSupabase(request);if(auth instanceof Response)return auth;
 if(auth.principal.authKind!=='first_party')return jsonNoStore({error:'first_party_required'},403);
 const denied=requirePlatformScope(auth,'platform:write');if(denied)return denied;
 if(request.nextUrl.searchParams.size)return jsonNoStore({error:'invalid_label_operation'},400);
 const body=await readBoundedJson(request,4096);
 if('error'in body)return jsonNoStore({error:'invalid_label_operation'},body.error==='too_large'?413:400);
 const value=body.body;
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==1||!copyUuid((value as {planId?:unknown}).planId))return jsonNoStore({error:'invalid_label_operation'},400);
 try{
  const {data,error}=await auth.supabase.rpc('confirm_label_organization_v1',{p_plan_id:(value as {planId:string}).planId.toLowerCase()}).abortSignal(AbortSignal.timeout(10000));
  if(error){
   if(['label_audience_changed','label_catalog_conflict','share_copy_required'].includes(error.message))return jsonNoStore({error:error.message},409);
   return jsonNoStore({error:error.code==='42501'?'label_plan_unavailable':'label_organization_unavailable'},error.code==='42501'?404:503);
  }
  const parsed=parseLabelsSnapshot(data);return parsed?jsonNoStore(parsed):jsonNoStore({error:'label_plan_contract_invalid'},502);
 }catch{return jsonNoStore({error:'label_organization_unavailable'},503);}
}
