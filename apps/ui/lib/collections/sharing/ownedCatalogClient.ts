import {platformV2AuthenticatedJsonHeaders} from '@/lib/platform/platformV2Http';
import {platformFetchWithTimeout} from '@/lib/platform/platformFetchWithTimeout';
import {parseOwnedCatalogPage,parseOwnedCatalogQuery,parseSharingOverview,type OwnedCatalogQuery} from './ownedCatalogContract';

export async function readOwnedSharedCatalog(userId:string,query:OwnedCatalogQuery,signal:AbortSignal){
 const input=parseOwnedCatalogQuery(query);if(!input)throw new Error('invalid_catalog_request');
 const active=()=>{if(signal.aborted)throw new DOMException('Aborted','AbortError');};active();
 const headers=await platformV2AuthenticatedJsonHeaders(userId);active();
 const params=new URLSearchParams({query:input.query,sort:input.sort,limit:String(input.limit)});
 if(input.cursor)params.set('cursor',JSON.stringify(input.cursor));
 const response=await platformFetchWithTimeout('/api/library/shared-collections/owned?'+params,{headers,signal,cache:'no-store',credentials:'same-origin'});
 const value=response.ok?await response.json().catch(()=>null):null;
 await platformV2AuthenticatedJsonHeaders(userId);active();
 if(!response.ok)throw new Error('owned_catalog_unavailable');
 const page=parseOwnedCatalogPage(value,input.limit);if(!page)throw new Error('owned_catalog_contract_invalid');
 return page;
}

export async function readSharingOverview(userId:string,signal:AbortSignal){
 if(signal.aborted)throw new DOMException('Aborted','AbortError');
 const headers=await platformV2AuthenticatedJsonHeaders(userId);
 if(signal.aborted)throw new DOMException('Aborted','AbortError');
 const response=await platformFetchWithTimeout('/api/library/shared-collections/overview',{headers,signal,cache:'no-store',credentials:'same-origin'});
 const value=response.ok?await response.json().catch(()=>null):null;
 await platformV2AuthenticatedJsonHeaders(userId);
 if(signal.aborted)throw new DOMException('Aborted','AbortError');
 const overview=response.ok?parseSharingOverview(value):null;
 if(!overview)throw new Error('sharing_overview_unavailable');
 // The owner tab counts publications, rather than inherited group access.
 let sharedByMe=0,cursor:OwnedCatalogQuery['cursor']=null;
 const seen=new Set<string>();
 do {
  const page=await readOwnedSharedCatalog(userId,{query:'',sort:'recent',limit:100,cursor},signal);
  sharedByMe+=page.collections.filter(row=>row.directPublication).length;
  cursor=page.nextCursor;
  if(cursor){const key=JSON.stringify(cursor);if(seen.has(key))throw new Error('catalog_cursor_cycle');seen.add(key);}
 }while(cursor);
 return {...overview,sharedByMe};
}
