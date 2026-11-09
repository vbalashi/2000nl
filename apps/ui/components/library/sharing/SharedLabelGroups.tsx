'use client';
import {SharedPublicationRow} from './SharedPublicationRow';
import React,{useEffect,useRef,useState} from 'react';
import {MoreHorizontal,Copy,Check} from 'lucide-react';
import {CollectionAccessIcon} from '../organization/CollectionAccessIcon';
import {ActionMenu} from '@/components/practice/ui/ActionMenu';
import {DialogSurface} from '@/components/practice/ui/DialogSurface';
import {IconAction} from '@/components/practice/ui/IconAction';
import {localizedSection} from '@/lib/i18n/catalog';
import type {WordListSummary} from '@/lib/types';
import type {OnboardingLanguage} from '@/lib/onboardingI18n';
import type {LabelSharingCatalog} from '@/lib/collections/sharing/labelSharingContract';
import {readLabelSharingCatalog,readLabelShareState} from '@/lib/collections/sharing/labelSharingClient';
import {labelSharingJournalKey,readLabelSharingJournal} from '@/lib/collections/sharing/labelSharingJournal';
import {localRecordSnapshotStore} from '@/lib/collections/sharing/corruptLocalRecord';
import {shareInvitationUrl} from '@/lib/collections/sharing/shareCode';
import {organizationCopy} from '../organization/copy';
import {OwnedLabelSharing} from './OwnedLabelSharing';
import {SharedLabelContents} from './SharedLabelContents';
import {CorruptLocalRecovery} from './CorruptLocalRecovery';
import {useLabelShareOperation} from './useLabelShareOperation';
import overlays from '@/components/practice/library/libraryOverlays.module.css';
import s from '../organization/organization.module.css';

type Group=LabelSharingCatalog['received'][number];
export function SharedLabelGroups({userId,locale,groups,view,onChanged,onOpenCollection,onReference,onOpenLabel,refreshToken,collections=[]}:{userId:string;locale:OnboardingLanguage;groups:Group[];refreshToken?:unknown;collections?:WordListSummary[];view:'owned'|'received';onChanged:()=>void;onOpenCollection:(id:string)=>void;onReference?:(code:string)=>void;onOpenLabel?:(id:string)=>void}){
 const t=localizedSection('labelSharing')[locale],common=organizationCopy(locale);
 const [menu,setMenu]=useState<{key:string;row:Group;anchor:HTMLButtonElement}|null>(null);
 const [dialog,setDialog]=useState<{key:string;row:Group;kind:'manage'|'contents'|'leave'}|null>(null);
 const key=JSON.stringify([userId,view]);
 const [counts,setCounts]=useState<{key:string;values:Record<string,number>}>({key:'',values:{}});
 const [copied,setCopied]=useState<string|null>(null),[copyFailed,setCopyFailed]=useState(false);
 const copyScope=useRef(key);copyScope.current=key;
 const copyTimer=useRef<ReturnType<typeof setTimeout>>(),copyRequest=useRef<AbortController|null>(null);
 const groupIds=JSON.stringify(groups.map(row=>row.labelId));
 useEffect(()=>{const abort=new AbortController();setCopied(null);setCopyFailed(false);setCounts({key,values:{}});
  if(view==='owned')for(const row of groups)void readLabelShareState(userId,row.labelId,abort.signal).then(state=>{if(!abort.signal.aborted)setCounts(previous=>({key,values:{...(previous.key===key?previous.values:{}),[row.labelId]:state.subscriberCount}}));}).catch(()=>{});
  return()=>{abort.abort();copyRequest.current?.abort();clearTimeout(copyTimer.current);};
 // Membership changes refresh counts without depending on render-time array identity.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[key,groupIds,refreshToken]);
 const shareCopy=localizedSection('ownedSharedCollections')[locale],copiedText=localizedSection('collectionSharing')[locale].copied;
 const copyLink=async(row:Group)=>{
  copyRequest.current?.abort();const abort=new AbortController();copyRequest.current=abort;
  const scope=key,valid=()=>!abort.signal.aborted&&copyScope.current===scope;setCopyFailed(false);
  try{const state=await readLabelShareState(userId,row.labelId,abort.signal);if(!valid())return;
   if(!state.isOpen||!state.invitationCode)throw new Error('share_unavailable');
   await navigator.clipboard.writeText(shareInvitationUrl(state.invitationCode,window.location.origin));
   if(valid()){setCopied(row.labelId);clearTimeout(copyTimer.current);copyTimer.current=setTimeout(()=>setCopied(null),2500);}
  }catch{if(valid())setCopyFailed(true);}finally{if(copyRequest.current===abort)copyRequest.current=null;}
 };
 return <section className={`${s.sharedGroups} ${view==='received'?s.receivedGroups:''}`} aria-label={t.groups}>
  {copyFailed&&<p role="status" className={s.muted}>{shareCopy.copyFailed}</p>}
  {groups.map(row=><SharedPublicationRow key={row.labelId} tableRow={view==='owned'} name={row.name} icon={<CollectionAccessIcon kind="label" shared received={view==='received'} label={t.groups}/>} onOpen={()=>setDialog({key,row,kind:'contents'})} metadata={<>{t.collections}: {row.collectionCount.toLocaleString(locale)}{view==='owned'&&<span className={s.mobileSubscriberLabel}> · {shareCopy.subscribers}: {counts.key===key?counts.values[row.labelId]?.toLocaleString(locale)??'—':'—'}</span>}</>} subscriberCount={view==='owned'?(counts.key===key?counts.values[row.labelId]?.toLocaleString(locale)??'—':'—'):undefined} actions={<>{view==='owned'&&<button type="button" onClick={()=>void copyLink(row)}>{copied===row.labelId?<Check size={15} aria-hidden="true"/>:<Copy size={15} aria-hidden="true"/>}{copied===row.labelId?copiedText:shareCopy.copy}</button>}</>} menu={<IconAction label={`${common.more}: ${row.name}`} onClick={event=>setMenu({key,row,anchor:event.currentTarget})}><MoreHorizontal size={16} strokeWidth={1.5}/></IconAction>}/>)}
  {menu?.key===key&&<ActionMenu language={locale} title={common.more} anchor={menu.anchor} onClose={()=>setMenu(null)} items={[
   ...(view==='owned'?[{id:'copy',label:shareCopy.copy,onSelect:()=>{void copyLink(menu.row);setMenu(null);}}]:[]),
   ...(onOpenLabel?[{id:'catalog',label:t.openInCollections,onSelect:()=>{onOpenLabel(menu.row.labelId);setMenu(null);}}]:[]),
   {id:'contents',label:t.openGroup,onSelect:()=>{setDialog({key,row:menu.row,kind:'contents'});setMenu(null);}},
   view==='owned'?{id:'manage',label:localizedSection('ownedSharedCollections')[locale].manage,onSelect:()=>{setDialog({key,row:menu.row,kind:'manage'});setMenu(null);}}:{id:'leave',label:localizedSection('receivedCollectionActions')[locale].leave,onSelect:()=>{setDialog({key,row:menu.row,kind:'leave'});setMenu(null);}},
  ]}/>}
  {dialog?.key===key&&(dialog.kind==='manage'?<OwnedLabelSharing userId={userId} labelId={dialog.row.labelId} name={dialog.row.name} collections={collections} locale={locale} onClose={()=>{setDialog(null);onChanged();}}/>:dialog.kind==='contents'?<SharedLabelContents onOpenLabel={onOpenLabel?()=>{setDialog(null);onOpenLabel(dialog.row.labelId);}:undefined} userId={userId} labelId={dialog.row.labelId} name={dialog.row.name} locale={locale} onClose={()=>setDialog(null)} onReference={code=>{setDialog(null);onReference?.(code);}} onOpen={id=>{setDialog(null);onOpenCollection(id);}}/>:<LeaveSharedLabel userId={userId} row={dialog.row} locale={locale} onClose={()=>setDialog(null)} onDone={()=>{setDialog(null);onChanged();}}/>)}
 </section>;
}

function LeaveSharedLabel({userId,row,locale,onClose,onDone}:{userId:string;row:Group;locale:OnboardingLanguage;onClose:()=>void;onDone:()=>void}){
 const scope='unsubscribe:'+row.labelId,operation=useLabelShareOperation(userId,scope,command=>command.action==='unsubscribe'&&command.labelId===row.labelId);
 const t=localizedSection('receivedCollectionActions')[locale],common=organizationCopy(locale),group=localizedSection('labelSharing')[locale];
 const finished=useRef<string|null>(null),receipt=operation.state.receipt;
 useEffect(()=>{if(receipt?.status==='committed'&&receipt.action==='unsubscribe'&&finished.current!==receipt.operationId){finished.current=receipt.operationId;onDone();}},[receipt,onDone]);
 const status=operation.state.status;
 return <DialogSurface className={overlays.dialog} aria-label={t.leave} onDismiss={()=>{if(status!=='saving')onClose();}}><div className={`${s.editor} ${s.sharingAction}`}>
  <CorruptLocalRecovery scopeKey={JSON.stringify([userId,row.labelId])} storageKey={labelSharingJournalKey(userId,scope)} valid={raw=>Boolean(readLabelSharingJournal(localRecordSnapshotStore(raw),userId,scope))} verify={async signal=>{await readLabelSharingCatalog(userId,signal);}} trigger={status} locale={locale} onClose={onClose} onReset={onClose}/>
  <h2>{t.leave}</h2><p>{row.name}</p><p>{group.leaveNotice}</p>
  {status==='uncertain'&&<p role="alert">{t.uncertain}</p>}
  {(status==='storage-error'||receipt?.status==='rejected')&&<p role="alert">{common.failed}</p>}
  <footer><button disabled={status==='saving'} onClick={onClose}>{common.cancel}</button>{status==='uncertain'?<><button onClick={()=>void operation.reconcile()}>{t.check}</button><button onClick={()=>void operation.retry()}>{t.retry}</button></>:<button disabled={status==='saving'} onClick={()=>void operation.execute({operationId:crypto.randomUUID(),action:'unsubscribe',labelId:row.labelId})}>{status==='saving'?common.saving:t.leave}</button>}</footer>
 </div></DialogSurface>;
}
