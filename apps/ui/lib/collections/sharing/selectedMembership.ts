import {copyUuid} from '@/lib/platform/independentEntryCopyContract';
import {platformV2AuthenticatedJsonHeaders} from '@/lib/platform/platformV2Http';
import {platformFetchWithTimeout} from '@/lib/platform/platformFetchWithTimeout';
import {parseSelectedMembership} from './selectedMembershipContract';
export async function readSelectedMembership(userId:string,id:string,entryIds:string[],signal:AbortSignal){
 if(!copyUuid(id)||entryIds.length>500||!entryIds.every(copyUuid))throw new Error('invalid_membership_request');
 signal.throwIfAborted();const headers=await platformV2AuthenticatedJsonHeaders(userId);signal.throwIfAborted();
 const response=await platformFetchWithTimeout('/api/library/collections/membership',{method:'POST',headers,body:JSON.stringify({collectionId:id,entryIds}),signal,cache:'no-store',credentials:'same-origin'});
 const value=response.ok?await response.json().catch(()=>null):null;
 await platformV2AuthenticatedJsonHeaders(userId);signal.throwIfAborted();
 const result=parseSelectedMembership(value,id,entryIds);if(!response.ok||!result)throw new Error('membership_unavailable');return result;
}
