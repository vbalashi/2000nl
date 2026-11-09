'use client';
import {SharedPublicationRow,SharedPublicationHeader} from './SharedPublicationRow';
import {ActionButton} from '@/components/practice/ui/ActionButton';
import { localizedSection } from "@/lib/i18n/catalog";

import type {SharedCatalogSelection} from './SharedCatalogControls';
import {CollectionAccessIcon} from '../organization/CollectionAccessIcon';
import {CollectionSortControl} from '@/components/library/organization/CollectionSortControl';
import React,{useEffect,useRef,useState} from 'react';
import {MoreHorizontal,Search,Folder,Copy,Check} from 'lucide-react';
import type {OnboardingLanguage} from '@/lib/onboardingI18n';
import {usePersonalLabels} from "../organization/usePersonalLabels";
import {labelRows} from "@/lib/collections/labels/catalog";
import {CollectionDetailsController} from "../organization/CollectionDetailsController";
import {LabelAssignmentPicker} from "../organization/LabelAssignmentPicker";
import {LabelAudienceConfirmation} from "./LabelAudienceConfirmation";
import {DialogSurface} from "@/components/practice/ui/DialogSurface";
import overlays from "@/components/practice/library/libraryOverlays.module.css";
import {IconAction} from '@/components/practice/ui/IconAction';
import {OwnedLabelSharing} from './OwnedLabelSharing';
import type {WordListSummary} from '@/lib/types';
import {ActionMenu} from '@/components/practice/ui/ActionMenu';
import {readCollectionShareManagement} from '@/lib/collections/sharing/shareManagementClient';
import {shareInvitationUrl} from '@/lib/collections/sharing/shareCode';
import {readOwnerShareJournal,ownerShareStore} from '@/lib/collections/sharing/ownerShareJournal';
import {formatUiCount} from '@/lib/uiMessages';
import type {OwnedCatalogQuery,OwnedSharedCollection} from '@/lib/collections/sharing/ownedCatalogContract';
import {organizationCopy} from '../organization/copy';
import {useOwnedSharedCatalog} from './useOwnedSharedCatalog';
import {OwnedCollectionSharing} from './OwnedCollectionSharing';
import s from '../organization/organization.module.css';

const copy=localizedSection("ownedSharedCollections");
type Dialog={ownerId:string;row:Pick<OwnedSharedCollection,'id'|'name'>;initialAction?:'close'};
export function OwnedSharedCollections({userId,active,locale,onOpen,onChanged,catalogOverride,hasGroups=false,groupRows,selection,ownCollections=[]}:{userId:string;active:boolean;locale:OnboardingLanguage;onOpen:(row:OwnedSharedCollection)=>void;onChanged:()=>void;hasGroups?:boolean;groupRows?:React.ReactNode;ownCollections?:WordListSummary[];selection?:SharedCatalogSelection;catalogOverride?:ReturnType<typeof useOwnedSharedCatalog>}){
 const [groupDialog,setGroupDialog]=useState<{ownerId:string;labelId:string;name:string}|null>(null);
 const [detailsSelection,setDetailsSelection]=useState<{ownerId:string;id:string;row:OwnedSharedCollection}|null>(null);
 const [labelEditor,setLabelEditor]=useState<{ownerId:string;id:string;name:string;selected:string[]}|null>(null);
 const [localQuery,setQuery]=useState(''),[localSort,setSort]=useState<OwnedCatalogQuery['sort']>('recent');
 const query=selection?.query??localQuery,sort=selection?.sort??localSort;
 const connectedCatalog=useOwnedSharedCatalog({userId,active:active&&!catalogOverride,query:{query,sort,limit:50}});
 const catalog=catalogOverride??connectedCatalog;
 const labels=usePersonalLabels(active,userId);
 const details=detailsSelection?.ownerId===userId?(catalog.collections.find(row=>row.id===detailsSelection.id)??detailsSelection.row):undefined;
 const [menuState,setMenu]=useState<{ownerId:string;row:OwnedSharedCollection;anchor:HTMLButtonElement}|null>(null);
 const menuRow=menuState?.ownerId===userId?catalog.collections.find(row=>row.id===menuState.row.id):undefined;
 const menu=menuRow&&menuState?{...menuState,row:menuRow}:null;
 const [dialog,setDialog]=useState<Dialog|null>(null),[notice,setNotice]=useState<{key:string;text:string}|null>(null);
 const [copied,setCopied]=useState<{key:string;id:string}|null>(null),copyTimer=useRef<ReturnType<typeof setTimeout>>();
 const copiedLabel=localizedSection('collectionSharing')[locale].copied;
 const dismissed=useRef(new Set<string>()),wasActive=useRef(false),copyRequest=useRef<AbortController|null>(null);
 const dialogOpener=useRef<HTMLButtonElement|null>(null),localSearchInput=useRef<HTMLInputElement|null>(null),restoreFocus=useRef(false);
 const searchInput=selection?.searchInputRef??localSearchInput;
 useEffect(()=>{if(dialog||groupDialog||!restoreFocus.current)return;restoreFocus.current=false;const target=dialogOpener.current?.isConnected?dialogOpener.current:searchInput.current;target?.focus({preventScroll:true});dialogOpener.current=null;},[dialog,groupDialog,catalog.collections,searchInput]);
 const t=copy[locale],common=organizationCopy(locale),key=JSON.stringify([userId,active]);
 const scope=useRef(key);scope.current=key;
 useEffect(()=>{copyRequest.current?.abort();clearTimeout(copyTimer.current);setCopied(null);setNotice(null);return()=>{copyRequest.current?.abort();clearTimeout(copyTimer.current);};},[key]);
 useEffect(()=>{
  if(!active){wasActive.current=false;return;}
  if(!wasActive.current){wasActive.current=true;dismissed.current.clear();}
  if(dialog?.ownerId===userId)return;
  const pending=readOwnerShareJournal(ownerShareStore(),userId);
  if(pending&&'collectionId'in pending.command&&!dismissed.current.has(pending.command.operationId)){
   const id=pending.command.collectionId,row=catalog.collections.find(item=>item.id===id);
   setDialog({ownerId:userId,row:row??{id,name:common.collections}});
  }
 },[active,userId,dialog,catalog.collections,common.collections]);
 const closeDialog=()=>{
  const pending=readOwnerShareJournal(ownerShareStore(),userId);
  if(pending&&'collectionId'in pending.command&&pending.command.collectionId===dialog?.row.id)dismissed.current.add(pending.command.operationId);
  restoreFocus.current=true;setDialog(null);void catalog.refresh();onChanged();
 };
 const copyLink=async(row:OwnedSharedCollection)=>{
  copyRequest.current?.abort();const abort=new AbortController();copyRequest.current=abort;clearTimeout(copyTimer.current);setCopied(null);setNotice(null);
  const valid=()=>!abort.signal.aborted&&scope.current===key;
  try{
   const management=await readCollectionShareManagement(userId,row.id,abort.signal);
   if(!valid())return;
   if(!management.isOpen||!management.invitationCode)throw new Error('share_unavailable');
   await navigator.clipboard.writeText(shareInvitationUrl(management.invitationCode,window.location.origin));
   if(valid()){setCopied({key,id:row.id});copyTimer.current=setTimeout(()=>setCopied(null),2500);}
  }catch{if(valid()){setNotice({key,text:t.copyFailed});setDialog({ownerId:userId,row});}}
  finally{if(copyRequest.current===abort)copyRequest.current=null;}
 };
 return <section className={`${s.catalog} ${s.received} ${s.ownedShared}`} aria-label={t.title}>
  {!selection&&<div className={s.filters}><label className={s.search}><Search size={16} aria-hidden="true"/><input ref={searchInput} aria-label={common.search} placeholder={common.search} maxLength={100} value={query} onChange={event=>setQuery(event.target.value)}/></label>
   <CollectionSortControl locale={locale} value={sort} onChange={setSort}/></div>}
  <span role="status" className={s.copyAnnounce}>{copied?.key===key?t.copied:''}</span>
  {notice?.key===key&&<p role="status" className={s.muted}>{notice.text}</p>}
  {catalog.status==='loading'?<div className={s.state} role="status">{common.loading}</div>:catalog.status==='error'?<div className={s.state}><p role="alert">{t.error}</p><button onClick={()=>void catalog.refresh()}>{common.retry}</button></div>:catalog.status==='ready'&&catalog.collections.filter(row=>row.directPublication).length===0&&!hasGroups?<p className={s.state}>{query.trim()?common.noResults:t.empty}</p>:null}
  {(catalog.collections.some(row=>row.directPublication)||hasGroups)&&<div className={s.ownedSharedTable} role="table" aria-label={t.title}><SharedPublicationHeader name={common.collections} subscribers={t.subscribers} actions={common.more}/>
   <div className={s.ownedSharedRows}>{groupRows}{catalog.collections.filter(row=>row.directPublication).map(row=><SharedPublicationRow key={row.id} tableRow name={row.name} icon={<CollectionAccessIcon shared label={common.sharedByYou}/>} onOpen={()=>setDetailsSelection({ownerId:userId,id:row.id,row})} metadata={<>{formatUiCount(locale,row.itemCount,common,'meaning')}{row.groups.length>0&&<> · <Folder size={12} aria-label={localizedSection('labelSharing')[locale].groups}/>{row.groups.map(group=>group.name).join(', ')}</>}<span className={s.mobileSubscriberLabel}> · {t.subscribers}: {row.subscriberCount.toLocaleString(locale)}</span></>} subscriberCount={row.subscriberCount.toLocaleString(locale)} actions={<>{row.directPublication&&<button type="button" aria-label={copied?.key===key&&copied.id===row.id?copiedLabel:t.copy} onClick={event=>{dialogOpener.current=event.currentTarget;void copyLink(row);}}>{copied?.key===key&&copied.id===row.id?<Check size={15} aria-hidden="true"/>:<Copy size={15} aria-hidden="true"/>}<span className={s.copyFeedbackText} aria-hidden="true"><span style={{visibility:copied?.key===key&&copied.id===row.id?'hidden':'visible'}}>{t.copy}</span><span style={{visibility:copied?.key===key&&copied.id===row.id?'visible':'hidden'}}>{copiedLabel}</span></span></button>}</>} menu={<IconAction label={`${common.more} · ${row.name}`} onClick={event=>setMenu({ownerId:userId,row,anchor:event.currentTarget})}><MoreHorizontal size={16} strokeWidth={1.5}/></IconAction>}/>)}</div></div>}
  {catalog.nextCursor&&<button className={s.loadMore} disabled={catalog.loadingMore} onClick={()=>void catalog.loadMore()}>{catalog.loadingMore?common.loading:common.moreResults}</button>}
  {menu?.ownerId===userId&&<ActionMenu anchor={menu.anchor} title={common.more} language={locale} onClose={()=>setMenu(null)} items={[
   ...(menu.row.directPublication?[
   {id:'copy',label:t.copy,onSelect:()=>{dialogOpener.current=menu.anchor;void copyLink(menu.row);setMenu(null);}},
   {id:'manage',label:t.manage,onSelect:()=>{dialogOpener.current=menu.anchor;menu.anchor.focus({preventScroll:true});setDialog({ownerId:userId,row:menu.row});setMenu(null);}},
   {id:'stop',label:t.stop,onSelect:()=>{dialogOpener.current=menu.anchor;menu.anchor.focus({preventScroll:true});setDialog({ownerId:userId,row:menu.row,initialAction:'close'});setMenu(null);}},
   ]:[]),
   {id:'open',label:common.open,onSelect:()=>{onOpen(menu.row);setMenu(null);}},
   ...menu.row.groups.map(group=>({id:`group:${group.labelId}`,label:`${t.manage}: ${group.name}`,icon:<Folder size={16}/>,onSelect:()=>{dialogOpener.current=menu.anchor;menu.anchor.focus({preventScroll:true});setGroupDialog({ownerId:userId,...group});setMenu(null);}})),
  ]}/>}
  {groupDialog?.ownerId===userId&&<OwnedLabelSharing userId={userId} labelId={groupDialog.labelId} name={groupDialog.name} collections={ownCollections} locale={locale} onClose={()=>{restoreFocus.current=true;setGroupDialog(null);void catalog.refresh();onChanged();}}/>}
  {details&&<DialogSurface className={overlays.dialog} aria-label={common.collections} onDismiss={()=>setDetailsSelection(null)}><CollectionDetailsController key={`${userId}:${details.id}`} userId={userId} id={details.id} itemCount={details.itemCount} canEditLabels={Boolean(labels.snapshot)} onUnavailable={()=>setLabelEditor(null)} onChanged={()=>{onChanged();void catalog.refresh();}} locale={locale} labelNames={labels.snapshot?.assignments.filter(item=>item.collection_id===details.id).map(item=>labelRows(labels.snapshot,locale).find(row=>row.label.id===item.label_id)?.path).filter((name):name is string=>Boolean(name))??[]} isShared onClose={()=>setDetailsSelection(null)} onLabels={name=>setLabelEditor({ownerId:userId,id:details.id,name,selected:labels.snapshot?.assignments.filter(item=>item.collection_id===details.id).map(item=>item.label_id)??[]})} onOpen={name=>{setDetailsSelection(null);onOpen({...details,name});}}/></DialogSurface>}
  {labelEditor?.ownerId===userId&&<DialogSurface className={overlays.dialog} aria-label={common.assign} onDismiss={()=>{if(!labels.busy)setLabelEditor(null);}}><form className={s.editor} onSubmit={event=>{event.preventDefault();void labels.mutate({type:'set-collection-labels',collection_id:labelEditor.id,label_ids:labelEditor.selected}).then(saved=>{if(saved){setLabelEditor(null);void catalog.refresh();onChanged();}});}}><header><h2>{common.assign}</h2></header><LabelAssignmentPicker name={labelEditor.name} snapshot={labels.snapshot} selected={labelEditor.selected} disabled={labels.busy} locale={locale} onToggle={id=>setLabelEditor(current=>current?{...current,selected:current.selected.includes(id)?current.selected.filter(value=>value!==id):[...current.selected,id]}:current)}/>{labels.error&&<p role="alert">{labels.error==='conflict'?common.conflict:common.failed}</p>}<footer><ActionButton type="button" disabled={labels.busy} onClick={()=>setLabelEditor(null)}>{common.cancel}</ActionButton><ActionButton variant="primary" type="submit" disabled={labels.busy}>{labels.busy?common.saving:common.save}</ActionButton></footer></form></DialogSurface>}
  {process.env.NEXT_PUBLIC_LABEL_SHARING_ENABLED==='true'&&labels.audience&&['awaiting','confirming','uncertain','checking'].includes(labels.audience.state.status)&&<LabelAudienceConfirmation controller={labels.audience} collections={ownCollections} locale={locale} onConfirm={()=>{void labels.audience.confirm().then(saved=>{if(saved){setLabelEditor(null);void catalog.refresh();onChanged();}});}} onCheck={()=>{void labels.audience.check().then(saved=>{if(saved){setLabelEditor(null);void catalog.refresh();onChanged();}});}}/>}
  {dialog?.ownerId===userId&&<OwnedCollectionSharing key={`${userId}:${dialog.row.id}`} userId={userId} collectionId={dialog.row.id} name={dialog.row.name} locale={locale} initialAction={dialog.initialAction} onClose={closeDialog}/>}
 </section>;
}
