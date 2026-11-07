import {copyUuid} from '@/lib/platform/independentEntryCopyContract';
import type {CollectionCompositionOperation} from './collectionCompositionContract';

type Store=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
export type CompositionIntent={userId:string;collectionId:string;planId:string;action:CollectionCompositionOperation['action']};
export const collectionCompositionJournalKey=(userId:string,collectionId:string)=>`2000nl.pending-collection-composition.v1.${encodeURIComponent(userId)}.${encodeURIComponent(collectionId)}`;
export function readCollectionCompositionJournal(store:Store,userId:string,collectionId:string):CompositionIntent|null{
 try{
  const raw=store.getItem(collectionCompositionJournalKey(userId,collectionId));if(!raw||raw.length>512)return null;
  const value:unknown=JSON.parse(raw);
  if(!value||typeof value!=='object'||Array.isArray(value))return null;
  const row=value as Record<string,unknown>;
  return Object.keys(row).length===4&&row.userId===userId&&row.collectionId===collectionId&&copyUuid(row.planId)&&['add','remove','delete'].includes(String(row.action))?row as CompositionIntent:null;
 }catch{return null;}
}
/** Consent is recorded before the first write, and cannot replace an unresolved intent. */
export function retainCollectionCompositionJournal(store:Store,intent:CompositionIntent):boolean{
 if(!copyUuid(intent.collectionId)||!copyUuid(intent.planId))return false;
 try{
  const key=collectionCompositionJournalKey(intent.userId,intent.collectionId),previous=store.getItem(key);
  const existing=readCollectionCompositionJournal(store,intent.userId,intent.collectionId);
  if(previous&&(!existing||existing.planId!==intent.planId||existing.action!==intent.action))return false;
  const raw=JSON.stringify(intent);store.setItem(key,raw);return store.getItem(key)===raw;
 }catch{return false;}
}
export function clearCollectionCompositionJournal(store:Store,intent:CompositionIntent):void{
 try{
  const existing=readCollectionCompositionJournal(store,intent.userId,intent.collectionId);
  if(existing?.planId===intent.planId&&existing.action===intent.action)store.removeItem(collectionCompositionJournalKey(intent.userId,intent.collectionId));
 }catch{/* A retained intent can be checked again without executing it. */}
}
