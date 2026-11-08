import {copyUuid} from '@/lib/platform/independentEntryCopyContract';
export type OwnedCollectionAccessMetadata={collections:Array<{collectionId:string;isShared:boolean;subscriberCount:number}>};
export function normalizeOwnedCollectionIds(value:unknown):string[]|null{
 if(!Array.isArray(value)||value.length>200||!value.every(copyUuid))return null;
 return [...new Set(value.map(id=>id.toLowerCase()))].sort();
}
export function parseOwnedCollectionAccessMetadata(value:unknown,requestedIds:readonly string[]):OwnedCollectionAccessMetadata|null{
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==1||!('collections'in value)||!Array.isArray(value.collections))return null;
 const requested=new Set(requestedIds);let previous='';
 for(const row of value.collections){
  if(!row||typeof row!=='object'||Array.isArray(row)||Object.keys(row).sort().join(',')!=='collectionId,isShared,subscriberCount'
   ||!copyUuid(row.collectionId)||!requested.has(row.collectionId)||row.collectionId<=previous||typeof row.isShared!=='boolean'
   ||!Number.isSafeInteger(row.subscriberCount)||row.subscriberCount<0||(!row.isShared&&row.subscriberCount!==0))return null;
  previous=row.collectionId;
 }
 return value as OwnedCollectionAccessMetadata;
}
