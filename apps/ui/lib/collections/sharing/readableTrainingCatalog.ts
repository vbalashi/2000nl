import {platformV2AuthenticatedJsonHeaders} from '@/lib/platform/platformV2Http';
import {platformFetchWithTimeout} from '@/lib/platform/platformFetchWithTimeout';
import {parseTrainingCollectionPage,parseTrainingCollections} from './trainingCollectionCatalogContract';
import type {ReceivedCatalogCursor} from './receivedCatalogContract';
import {copyUuid} from '@/lib/platform/independentEntryCopyContract';
async function request(userId:string,signal:AbortSignal,params?:URLSearchParams,body?:unknown){
 signal.throwIfAborted();const headers=await platformV2AuthenticatedJsonHeaders(userId);signal.throwIfAborted();
 const response=await platformFetchWithTimeout('/api/library/collections/training-catalog'+(params?'?'+params:''),{method:body?'POST':'GET',headers,signal,cache:'no-store',credentials:'same-origin',...(body?{body:JSON.stringify(body)}:{})});
 const value=response.ok?await response.json().catch(()=>null):null;await platformV2AuthenticatedJsonHeaders(userId);signal.throwIfAborted();if(!response.ok)throw Error('training_catalog_unavailable');return value;
}
export async function readTrainingCollectionPage(userId:string,language:string,query:string,cursor:ReceivedCatalogCursor|null,signal:AbortSignal){
 const params=new URLSearchParams({languageCode:language,query,limit:'50'});if(cursor)params.set('cursor',JSON.stringify(cursor));
 const page=parseTrainingCollectionPage(await request(userId,signal,params),50);if(!page)throw Error('training_catalog_contract_invalid');return page;
}
export async function readTrainingCollectionReferences(userId:string,language:string,ids:string[],signal:AbortSignal){
 if(ids.length>100||!ids.every(copyUuid)||new Set(ids.map(id=>id.toLowerCase())).size!==ids.length)throw Error('invalid_training_references');
 const value=await request(userId,signal,undefined,{languageCode:language,collectionIds:ids});
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==1)throw Error('training_catalog_contract_invalid');
 const rows=parseTrainingCollections((value as {collections?:unknown}).collections,100);if(!rows||rows.some(row=>!ids.some(id=>id.toLowerCase()===row.id)))throw Error('training_catalog_contract_invalid');return rows;
}
