import {platformV2AuthenticatedJsonHeaders} from '@/lib/platform/platformV2Http';
import {platformFetchWithTimeout} from '@/lib/platform/platformFetchWithTimeout';
import {copyUuid} from '@/lib/platform/independentEntryCopyContract';
import {parseReceivedLabelMutation,parseReceivedLabelResult,parseReceivedLabelState,matchesReceivedLabelMutation,type ReceivedLabelMutation} from './receivedLabelsContract';
export class ReceivedLabelsError extends Error{constructor(readonly kind:'unavailable'|'conflict'|'missing'){super(kind);}}
async function request(userId:string,id:string,signal:AbortSignal,mutation?:ReceivedLabelMutation){
 if(!copyUuid(id))throw new Error('invalid_collection_id');const normalized=id.toLowerCase();
 signal.throwIfAborted();const headers=await platformV2AuthenticatedJsonHeaders(userId);signal.throwIfAborted();
 const response=await platformFetchWithTimeout(`/api/library/collections/${normalized}/labels`,{method:mutation?'PUT':'GET',headers,signal,cache:'no-store',credentials:'same-origin',...(mutation?{body:JSON.stringify(mutation)}:{})});
 const value=response.ok?await response.json().catch(()=>null):null;
 await platformV2AuthenticatedJsonHeaders(userId);signal.throwIfAborted();
 if(!response.ok)throw new ReceivedLabelsError(response.status===404?'missing':response.status===409?'conflict':'unavailable');
 return {value,id:normalized};
}
export async function readReceivedLabels(userId:string,id:string,signal:AbortSignal){
 const result=await request(userId,id,signal),state=parseReceivedLabelState(result.value,result.id);
 if(!state)throw new ReceivedLabelsError('unavailable');return state;
}
export async function writeReceivedLabels(userId:string,id:string,mutation:ReceivedLabelMutation,signal:AbortSignal){
 const input=parseReceivedLabelMutation(mutation);if(!input)throw new Error('invalid_label_operation');
 const result=await request(userId,id,signal,input),state=parseReceivedLabelResult(result.value,result.id);
 if(!state||!matchesReceivedLabelMutation(state,input))throw new ReceivedLabelsError('unavailable');return state;
}
