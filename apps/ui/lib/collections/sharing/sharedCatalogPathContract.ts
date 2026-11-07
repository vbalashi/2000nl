import {copyUuid} from '@/lib/platform/independentEntryCopyContract';
export type SharedCatalogGroup={labelId:string;name:string};
export function parseSharedCatalogGroups(value:unknown):SharedCatalogGroup[]|null{
 if(!Array.isArray(value)||value.length>1000)return null;
 let previous='';
 for(const row of value){
  if(!row||typeof row!=='object'||Array.isArray(row)||Object.keys(row).sort().join(',')!=='labelId,name'
   ||!copyUuid(row.labelId)||row.labelId!==row.labelId.toLowerCase()||row.labelId<=previous
   ||typeof row.name!=='string'||!row.name.length||[...row.name].length>1000||row.name.includes('\0')
   ||[...row.name].some(c=>{const point=c.codePointAt(0)!;return point>=0xd800&&point<=0xdfff;}))return null;
  previous=row.labelId;
 }
 return value as SharedCatalogGroup[];
}
