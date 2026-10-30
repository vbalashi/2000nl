'use client';
import React from 'react';
import {Plus} from 'lucide-react';
import type {OnboardingLanguage} from '@/lib/onboardingI18n';
import type {ReceivedCollection} from '@/lib/collections/sharing/receivedCatalogContract';
import type {OwnedSharedCollection} from '@/lib/collections/sharing/ownedCatalogContract';
import {useSharingOverview} from './useSharingOverview';
import {OwnedSharedCollections} from './OwnedSharedCollections';
import {ReceivedCollections} from './ReceivedCollections';
import s from '../organization/organization.module.css';

const copy={
 en:{owned:'Shared by me',received:'Added by me',add:'Add by link / code'},
 ru:{owned:'Я поделился',received:'Добавленные мной',add:'Добавить по ссылке / коду'},
 nl:{owned:'Door mij gedeeld',received:'Door mij toegevoegd',add:'Toevoegen via link / code'},
};
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
  <div className={s.sharedTop}><div className={s.sharedSwitcher} role="group" aria-label={locale==='ru'?'Разделы общего доступа':locale==='nl'?'Gedeelde onderdelen':'Shared sections'}>
   <button type="button" aria-pressed={view==='owned'} onClick={()=>onViewChange('owned')}>{t.owned}{counts?` · ${counts.sharedByMe.toLocaleString(locale)}`:''}</button>
   <button type="button" aria-pressed={view==='received'} onClick={()=>onViewChange('received')}>{t.received}{counts?` · ${counts.addedByMe.toLocaleString(locale)}`:''}</button>
  </div><button type="button" onClick={onAdd}><Plus size={16}/>{t.add}</button></div>
  {view==='owned'?owned:received}
 </div>;
}
