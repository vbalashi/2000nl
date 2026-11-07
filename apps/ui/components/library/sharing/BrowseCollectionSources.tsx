'use client';
import React from 'react';
import {localizedField} from '@/lib/i18n/catalog';
import type {SourceKind} from '@/components/practice/ui/SourceTypeControl';
import {BookOpen,Layers,Folder,Check,Share2} from 'lucide-react';
import {usePersonalCollectionCatalog} from '../organization/usePersonalCollectionCatalog';
import {organizationCopy} from '../organization/copy';
import type {OnboardingLanguage} from '@/lib/onboardingI18n';
import type {LibraryFilterOption} from '@/components/practice/library/LibraryFilters';
import type {PersonalCollection} from '@/lib/collections/sharing/personalCatalogContract';
import f from '@/components/practice/library/libraryFilters.module.css';
export function BrowseCollectionSources({userId,language,query,options,curatedIds,selected,select,onSelect,locale,kind='all'}:{userId:string;language:string;query:string;options:LibraryFilterOption[];curatedIds:string[];selected:string|null;select:(id:string|null)=>void;onSelect:(row:PersonalCollection)=>void;locale:OnboardingLanguage;kind?:SourceKind}){
 const catalog=usePersonalCollectionCatalog({userId,active:true,query:{query,sort:'name',scope:'all',labelId:null,languageCode:language,limit:50}}),copy=organizationCopy(locale);
 const base=options.filter(option=>kind==='all'||(kind==='dictionary'&&(!option.id||option.id.startsWith('dictionary:')))||(kind==='collection'&&(option.id?.startsWith('collection:')||option.id?.startsWith('label:')))).filter(option=>!option.id?.startsWith('collection:')||curatedIds.includes(option.id.slice(11))).filter(option=>option.label.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
 return <>{base.map(option=><button type="button" key={option.id??'all'} className={f.sourceOption} aria-label={option.label} aria-pressed={selected===option.id} onClick={()=>select(option.id)}><span className={f.sourceName}>{option.id?.startsWith('label:')?<Folder size={15}/>:option.id?.startsWith('collection:')?<Layers size={15}/>:option.id?<BookOpen size={15}/>:null}{option.label}</span><span className={f.sourceMeta}>{selected===option.id&&<Check size={14}/>}<small>{option.id&&!option.id.startsWith('label:')?localizedField('sourcePicker',option.id.startsWith('dictionary:')?'dictionarySingular':'collectionSingular')[locale]:null}</small></span></button>)}
 {catalog.collections.filter(row=>kind==='all'||(kind==='shared'?row.ownership==='received':kind==='collection'&&row.ownership!=='received')).map(row=><button type="button" key={row.id} className={f.sourceOption} aria-label={row.name} aria-pressed={selected==='collection:'+row.id} onClick={()=>{onSelect(row);select('collection:'+row.id);}}><span className={f.sourceName}>{row.ownership==='received'?<Share2 size={15} aria-label={copy.shared}/>:<Layers size={15}/>}<span>{row.name}</span></span><span className={f.sourceMeta}>{selected==='collection:'+row.id&&<Check size={14}/>}<small>{localizedField('sourcePicker',row.ownership==='received'?'sharedSingular':'collectionSingular')[locale]}</small></span></button>)}
 {catalog.status==='loading'&&<p role="status">{copy.loading}</p>}{catalog.status==='error'&&<p role="alert">{copy.error}<button type="button" onClick={()=>void catalog.refresh()}>{copy.retry}</button></p>}
 {catalog.nextCursor&&<button type="button" className={f.reset} disabled={catalog.loadingMore} onClick={()=>void catalog.loadMore()}>{catalog.loadingMore?copy.loading:copy.moreResults}</button>}
 {catalog.status==='ready'&&!catalog.nextCursor&&!base.length&&!catalog.collections.some(row=>kind==='all'||(kind==='shared'?row.ownership==='received':kind==='collection'&&row.ownership!=='received'))&&<p>{copy.noResults}</p>}</>;
}
