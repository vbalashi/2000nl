'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {createShareIntent,executeShareIntent,reconcileShareIntent,type ShareIntent} from '@/lib/collections/sharing/shareCommandClient';
import {readCollectionShareManagement} from '@/lib/collections/sharing/shareManagementClient';
import type {CollectionShareManagement} from '@/lib/collections/sharing/shareManagementContract';
import {readOwnerShareJournal,retainOwnerShareJournal,clearOwnerShareJournal,ownerShareStore} from '@/lib/collections/sharing/ownerShareJournal';
import {useUserEventHints} from '@/lib/events/userEventHints';
type State={key:string;status:'loading'|'error';data:null}|{key:string;status:'ready'|'storage-error';data:CollectionShareManagement}|{key:string;status:'saving'|'uncertain';data:null;intent:ShareIntent};
export function useOwnedCollectionSharing(userId:string,collectionId:string){
 const key=JSON.stringify([userId,collectionId]);const scope=useRef({key,userId,collectionId});scope.current={key,userId,collectionId};
 const [state,setState]=useState<State>({key,status:'loading',data:null});const latest=useRef(state);
 const [rejection,setRejection]=useState<{key:string;reason:string}|null>(null);
 const controller=useRef<AbortController|null>(null),locked=useRef(false);
 const commit=useCallback((next:State)=>{latest.current=next;setState(next);},[]);
 const refresh=useCallback(async()=>{
  const current=scope.current,base=latest.current;if(locked.current||base.key===current.key&&['saving','uncertain'].includes(base.status))return;
  controller.current?.abort();const abort=new AbortController();controller.current=abort;
  commit({key:current.key,status:'loading',data:null});
  try{const data=await readCollectionShareManagement(current.userId,current.collectionId,abort.signal);if(!abort.signal.aborted&&scope.current.key===current.key)commit({key:current.key,status:'ready',data});}
  catch{if(!abort.signal.aborted&&scope.current.key===current.key)commit({key:current.key,status:'error',data:null});}
 },[commit]);
 useEffect(()=>{
  locked.current=false;setRejection(null);const intent=readOwnerShareJournal(ownerShareStore(),userId);
  if(intent&&'collectionId'in intent.command&&intent.command.collectionId===collectionId)commit({key,status:'uncertain',data:null,intent});
  else{commit({key,status:'loading',data:null});void refresh();}
  return()=>{controller.current?.abort();};
 },[key,userId,collectionId,commit,refresh]);
 useUserEventHints(userId,['collections.changed'],refresh);
 useEffect(()=>{const focus=()=>void refresh();window.addEventListener('focus',focus);return()=>window.removeEventListener('focus',focus);},[refresh]);
 const run=useCallback(async(action:'open'|'rotate'|'close'|'check'|'retry')=>{
  const current=scope.current,base=latest.current;if(locked.current||base.key!==current.key)return;
  const recovering=action==='check'||action==='retry';
  if(recovering?base.status!=='uncertain':!['ready','storage-error'].includes(base.status))return;
  if(!recovering&&base.data&&(action==='open'?base.data.isOpen:!base.data.isOpen))return;
  let intent:ShareIntent|null;
  try{intent='intent'in base?base.intent:base.data?createShareIntent(current.userId,{operationId:crypto.randomUUID(),action:action as 'open'|'rotate'|'close',collectionId:current.collectionId,expectedRevision:base.data.revision}):null;}
  catch{commit({key:current.key,status:'error',data:null});return;}
  if(!intent)return;
  if(action!=='check'&&!retainOwnerShareJournal(ownerShareStore(),intent)){
   if('intent'in base)commit({...base,status:'uncertain'});else if(base.data)commit({key:current.key,status:'storage-error',data:base.data});return;
  }
  setRejection(null);locked.current=true;controller.current?.abort();const abort=new AbortController();controller.current=abort;
  const valid=()=>!abort.signal.aborted&&scope.current.key===current.key;
  commit({key:current.key,status:'saving',data:null,intent});
  try{
   const result=await(action==='check'?reconcileShareIntent:executeShareIntent)(intent,abort.signal);if(!valid())return;
   if(result.state==='committed'||result.state==='rejected'){
    if(result.state==='rejected')setRejection({key:current.key,reason:result.receipt.reason});
    clearOwnerShareJournal(ownerShareStore(),intent);
    // Fresh projection owns subscriber counts and current code, not the old command acknowledgement.
    commit({key:current.key,status:'loading',data:null});locked.current=false;await refresh();
   }else commit({key:current.key,status:'uncertain',data:null,intent});
  }catch{if(valid())commit({key:current.key,status:'uncertain',data:null,intent});}
  finally{if(controller.current===abort)locked.current=false;}
 },[commit,refresh]);
 return {rejection:rejection?.key===key?rejection.reason:null,state:state.key===key?state:{key,status:'loading' as const,data:null},refresh,run};
}
