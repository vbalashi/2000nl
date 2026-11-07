import {platformV2AuthenticatedJsonHeaders} from '@/lib/platform/platformV2Http';
import {platformFetchWithTimeout} from '@/lib/platform/platformFetchWithTimeout';
import {copyUuid} from '@/lib/platform/independentEntryCopyContract';
import {parseLabelMutation,parseLabelsSnapshot,type CollectionLabelsSnapshot} from '@/lib/collections/labels/model';
import {parseLabelOrganizationPlan,type LabelOrganizationPlan} from './labelOrganizationContract';
async function request(userId:string,path:string,body:unknown,signal:AbortSignal):Promise<unknown>{
 signal.throwIfAborted();const headers=await platformV2AuthenticatedJsonHeaders(userId);signal.throwIfAborted();
 const response=await platformFetchWithTimeout(`/api/library/label-sharing/organization/${path}`,{method:'POST',headers,signal,credentials:'same-origin',cache:'no-store',body:JSON.stringify(body)});
 const value:unknown=await response.json();
 await platformV2AuthenticatedJsonHeaders(userId);signal.throwIfAborted();
 if(!response.ok){
  const reason=value&&typeof value==='object'&&'error'in value?value.error:null;
  throw new Error(typeof reason==='string'&&['label_audience_changed','label_catalog_conflict','share_copy_required','label_plan_unavailable'].includes(reason)?reason:'label_organization_unavailable');
 }
 return value;
}
export async function prepareLabelOrganization(userId:string,value:unknown,signal:AbortSignal):Promise<LabelOrganizationPlan>{
 const input=parseLabelMutation(value);if(!input)throw new Error('invalid_label_operation');
 const parsed=parseLabelOrganizationPlan(await request(userId,'prepare',input,signal));
 if(!parsed)throw new Error('label_plan_contract_invalid');return parsed;
}
export async function confirmLabelOrganization(userId:string,planId:string,signal:AbortSignal):Promise<CollectionLabelsSnapshot>{
 if(!copyUuid(planId))throw new Error('invalid_label_operation');
 const parsed=parseLabelsSnapshot(await request(userId,'confirm',{planId:planId.toLowerCase()},signal));
 if(!parsed)throw new Error('label_plan_contract_invalid');return parsed;
}
