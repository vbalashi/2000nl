import {copyUuid} from '@/lib/platform/independentEntryCopyContract';
import {parseReceivedCatalogCursor,type ReceivedCatalogCursor} from './receivedCatalogContract';

export type OwnedCatalogQuery={query:string;sort:'recent'|'name'|'count';cursor:ReceivedCatalogCursor|null;limit:number};
export type OwnedSharedCollection={id:string;name:string;createdAt:string;itemCount:number;subscriberCount:number};
export type OwnedCatalogPage={collections:OwnedSharedCollection[];nextCursor:ReceivedCatalogCursor|null};
export type SharingOverview={sharedByMe:number;addedByMe:number};
const record=(value:unknown):value is Record<string,unknown>=>Boolean(value)&&typeof value==='object'&&!Array.isArray(value);
const exact=(value:Record<string,unknown>,fields:string[])=>Object.keys(value).length===fields.length&&Object.keys(value).every(key=>fields.includes(key));
const text=(value:unknown,max:number):value is string=>typeof value==='string'&&[...value].length<=max&&!value.includes('\0')&&![...value].some(character=>{const point=character.codePointAt(0)!;return point>=0xd800&&point<=0xdfff;});
const timestamp=(value:unknown):value is string=>typeof value==='string'&&value.length<=40&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/.test(value)&&Number.isFinite(Date.parse(value));

export function parseOwnedCatalogQuery(value:unknown):OwnedCatalogQuery|null{
 if(!record(value)||Object.keys(value).some(key=>!['query','sort','cursor','limit'].includes(key)))return null;
 const query=value.query===undefined?'':value.query,sort=value.sort===undefined?'recent':value.sort,limit=value.limit===undefined?50:value.limit;
 if(!text(query,100)||typeof sort!=='string'||!['recent','name','count'].includes(sort)||!Number.isInteger(limit)||Number(limit)<1||Number(limit)>100)return null;
 const cursor=value.cursor==null?null:parseReceivedCatalogCursor(value.cursor);if(value.cursor!=null&&!cursor)return null;
 return {query:query.trim(),sort:sort as OwnedCatalogQuery['sort'],cursor,limit:Number(limit)};
}

export function parseOwnedCatalogPage(value:unknown,limit:number):OwnedCatalogPage|null{
 if(!Number.isInteger(limit)||limit<1||limit>100||!record(value)||!exact(value,['collections','nextCursor'])||!Array.isArray(value.collections)||value.collections.length>limit)return null;
 const ids=new Set<string>(),collections:OwnedSharedCollection[]=[];
 for(const row of value.collections){
  if(!record(row)||!exact(row,['id','name','createdAt','itemCount','subscriberCount'])||!copyUuid(row.id)||ids.has(row.id.toLowerCase())||!text(row.name,1000)||!timestamp(row.createdAt)||
   !Number.isSafeInteger(row.itemCount)||Number(row.itemCount)<0||!Number.isSafeInteger(row.subscriberCount)||Number(row.subscriberCount)<0)return null;
  ids.add(row.id.toLowerCase());collections.push({...row,id:row.id.toLowerCase()} as OwnedSharedCollection);
 }
 const nextCursor=value.nextCursor===null?null:parseReceivedCatalogCursor(value.nextCursor);
 if(value.nextCursor!==null&&(!nextCursor||collections.length!==limit||nextCursor.id!==collections.at(-1)?.id))return null;
 if(new TextEncoder().encode(JSON.stringify(value)).byteLength>1024*1024)return null;
 return {collections,nextCursor};
}

export function parseSharingOverview(value:unknown):SharingOverview|null{
 if(!record(value)||!exact(value,['sharedByMe','addedByMe'])||!Number.isSafeInteger(value.sharedByMe)||Number(value.sharedByMe)<0||!Number.isSafeInteger(value.addedByMe)||Number(value.addedByMe)<0)return null;
 return {sharedByMe:Number(value.sharedByMe),addedByMe:Number(value.addedByMe)};
}
