import {copyUuid} from '@/lib/platform/independentEntryCopyContract';
type Store=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
export type LabelCreateIntent={userId:string;scope:string;id:string;name:string;baseRevision:number;planId:string|null};
const key=(userId:string,scope:string)=>'2000nl.pending-label-create.v1.'+encodeURIComponent(userId)+'.'+encodeURIComponent(scope);
export function readLabelCreate(store:Store,userId:string,scope:string):LabelCreateIntent|null{
 try{const raw=store.getItem(key(userId,scope));if(!raw||raw.length>2048)return null;const v=JSON.parse(raw);return v&&v.userId===userId&&v.scope===scope&&copyUuid(v.id)&&typeof v.name==='string'&&v.name.trim()&&Array.from(v.name).length<=100&&Number.isSafeInteger(v.baseRevision)&&v.baseRevision>=0&&(v.planId===null||copyUuid(v.planId))?v:null;}catch{return null;}
}
export function retainLabelCreate(store:Store,intent:LabelCreateIntent):boolean{
 try{const previous=readLabelCreate(store,intent.userId,intent.scope);if(previous&&(previous.id!==intent.id||previous.name!==intent.name||previous.baseRevision!==intent.baseRevision||previous.planId&&previous.planId!==intent.planId))return false;const data=JSON.stringify(intent);store.setItem(key(intent.userId,intent.scope),data);return store.getItem(key(intent.userId,intent.scope))===data;}catch{return false;}
}
export function clearLabelCreate(store:Store,intent:LabelCreateIntent){try{if(readLabelCreate(store,intent.userId,intent.scope)?.id===intent.id)store.removeItem(key(intent.userId,intent.scope));}catch{/* Reconcile the retained identity again. */}}
