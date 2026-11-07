'use client';
import React,{useCallback,useEffect,useRef,useState} from 'react';
import {readLabelShareState} from '@/lib/collections/sharing/labelSharingClient';
import type {LabelShareState} from '@/lib/collections/sharing/labelSharingContract';
import {labelSharingJournalKey,readLabelSharingJournal} from '@/lib/collections/sharing/labelSharingJournal';
import {localRecordSnapshotStore} from '@/lib/collections/sharing/corruptLocalRecord';
import type {OnboardingLanguage} from '@/lib/onboardingI18n';
import {CorruptLocalRecovery} from './CorruptLocalRecovery';
import {LabelSharingDialog,type LabelSharingController} from './LabelSharingDialog';
import {useLabelShareOperation} from './useLabelShareOperation';

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

export function OwnedLabelSharing({userId,labelId,name,locale,onClose}:{userId:string;labelId:string;name:string;locale:OnboardingLanguage;onClose:()=>void}){
 const controller=useOwnedLabelSharing(userId,labelId),scope='owner:'+labelId;
 return <><LabelSharingDialog name={name} locale={locale} controller={controller} onClose={onClose}/>
  <CorruptLocalRecovery scopeKey={JSON.stringify([userId,labelId])} storageKey={labelSharingJournalKey(userId,scope)}
   valid={raw=>Boolean(readLabelSharingJournal(localRecordSnapshotStore(raw),userId,scope))}
   verify={async signal=>{await readLabelShareState(userId,labelId,signal);}} trigger={controller.status} locale={locale} onClose={onClose} onReset={controller.refresh}/>
 </>;
}
