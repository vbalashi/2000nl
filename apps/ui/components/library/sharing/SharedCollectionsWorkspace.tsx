'use client';
import { localizedSection, localizedField } from "@/lib/i18n/catalog";

import React,{useRef,useState} from 'react';
import type {CollectionSort} from '@/lib/collections/labels/catalog';
import {SharedCatalogControls} from './SharedCatalogControls';
import {Plus} from 'lucide-react';
import {SegmentedControl} from '@/components/practice/ui/SegmentedControl';
import type {WordListSummary} from '@/lib/types';
import type {OnboardingLanguage} from '@/lib/onboardingI18n';
import type {ReceivedCollection} from '@/lib/collections/sharing/receivedCatalogContract';
import type {OwnedSharedCollection} from '@/lib/collections/sharing/ownedCatalogContract';
import {useSharingOverview} from './useSharingOverview';
import {OwnedSharedCollections} from './OwnedSharedCollections';
import {ReceivedCollections} from './ReceivedCollections';
import {SharedLabelGroups} from './SharedLabelGroups';
import {useLabelSharingCatalog} from './useLabelSharingCatalog';
import {organizationCopy} from '../organization/copy';
import s from '../organization/organization.module.css';

const copy=localizedSection("sharedWorkspace");
type WorkspaceProps={userId:string;active:boolean;locale:OnboardingLanguage;ownCollections?:WordListSummary[];view:'owned'|'received';onViewChange:(view:'owned'|'received')=>void;onOpenOwned:(row:OwnedSharedCollection)=>void;onOpenReceived:(row:ReceivedCollection)=>void;onOpenGroupCollection?:(id:string,ownership:'owned'|'received')=>void;onAdd:()=>void;onReference?:(code:string)=>void};
export function SharedCollectionsWorkspace(props:WorkspaceProps){
 const selectionKey=JSON.stringify([props.userId,props.active,props.view]);
 const [filter,setFilter]=useState<{key:string;query:string;sort:CollectionSort}>({key:selectionKey,query:'',sort:'recent'});
 const selection={...(filter.key===selectionKey?filter:{query:'',sort:'recent' as const}),searchInputRef:useRef<HTMLInputElement>(null)};
 const update=(next:Partial<{query:string;sort:CollectionSort}>)=>setFilter({key:selectionKey,query:selection.query,sort:selection.sort,...next});
 const toolbar=<SharedCatalogControls locale={props.locale} selection={selection} onQueryChange={query=>update({query})} onSortChange={sort=>update({sort})}/>;
 const overview=useSharingOverview(props.userId,props.active);
 const enabled=process.env.NEXT_PUBLIC_LABEL_SHARING_ENABLED==='true';
 const groups=useLabelSharingCatalog(props.userId,props.active&&enabled);
 const owned=groups.data?.owned.filter(row=>row.isOpen)??[],received=groups.data?.received??[];
 const filterGroups=<T extends {name:string}>(rows:T[])=>{const matching=rows.filter(row=>row.name.toLocaleLowerCase(props.locale).includes(selection.query.trim().toLocaleLowerCase(props.locale)));return selection.sort==='name'?[...matching].sort((a,b)=>a.name.localeCompare(b.name,props.locale)):matching;};
 const visibleOwned=filterGroups(owned),visibleReceived=filterGroups(received);
 const changed=()=>{void overview.refresh();void groups.refresh();};
 const groupRows=(view:'owned'|'received')=>enabled?<>{groups.status==='error'&&<p role="alert">{organizationCopy(props.locale).sharingStatusError} <button onClick={()=>void groups.refresh()}>{organizationCopy(props.locale).retry}</button></p>}<SharedLabelGroups userId={props.userId} locale={props.locale} view={view} collections={props.ownCollections} groups={view==='owned'?visibleOwned:visibleReceived} onChanged={changed} onReference={props.onReference} onOpenCollection={id=>props.onOpenGroupCollection?.(id,view)}/></>:null;
 return <SharedCollectionsWorkspaceView {...props} toolbar={toolbar} counts={overview.data?{sharedByMe:overview.data.sharedByMe+owned.length,addedByMe:overview.data.addedByMe+received.length}:undefined}
  owned={<>{groupRows('owned')}<OwnedSharedCollections userId={props.userId} active={props.active} locale={props.locale} selection={selection} hasGroups={visibleOwned.length>0} onOpen={props.onOpenOwned} onChanged={changed}/></>}
  received={<>{groupRows('received')}<ReceivedCollections userId={props.userId} active={props.active} locale={props.locale} selection={selection} hasGroups={visibleReceived.length>0} onOpenCollectionId={id=>props.onOpenGroupCollection?.(id,'received')} embedded onOpen={props.onOpenReceived} onAdd={props.onAdd} onChanged={changed}/></>}/>;
}
export function SharedCollectionsWorkspaceView({locale,view,onViewChange,onAdd,counts,owned,received,toolbar}:WorkspaceProps&{counts?:{sharedByMe:number;addedByMe:number};owned:React.ReactNode;received:React.ReactNode;toolbar?:React.ReactNode}){
 const t=copy[locale];
 return <div className={s.sharedWorkspace}>
  <div className={s.sharedTop}><div className={s.sharedSwitcher}><SegmentedControl standard label={localizedField("sharedWorkspace", "label")[locale]}>
   <button type="button" aria-pressed={view==='owned'} onClick={()=>onViewChange('owned')}>{t.owned}{counts?` · ${counts.sharedByMe.toLocaleString(locale)}`:''}</button>
   <button type="button" data-onboarding="shared-received" aria-pressed={view==='received'} onClick={()=>onViewChange('received')}>{t.received}{counts?` · ${counts.addedByMe.toLocaleString(locale)}`:''}</button>
  </SegmentedControl></div><button type="button" data-onboarding="invitation-add" onClick={onAdd}><Plus size={16}/>{t.add}</button></div>
  {toolbar}
  {view==='owned'?owned:received}
 </div>;
}
