import {createLabelShareIntent,type LabelShareIntent} from './labelSharingClient';
import {parseLabelShareCommand} from './labelSharingContract';

type Store=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
const key=(userId:string,scope:string)=>'2000nl.pending-label-share.v1.'+encodeURIComponent(userId)+'.'+encodeURIComponent(scope);
export const labelSharingJournalKey=key;

/** Only command identity is retained, so a lost response can be reconciled after reopening. */
export function readLabelSharingJournal(store:Store,userId:string,scope:string):LabelShareIntent|null{
 try{
  const raw=store.getItem(key(userId,scope));
  if(!raw||raw.length>1024)return null;
  const value:unknown=JSON.parse(raw);
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==2)return null;
  const record=value as {userId?:unknown;command?:unknown};
  const command=parseLabelShareCommand(record.command);
  return record.userId===userId&&command?createLabelShareIntent(userId,command):null;
 }catch{return null;}
}

export function retainLabelSharingJournal(store:Store,scope:string,intent:LabelShareIntent):boolean{
 try{
  const canonical=createLabelShareIntent(intent.userId,intent.command),serialized=JSON.stringify(canonical);
  const previous=store.getItem(key(intent.userId,scope));
  if(previous&&JSON.stringify(readLabelSharingJournal(store,intent.userId,scope))!==serialized)return false;
  store.setItem(key(intent.userId,scope),serialized);
  return store.getItem(key(intent.userId,scope))===serialized;
 }catch{return false;}
}

export function clearLabelSharingJournal(store:Store,scope:string,intent:LabelShareIntent):void{
 try{
  if(JSON.stringify(readLabelSharingJournal(store,intent.userId,scope))===JSON.stringify(intent))store.removeItem(key(intent.userId,scope));
 }catch{/* A retained command can safely be reconciled again. */}
}

export {tabShareIntentStore as labelSharingStore} from './shareIntentJournal';
