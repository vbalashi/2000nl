import {copyUuid} from '@/lib/platform/independentEntryCopyContract';
const record=(value:unknown):value is Record<string,unknown>=>Boolean(value)&&typeof value==='object'&&!Array.isArray(value);
const exact=(value:Record<string,unknown>,keys:string[])=>Object.keys(value).length===keys.length&&Object.keys(value).every(key=>keys.includes(key));
export function parsePublicationBadgeRequest(value:unknown):string[]|null{
 if(!record(value)||!exact(value,['ids'])||!Array.isArray(value.ids)||value.ids.length>100||value.ids.some(id=>!copyUuid(id)))return null;
 const ids=value.ids.map((id:string)=>id.toLowerCase());return new Set(ids).size===ids.length?ids:null;
}
export function parsePublicationBadges(value:unknown,requested:string[]):string[]|null{
 if(!record(value)||!exact(value,['openIds'])||!Array.isArray(value.openIds)||value.openIds.length>requested.length||value.openIds.some(id=>!copyUuid(id)))return null;
 const allowed=new Set(requested.map(id=>id.toLowerCase()));const ids=value.openIds.map((id:string)=>id.toLowerCase());
 return ids.every(id=>allowed.has(id))&&new Set(ids).size===ids.length?ids:null;
}
