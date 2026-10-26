import {copyUuid} from '@/lib/platform/independentEntryCopyContract';
import {parseReceivedCatalogQuery,parseReceivedCatalogCursor,type ReceivedCatalogQuery,type ReceivedCatalogCursor} from './receivedCatalogContract';
export type PersonalCatalogQuery=ReceivedCatalogQuery&{languageCode:string|null};
export type PersonalCollection={id:string;name:string;createdAt:string;ownership:'owned'|'received';isShared:boolean;itemCount:number;labelIds:string[]};
export type PersonalCatalogPage={revision:number;collections:PersonalCollection[];nextCursor:ReceivedCatalogCursor|null};
const record=(v:unknown):v is Record<string,unknown>=>Boolean(v)&&typeof v==='object'&&!Array.isArray(v);
const exact=(v:Record<string,unknown>,keys:string[])=>Object.keys(v).length===keys.length&&Object.keys(v).every(k=>keys.includes(k));
const text=(v:unknown,max:number):v is string=>typeof v==='string'&&[...v].length<=max&&!v.includes('\0')&&![...v].some(c=>{const p=c.codePointAt(0)!;return p>=0xd800&&p<=0xdfff;});
export function parsePersonalCatalogQuery(value:unknown):PersonalCatalogQuery|null{
 if(!record(value))return null;const {languageCode,...rest}=value;
 if(languageCode!==null&&languageCode!==undefined&&(!text(languageCode,16)||!languageCode.trim()))return null;
 const query=parseReceivedCatalogQuery(rest);return query?{...query,languageCode:typeof languageCode==='string'?languageCode.trim():null}:null;
}
export function parsePersonalCatalogPage(value:unknown,limit:number):PersonalCatalogPage|null{
 if(!Number.isInteger(limit)||limit<1||limit>100||!record(value)||!exact(value,['revision','collections','nextCursor'])||!Number.isInteger(value.revision)||Number(value.revision)<0||Number(value.revision)>2147483646||!Array.isArray(value.collections)||value.collections.length>limit)return null;
 const ids=new Set<string>();const collections:PersonalCollection[]=[];
 for(const row of value.collections){
  if(!record(row)||!exact(row,['id','name','createdAt','ownership','isShared','itemCount','labelIds'])||!copyUuid(row.id)||ids.has(row.id.toLowerCase())||!text(row.name,1000)||
   typeof row.createdAt!=='string'||row.createdAt.length>40||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/.test(row.createdAt)||!Number.isFinite(Date.parse(row.createdAt))||
   !['owned','received'].includes(row.ownership as string)||typeof row.isShared!=='boolean'||row.ownership==='received'&&!row.isShared||!Number.isSafeInteger(row.itemCount)||Number(row.itemCount)<0||
   !Array.isArray(row.labelIds)||row.labelIds.length>1000||row.labelIds.some(id=>!copyUuid(id))||new Set(row.labelIds.map(id=>id.toLowerCase())).size!==row.labelIds.length)return null;
  ids.add(row.id.toLowerCase());collections.push({...row,id:row.id.toLowerCase(),labelIds:row.labelIds.map(id=>id.toLowerCase())} as PersonalCollection);
 }
 const nextCursor=value.nextCursor===null?null:parseReceivedCatalogCursor(value.nextCursor);
 if(value.nextCursor!==null&&(!nextCursor||collections.length!==limit||nextCursor.id!==collections.at(-1)?.id))return null;
 return new TextEncoder().encode(JSON.stringify(value)).byteLength<=1024*1024?{revision:Number(value.revision),collections,nextCursor}:null;
}
