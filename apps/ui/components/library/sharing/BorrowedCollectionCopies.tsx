'use client';
import React,{useCallback,useEffect,useRef,useState} from 'react';
import {X} from 'lucide-react';
import {DialogSurface} from '@/components/practice/ui/DialogSurface';
import {IconAction} from '@/components/practice/ui/IconAction';
import {localizedSection,formatMessage} from '@/lib/i18n/catalog';
import type {OnboardingLanguage} from '@/lib/onboardingI18n';
import type {WordListSummary} from '@/lib/types';
import {preflightLabelShare} from '@/lib/collections/sharing/labelSharingClient';
import {collectionCopyJournalKey,readCollectionCopyJournal} from '@/lib/collections/sharing/collectionCopyJournal';
import {labelSharingStore} from '@/lib/collections/sharing/labelSharingJournal';
import {localRecordSnapshotStore} from '@/lib/collections/sharing/corruptLocalRecord';
import {requestLabels} from '@/lib/collections/labels/client';
import {organizationCopy} from '../organization/copy';
import {useCollectionBorrowedCopy} from './useCollectionBorrowedCopy';
import {CorruptLocalRecovery} from './CorruptLocalRecovery';
import overlays from '@/components/practice/library/libraryOverlays.module.css';
import s from '../organization/organization.module.css';

export type BorrowedCopyScope={kind:'label'|'collection';id:string};
type Row={collectionId:string;name:string};
export function BorrowedCollectionCopies({userId,scope,name,collections=[],locale,onClose,onChanged}:{userId:string;scope:BorrowedCopyScope;name:string;collections?:WordListSummary[];locale:OnboardingLanguage;onClose:()=>void;onChanged?:()=>void}){
 const key=JSON.stringify([userId,scope.kind,scope.id]),current=useRef({key,userId,scope});current.current={key,userId,scope};
 const [state,setState]=useState<{key:string;status:'loading'|'ready'|'error';rows:Row[]}>({key,status:'loading',rows:[]});
 const [completed,setCompleted]=useState<Row[]>([]),[visibleCount,setVisibleCount]=useState(5);
 const pending=readCollectionCopyJournal(labelSharingStore(),userId);
 const [activeId,setActiveId]=useState<string|null>(pending?.listId??null),request=useRef<AbortController|null>(null);
 const common=organizationCopy(locale),t=localizedSection('labelSharing')[locale],copy=localizedSection('independentEntryCopy')[locale];
 const refresh=useCallback(async()=>{
  const context=current.current;request.current?.abort();const abort=new AbortController();request.current=abort;
  if(context.scope.kind==='collection'){setState({key:context.key,status:'ready',rows:[{collectionId:context.scope.id,name:''}]});return;}
  setState({key:context.key,status:'loading',rows:[]});
  try{const result=await preflightLabelShare(context.userId,context.scope.id,abort.signal);if(!abort.signal.aborted&&current.current.key===context.key)setState({key:context.key,status:'ready',rows:result.collections});}
  catch{if(!abort.signal.aborted&&current.current.key===context.key)setState({key:context.key,status:'error',rows:[]});}
 },[]);
 useEffect(()=>{void refresh();return()=>request.current?.abort();},[key,refresh]);
 const visible=state.key===key?state:{key,status:'loading',rows:[]};
 const rows=new Map([...completed,...visible.rows].map(row=>[row.collectionId,{...row,name:row.name||collections.find(collection=>collection.id===row.collectionId)?.name||common.collections}]));
 if(pending&&!rows.has(pending.listId))rows.set(pending.listId,{collectionId:pending.listId,name:collections.find(collection=>collection.id===pending.listId)?.name??common.collections});
 const ordered=[...rows.values()].sort((a,b)=>Number(b.collectionId===pending?.listId)-Number(a.collectionId===pending?.listId));
 return <DialogSurface className={overlays.dialog} aria-label={t.copyTitle} onDismiss={onClose}><section className={`${s.editor} ${s.copyPreparation}`}>
  <CorruptLocalRecovery scopeKey={userId} storageKey={collectionCopyJournalKey(userId)} valid={raw=>Boolean(readCollectionCopyJournal(localRecordSnapshotStore(raw),userId))} verify={async signal=>{await requestLabels(signal,undefined,userId);}} trigger={activeId??visible.status} locale={locale} onClose={onClose} onReset={()=>{setActiveId(null);void refresh();}}/>
  <header><h2>{t.copyTitle}</h2><IconAction label={common.close} onClick={onClose}><X size={18}/></IconAction></header>
  <p>{name}</p><p>{copy.notice}</p><p>{t.copySeparation}</p>
  {visible.status==='loading'&&<p role="status">{common.loading}</p>}
  {visible.status==='error'&&<p role="alert">{copy.failed} <button onClick={()=>void refresh()}>{common.retry}</button></p>}
  {visible.status==='ready'&&!ordered.length&&<p>{t.noBorrowed}</p>}
  {ordered.slice(0,visibleCount).map(row=><CollectionCopyRow key={`${userId}:${row.collectionId}`} userId={userId} row={row} locale={locale} disabled={Boolean(activeId&&activeId!==row.collectionId)} onStarted={()=>setActiveId(row.collectionId)} onSettled={()=>setActiveId(value=>value===row.collectionId?null:value)} onCompleted={()=>{setCompleted(value=>value.some(item=>item.collectionId===row.collectionId)?value:[...value,row]);onChanged?.();void refresh();}}/>)}
  {ordered.length>visibleCount&&<button onClick={()=>setVisibleCount(value=>value+5)}>{common.moreResults}</button>}
  <p>{t.copyNext}</p><footer><button onClick={onClose}>{common.close}</button></footer>
 </section></DialogSurface>;
}

function CollectionCopyRow({userId,row,locale,disabled,onStarted,onSettled,onCompleted}:{userId:string;row:Row;locale:OnboardingLanguage;disabled:boolean;onStarted:()=>void;onSettled:()=>void;onCompleted:()=>void}){
 const controller=useCollectionBorrowedCopy(userId,row.collectionId),{state}=controller;
 const t=localizedSection('independentEntryCopy')[locale],group=localizedSection('labelSharing')[locale],common=organizationCopy(locale),sharing=localizedSection('collectionSharing')[locale];
 const notified=useRef<string|null>(null);
 useEffect(()=>{
  if(['completed','error','storage-error'].includes(state.status))onSettled();
  if(state.status==='completed'&&state.command&&notified.current!==state.command.operationId){notified.current=state.command.operationId;onCompleted();}
 },[state.status,state.command,onSettled,onCompleted]);
 return <section className={s.copyCollection}><h3>{row.name}</h3>
  {state.status==='loading'?<p role="status">{common.loading}</p>:state.status==='saving'?<p role="status">{t.pending}</p>:state.status==='completed'?<p role="status">{t.success}</p>:state.status==='uncertain'?<><p role="alert">{t.uncertain}</p><div><button onClick={()=>void controller.check()}>{t.check}</button><button onClick={()=>void controller.retry()}>{sharing.retry}</button></div></>:state.status==='error'?<><p role="alert">{state.reason?.endsWith('_changed')?t.changed:t.failed}</p><button onClick={()=>void controller.refresh()}>{t.refresh}</button></>:<>
   <p>{state.preview?.borrowedCount?formatMessage(group.borrowedCount,{count:state.preview.borrowedCount.toLocaleString(locale)}):group.noBorrowed}</p>
   {state.status==='storage-error'&&<p role="alert">{common.failed}</p>}
   {state.preview?.borrowedCount?state.preview.canCopy?<button disabled={disabled} onClick={()=>{onStarted();void controller.start();}}>{t.confirm}</button>:<p role="alert">{t.failed}</p>:null}
  </>}
 </section>;
}
