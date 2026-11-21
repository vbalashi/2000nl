'use client';
import React from 'react';
import {MoreHorizontal} from 'lucide-react';
import {organizationCopy} from './copy';
import type {LabelSharingCatalog} from '@/lib/collections/sharing/labelSharingContract';
import type {OnboardingLanguage} from '@/lib/onboardingI18n';
import {localizedSection} from '@/lib/i18n/catalog';
import {CollectionAccessIcon} from './CollectionAccessIcon';
import s from './organization.module.css';
type Group=LabelSharingCatalog['received'][number];
export function ReceivedGroupScopes({locale,groups,query,selectedId,onSelect,onMenu}:{
 locale:OnboardingLanguage; groups:Group[]; query:string; selectedId:string|null;
 onSelect:(group:Group)=>void; onMenu?:(anchor:HTMLButtonElement,group:Group)=>void;
}){
 const received=localizedSection('sharedWorkspace')[locale].received;
 const more=organizationCopy(locale).more;
 return <>{groups.filter(row=>row.name.toLocaleLowerCase(locale).includes(query.trim().toLocaleLowerCase(locale))).map(row=>
  <div className={s.labelRow} key={row.labelId}>
   <span className={s.treeSpacer} aria-hidden="true"/>
   <button type="button" aria-label={row.name} aria-pressed={selectedId===row.labelId} title={received} onClick={()=>onSelect(row)}>
    <CollectionAccessIcon kind="label" received label={received}/><span>{row.name}</span>
   </button>
   {onMenu&&<button type="button" aria-label={`${more}: ${row.name}`} onClick={event=>onMenu(event.currentTarget,row)}>
    <MoreHorizontal size={16} strokeWidth={1.5}/>
   </button>}
  </div>
 )}</>;
}
