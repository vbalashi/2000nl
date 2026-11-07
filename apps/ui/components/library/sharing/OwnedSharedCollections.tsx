'use client';
import { localizedSection } from "@/lib/i18n/catalog";

import {CollectionSortControl} from '@/components/library/organization/CollectionSortControl';
import React,{useEffect,useRef,useState} from 'react';
import {FileText,MoreHorizontal,Search,Share2} from 'lucide-react';
import type {OnboardingLanguage} from '@/lib/onboardingI18n';
import {usePersonalLabels} from "../organization/usePersonalLabels";
import {labelRows} from "@/lib/collections/labels/catalog";
import {CollectionDetailsPanel} from "../organization/CollectionDetailsPanel";
import {collectionDetailsFromSummary} from "@/lib/collections/details/summaryAdapter";
import {DialogSurface} from "@/components/practice/ui/DialogSurface";
import overlays from "@/components/practice/library/libraryOverlays.module.css";
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
export function OwnedSharedCollections({userId,active,locale,onOpen,onChanged,catalogOverride}:{userId:string;active:boolean;locale:OnboardingLanguage;onOpen:(row:OwnedSharedCollection)=>void;onChanged:()=>void;catalogOverride?:ReturnType<typeof useOwnedSharedCatalog>}){
 const [detailsSelection,setDetailsSelection]=useState<{ownerId:string;id:string}|null>(null);
 const [query,setQuery]=useState(''),[sort,setSort]=useState<OwnedCatalogQuery['sort']>('recent');
 const connectedCatalog=useOwnedSharedCatalog({userId,active:active&&!catalogOverride,query:{query,sort,limit:50}});
 const catalog=catalogOverride??connectedCatalog;
 const labels=usePersonalLabels(active,userId);
 const details=detailsSelection?.ownerId===userId?catalog.collections.find(row=>row.id===detailsSelection.id):undefined;
 const [menu,setMenu]=useState<{ownerId:string;row:OwnedSharedCollection;anchor:HTMLButtonElement}|null>(null);
 const [dialog,setDialog]=useState<Dialog|null>(null),[notice,setNotice]=useState<{key:string;text:string}|null>(null);
 const dismissed=useRef(new Set<string>()),wasActive=useRef(false),copyRequest=useRef<AbortController|null>(null);
 const dialogOpener=useRef<HTMLButtonElement|null>(null),searchInput=useRef<HTMLInputElement|null>(null),restoreFocus=useRef(false);
 useEffect(()=>{if(dialog||!restoreFocus.current)return;restoreFocus.current=false;const target=dialogOpener.current?.isConnected?dialogOpener.current:searchInput.current;target?.focus({preventScroll:true});dialogOpener.current=null;},[dialog,catalog.collections]);
 const t=copy[locale],common=organizationCopy(locale),key=JSON.stringify([userId,active]);
 const scope=useRef(key);scope.current=key;
 useEffect(()=>{copyRequest.current?.abort();setNotice(null);return()=>copyRequest.current?.abort();},[key]);
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
  copyRequest.current?.abort();const abort=new AbortController();copyRequest.current=abort;setNotice(null);
  const valid=()=>!abort.signal.aborted&&scope.current===key;
  try{
   const management=await readCollectionShareManagement(userId,row.id,abort.signal);
   if(!valid())return;
   if(!management.isOpen||!management.invitationCode)throw new Error('share_unavailable');
   await navigator.clipboard.writeText(shareInvitationUrl(management.invitationCode,window.location.origin));
   if(valid())setNotice({key,text:t.copied});
  }catch{if(valid()){setNotice({key,text:t.copyFailed});setDialog({ownerId:userId,row});}}
  finally{if(copyRequest.current===abort)copyRequest.current=null;}
 };
 return <section className={`${s.catalog} ${s.received} ${s.ownedShared}`} aria-label={t.title}>
  <div className={s.filters}><label className={s.search}><Search size={16} aria-hidden="true"/><input ref={searchInput} aria-label={common.search} placeholder={common.search} maxLength={100} value={query} onChange={event=>setQuery(event.target.value)}/></label>
   <CollectionSortControl locale={locale} value={sort} onChange={setSort}/></div>
  {notice?.key===key&&<p role="status" className={s.muted}>{notice.text}</p>}
  {catalog.status==='loading'?<div className={s.state} role="status">{common.loading}</div>:catalog.status==='error'?<div className={s.state}><p role="alert">{t.error}</p><button onClick={()=>void catalog.refresh()}>{common.retry}</button></div>:catalog.status==='ready'&&catalog.collections.length===0?<p className={s.state}>{query.trim()?common.noResults:t.empty}</p>:null}
  {catalog.collections.length>0&&<div className={s.ownedSharedTable} role="table" aria-label={t.title}><div className={s.ownedSharedHead} role="row"><span role="columnheader">{common.collections}</span><span role="columnheader">{t.active}</span><span role="columnheader">{t.subscribers}</span><span role="columnheader">{common.more}</span></div>
   <div className={s.ownedSharedRows}>{catalog.collections.map(row=><div className={s.ownedSharedRow} role="row" key={row.id}>
    <div role="cell" className={s.ownedSharedName}><FileText size={18} aria-hidden="true"/><div><button type="button" onClick={()=>setDetailsSelection({ownerId:userId,id:row.id})}>{row.name}</button><small>{formatUiCount(locale,row.itemCount,common,'meaning')} · {t.owned}</small></div></div>
    <span role="cell" className={s.ownedSharedStatus}><Share2 size={14} aria-hidden="true"/>{t.active}</span>
    <span role="cell"><span className={s.mobileSubscriberLabel}>{t.subscribers}: </span>{row.subscriberCount.toLocaleString(locale)}</span>
    <div role="cell" className={s.ownedSharedActions}><button type="button" onClick={event=>{dialogOpener.current=event.currentTarget;void copyLink(row);}}>{t.copy}</button><button type="button" aria-label={`${common.more} · ${row.name}`} onClick={event=>setMenu({ownerId:userId,row,anchor:event.currentTarget})}><MoreHorizontal size={18}/></button></div>
   </div>)}</div></div>}
  {catalog.nextCursor&&<button className={s.loadMore} disabled={catalog.loadingMore} onClick={()=>void catalog.loadMore()}>{catalog.loadingMore?common.loading:common.moreResults}</button>}
  {menu?.ownerId===userId&&<ActionMenu anchor={menu.anchor} title={common.more} language={locale} onClose={()=>setMenu(null)} items={[
   {id:'manage',label:t.manage,onSelect:()=>{dialogOpener.current=menu.anchor;menu.anchor.focus({preventScroll:true});setDialog({ownerId:userId,row:menu.row});setMenu(null);}},
   {id:'open',label:common.open,onSelect:()=>{onOpen(menu.row);setMenu(null);}},
   {id:'stop',label:t.stop,onSelect:()=>{dialogOpener.current=menu.anchor;menu.anchor.focus({preventScroll:true});setDialog({ownerId:userId,row:menu.row,initialAction:'close'});setMenu(null);}},
  ]}/>}
  {details&&<DialogSurface className={overlays.dialog} aria-label={details.name} onDismiss={()=>setDetailsSelection(null)}><CollectionDetailsPanel details={collectionDetailsFromSummary({id:details.id,name:details.name,type:'user',item_count:details.itemCount},{canEditLabels:false})} locale={locale} labelNames={labels.snapshot?.assignments.filter(item=>item.collection_id===details.id).map(item=>labelRows(labels.snapshot,locale).find(row=>row.label.id===item.label_id)?.path).filter((name):name is string=>Boolean(name))??[]} isShared onClose={()=>setDetailsSelection(null)} onLabels={()=>{}} onOpen={()=>{setDetailsSelection(null);onOpen(details);}}/></DialogSurface>}
  {dialog?.ownerId===userId&&<OwnedCollectionSharing key={`${userId}:${dialog.row.id}`} userId={userId} collectionId={dialog.row.id} name={dialog.row.name} locale={locale} initialAction={dialog.initialAction} onClose={closeDialog}/>}
 </section>;
}
