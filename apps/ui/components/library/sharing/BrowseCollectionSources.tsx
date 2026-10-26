'use client';
import React from 'react';
import {FileText,Folder,Check,Share2} from 'lucide-react';
import {usePersonalCollectionCatalog} from '../organization/usePersonalCollectionCatalog';
import {organizationCopy} from '../organization/copy';
import type {OnboardingLanguage} from '@/lib/onboardingI18n';
import type {LibraryFilterOption} from '@/components/practice/library/LibraryFilters';
import type {PersonalCollection} from '@/lib/collections/sharing/personalCatalogContract';
import f from '@/components/practice/library/libraryFilters.module.css';
export function BrowseCollectionSources({userId,language,query,options,curatedIds,selected,select,onSelect,locale}:{userId:string;language:string;query:string;options:LibraryFilterOption[];curatedIds:string[];selected:string|null;select:(id:string|null)=>void;onSelect:(row:PersonalCollection)=>void;locale:OnboardingLanguage}){
 const catalog=usePersonalCollectionCatalog({userId,active:true,query:{query,sort:'name',scope:'all',labelId:null,languageCode:language,limit:50}}),copy=organizationCopy(locale);
 const base=options.filter(option=>!option.id?.startsWith('collection:')||curatedIds.includes(option.id.slice(11))).filter(option=>option.label.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
 return <>{base.map(option=><button type="button" key={option.id??'all'} className={f.sourceOption} aria-pressed={selected===option.id} onClick={()=>select(option.id)}><span className={f.sourceName}>{option.id?.startsWith('label:')?<Folder size={15}/>:option.id?.startsWith('collection:')?<FileText size={15}/>:null}{option.label}</span>{selected===option.id&&<Check size={14}/>}</button>)}
 {catalog.collections.map(row=><button type="button" key={row.id} className={f.sourceOption} aria-pressed={selected==='collection:'+row.id} onClick={()=>{onSelect(row);select('collection:'+row.id);}}><span className={f.sourceName}><FileText size={15}/>{row.name}{row.ownership==='received'&&<Share2 size={13} aria-label={copy.shared}/>}</span>{selected==='collection:'+row.id&&<Check size={14}/>}</button>)}
 {catalog.status==='loading'&&<p role="status">{copy.loading}</p>}{catalog.status==='error'&&<p role="alert">{copy.error}<button type="button" onClick={()=>void catalog.refresh()}>{copy.retry}</button></p>}
 {catalog.nextCursor&&<button type="button" className={f.reset} disabled={catalog.loadingMore} onClick={()=>void catalog.loadMore()}>{catalog.loadingMore?copy.loading:copy.moreResults}</button>}
 {catalog.status==='ready'&&!base.length&&!catalog.collections.length&&<p>{copy.noResults}</p>}</>;
}
