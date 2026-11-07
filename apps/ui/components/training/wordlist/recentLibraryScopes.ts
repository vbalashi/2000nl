import type { LibraryEntryFilters } from '@/lib/platform/librarySearchScope';
import { parseLibraryEntryFilters } from '@/lib/platform/librarySearchScope';
import type { DictionarySearchCategory } from '@/lib/platform/dictionaryCategorySearch';

export type RecentLibraryScope={query:string;languageCode:string;dictionaryId:string|null;collectionId:string|null;collectionOwnership:'owned'|'received'|null;labelId:string|null;labelName:string|null;sourceName:string;filters:LibraryEntryFilters;category:DictionarySearchCategory};
const stringOrNull=(value:unknown):value is string|null=>value===null||(typeof value==='string'&&value.length<=200);
export function parseRecentLibraryScopes(raw:string|null):RecentLibraryScope[]{
 try {
  const parsed:unknown=JSON.parse(raw ?? '[]');if(!Array.isArray(parsed))return [];
  return parsed.flatMap((value):RecentLibraryScope[]=>{
   if(!value||typeof value!=='object'||Array.isArray(value))return [];
   const item=value as Record<string,unknown>,filters=parseLibraryEntryFilters(item.filters);
   if(!filters||typeof item.query!=='string'||item.query.length>200||typeof item.languageCode!=='string'||!item.languageCode.match(/^[a-z]{2,3}(-[a-z0-9]{2,8})*$/)||
    !stringOrNull(item.dictionaryId)||!stringOrNull(item.collectionId)||!stringOrNull(item.labelId)||!stringOrNull(item.labelName)||
    !['owned','received',null].includes(item.collectionOwnership as 'owned'|'received'|null)||typeof item.sourceName!=='string'||item.sourceName.length>200||
    !['headwords','examples','definitions','alphabetical'].includes(item.category as string))return [];
   if(Number(Boolean(item.dictionaryId))+Number(Boolean(item.collectionId))+Number(Boolean(item.labelId))>1)return [];
   return [{query:item.query,languageCode:item.languageCode,dictionaryId:item.dictionaryId,collectionId:item.collectionId,collectionOwnership:item.collectionOwnership as RecentLibraryScope['collectionOwnership'],labelId:item.labelId,labelName:item.labelName,sourceName:item.sourceName,filters,category:item.category as DictionarySearchCategory}];
  }).slice(0,6);
 } catch{return [];}
}
export function recentLibraryScopeKey(scope:RecentLibraryScope):string{
 return JSON.stringify([scope.query.trim(),scope.languageCode,scope.dictionaryId,scope.collectionId,scope.collectionOwnership,scope.labelId,scope.filters,scope.category]);
}
export function rememberLibraryScope(items:RecentLibraryScope[],scope:RecentLibraryScope):RecentLibraryScope[]{
 const key=recentLibraryScopeKey(scope);return [scope,...items.filter(item=>recentLibraryScopeKey(item)!==key)].slice(0,6);
}
