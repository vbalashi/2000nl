import {copyUuid} from '@/lib/platform/independentEntryCopyContract';

type Store=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
export const labelOrganizationJournalKey=(userId:string)=>'2000nl.pending-label-organization.v1.'+encodeURIComponent(userId);
export function readLabelOrganizationJournal(store:Store,userId:string):string|null{
 try{
  const raw=store.getItem(labelOrganizationJournalKey(userId));if(!raw||raw.length>256)return null;
  const value=JSON.parse(raw);
  return value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===2&&value.userId===userId&&copyUuid(value.planId)?value.planId:null;
 }catch{return null;}
}
/** Retain only after Save has been explicitly confirmed, never during preview. */
export function retainLabelOrganizationJournal(store:Store,userId:string,planId:string):boolean{
 if(!copyUuid(planId))return false;
 try{
  const previous=store.getItem(labelOrganizationJournalKey(userId));
  if(previous&&readLabelOrganizationJournal(store,userId)!==planId)return false;
  const serialized=JSON.stringify({userId,planId});store.setItem(labelOrganizationJournalKey(userId),serialized);
  return store.getItem(labelOrganizationJournalKey(userId))===serialized;
 }catch{return false;}
}
export function clearLabelOrganizationJournal(store:Store,userId:string,planId:string):void{
 try{if(readLabelOrganizationJournal(store,userId)===planId)store.removeItem(labelOrganizationJournalKey(userId));}catch{/* Rechecking a retained plan is safe. */}
}
