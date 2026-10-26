import { copyUuid } from '@/lib/platform/independentEntryCopyContract';
export type ReceivedCatalogCursor = { id: string; key: string; scope: string };
export type ReceivedCatalogQuery = { query: string; sort: 'name'|'recent'|'count'; scope: 'all'|'unlabelled'|'label'; labelId: string|null; cursor: ReceivedCatalogCursor|null; limit: number };
export type ReceivedCollection = { id:string; name:string; createdAt:string; addedAt:string; ownerUserId:string; role:'viewer'; itemCount:number; labelIds:string[] };
export type ReceivedCatalogPage = { revision:number; collections:ReceivedCollection[]; nextCursor:ReceivedCatalogCursor|null };
const record=(v:unknown):v is Record<string,unknown>=>Boolean(v)&&typeof v==='object'&&!Array.isArray(v);
const keys=(v:Record<string,unknown>,allowed:string[])=>Object.keys(v).length===allowed.length&&Object.keys(v).every(k=>allowed.includes(k));
const text=(v:unknown,max:number):v is string=>typeof v==='string'&&[...v].length<=max&&!v.includes('\0')&&![...v].some(c=>{const p=c.codePointAt(0)!;return p>=0xd800&&p<=0xdfff;});
export function parseReceivedCatalogCursor(value:unknown):ReceivedCatalogCursor|null{
 return record(value)&&keys(value,['id','key','scope'])&&copyUuid(value.id)&&text(value.key,1000)&&typeof value.scope==='string'&&/^[a-f0-9]{64}$/.test(value.scope)
  ?{id:value.id.toLowerCase(),key:value.key,scope:value.scope}:null;
}
export function parseReceivedCatalogQuery(value:unknown):ReceivedCatalogQuery|null{
 if(!record(value)||Object.keys(value).some(k=>!['query','sort','scope','labelId','cursor','limit'].includes(k)))return null;
 const query=value.query===undefined?'':value.query,sort=value.sort===undefined?'recent':value.sort,scope=value.scope===undefined?'all':value.scope,labelId=value.labelId??null,limit=value.limit===undefined?50:value.limit;
 if(!text(query,100)||typeof sort!=='string'||!['name','recent','count'].includes(sort)||typeof scope!=='string'||!['all','unlabelled','label'].includes(scope)||
  !Number.isInteger(limit)||Number(limit)<1||Number(limit)>100||(scope==='label'?!copyUuid(labelId):labelId!==null))return null;
 const cursor=value.cursor==null?null:parseReceivedCatalogCursor(value.cursor);if(value.cursor!=null&&!cursor)return null;
 return {query:query.trim(),sort:sort as ReceivedCatalogQuery['sort'],scope:scope as ReceivedCatalogQuery['scope'],labelId:typeof labelId==='string'?labelId.toLowerCase():null,cursor,limit:Number(limit)};
}
const timestamp=(v:unknown):v is string=>typeof v==='string'&&v.length<=40&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/.test(v)&&Number.isFinite(Date.parse(v));
export function parseReceivedCatalogPage(value:unknown,limit:number,principalId?:string):ReceivedCatalogPage|null{
 if(!Number.isInteger(limit)||limit<1||limit>100||!record(value)||!keys(value,['revision','collections','nextCursor'])||!Number.isInteger(value.revision)||Number(value.revision)<0||Number(value.revision)>2147483646||
  !Array.isArray(value.collections)||value.collections.length>limit)return null;
 const ids=new Set<string>();const collections:ReceivedCollection[]=[];
 for(const row of value.collections){
  if(!record(row)||!keys(row,['id','name','createdAt','addedAt','ownerUserId','role','itemCount','labelIds'])||!copyUuid(row.id)||ids.has(row.id.toLowerCase())||
   !text(row.name,1000)||!timestamp(row.createdAt)||!timestamp(row.addedAt)||!copyUuid(row.ownerUserId)||row.ownerUserId.toLowerCase()===principalId?.toLowerCase()||row.role!=='viewer'||
   !Number.isSafeInteger(row.itemCount)||Number(row.itemCount)<0||!Array.isArray(row.labelIds)||row.labelIds.length>1000||row.labelIds.some(id=>!copyUuid(id))||
   new Set(row.labelIds.map(id=>id.toLowerCase())).size!==row.labelIds.length)return null;
  ids.add(row.id.toLowerCase());collections.push({...row,id:row.id.toLowerCase(),ownerUserId:row.ownerUserId.toLowerCase(),labelIds:row.labelIds.map(id=>id.toLowerCase())} as ReceivedCollection);
 }
 const nextCursor=value.nextCursor===null?null:parseReceivedCatalogCursor(value.nextCursor);
 if(value.nextCursor!==null&&(!nextCursor||collections.length!==limit||nextCursor.id!==collections.at(-1)?.id))return null;
 if(new TextEncoder().encode(JSON.stringify(value)).byteLength>1024*1024)return null;
 return {revision:Number(value.revision),collections,nextCursor};
}
