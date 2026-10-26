import {platformV2AuthenticatedJsonHeaders} from '@/lib/platform/platformV2Http';
import {platformFetchWithTimeout} from '@/lib/platform/platformFetchWithTimeout';
import {parsePublicationBadgeRequest,parsePublicationBadges} from './publicationBadgesContract';
export async function readOwnedPublicationBadges(userId:string,ids:string[],signal:AbortSignal){
 const input=parsePublicationBadgeRequest({ids});if(!input)throw new Error('invalid_publication_badge_request');
 const active=()=>{if(signal.aborted)throw new DOMException('Aborted','AbortError');};active();
 const headers=await platformV2AuthenticatedJsonHeaders(userId);active();
 const response=await platformFetchWithTimeout('/api/library/shared-collections/owned/badges',{method:'POST',headers:{...headers,'content-type':'application/json'},body:JSON.stringify({ids:input}),signal,cache:'no-store',credentials:'same-origin'});
 const value=response.ok?await response.json().catch(()=>null):null;
 await platformV2AuthenticatedJsonHeaders(userId);active();
 if(!response.ok)throw new Error('publication_badges_unavailable');
 const openIds=parsePublicationBadges(value,input);if(!openIds)throw new Error('publication_badges_contract_invalid');return openIds;
}
