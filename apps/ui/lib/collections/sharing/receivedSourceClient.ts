import {copyUuid} from '@/lib/platform/independentEntryCopyContract';
import {platformV2AuthenticatedJsonHeaders} from '@/lib/platform/platformV2Http';
import {platformFetchWithTimeout} from '@/lib/platform/platformFetchWithTimeout';
import {parseReceivedSource,type ReceivedSource} from './receivedSourceContract';
export async function readReceivedSource(userId:string,id:string,signal:AbortSignal):Promise<ReceivedSource|null>{
 if(!copyUuid(id))throw new Error('invalid_collection_id');
 const active=()=>{if(signal.aborted)throw new DOMException('Aborted','AbortError');};active();
 const headers=await platformV2AuthenticatedJsonHeaders(userId);active();
 const response=await platformFetchWithTimeout(`/api/library/shared-collections/received/source?id=${encodeURIComponent(id)}`,{headers,signal,cache:'no-store',credentials:'same-origin'});
 const value=response.ok?await response.json().catch(()=>undefined):undefined;
 await platformV2AuthenticatedJsonHeaders(userId);active();
 if(response.status===404)return null;
 if(!response.ok)throw new Error('received_source_unavailable');
 const source=parseReceivedSource(value,id);if(!source)throw new Error('received_source_contract_invalid');
 return source;
}
