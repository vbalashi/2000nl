import {NextRequest} from 'next/server';
import {getAuthenticatedSupabase,jsonNoStore,requirePlatformScope} from '@/lib/platform/serverSupabase';
import {readBoundedJson} from '@/lib/http/readBoundedJson';
import {MAX_LABEL_REQUEST_BYTES,parseLabelMutation} from '@/lib/collections/labels/model';
import {parseLabelOrganizationPlan} from '@/lib/collections/sharing/labelOrganizationContract';
export const dynamic='force-dynamic';
export async function POST(request:NextRequest){
 const auth=await getAuthenticatedSupabase(request);if(auth instanceof Response)return auth;
 if(auth.principal.authKind!=='first_party')return jsonNoStore({error:'first_party_required'},403);
 const denied=requirePlatformScope(auth,'platform:write');if(denied)return denied;
 if(request.nextUrl.searchParams.size)return jsonNoStore({error:'invalid_label_operation'},400);
 const body=await readBoundedJson(request,MAX_LABEL_REQUEST_BYTES);
 if('error'in body)return jsonNoStore({error:'invalid_label_operation'},body.error==='too_large'?413:400);
 const input=parseLabelMutation(body.body);if(!input)return jsonNoStore({error:'invalid_label_operation'},400);
 try{
  const {data,error}=await auth.supabase.rpc('prepare_label_organization_v1',{p_expected_catalog_revision:input.expectedRevision,p_operation:input.operation}).abortSignal(AbortSignal.timeout(10000));
  if(error)return jsonNoStore({error:['label_audience_changed','label_catalog_conflict'].includes(error.message)?error.message:'label_organization_unavailable'},['40001','55P03'].includes(error.code)?409:503);
  const parsed=parseLabelOrganizationPlan(data);return parsed?jsonNoStore(parsed):jsonNoStore({error:'label_plan_contract_invalid'},502);
 }catch{return jsonNoStore({error:'label_organization_unavailable'},503);}
}
