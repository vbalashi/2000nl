import {copyUuid} from '@/lib/platform/independentEntryCopyContract';
import {platformV2AuthenticatedJsonHeaders} from '@/lib/platform/platformV2Http';
import {platformFetchWithTimeout} from '@/lib/platform/platformFetchWithTimeout';

export type CollectionCopyPreview={listId:string;revision:string;canCopy:boolean;borrowedCount:number};
export type CollectionCopyCommand={operationId:string;listId:string;expectedRevision:string};
export type CollectionCopyReceipt={operationId:string;status:'unknown'}|{operationId:string;status:'completed';listId:string;copiedCount:number};
export type CollectionCopyOutcome=CollectionCopyReceipt|{status:'rejected';reason:string};
const object=(value:unknown):value is Record<string,unknown>=>Boolean(value)&&typeof value==='object'&&!Array.isArray(value);
const keys=(value:Record<string,unknown>,fields:string[])=>Object.keys(value).length===fields.length&&Object.keys(value).every(key=>fields.includes(key));
const count=(value:unknown):value is number=>Number.isSafeInteger(value)&&Number(value)>=0&&Number(value)<=50;
export function parseCollectionCopyCommand(value:unknown):CollectionCopyCommand|null{
 return object(value)&&keys(value,['operationId','listId','expectedRevision'])&&copyUuid(value.operationId)&&copyUuid(value.listId)&&typeof value.expectedRevision==='string'&&/^[a-f0-9]{64}$/.test(value.expectedRevision)?{operationId:value.operationId.toLowerCase(),listId:value.listId.toLowerCase(),expectedRevision:value.expectedRevision}:null;
}
function receipt(value:unknown,operationId:string,listId:string):CollectionCopyReceipt|null{
 if(!object(value)||value.operationId!==operationId)return null;
 if(value.status==='unknown')return keys(value,['operationId','status'])?value as CollectionCopyReceipt:null;
 return keys(value,['operationId','status','listId','copiedCount'])&&value.status==='completed'&&value.listId===listId&&count(value.copiedCount)?value as CollectionCopyReceipt:null;
}
async function request(userId:string,path:string,signal:AbortSignal,command?:CollectionCopyCommand){
 signal.throwIfAborted();const headers=await platformV2AuthenticatedJsonHeaders(userId);signal.throwIfAborted();
 const response=await platformFetchWithTimeout('/api/library/collection-copies'+path,{method:command?'POST':'GET',headers,signal,credentials:'same-origin',cache:'no-store',...(command?{body:JSON.stringify(command)}:{})});
 const value:unknown=await response.json().catch(()=>null);
 await platformV2AuthenticatedJsonHeaders(userId);signal.throwIfAborted();return {response,value};
}
export async function previewCollectionBorrowedCopy(userId:string,listId:string,signal:AbortSignal):Promise<CollectionCopyPreview>{
 if(!copyUuid(listId))throw new Error('invalid_copy_request');
 listId=listId.toLowerCase();
 const {response,value}=await request(userId,'?listId='+encodeURIComponent(listId),signal);
 if(!response.ok||!object(value)||!keys(value,['listId','revision','canCopy','borrowedCount'])||value.listId!==listId||typeof value.revision!=='string'||!/^[a-f0-9]{64}$/.test(value.revision)||typeof value.canCopy!=='boolean'||!count(value.borrowedCount))throw new Error('collection_copy_preview_unavailable');
 return value as CollectionCopyPreview;
}
export async function submitCollectionBorrowedCopy(userId:string,command:CollectionCopyCommand,signal:AbortSignal):Promise<CollectionCopyOutcome|null>{
 const parsed=parseCollectionCopyCommand(command);if(!parsed)throw new Error('invalid_copy_request');command=parsed;
 try{
  const {response,value}=await request(userId,'',signal,command);
  if(response.ok)return receipt(value,command.operationId,command.listId);
  if([404,409,422].includes(response.status)&&object(value)&&typeof value.error==='string'&&['copy_source_changed','copy_collection_changed','copy_collection_too_large','copy_operation_conflict','copy_content_too_large','copy_content_invalid','copy_content_unsupported','copy_asset_snapshot_unsupported','copy_source_unavailable'].includes(value.error))return {status:'rejected',reason:value.error};
  return null;
 }catch{signal.throwIfAborted();return null;}
}
export async function reconcileCollectionBorrowedCopy(userId:string,command:CollectionCopyCommand,signal:AbortSignal):Promise<CollectionCopyReceipt|null>{
 const parsed=parseCollectionCopyCommand(command);if(!parsed)throw new Error('invalid_copy_request');command=parsed;
 const {response,value}=await request(userId,'?operationId='+encodeURIComponent(command.operationId),signal);
 return response.ok?receipt(value,command.operationId,command.listId):null;
}
