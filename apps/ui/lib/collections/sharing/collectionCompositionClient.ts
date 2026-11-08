import {platformV2AuthenticatedJsonHeaders} from '@/lib/platform/platformV2Http';
import {platformFetchWithTimeout} from '@/lib/platform/platformFetchWithTimeout';
import {copyUuid} from '@/lib/platform/independentEntryCopyContract';
import {parseCollectionCompositionOperation,parseCollectionCompositionPlan,parseCollectionCompositionReceipt,type CollectionCompositionPlan,type CollectionCompositionReceipt} from './collectionCompositionContract';
async function request(userId:string,path:string,body:unknown,signal:AbortSignal):Promise<unknown>{
 signal.throwIfAborted();const headers=await platformV2AuthenticatedJsonHeaders(userId);signal.throwIfAborted();
 const response=await platformFetchWithTimeout(`/api/library/label-sharing/composition/${path}`,{method:'POST',headers,signal,credentials:'same-origin',cache:'no-store',body:JSON.stringify(body)});
 const value:unknown=await response.json();await platformV2AuthenticatedJsonHeaders(userId);signal.throwIfAborted();
 if(!response.ok){const reason=value&&typeof value==='object'&&'error'in value?value.error:null;throw new Error(typeof reason==='string'&&['collection_audience_changed','share_copy_required','collection_unavailable'].includes(reason)?reason:'collection_plan_unavailable');}
 return value;
}
export async function prepareCollectionComposition(userId:string,collectionId:string,value:unknown,signal:AbortSignal):Promise<CollectionCompositionPlan>{
 const operation=parseCollectionCompositionOperation(value);if(!copyUuid(collectionId)||!operation)throw new Error('invalid_collection_operation');
 const id=collectionId.toLowerCase();const parsed=parseCollectionCompositionPlan(await request(userId,'prepare',{collectionId:id,operation},signal),id,operation.action);
 if(!parsed)throw new Error('collection_plan_contract_invalid');return parsed;
}
export async function confirmCollectionComposition(userId:string,planId:string,signal:AbortSignal):Promise<CollectionCompositionReceipt>{
 if(!copyUuid(planId))throw new Error('invalid_collection_operation');const id=planId.toLowerCase();
 const parsed=parseCollectionCompositionReceipt(await request(userId,'confirm',{planId:id},signal),id);
 if(!parsed)throw new Error('collection_plan_contract_invalid');return parsed;
}

import {parseCollectionCompositionPlanState,type CollectionCompositionPlanState} from './collectionCompositionContract';
export async function readCollectionCompositionReceipt(userId:string,planId:string,signal:AbortSignal):Promise<CollectionCompositionPlanState>{
 if(!copyUuid(planId))throw new Error('invalid_collection_operation');const id=planId.toLowerCase();
 signal.throwIfAborted();const headers=await platformV2AuthenticatedJsonHeaders(userId);signal.throwIfAborted();
 const response=await platformFetchWithTimeout(`/api/library/label-sharing/composition/receipt?planId=${encodeURIComponent(id)}`,{method:'GET',headers,signal,credentials:'same-origin',cache:'no-store'});
 const value:unknown=response.ok?await response.json():null;await platformV2AuthenticatedJsonHeaders(userId);signal.throwIfAborted();
 const parsed=parseCollectionCompositionPlanState(value,id);if(!parsed)throw new Error('collection_plan_receipt_unavailable');return parsed;
}
