import {copyUuid} from '@/lib/platform/independentEntryCopyContract';
export function parseSelectedMembership(value:unknown,id:string,requested:string[]):string[]|null{
 if(!value||typeof value!=='object'||Array.isArray(value))return null;
 const row=value as Record<string,unknown>,allowed=new Set(requested.map(id=>id.toLowerCase()));
 if(Object.keys(row).length!==2||row.collectionId!==id.toLowerCase()||!Array.isArray(row.includedEntryIds)||row.includedEntryIds.length>requested.length)return null;
 const ids=row.includedEntryIds;
 if(!ids.every((id):id is string=>copyUuid(id)&&allowed.has(id.toLowerCase()))||new Set(ids.map(id=>id.toLowerCase())).size!==ids.length)return null;
 return ids.map(id=>id.toLowerCase());
}
