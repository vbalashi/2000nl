'use client';
import { localizedSection, localizedField } from "@/lib/i18n/catalog";

import React from 'react';
import {Plus} from 'lucide-react';
import {SegmentedControl} from '@/components/practice/ui/SegmentedControl';
import type {OnboardingLanguage} from '@/lib/onboardingI18n';
import type {ReceivedCollection} from '@/lib/collections/sharing/receivedCatalogContract';
import type {OwnedSharedCollection} from '@/lib/collections/sharing/ownedCatalogContract';
import {useSharingOverview} from './useSharingOverview';
import {OwnedSharedCollections} from './OwnedSharedCollections';
import {ReceivedCollections} from './ReceivedCollections';
import s from '../organization/organization.module.css';

const copy=localizedSection("sharedWorkspace");
type WorkspaceProps={userId:string;active:boolean;locale:OnboardingLanguage;view:'owned'|'received';onViewChange:(view:'owned'|'received')=>void;onOpenOwned:(row:OwnedSharedCollection)=>void;onOpenReceived:(row:ReceivedCollection)=>void;onAdd:()=>void};
export function SharedCollectionsWorkspace(props:WorkspaceProps){
 const overview=useSharingOverview(props.userId,props.active);
 return <SharedCollectionsWorkspaceView {...props} counts={overview.data??undefined}
  owned={<OwnedSharedCollections userId={props.userId} active={props.active} locale={props.locale} onOpen={props.onOpenOwned} onChanged={()=>void overview.refresh()}/>}
  received={<ReceivedCollections userId={props.userId} active={props.active} locale={props.locale} embedded onOpen={props.onOpenReceived} onAdd={props.onAdd} onChanged={()=>void overview.refresh()}/>}/>;
}
export function SharedCollectionsWorkspaceView({locale,view,onViewChange,onAdd,counts,owned,received}:WorkspaceProps&{counts?:{sharedByMe:number;addedByMe:number};owned:React.ReactNode;received:React.ReactNode}){
 const t=copy[locale];
 return <div className={s.sharedWorkspace}>
  <div className={s.sharedTop}><div className={s.sharedSwitcher}><SegmentedControl standard label={localizedField("sharedWorkspace", "label")[locale]}>
   <button type="button" aria-pressed={view==='owned'} onClick={()=>onViewChange('owned')}>{t.owned}{counts?` · ${counts.sharedByMe.toLocaleString(locale)}`:''}</button>
   <button type="button" data-onboarding="shared-received" aria-pressed={view==='received'} onClick={()=>onViewChange('received')}>{t.received}{counts?` · ${counts.addedByMe.toLocaleString(locale)}`:''}</button>
  </SegmentedControl></div><button type="button" data-onboarding="invitation-add" onClick={onAdd}><Plus size={16}/>{t.add}</button></div>
  {view==='owned'?owned:received}
 </div>;
}
