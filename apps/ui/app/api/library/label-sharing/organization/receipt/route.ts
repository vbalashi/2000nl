import {NextRequest} from 'next/server';
import {getAuthenticatedSupabase,jsonNoStore,requirePlatformScope} from '@/lib/platform/serverSupabase';
import {copyUuid} from '@/lib/platform/independentEntryCopyContract';
import {parseLabelOrganizationReceipt} from '@/lib/collections/sharing/labelOrganizationContract';
export const dynamic='force-dynamic';
export async function GET(request:NextRequest){
 const auth=await getAuthenticatedSupabase(request);if(auth instanceof Response)return auth;
 if(auth.principal.authKind!=='first_party')return jsonNoStore({error:'first_party_required'},403);
 const denied=requirePlatformScope(auth,'platform:read');if(denied)return denied;
 const id=request.nextUrl.searchParams.get('planId');
 if(!copyUuid(id)||request.nextUrl.searchParams.size!==1)return jsonNoStore({error:'invalid_label_operation'},400);
 try{
  const {data,error}=await auth.supabase.rpc('read_label_organization_plan_v1',{p_plan_id:id.toLowerCase()}).abortSignal(AbortSignal.timeout(10000));
  if(error)return jsonNoStore({error:'label_organization_unavailable'},503);
  const parsed=parseLabelOrganizationReceipt(data,id.toLowerCase());return parsed?jsonNoStore(parsed):jsonNoStore({error:'label_plan_contract_invalid'},502);
 }catch{return jsonNoStore({error:'label_organization_unavailable'},503);}
}
