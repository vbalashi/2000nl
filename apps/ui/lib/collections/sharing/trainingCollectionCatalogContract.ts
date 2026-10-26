import {copyUuid} from '@/lib/platform/independentEntryCopyContract';
import {parseReceivedCatalogCursor,type ReceivedCatalogCursor} from './receivedCatalogContract';
export type TrainingCollection={id:string;name:string;ownership:'owned'|'received';availableItemCount:number};
export type TrainingCollectionPage={collections:TrainingCollection[];nextCursor:ReceivedCatalogCursor|null};
const object=(value:unknown):value is Record<string,unknown>=>Boolean(value)&&typeof value==='object'&&!Array.isArray(value);
export function parseTrainingCollections(value:unknown,limit:number):TrainingCollection[]|null{
 if(!Array.isArray(value)||value.length>limit)return null;const ids=new Set<string>(),rows:TrainingCollection[]=[];
 for(const row of value){
  if(!object(row)||Object.keys(row).length!==4||!copyUuid(row.id)||ids.has(row.id.toLowerCase())||typeof row.name!=='string'||[...row.name].length>1000||row.name.includes('\0')||[...row.name].some(char=>{const point=char.codePointAt(0)!;return point>=0xd800&&point<=0xdfff;})||!['owned','received'].includes(String(row.ownership))||!Number.isSafeInteger(row.availableItemCount)||Number(row.availableItemCount)<0||row.ownership==='received'&&row.availableItemCount===0)return null;
  ids.add(row.id.toLowerCase());rows.push({...row,id:row.id.toLowerCase()} as TrainingCollection);
 }return rows;
}
export function parseTrainingCollectionPage(value:unknown,limit:number):TrainingCollectionPage|null{
 if(!object(value)||Object.keys(value).length!==2||!Object.hasOwn(value,'collections')||!Object.hasOwn(value,'nextCursor'))return null;
 const collections=parseTrainingCollections(value.collections,limit),cursor=value.nextCursor===null?null:parseReceivedCatalogCursor(value.nextCursor);
 if(!collections||value.nextCursor!==null&&(!cursor||collections.length!==limit||cursor.id!==collections.at(-1)?.id))return null;
 return {collections,nextCursor:cursor};
}
