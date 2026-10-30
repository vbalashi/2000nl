'use client';
import React,{useState,useRef,useEffect} from 'react';
import {Eye,FileText,Plus,Search,MoreHorizontal} from 'lucide-react';
import type {OnboardingLanguage} from '@/lib/onboardingI18n';
import type {ReceivedCollection,ReceivedCatalogQuery} from '@/lib/collections/sharing/receivedCatalogContract';
import {readUnsubscribeJournal,tabUnsubscribeStore} from '@/lib/collections/sharing/unsubscribeJournal';
import {ActionMenu} from '@/components/practice/ui/ActionMenu';
import {ForwardCollection,UnsubscribeCollection,receivedActionCopy} from './ReceivedCollectionActions';
import {useReceivedCatalog} from '../organization/useReceivedCatalog';
import {organizationCopy} from '../organization/copy';
import s from '../organization/organization.module.css';
const copy={
 en:{added:'Added by me',add:'Add by link / code',empty:'No shared collections added',error:'Could not load shared collections.',shared:'Shared · view only'},
 ru:{added:'Добавленные мной',add:'Добавить по ссылке / коду',empty:'Пока нет добавленных общих коллекций',error:'Не удалось загрузить общие коллекции.',shared:'Общая · только просмотр'},
 nl:{added:'Door mij toegevoegd',add:'Toevoegen via link / code',empty:'Nog geen gedeelde collecties toegevoegd',error:'Gedeelde collecties konden niet worden geladen.',shared:'Gedeeld · alleen bekijken'},
};
export function ReceivedCollections({userId,active,locale,onOpen,onAdd,embedded=false,onChanged,catalogOverride}:{userId:string;active:boolean;locale:OnboardingLanguage;onOpen:(row:ReceivedCollection)=>void;onAdd:()=>void;embedded?:boolean;onChanged?:()=>void;catalogOverride?:ReturnType<typeof useReceivedCatalog>}){
 const [query,setQuery]=useState('');
 const actionFocus=useRef<HTMLButtonElement|null>(null),addButton=useRef<HTMLButtonElement|null>(null),searchInput=useRef<HTMLInputElement|null>(null);
 const [menu,setMenu]=useState<{row:ReceivedCollection;anchor:HTMLButtonElement}|null>(null);
 const [action,setAction]=useState<{kind:'forward';row:ReceivedCollection}|{kind:'unsubscribe';row:Pick<ReceivedCollection,'id'|'name'>}|null>(null);
 useEffect(()=>{if(action||!actionFocus.current)return;const target=actionFocus.current.isConnected?actionFocus.current:addButton.current??searchInput.current;target?.focus({preventScroll:true});actionFocus.current=null;},[action]);
 const [dismissed,setDismissed]=useState<string|null>(null);
 const pending=active?readUnsubscribeJournal(tabUnsubscribeStore(),userId):null;
 const pendingKey=pending?JSON.stringify([userId,pending.command.operationId]):null;
 const closeUnsubscribe=()=>{const current=readUnsubscribeJournal(tabUnsubscribeStore(),userId);setDismissed(current?JSON.stringify([userId,current.command.operationId]):null);setAction(null);};
 const [sort,setSort]=useState<ReceivedCatalogQuery['sort']>('recent');
 const connectedCatalog=useReceivedCatalog({userId,active:active&&!catalogOverride,query:{query,sort,scope:'all',labelId:null,limit:50}});
 const catalog=catalogOverride??connectedCatalog;
 const t=copy[locale],common=organizationCopy(locale),actions=receivedActionCopy(locale);
 useEffect(()=>{if(!active||action||pendingKey===dismissed)return;const pending=readUnsubscribeJournal(tabUnsubscribeStore(),userId);if(pending&&'collectionId'in pending.command){const id=pending.command.collectionId;const row=catalog.collections.find(row=>row.id===id);setAction({kind:'unsubscribe',row:row??{id,name:common.collections}});}},[active,userId,action,catalog.collections,common.collections,pendingKey,dismissed]);
 return <section className={`${s.catalog} ${s.received}`} aria-label={t.added}>
  {!embedded&&<header className={s.catalogHeader}><h2>{t.added}</h2><button ref={addButton} type="button" onClick={onAdd}><Plus size={16}/><span>{t.add}</span></button></header>}
  {pendingKey&&pendingKey===dismissed&&<button type="button" onClick={()=>setDismissed(null)}>{actions.check}</button>}
  <div className={s.filters}><label className={s.search}><Search size={16} aria-hidden="true"/><input ref={searchInput} aria-label={common.search} placeholder={common.search} maxLength={100} value={query} onChange={event=>setQuery(event.target.value)}/></label>
   <select aria-label={locale==='ru'?'Сортировка':locale==='nl'?'Sorteren':'Sort'} value={sort} onChange={event=>setSort(event.target.value as ReceivedCatalogQuery['sort'])}><option value="recent">{common.recent}</option><option value="name">{common.alphabetic}</option><option value="count">{common.count}</option></select></div>
  {catalog.status==='loading'?<div className={s.state} role="status">{common.loading}</div>:catalog.status==='error'?<div className={s.state}><p role="alert">{t.error}</p><button onClick={()=>void catalog.refresh()}>{common.retry}</button></div>:catalog.status==='ready'&&catalog.collections.length===0?<p className={s.state}>{query.trim()?common.noResults:t.empty}</p>:null}
  <div className={s.results}>{catalog.collections.map(row=><article className={s.collection} key={row.id}><FileText size={20} aria-hidden="true"/><div className={s.collectionCopy}><button className={s.collectionName} onClick={()=>onOpen(row)}>{row.name}</button><p><Eye size={14} aria-hidden="true"/>{t.shared} · {row.itemCount.toLocaleString(locale)}</p></div><button type="button" onClick={()=>onOpen(row)}>{common.open}</button><button type="button" aria-label={`${common.more} · ${row.name}`} onClick={event=>setMenu({row,anchor:event.currentTarget})}><MoreHorizontal size={18}/></button></article>)}</div>
  {catalog.nextCursor&&<button className={s.loadMore} disabled={catalog.loadingMore} onClick={()=>void catalog.loadMore()}>{catalog.loadingMore?common.loading:common.moreResults}</button>}
 {menu&&<ActionMenu anchor={menu.anchor} title={common.more} language={locale} onClose={()=>setMenu(null)} items={[
   {id:'forward',label:actions.forward,onSelect:()=>{actionFocus.current=menu.anchor;setAction({kind:'forward',row:menu.row});setMenu(null);}},
   {id:'unsubscribe',label:actions.leave,onSelect:()=>{actionFocus.current=menu.anchor;setAction({kind:'unsubscribe',row:menu.row});setMenu(null);}},
  ]}/>}
  {action?.kind==='forward'&&<ForwardCollection key={action.row.id} userId={userId} row={action.row} locale={locale} onClose={()=>setAction(null)}/>}
  {action?.kind==='unsubscribe'&&<UnsubscribeCollection key={action.row.id} userId={userId} row={action.row} locale={locale} onClose={closeUnsubscribe} onDone={()=>{setAction(null);void catalog.refresh();onChanged?.();}}/>}
 </section>;
}
