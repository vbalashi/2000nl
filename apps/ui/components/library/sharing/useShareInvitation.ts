'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {createShareIntent,executeShareIntent,previewCollectionShare,reconcileShareIntent,type ShareIntent} from '@/lib/collections/sharing/shareCommandClient';
import type {SharePreview} from '@/lib/collections/sharing/shareCommandContract';
import {readAcceptJournal,retainAcceptJournal,clearAcceptJournal,tabAcceptStore} from '@/lib/collections/sharing/acceptJournal';
import {isCanonicalShareCode} from '@/lib/collections/sharing/shareCode';

type State =
 | {status:'loading';key:string}
 | {status:'unavailable';key:string}
 | {status:'error';key:string}
 | {status:'ready'|'storage-error';key:string;preview:SharePreview}
 | {status:'saving'|'uncertain';key:string;preview:SharePreview|null;intent:ShareIntent}
 | {status:'accepted';key:string;collectionId:string;available:boolean;name:string;entryCount:number};

/** Preview is never acceptance. Account/code changes synchronously hide the old projection. */
export function useShareInvitation(userId:string,code:string){
 const key=JSON.stringify([userId,code]);
 const current=useRef({key,userId,code});current.current={key,userId,code};
 const [state,setState]=useState<State>({status:'loading',key});
 const latest=useRef(state);
 const controller=useRef<AbortController|null>(null);
 const generation=useRef(0);
 const busy=useRef(false);
 const commit=useCallback((next:State)=>{latest.current=next;setState(next);},[]);
 const preview=useCallback(async()=>{
  const scope=current.current;
  // Reloading metadata must not erase an uncertain mutation's identity.
  if(latest.current.key===scope.key&&['saving','uncertain','accepted'].includes(latest.current.status))return;
  const restored=readAcceptJournal(tabAcceptStore(),scope.userId);
  if(restored&&restored.command.action==='accept'&&restored.command.code===scope.code){commit({status:'uncertain',key:scope.key,preview:null,intent:restored});return;}
  controller.current?.abort();const request=++generation.current;
  const abort=new AbortController();controller.current=abort;
  commit({status:'loading',key:scope.key});
  const valid=()=>!abort.signal.aborted&&generation.current===request&&current.current.key===scope.key;
  try{
   if(!scope.userId||!isCanonicalShareCode(scope.code))throw new Error('invalid_share_request');
   const result=await previewCollectionShare(scope.userId,scope.code,abort.signal);
   if(valid())commit({status:'ready',key:scope.key,preview:result});
  }catch(error){if(valid())commit({status:error instanceof Error&&['invalid_share_request','share_preview_not_found'].includes(error.message)?'unavailable':'error',key:scope.key});}
 },[commit]);
 useEffect(()=>{busy.current=false;void preview();return()=>{controller.current?.abort();};},[key,preview]);
 const run=useCallback(async(mode:'accept'|'reconcile'|'retry')=>{
  const scope=current.current,base=latest.current;
  if(busy.current||base.key!==scope.key)return;
  if(mode==='accept'?!['ready','storage-error'].includes(base.status):base.status!=='uncertain')return;
  if(!('preview'in base))return;
  const intent='intent'in base?base.intent:createShareIntent(scope.userId,{operationId:crypto.randomUUID(),action:'accept',code:scope.code});
  if(mode!=='reconcile'&&!retainAcceptJournal(tabAcceptStore(),intent)){commit('intent'in base?{status:'uncertain',key:scope.key,preview:base.preview,intent}:{status:'storage-error',key:scope.key,preview:base.preview!});return;}
  busy.current=true;
  controller.current?.abort();const request=++generation.current;
  const abort=new AbortController();controller.current=abort;
  const valid=()=>!abort.signal.aborted&&generation.current===request&&current.current.key===scope.key;
  commit({status:'saving',key:scope.key,preview:base.preview,intent});
  try{
   const result=await(mode==='reconcile'?reconcileShareIntent:executeShareIntent)(intent,abort.signal);
   if(!valid())return;
   if(result.state==='committed'){
    clearAcceptJournal(tabAcceptStore(),intent);
    commit({status:'accepted',key:scope.key,collectionId:result.receipt.collectionId,available:result.receipt.available,name:base.preview?.name??'',entryCount:base.preview?.entryCount??0});
   }else commit({status:'uncertain',key:scope.key,preview:base.preview,intent});
  }catch{if(valid())commit({status:'uncertain',key:scope.key,preview:base.preview,intent});}
  finally{if(current.current.key===scope.key&&generation.current===request)busy.current=false;}
 },[commit]);
 return {state:state.key===key?state:{status:'loading' as const,key},refresh:preview,accept:()=>run('accept'),reconcile:()=>run('reconcile'),retry:()=>run('retry')};
}
