'use client';
import { localizedSection } from "@/lib/i18n/catalog";

import type {SharedCatalogSelection} from './SharedCatalogControls';
import {CollectionSortControl} from '@/components/library/organization/CollectionSortControl';
import React,{useState,useRef,useEffect} from 'react';
import {FileText,Folder,Plus,Search,MoreHorizontal} from 'lucide-react';
import type {OnboardingLanguage} from '@/lib/onboardingI18n';
import type {ReceivedCollection,ReceivedCatalogQuery} from '@/lib/collections/sharing/receivedCatalogContract';
import {readUnsubscribeJournal,tabUnsubscribeStore} from '@/lib/collections/sharing/unsubscribeJournal';
import {ActionMenu} from '@/components/practice/ui/ActionMenu';
import {ForwardCollection,UnsubscribeCollection,receivedActionCopy} from './ReceivedCollectionActions';
import {useReceivedCatalog} from '../organization/useReceivedCatalog';
import {organizationCopy} from '../organization/copy';
import {IconAction} from '@/components/practice/ui/IconAction';
import {SharedLabelContents} from './SharedLabelContents';
import {DialogSurface} from '@/components/practice/ui/DialogSurface';
import {CollectionDetailsController} from '../organization/CollectionDetailsController';
import {ReceivedCollectionLabels} from '../organization/ReceivedCollectionLabels';
import {formatUiCount} from '@/lib/uiMessages';
import {usePersonalLabels} from '../organization/usePersonalLabels';
import {labelRows} from '@/lib/collections/labels/catalog';
import overlays from '@/components/practice/library/libraryOverlays.module.css';
import s from '../organization/organization.module.css';
const copy=localizedSection("receivedCollections");
export function ReceivedCollections({userId,active,locale,onOpen,onAdd,embedded=false,onChanged,catalogOverride,hasGroups=false,onOpenCollectionId,selection}:{userId:string;active:boolean;locale:OnboardingLanguage;onOpen:(row:ReceivedCollection)=>void;onAdd:()=>void;embedded?:boolean;onChanged?:()=>void;hasGroups?:boolean;selection?:SharedCatalogSelection;onOpenCollectionId?:(id:string)=>void;catalogOverride?:ReturnType<typeof useReceivedCatalog>}){
 const [localQuery,setQuery]=useState('');
 const actionFocus=useRef<HTMLButtonElement|null>(null),addButton=useRef<HTMLButtonElement|null>(null),localSearchInput=useRef<HTMLInputElement|null>(null);
 const searchInput=selection?.searchInputRef??localSearchInput;
 const [menuState,setMenu]=useState<{userId:string;row:ReceivedCollection;anchor:HTMLButtonElement}|null>(null);
 const [group,setGroup]=useState<{userId:string;labelId:string;name:string}|null>(null);
 const [detail,setDetail]=useState<{userId:string;id:string;row:ReceivedCollection}|null>(null);
 const [labelEditor,setLabelEditor]=useState<{userId:string;id:string;name:string}|null>(null);
 const labels=usePersonalLabels(active&&detail?.userId===userId,userId);
 const [action,setAction]=useState<{kind:'forward';row:ReceivedCollection}|{kind:'unsubscribe';row:Pick<ReceivedCollection,'id'|'name'>}|null>(null);
 useEffect(()=>{if(action||group||!actionFocus.current)return;const target=actionFocus.current.isConnected?actionFocus.current:addButton.current??searchInput.current;target?.focus({preventScroll:true});actionFocus.current=null;},[action,group,searchInput]);
 const [dismissed,setDismissed]=useState<string|null>(null);
 const pending=active?readUnsubscribeJournal(tabUnsubscribeStore(),userId):null;
 const pendingKey=pending?JSON.stringify([userId,pending.command.operationId]):null;
 const closeUnsubscribe=()=>{const current=readUnsubscribeJournal(tabUnsubscribeStore(),userId);setDismissed(current?JSON.stringify([userId,current.command.operationId]):null);setAction(null);};
 const [localSort,setSort]=useState<ReceivedCatalogQuery['sort']>('recent');
 const query=selection?.query??localQuery,sort=selection?.sort??localSort;
 const connectedCatalog=useReceivedCatalog({userId,active:active&&!catalogOverride,query:{query,sort,scope:'all',labelId:null,limit:50}});
 const catalog=catalogOverride??connectedCatalog;
 const menuRow=menuState?.userId===userId?catalog.collections.find(row=>row.id===menuState.row.id):undefined;
 const menu=menuRow&&menuState?{...menuState,row:menuRow}:null;
 const t=copy[locale],common=organizationCopy(locale),actions=receivedActionCopy(locale);
 useEffect(()=>{if(!active||action||pendingKey===dismissed)return;const pending=readUnsubscribeJournal(tabUnsubscribeStore(),userId);if(pending&&'collectionId'in pending.command){const id=pending.command.collectionId;const row=catalog.collections.find(row=>row.id===id);setAction({kind:'unsubscribe',row:row??{id,name:common.collections}});}},[active,userId,action,catalog.collections,common.collections,pendingKey,dismissed]);
 return <section className={`${s.catalog} ${s.received}`} aria-label={t.added}>
  {!embedded&&<header className={s.catalogHeader}><h2>{t.added}</h2><button ref={addButton} type="button" onClick={onAdd}><Plus size={16}/><span>{t.add}</span></button></header>}
  {pendingKey&&pendingKey===dismissed&&<button type="button" onClick={()=>setDismissed(null)}>{actions.check}</button>}
  {!selection&&<div className={s.filters}><label className={s.search}><Search size={16} aria-hidden="true"/><input ref={searchInput} aria-label={common.search} placeholder={common.search} maxLength={100} value={query} onChange={event=>setQuery(event.target.value)}/></label>
   <CollectionSortControl locale={locale} value={sort} onChange={setSort}/></div>}
  {catalog.status==='loading'?<div className={s.state} role="status">{common.loading}</div>:catalog.status==='error'?<div className={s.state}><p role="alert">{t.error}</p><button onClick={()=>void catalog.refresh()}>{common.retry}</button></div>:catalog.status==='ready'&&catalog.collections.length===0&&!hasGroups?<p className={s.state}>{query.trim()?common.noResults:t.empty}</p>:null}
  <div className={s.results}>{catalog.collections.map(row=><article className={s.collection} key={row.id}><span className={s.accessIcon} title={t.shared}><FileText size={16}/></span><div className={s.collectionCopy}><button className={s.collectionName} onClick={()=>setDetail({userId,id:row.id,row})}>{row.name}</button><p>{formatUiCount(locale,row.itemCount,common,'meaning')}{row.groups.length>0&&<> · <Folder size={12} aria-label={localizedSection('labelSharing')[locale].groups}/>{row.groups.map(group=>group.name).join(', ')}</>}</p></div><IconAction label={`${common.more} · ${row.name}`} onClick={event=>setMenu({userId,row,anchor:event.currentTarget})}><MoreHorizontal size={16} strokeWidth={1.5}/></IconAction></article>)}</div>
  {catalog.nextCursor&&<button className={s.loadMore} disabled={catalog.loadingMore} onClick={()=>void catalog.loadMore()}>{catalog.loadingMore?common.loading:common.moreResults}</button>}
 {menu?.userId===userId&&<ActionMenu anchor={menu.anchor} title={common.more} language={locale} onClose={()=>setMenu(null)} items={[
   {id:'open',label:common.open,onSelect:()=>{onOpen(menu.row);setMenu(null);}},
   ...(menu.row.directSubscription?[
    {id:'forward',label:actions.forward,onSelect:()=>{actionFocus.current=menu.anchor;setAction({kind:'forward',row:menu.row});setMenu(null);}},
    {id:'unsubscribe',label:actions.leave,onSelect:()=>{actionFocus.current=menu.anchor;setAction({kind:'unsubscribe',row:menu.row});setMenu(null);}},
   ]:[]),
   ...menu.row.groups.map(item=>({id:`group:${item.labelId}`,label:`${localizedSection('labelSharing')[locale].openGroup}: ${item.name}`,icon:<Folder size={16}/>,onSelect:()=>{actionFocus.current=menu.anchor;menu.anchor.focus({preventScroll:true});setGroup({userId,...item});setMenu(null);}})),
  ]}/>}
  {group?.userId===userId&&<SharedLabelContents userId={userId} labelId={group.labelId} name={group.name} locale={locale} onClose={()=>setGroup(null)} onOpen={id=>{setGroup(null);if(onOpenCollectionId)onOpenCollectionId(id);else{const row=catalog.collections.find(item=>item.id===id);if(row)onOpen(row);}}}/>}
  {detail?.userId===userId&&[catalog.collections.find(row=>row.id===detail.id)??detail.row].map(row=><DialogSurface key={row.id} className={overlays.dialog} aria-label={common.collections} onDismiss={()=>setDetail(null)}><CollectionDetailsController key={`${userId}:${row.id}`} userId={userId} id={row.id} itemCount={row.itemCount} canEditLabels={true} onUnavailable={()=>setLabelEditor(null)} locale={locale} labelNames={labelRows(labels.snapshot,locale).filter(item=>row.labelIds.includes(item.label.id)).map(item=>item.path)} isShared onClose={()=>setDetail(null)} onLabels={name=>setLabelEditor({userId,id:row.id,name})} onOpen={name=>{setDetail(null);onOpen({...row,name});}}/></DialogSurface>)}
  {labelEditor?.userId===userId&&<ReceivedCollectionLabels key={`${userId}:${labelEditor.id}`} userId={userId} collectionId={labelEditor.id} name={labelEditor.name} locale={locale} onClose={()=>setLabelEditor(null)} onSaved={()=>{setLabelEditor(null);void catalog.refresh();void labels.refresh();}}/>}
  {action?.kind==='forward'&&<ForwardCollection key={action.row.id} userId={userId} row={action.row} locale={locale} onClose={()=>setAction(null)}/>}
  {action?.kind==='unsubscribe'&&<UnsubscribeCollection key={action.row.id} userId={userId} row={action.row} locale={locale} onClose={closeUnsubscribe} onDone={()=>{setAction(null);void catalog.refresh();onChanged?.();}}/>}
 </section>;
}
