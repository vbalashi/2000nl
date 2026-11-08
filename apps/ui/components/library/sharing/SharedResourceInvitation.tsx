'use client';
import React,{useCallback,useEffect,useRef,useState} from 'react';
import type {OnboardingLanguage} from '@/lib/onboardingI18n';
import {previewSharedResource} from '@/lib/collections/sharing/labelSharingClient';
import type {SharedResourcePreview} from '@/lib/collections/sharing/labelSharingContract';
import {labelSharingJournalKey,readLabelSharingJournal} from '@/lib/collections/sharing/labelSharingJournal';
import {localRecordSnapshotStore} from '@/lib/collections/sharing/corruptLocalRecord';
import {InvitationPreview} from './InvitationPreview';
import {LabelInvitationPreviewView} from './LabelInvitationPreview';
import {useLabelShareOperation} from './useLabelShareOperation';
import {CorruptLocalRecovery} from './CorruptLocalRecovery';

export function SharedResourceInvitation({userId,code,locale,onClose,onConfirmed,onOpen,onOpenLabel}:{
 userId:string;code:string;locale:OnboardingLanguage;onClose:()=>void;onConfirmed?:()=>void;onOpen:(id:string)=>void;onOpenLabel:(id:string,name:string)=>void;
}){
 const key=JSON.stringify([userId,code]),scope='accept:'+code;
 const current=useRef(key);current.current=key;
 const [state,setState]=useState<{key:string;status:'loading'|'ready'|'error'|'unavailable';data:SharedResourcePreview|null}>({key,status:'loading',data:null});
 const active=useRef<AbortController|null>(null),confirmed=useRef(new Set<string>());
 const operation=useLabelShareOperation(userId,scope,command=>command.action==='accept'&&command.code===code);
 const refresh=useCallback(async()=>{
  active.current?.abort();const abort=new AbortController();active.current=abort;
  setState({key,status:'loading',data:null});
  try{const data=await previewSharedResource(userId,code,abort.signal);if(!abort.signal.aborted&&current.current===key)setState({key,status:'ready',data});}
  catch(error){if(!abort.signal.aborted&&current.current===key)setState({key,status:error instanceof Error&&error.message==='share_preview_not_found'?'unavailable':'error',data:null});}
 },[key,userId,code]);
 useEffect(()=>{void refresh();return()=>active.current?.abort();},[refresh]);
 const receipt=operation.state.receipt;
 useEffect(()=>{
  if(receipt?.status==='committed'&&receipt.action==='accept'&&!confirmed.current.has(receipt.operationId)){
   confirmed.current.add(receipt.operationId);onConfirmed?.();void refresh();
  }
 },[receipt,onConfirmed,refresh]);
 const visible=state.key===key?state:{key,status:'loading' as const,data:null};
 if(visible.data?.kind==='collection')return <InvitationPreview userId={userId} code={code} locale={locale} onClose={onClose} onConfirmed={onConfirmed} onOpen={onOpen}/>;
 const preview=visible.data?.kind==='label'?visible.data.preview:null;
 const status=operation.state.status==='saving'?'saving':operation.state.status==='uncertain'?'uncertain':operation.state.status==='storage-error'?'storage-error':visible.status!=='ready'?visible.status:receipt?.status==='rejected'?'rejected':'ready';
 return <>
  <LabelInvitationPreviewView locale={locale} preview={preview} status={status} accepted={receipt?.status==='committed'}
   onAdd={()=>{if(preview&&!preview.alreadyAdded)void operation.execute({operationId:crypto.randomUUID(),action:'accept',code});}}
   onOpen={()=>{if(preview?.alreadyAdded)onOpenLabel(preview.labelId,preview.name);}} onClose={onClose} onRefresh={()=>{void refresh();}}
   onReconcile={()=>{void operation.reconcile();}} onRetry={()=>{void operation.retry();}}/>
  <CorruptLocalRecovery scopeKey={key} storageKey={labelSharingJournalKey(userId,scope)}
   valid={raw=>Boolean(readLabelSharingJournal(localRecordSnapshotStore(raw),userId,scope))}
   verify={async signal=>{try{await previewSharedResource(userId,code,signal);}catch(error){if(!(error instanceof Error)||error.message!=='share_preview_not_found')throw error;}}}
   trigger={status} locale={locale} onClose={onClose} onReset={()=>{void refresh();}}/>
 </>;
}
