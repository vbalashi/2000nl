import {copyUuid} from '@/lib/platform/independentEntryCopyContract';
import type {CollectionSourceDetails} from './model';
export type DetailsRecord={id:string;name:string;description:string|null;source:CollectionSourceDetails|null;revision:string;isOwner:boolean};
const object=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const nullableText=(v:unknown):v is string|null=>v===null||typeof v==='string'&&v.length<=2048;
export function parseDetailsRecord(v:unknown):DetailsRecord|null {
 if(!object(v)||Object.keys(v).sort().join(',')!=='description,id,isOwner,name,revision,source'||!copyUuid(v.id)||typeof v.name!=='string'||!v.name.trim()||!(v.description===null||typeof v.description==='string')||typeof v.revision!=='string'||!/^\d{1,19}$/.test(v.revision)||typeof v.isOwner!=='boolean')return null;
 if(v.source!==null&&!object(v.source))return null;
 const input=v.source as Record<string,unknown>|null;
 const keys=['materialKind','originKind','materialTitle','creatorName','url','fileName','publishedOn'] as const;
 if(input&&Object.keys(input).some(k=>!keys.includes(k as typeof keys[number])))return null;
 const source=input?Object.fromEntries(keys.map(k=>[k,input[k]??null])) as CollectionSourceDetails:null;
 if(source&&(!keys.every(k=>nullableText(source[k]))||source.materialKind!==null&&!['video','article','text','book','other'].includes(source.materialKind)||source.originKind!==null&&!['youtube','web','local_file','manual','other'].includes(source.originKind)))return null;
 if(source?.publishedOn){const date=source.publishedOn;if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(Date.parse(`${date}T00:00:00Z`))||new Date(`${date}T00:00:00Z`).toISOString().slice(0,10)!==date)return null;}
 return {id:v.id.toLowerCase(),name:v.name,description:v.description,source,revision:v.revision,isOwner:v.isOwner};
}
