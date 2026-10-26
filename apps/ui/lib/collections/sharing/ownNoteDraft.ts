import {copyUuid} from '@/lib/platform/independentEntryCopyContract';
import {noteRevision,noteText} from './noteContract';
export type OwnNoteDraft={userId:string;entryId:string;revision:string;baseNotes:string|null;draft:string;sent:boolean};
type Store=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
const key=(userId:string,entryId:string)=>'2000nl.own-note-draft.v1.'+encodeURIComponent(userId)+'.'+entryId;
export const noteDraftStore=():Store=>({getItem:k=>window.sessionStorage.getItem(k),setItem:(k,v)=>window.sessionStorage.setItem(k,v),removeItem:k=>window.sessionStorage.removeItem(k)});
function parse(value:unknown,userId:string,entryId:string):OwnNoteDraft|null{
 if(!value||typeof value!=='object'||Array.isArray(value))return null;
 const v=value as Record<string,unknown>;
 return Object.keys(v).length===6&&v.userId===userId&&v.entryId===entryId&&copyUuid(entryId)&&noteRevision(v.revision)&&noteText(v.baseNotes)&&typeof v.draft==='string'&&noteText(v.draft)&&typeof v.sent==='boolean'?v as OwnNoteDraft:null;
}
export function readOwnNoteDraft(store:Store,userId:string,entryId:string):OwnNoteDraft|null{
 try{const raw=store.getItem(key(userId,entryId));return raw&&raw.length<=2*1024*1024?parse(JSON.parse(raw),userId,entryId):null;}catch{return null;}
}
export function retainOwnNoteDraft(store:Store,value:OwnNoteDraft,settled?:OwnNoteDraft):boolean{
 if(!parse(value,value.userId,value.entryId))return false;
 try{const raw=store.getItem(key(value.userId,value.entryId));const existing=readOwnNoteDraft(store,value.userId,value.entryId);if(raw&&!existing)return false;if(existing?.sent&&JSON.stringify(existing)!==JSON.stringify(value)&&JSON.stringify(existing)!==JSON.stringify(settled))return false;const text=JSON.stringify(value);store.setItem(key(value.userId,value.entryId),text);return store.getItem(key(value.userId,value.entryId))===text;}catch{return false;}
}
export function clearOwnNoteDraft(store:Store,value:OwnNoteDraft):void{
 try{if(JSON.stringify(readOwnNoteDraft(store,value.userId,value.entryId))===JSON.stringify(value))store.removeItem(key(value.userId,value.entryId));}catch{/* Keep recoverable data when cleanup fails. */}
}
