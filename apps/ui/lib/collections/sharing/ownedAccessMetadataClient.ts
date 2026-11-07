import {platformV2AuthenticatedJsonHeaders} from '@/lib/platform/platformV2Http';
import {platformFetchWithTimeout} from '@/lib/platform/platformFetchWithTimeout';
import {normalizeOwnedCollectionIds,parseOwnedCollectionAccessMetadata,type OwnedCollectionAccessMetadata} from './ownedCollectionAccessContract';
export async function readOwnedCollectionAccessMetadata(userId:string,collectionIds:readonly string[],signal:AbortSignal):Promise<OwnedCollectionAccessMetadata['collections']>{
 const ids=normalizeOwnedCollectionIds(collectionIds);if(!ids)throw new Error('invalid_share_request');
 signal.throwIfAborted();const headers=await platformV2AuthenticatedJsonHeaders(userId);signal.throwIfAborted();
 const response=await platformFetchWithTimeout('/api/library/label-sharing/owned-access',{method:'POST',headers,signal,credentials:'same-origin',cache:'no-store',body:JSON.stringify({collectionIds:ids})});
 const value:unknown=response.ok?await response.json():null;
 await platformV2AuthenticatedJsonHeaders(userId);signal.throwIfAborted();
 const parsed=parseOwnedCollectionAccessMetadata(value,ids);if(!parsed)throw new Error('owned_collection_access_unavailable');return parsed.collections;
}
