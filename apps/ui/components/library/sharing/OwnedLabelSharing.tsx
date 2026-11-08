'use client';
import React,{useCallback,useEffect,useRef,useState} from 'react';
import {readLabelShareState,preflightLabelShare} from '@/lib/collections/sharing/labelSharingClient';
import type {LabelShareState} from '@/lib/collections/sharing/labelSharingContract';
import {labelSharingJournalKey,readLabelSharingJournal} from '@/lib/collections/sharing/labelSharingJournal';
import {localRecordSnapshotStore} from '@/lib/collections/sharing/corruptLocalRecord';
import type {OnboardingLanguage} from '@/lib/onboardingI18n';
import {CorruptLocalRecovery} from './CorruptLocalRecovery';
import {LabelSharingDialog,type LabelSharingController} from './LabelSharingDialog';
import {useLabelShareOperation} from './useLabelShareOperation';
import {BorrowedCollectionCopies} from './BorrowedCollectionCopies';
import type {WordListSummary} from '@/lib/types';

export function useOwnedLabelSharing(userId:string,labelId:string){
 const key=JSON.stringify([userId,labelId]),scope='owner:'+labelId;
 const current=useRef(key);current.current=key;
 const [read,setRead]=useState<{key:string;status:'loading'|'ready'|'error';data:LabelShareState|null}>({key,status:'loading',data:null});
 const active=useRef<AbortController|null>(null);
 const operation=useLabelShareOperation(userId,scope,command=>'labelId'in command&&command.labelId===labelId&&['open','rotate','close'].includes(command.action));
 const refresh=useCallback(async()=>{
  active.current?.abort();const abort=new AbortController();active.current=abort;
  setRead({key,status:'loading',data:null});
  try{const data=await readLabelShareState(userId,labelId,abort.signal);if(!abort.signal.aborted&&current.current===key)setRead({key,status:'ready',data});}
  catch{if(!abort.signal.aborted&&current.current===key)setRead({key,status:'error',data:null});}
 },[key,userId,labelId]);
 const receipt=operation.state.receipt;
 useEffect(()=>{void refresh();return()=>active.current?.abort();},[refresh,receipt]);
 const data=read.key===key?read.data:null;
 const status:LabelSharingController['status']=operation.state.status==='saving'?'saving':operation.state.status==='uncertain'?'uncertain':operation.state.status==='storage-error'?'error':read.key!==key?'loading':read.status;
 return {status,data,rejected:receipt?.status==='rejected',refresh:()=>{void refresh();},reconcile:()=>{void operation.reconcile();},retry:()=>{void operation.retry();},
  run:(action:'open'|'rotate'|'close')=>{if(data&&status==='ready')void operation.execute({operationId:crypto.randomUUID(),action,labelId,expectedRevision:data.revision});}};
}

export function OwnedLabelSharing({userId,labelId,name,collections=[],locale,onClose}:{userId:string;labelId:string;name:string;collections?:WordListSummary[];locale:OnboardingLanguage;onClose:()=>void}){
 const controller=useOwnedLabelSharing(userId,labelId),scope='owner:'+labelId;
 const [copies,setCopies]=useState(false),[checking,setChecking]=useState<'loading'|'error'|null>(null),request=useRef<AbortController|null>(null);
 useEffect(()=>()=>request.current?.abort(),[userId,labelId]);
 const run=async(action:'open'|'rotate'|'close')=>{
  if(action!=='open'){controller.run(action);return;}
  if(checking==='loading')return;
  request.current?.abort();const abort=new AbortController();request.current=abort;setChecking('loading');
  try{const result=await preflightLabelShare(userId,labelId,abort.signal);if(abort.signal.aborted)return;setChecking(null);if(result.collections.length)setCopies(true);else controller.run(action);}
  catch{if(!abort.signal.aborted)setChecking('error');}
 };
 return <><LabelSharingDialog name={name} locale={locale} controller={{...controller,status:checking??controller.status,run:action=>{void run(action);},refresh:()=>{setChecking(null);controller.refresh();}}} onClose={onClose}/>
  {copies&&<BorrowedCollectionCopies userId={userId} scope={{kind:'label',id:labelId}} name={name} collections={collections} locale={locale} onClose={()=>{setCopies(false);controller.refresh();}}/>}
  <CorruptLocalRecovery scopeKey={JSON.stringify([userId,labelId])} storageKey={labelSharingJournalKey(userId,scope)}
   valid={raw=>Boolean(readLabelSharingJournal(localRecordSnapshotStore(raw),userId,scope))}
   verify={async signal=>{await readLabelShareState(userId,labelId,signal);}} trigger={controller.status} locale={locale} onClose={onClose} onReset={controller.refresh}/>
 </>;
}
