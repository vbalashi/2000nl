'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {createShareIntent,executeShareIntent,reconcileShareIntent,type ShareIntent} from '@/lib/collections/sharing/shareCommandClient';
import {readUnsubscribeJournal,retainUnsubscribeJournal,clearUnsubscribeJournal,tabUnsubscribeStore} from '@/lib/collections/sharing/unsubscribeJournal';
import type {ShareCommandReceipt} from '@/lib/collections/sharing/shareCommandContract';
type State={key:string;status:'ready'|'storage-error'}|{key:string;status:'saving'|'uncertain';intent:ShareIntent}|{key:string;status:'committed';receipt:Exclude<ShareCommandReceipt,{status:'unknown'|'rejected'}>};
/** One mounted action owns its immutable intent until confirmation; no automatic retry. */
export function useUnsubscribeCollection(userId:string,collectionId:string){
 const key=JSON.stringify([userId,collectionId]);
 const scope=useRef({key,userId,collectionId});scope.current={key,userId,collectionId};
 const [state,setState]=useState<State>({key,status:'ready'});
 const latest=useRef(state);latest.current=state;
 const controller=useRef<AbortController|null>(null);
 const locked=useRef(false);
 useEffect(()=>{locked.current=false;return()=>{controller.current?.abort();};},[key]);
 const run=useCallback(async(mode:'start'|'check'|'retry')=>{
  const current=scope.current,base=latest.current;
  if(locked.current||base.key!==current.key|| (mode==='start'?!['ready','storage-error'].includes(base.status):base.status!=='uncertain'))return;
  const intent='intent'in base?base.intent:createShareIntent(current.userId,{operationId:crypto.randomUUID(),action:'unsubscribe',collectionId:current.collectionId});
  if(mode!=='check'&&!retainUnsubscribeJournal(tabUnsubscribeStore(),intent)){const next:State='intent'in base?{key:current.key,status:'uncertain',intent}:{key:current.key,status:'storage-error'};latest.current=next;setState(next);return;}
  locked.current=true;const abort=new AbortController();controller.current=abort;
  const commit=(next:State)=>{latest.current=next;setState(next);};
  const valid=()=>!abort.signal.aborted&&scope.current.key===current.key;
  commit({key:current.key,status:'saving',intent});
  try{
   const result=await(mode==='check'?reconcileShareIntent:executeShareIntent)(intent,abort.signal);
   if(valid()&&result.state==='committed')clearUnsubscribeJournal(tabUnsubscribeStore(),intent);
   if(valid())commit(result.state==='committed'?{key:current.key,status:'committed',receipt:result.receipt}:{key:current.key,status:'uncertain',intent});
  }catch{if(valid())commit({key:current.key,status:'uncertain',intent});}
  finally{if(controller.current===abort)locked.current=false;}
 },[]);
 // A changed principal/resource starts a new action scope without exposing old state.
 useEffect(()=>{const restored=readUnsubscribeJournal(tabUnsubscribeStore(),userId);const next:State=restored&&'collectionId'in restored.command&&restored.command.collectionId===collectionId?{key,status:'uncertain',intent:restored}:{key,status:'ready'};latest.current=next;setState(next);},[key,userId,collectionId]);
 return {state:state.key===key?state:{key,status:'ready' as const},start:()=>run('start'),check:()=>run('check'),retry:()=>run('retry')};
}
