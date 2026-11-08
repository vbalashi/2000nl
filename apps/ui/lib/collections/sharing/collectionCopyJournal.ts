import {parseCollectionCopyCommand,type CollectionCopyCommand} from './collectionBorrowedCopyClient';
type Store=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
export const collectionCopyJournalKey=(userId:string)=>'2000nl.pending-collection-copy.v1.'+encodeURIComponent(userId);
export function readCollectionCopyJournal(store:Store,userId:string):CollectionCopyCommand|null{
 try{
  const raw=store.getItem(collectionCopyJournalKey(userId));if(!raw||raw.length>512)return null;
  const value=JSON.parse(raw);
  return value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===2&&value.userId===userId?parseCollectionCopyCommand(value.command):null;
 }catch{return null;}
}
export function retainCollectionCopyJournal(store:Store,userId:string,command:CollectionCopyCommand):boolean{
 const parsed=parseCollectionCopyCommand(command);if(!parsed)return false;
 try{
  const raw=store.getItem(collectionCopyJournalKey(userId));
  if(raw&&JSON.stringify(readCollectionCopyJournal(store,userId))!==JSON.stringify(parsed))return false;
  const value=JSON.stringify({userId,command:parsed});store.setItem(collectionCopyJournalKey(userId),value);
  return store.getItem(collectionCopyJournalKey(userId))===value;
 }catch{return false;}
}
export function clearCollectionCopyJournal(store:Store,userId:string,command:CollectionCopyCommand):void{
 try{if(JSON.stringify(readCollectionCopyJournal(store,userId))===JSON.stringify(command))store.removeItem(collectionCopyJournalKey(userId));}catch{/* Retained identity remains safe to check. */}
}
