import { copyUuid } from '@/lib/platform/independentEntryCopyContract';
import { platformV2AuthenticatedJsonHeaders } from '@/lib/platform/platformV2Http';
import { platformFetchWithTimeout } from '@/lib/platform/platformFetchWithTimeout';
import { parseCollectionShareManagement,parseCollectionShareForward } from './shareManagementContract';
async function readState<T>(userId:string,collectionId:string,signal:AbortSignal,forward:boolean,parse:(value:unknown,id:string)=>T|null):Promise<T>{
 if(!userId||!copyUuid(collectionId))throw new Error('invalid_share_request');
 const id=collectionId.toLowerCase();const active=()=>{if(signal.aborted)throw new DOMException('Aborted','AbortError');};active();
 const headers=await platformV2AuthenticatedJsonHeaders(userId);active();
 const response=await platformFetchWithTimeout(`/api/library/collections/${id}/sharing${forward?'/forward':''}`,{headers,signal,cache:'no-store',credentials:'same-origin'});
 const value=response.ok?await response.json().catch(()=>null):null;
 await platformV2AuthenticatedJsonHeaders(userId);active();
 if(!response.ok)throw new Error(response.status===404?'share_unavailable':'share_read_unavailable');
 const parsed=parse(value,id);if(!parsed)throw new Error('share_contract_invalid');return parsed;
}
export const readCollectionShareManagement=(userId:string,collectionId:string,signal:AbortSignal)=>readState(userId,collectionId,signal,false,parseCollectionShareManagement);
export const readCollectionShareForward=(userId:string,collectionId:string,signal:AbortSignal)=>readState(userId,collectionId,signal,true,parseCollectionShareForward);
