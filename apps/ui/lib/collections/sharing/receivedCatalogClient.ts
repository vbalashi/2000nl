import { platformV2AuthenticatedJsonHeaders } from '@/lib/platform/platformV2Http';
import { platformFetchWithTimeout } from '@/lib/platform/platformFetchWithTimeout';
import { parseReceivedCatalogQuery, parseReceivedCatalogPage, type ReceivedCatalogQuery } from './receivedCatalogContract';
export async function readReceivedCatalog(userId:string,query:ReceivedCatalogQuery,signal:AbortSignal){
 const input=parseReceivedCatalogQuery(query);if(!input)throw new Error('invalid_catalog_request');
 const active=()=>{if(signal.aborted)throw new DOMException('Aborted','AbortError');};active();
 const headers=await platformV2AuthenticatedJsonHeaders(userId);active();
 const params=new URLSearchParams({query:input.query,sort:input.sort,scope:input.scope,limit:String(input.limit)});
 if(input.labelId)params.set('labelId',input.labelId);if(input.cursor)params.set('cursor',JSON.stringify(input.cursor));
 const response=await platformFetchWithTimeout('/api/library/shared-collections/received?'+params,{headers,signal,cache:'no-store',credentials:'same-origin'});
 const value=response.ok?await response.json().catch(()=>null):null;
 await platformV2AuthenticatedJsonHeaders(userId);active();
 if(!response.ok)throw new Error('received_catalog_unavailable');
 const page=parseReceivedCatalogPage(value,input.limit,userId);if(!page)throw new Error('received_catalog_contract_invalid');
 return page;
}
