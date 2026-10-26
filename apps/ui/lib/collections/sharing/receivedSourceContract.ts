import {copyUuid} from '@/lib/platform/independentEntryCopyContract';

export type ReceivedSource={id:string;name:string;createdAt:string};
export function parseReceivedSource(value:unknown,id:string):ReceivedSource|null{
 if(!value||typeof value!=='object'||Array.isArray(value))return null;
 const row=value as Record<string,unknown>;
 if(Object.keys(row).length!==3||!['id','name','createdAt'].every(key=>Object.hasOwn(row,key))||
  !copyUuid(row.id)||row.id.toLowerCase()!==id.toLowerCase()||typeof row.name!=='string'||[...row.name].length>1000||row.name.includes('\0')||
  typeof row.createdAt!=='string'||row.createdAt.length>40||
  !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/.test(row.createdAt)||!Number.isFinite(Date.parse(row.createdAt)))return null;
 return {id:row.id.toLowerCase(),name:row.name,createdAt:row.createdAt};
}
