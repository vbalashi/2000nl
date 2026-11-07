'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {previewCollectionBorrowedCopy,submitCollectionBorrowedCopy,reconcileCollectionBorrowedCopy,type CollectionCopyCommand,type CollectionCopyPreview} from '@/lib/collections/sharing/collectionBorrowedCopyClient';
import {readCollectionCopyJournal,retainCollectionCopyJournal,clearCollectionCopyJournal} from '@/lib/collections/sharing/collectionCopyJournal';
import {labelSharingStore} from '@/lib/collections/sharing/labelSharingJournal';

type State={key:string;status:'loading'|'ready'|'saving'|'uncertain'|'completed'|'error'|'storage-error';preview:CollectionCopyPreview|null;command:CollectionCopyCommand|null;reason:string|null};
export function useCollectionBorrowedCopy(userId:string,listId:string){
 const key=JSON.stringify([userId,listId]),scope=useRef({key,userId,listId});scope.current={key,userId,listId};
 const [state,setState]=useState<State>({key,status:'loading',preview:null,command:null,reason:null});
 const latest=useRef(state),request=useRef<AbortController|null>(null),busy=useRef(false);
 const commit=useCallback((value:State)=>{latest.current=value;setState(value);},[]);
 const refresh=useCallback(async()=>{
  if(busy.current)return;
  request.current?.abort();
  const context=scope.current,pending=readCollectionCopyJournal(labelSharingStore(),context.userId);
  if(pending?.listId===context.listId){commit({key:context.key,status:'uncertain',preview:null,command:pending,reason:null});return;}
  request.current?.abort();const abort=new AbortController();request.current=abort;
  commit({key:context.key,status:'loading',preview:null,command:null,reason:null});
  try{const preview=await previewCollectionBorrowedCopy(context.userId,context.listId,abort.signal);if(!abort.signal.aborted&&scope.current.key===context.key)commit({key:context.key,status:'ready',preview,command:null,reason:null});}
  catch{if(!abort.signal.aborted&&scope.current.key===context.key)commit({key:context.key,status:'error',preview:null,command:null,reason:null});}
 },[commit]);
 useEffect(()=>{busy.current=false;void refresh();return()=>request.current?.abort();},[key,refresh]);
 const run=useCallback(async(mode:'start'|'retry'|'check')=>{
  const context=scope.current,base=latest.current;
  if(busy.current||base.key!==context.key)return;
  if(mode==='start'?!['ready','storage-error'].includes(base.status)||!base.preview?.canCopy||base.preview.borrowedCount===0:base.status!=='uncertain'||!base.command)return;
  const command=mode==='start'?{operationId:crypto.randomUUID(),listId:context.listId,expectedRevision:base.preview!.revision}:base.command!;
  if(mode!=='check'&&!retainCollectionCopyJournal(labelSharingStore(),context.userId,command)){commit({...base,status:base.command?'uncertain':'storage-error'});return;}
  busy.current=true;request.current?.abort();const abort=new AbortController();request.current=abort;
  const valid=()=>!abort.signal.aborted&&scope.current.key===context.key;
  commit({...base,status:'saving',command,reason:null});
  try{
   const result=await(mode==='check'?reconcileCollectionBorrowedCopy:submitCollectionBorrowedCopy)(context.userId,command,abort.signal);
   if(!valid())return;
   if(result?.status==='completed'){
    clearCollectionCopyJournal(labelSharingStore(),context.userId,command);commit({...base,status:'completed',command,reason:null});
   }else if(result?.status==='rejected'){
    clearCollectionCopyJournal(labelSharingStore(),context.userId,command);commit({...base,status:'error',command:null,reason:result.reason});
   }else commit({...base,status:'uncertain',command,reason:null});
  }catch{if(valid())commit({...base,status:'uncertain',command,reason:null});}
  finally{if(valid())busy.current=false;}
 },[commit]);
 return {state:state.key===key?state:{key,status:'loading' as const,preview:null,command:null,reason:null},refresh,start:()=>run('start'),retry:()=>run('retry'),check:()=>run('check')};
}
