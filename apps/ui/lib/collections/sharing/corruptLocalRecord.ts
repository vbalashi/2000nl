export type LocalStore=Pick<Storage,'getItem'|'removeItem'>;
export type CorruptRecord={kind:'corrupt';snapshot:string}|{kind:'empty'|'valid'|'unavailable'};
/** Untrusted recovery bytes stay in this tab; never expose them in text or telemetry. */
export function inspectLocalRecord(store:LocalStore,key:string,valid:(raw:string)=>boolean):CorruptRecord{
 try{const raw=store.getItem(key);if(raw===null)return {kind:'empty'};return valid(raw)?{kind:'valid'}:{kind:'corrupt',snapshot:raw};}catch{return {kind:'unavailable'};}
}
/** Explicit local-only compare-and-clear. Never erase a newly valid or replaced intent. */
export function clearCorruptLocalRecord(store:LocalStore,key:string,snapshot:string,valid:(raw:string)=>boolean):boolean{
 try{if(store.getItem(key)!==snapshot||valid(snapshot))return false;store.removeItem(key);return store.getItem(key)===null;}catch{return false;}
}

export const localRecordSnapshotStore=(raw:string)=>({getItem:()=>raw,setItem:()=>{},removeItem:()=>{}});
