import {parseShareCommand} from './shareCommandContract';
import {createShareIntent,type ShareIntent} from './shareCommandClient';
type Store=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
export function createShareIntentJournal(prefix:string,action:'unsubscribe'|'accept'|'owner'){
const key=(userId:string)=>prefix+encodeURIComponent(userId);
/** Canonical command only: never retain article text, preview metadata or display names. */
function read(store:Store,userId:string):ShareIntent|null{
 try{
  const raw=store.getItem(key(userId));if(!raw)return null;
  if(raw.length>1024)return null;
  const value=JSON.parse(raw);
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==2||value.userId!==userId)return null;
  const command=parseShareCommand(value.command);
  if(!command||(action==='owner'?!['open','rotate','close'].includes(command.action):command.action!==action))return null;
  return createShareIntent(userId,command);
 }catch{return null;}
}
/** A different unresolved operation must never be overwritten. Persist before sending. */
function retain(store:Store,intent:ShareIntent):boolean{
 const command=parseShareCommand(intent.command);
 if(!intent.userId||intent.userId.length>100||!command||(action==='owner'?!['open','rotate','close'].includes(command.action):command.action!==action)||JSON.stringify(command)!==JSON.stringify(intent.command))return false;
 try{
  const previous=store.getItem(key(intent.userId));
  const serialized=JSON.stringify(intent);
  if(previous){const existing=read(store,intent.userId);if(!existing||JSON.stringify(existing)!==serialized)return false;}
  store.setItem(key(intent.userId),serialized);
  return store.getItem(key(intent.userId))===serialized;
 }catch{return false;}
}
function clear(store:Store,intent:ShareIntent):void{
 try{const existing=read(store,intent.userId);if(existing&&JSON.stringify(existing)===JSON.stringify(intent))store.removeItem(key(intent.userId));}catch{/* Retain on uncertain cleanup; reconciliation remains safe. */}
}
return {read,retain,clear};
}
export function tabShareIntentStore():Store{
 return {getItem:k=>window.sessionStorage.getItem(k),setItem:(k,v)=>window.sessionStorage.setItem(k,v),removeItem:k=>window.sessionStorage.removeItem(k)};
}
