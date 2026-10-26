import {platformV2AuthenticatedJsonHeaders} from '@/lib/platform/platformV2Http';
import {platformFetchWithTimeout} from '@/lib/platform/platformFetchWithTimeout';
import {parsePersonalCatalogQuery,parsePersonalCatalogPage,type PersonalCatalogQuery} from './personalCatalogContract';
export async function readPersonalCatalog(userId:string,query:PersonalCatalogQuery,signal:AbortSignal){
 const input=parsePersonalCatalogQuery(query);if(!input)throw new Error('invalid_catalog_request');
 signal.throwIfAborted();const headers=await platformV2AuthenticatedJsonHeaders(userId);signal.throwIfAborted();
 const params=new URLSearchParams({query:input.query,sort:input.sort,scope:input.scope,limit:String(input.limit)});
 if(input.labelId)params.set('labelId',input.labelId);if(input.cursor)params.set('cursor',JSON.stringify(input.cursor));if(input.languageCode)params.set('languageCode',input.languageCode);
 const response=await platformFetchWithTimeout('/api/library/collections/catalog?'+params,{headers,signal,cache:'no-store',credentials:'same-origin'});
 const value=response.ok?await response.json().catch(()=>null):null;
 await platformV2AuthenticatedJsonHeaders(userId);signal.throwIfAborted();
 if(!response.ok)throw new Error('personal_catalog_unavailable');
 const page=parsePersonalCatalogPage(value,input.limit);if(!page)throw new Error('personal_catalog_contract_invalid');return page;
}
