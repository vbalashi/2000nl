import {MAX_LABELS,MAX_LABEL_ASSIGNMENTS} from '../labels/model';
import {parseSourceOwnership,type SourceOwnership} from './sourceOwnershipContract';
import {copyUuid} from '@/lib/platform/independentEntryCopyContract';
import {parseReceivedCatalogQuery,parseReceivedCatalogCursor,type ReceivedCatalogQuery,type ReceivedCatalogCursor} from './receivedCatalogContract';
export type PersonalCatalogQuery=Omit<ReceivedCatalogQuery,'scope'>&{scope:ReceivedCatalogQuery['scope']|'group';languageCode:string|null;ownership?:SourceOwnership};
export type PersonalCollection={id:string;name:string;createdAt:string;ownership:'owned'|'received';isShared:boolean;itemCount:number;labelIds:string[]};
export type ReceivedGroupLabel={id:string;parentId:string|null;name:string};
export type ReceivedGroupTree={revision:number;labels:ReceivedGroupLabel[];placements:Record<string,string[]>};
export type PersonalCatalogPage={revision:number;collections:PersonalCollection[];nextCursor:ReceivedCatalogCursor|null;groupTree?:ReceivedGroupTree};
const record=(v:unknown):v is Record<string,unknown>=>Boolean(v)&&typeof v==='object'&&!Array.isArray(v);
const exact=(v:Record<string,unknown>,keys:string[])=>Object.keys(v).length===keys.length&&Object.keys(v).every(k=>keys.includes(k));
const text=(v:unknown,max:number):v is string=>typeof v==='string'&&[...v].length<=max&&!v.includes('\0')&&![...v].some(c=>{const p=c.codePointAt(0)!;return p>=0xd800&&p<=0xdfff;});
export function parsePersonalCatalogQuery(value:unknown): (PersonalCatalogQuery&{ownership:SourceOwnership})|null{
 if(!record(value))return null;const {languageCode,ownership,...rest}=value;const kind=parseSourceOwnership(ownership);if(!kind)return null;
 if(languageCode!==null&&languageCode!==undefined&&(!text(languageCode,16)||!languageCode.trim()))return null;
 const group=rest.scope==='group';if(group&&!copyUuid(rest.labelId))return null;
 const query=parseReceivedCatalogQuery(group?{...rest,scope:'all',labelId:null}:rest);return query?{...query,...(group?{scope:'group' as const,labelId:String(rest.labelId).toLowerCase()}:{}),languageCode:typeof languageCode==='string'?languageCode.trim():null,ownership:kind}:null;
}
export function parsePersonalCatalogPage(value:unknown,limit:number,ownership:SourceOwnership='all',groupId?:string):PersonalCatalogPage|null{
 if(!Number.isInteger(limit)||limit<1||limit>100||!record(value)||!exact(value,groupId?['revision','collections','nextCursor','groupTree']:['revision','collections','nextCursor'])||!Number.isInteger(value.revision)||Number(value.revision)<0||Number(value.revision)>2147483646||!Array.isArray(value.collections)||value.collections.length>limit)return null;
 const ids=new Set<string>();const collections:PersonalCollection[]=[];
 for(const row of value.collections){
  if(!record(row)||!exact(row,['id','name','createdAt','ownership','isShared','itemCount','labelIds'])||!copyUuid(row.id)||ids.has(row.id.toLowerCase())||!text(row.name,1000)||
   typeof row.createdAt!=='string'||row.createdAt.length>40||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/.test(row.createdAt)||!Number.isFinite(Date.parse(row.createdAt))||
   !['owned','received'].includes(row.ownership as string)||(ownership!=='all'&&row.ownership!==ownership)||(groupId&&row.ownership!=='received')||typeof row.isShared!=='boolean'||row.ownership==='received'&&!row.isShared||!Number.isSafeInteger(row.itemCount)||Number(row.itemCount)<0||
   !Array.isArray(row.labelIds)||row.labelIds.length>1000||row.labelIds.some(id=>!copyUuid(id))||new Set(row.labelIds.map(id=>id.toLowerCase())).size!==row.labelIds.length)return null;
  ids.add(row.id.toLowerCase());collections.push({...row,id:row.id.toLowerCase(),labelIds:row.labelIds.map(id=>id.toLowerCase())} as PersonalCollection);
 }
 const nextCursor=value.nextCursor===null?null:parseReceivedCatalogCursor(value.nextCursor);
 if(value.nextCursor!==null&&(!nextCursor||collections.length!==limit||nextCursor.id!==collections.at(-1)?.id))return null;
 const groupTree=groupId?parseGroupTree(value.groupTree,groupId,ids):null;
 if(groupId&&!groupTree)return null;
 return new TextEncoder().encode(JSON.stringify(value)).byteLength<=1024*1024?{revision:Number(value.revision),collections,nextCursor,...(groupTree?{groupTree}:{})}:null;
}


function parseGroupTree(value:unknown,groupId:string,collectionIds:Set<string>):ReceivedGroupTree|null{
 if(!record(value)||!exact(value,['revision','labels','placements'])||!Number.isInteger(value.revision)||Number(value.revision)<0||
  Number(value.revision)>2147483646||!Array.isArray(value.labels)||value.labels.length>MAX_LABELS||!record(value.placements))return null;
 const labels=new Map<string,ReceivedGroupLabel>();
 for(const label of value.labels){
  if(!record(label)||!exact(label,['id','parentId','name'])||!copyUuid(label.id)||
   !(label.id===groupId?label.parentId===null:copyUuid(label.parentId))||!text(label.name,100)||!label.name.trim()||labels.has(label.id))return null;
  labels.set(label.id,{id:label.id,parentId:label.parentId as string|null,name:label.name});
 }
 for(const label of labels.values()){
  let ancestor=label;
  for(let depth=1;ancestor.id!==groupId;depth++){
   const parent=ancestor.parentId&&labels.get(ancestor.parentId);
   if(!parent||depth>=16)return null;
   ancestor=parent;
  }
 }
 const placements:Record<string,string[]>={};
 const usedLabels=new Set<string>();
 let assignmentCount=0;
 for(const [id,assigned] of Object.entries(value.placements)){
  if(!collectionIds.has(id)||!Array.isArray(assigned)||!assigned.length||assigned.length>MAX_LABELS||
   !assigned.every(label=>typeof label==='string'&&labels.has(label))||new Set(assigned).size!==assigned.length)return null;
  assignmentCount+=assigned.length;
  if(assignmentCount>MAX_LABEL_ASSIGNMENTS)return null;
  placements[id]=assigned;
  for(const label of assigned){
   let ancestor:string|null=label;
   while(ancestor&&!usedLabels.has(ancestor)){
    usedLabels.add(ancestor);
    ancestor=labels.get(ancestor)?.parentId??null;
   }
  }
 }
 if(Object.keys(placements).length!==collectionIds.size||usedLabels.size!==labels.size)return null;
 return {revision:Number(value.revision),labels:[...labels.values()],placements};
}
