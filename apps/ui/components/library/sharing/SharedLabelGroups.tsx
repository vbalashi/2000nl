'use client';
import React,{useEffect,useRef,useState} from 'react';
import {Folder,MoreHorizontal} from 'lucide-react';
import {ActionMenu} from '@/components/practice/ui/ActionMenu';
import {DialogSurface} from '@/components/practice/ui/DialogSurface';
import {IconAction} from '@/components/practice/ui/IconAction';
import {localizedSection} from '@/lib/i18n/catalog';
import type {WordListSummary} from '@/lib/types';
import type {OnboardingLanguage} from '@/lib/onboardingI18n';
import type {LabelSharingCatalog} from '@/lib/collections/sharing/labelSharingContract';
import {readLabelSharingCatalog} from '@/lib/collections/sharing/labelSharingClient';
import {labelSharingJournalKey,readLabelSharingJournal} from '@/lib/collections/sharing/labelSharingJournal';
import {localRecordSnapshotStore} from '@/lib/collections/sharing/corruptLocalRecord';
import {organizationCopy} from '../organization/copy';
import {OwnedLabelSharing} from './OwnedLabelSharing';
import {SharedLabelContents} from './SharedLabelContents';
import {CorruptLocalRecovery} from './CorruptLocalRecovery';
import {useLabelShareOperation} from './useLabelShareOperation';
import overlays from '@/components/practice/library/libraryOverlays.module.css';
import s from '../organization/organization.module.css';

type Group=LabelSharingCatalog['received'][number];
export function SharedLabelGroups({userId,locale,groups,view,onChanged,onOpenCollection,onReference,collections=[]}:{userId:string;locale:OnboardingLanguage;groups:Group[];collections?:WordListSummary[];view:'owned'|'received';onChanged:()=>void;onOpenCollection:(id:string)=>void;onReference?:(code:string)=>void}){
 const t=localizedSection('labelSharing')[locale],common=organizationCopy(locale);
 const [menu,setMenu]=useState<{key:string;row:Group;anchor:HTMLButtonElement}|null>(null);
 const [dialog,setDialog]=useState<{key:string;row:Group;kind:'manage'|'contents'|'leave'}|null>(null);
 const key=JSON.stringify([userId,view]);
 return <section className={s.sharedGroups} aria-label={t.groups}>
  {groups.map(row=><article key={row.labelId} className={s.collection}>
   <span className={s.accessIcon} title={t.groups}><Folder size={18} aria-hidden="true"/></span>
   <div className={s.collectionCopy}><button className={s.collectionName} onClick={()=>setDialog({key,row,kind:'contents'})}>{row.name}</button><p>{t.collections}: {row.collectionCount.toLocaleString(locale)}</p></div>
   <IconAction label={`${common.more}: ${row.name}`} onClick={event=>setMenu({key,row,anchor:event.currentTarget})}><MoreHorizontal size={16} strokeWidth={1.5}/></IconAction>
  </article>)}
  {menu?.key===key&&<ActionMenu language={locale} title={common.more} anchor={menu.anchor} onClose={()=>setMenu(null)} items={[
   {id:'contents',label:t.openGroup,onSelect:()=>{setDialog({key,row:menu.row,kind:'contents'});setMenu(null);}},
   view==='owned'?{id:'manage',label:localizedSection('ownedSharedCollections')[locale].manage,onSelect:()=>{setDialog({key,row:menu.row,kind:'manage'});setMenu(null);}}:{id:'leave',label:localizedSection('receivedCollectionActions')[locale].leave,onSelect:()=>{setDialog({key,row:menu.row,kind:'leave'});setMenu(null);}},
  ]}/>}
  {dialog?.key===key&&(dialog.kind==='manage'?<OwnedLabelSharing userId={userId} labelId={dialog.row.labelId} name={dialog.row.name} collections={collections} locale={locale} onClose={()=>{setDialog(null);onChanged();}}/>:dialog.kind==='contents'?<SharedLabelContents userId={userId} labelId={dialog.row.labelId} name={dialog.row.name} locale={locale} onClose={()=>setDialog(null)} onReference={code=>{setDialog(null);onReference?.(code);}} onOpen={id=>{setDialog(null);onOpenCollection(id);}}/>:<LeaveSharedLabel userId={userId} row={dialog.row} locale={locale} onClose={()=>setDialog(null)} onDone={()=>{setDialog(null);onChanged();}}/>)}
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
