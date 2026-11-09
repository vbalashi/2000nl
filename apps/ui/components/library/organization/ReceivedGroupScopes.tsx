'use client';
import React from 'react';
import type {LabelSharingCatalog} from '@/lib/collections/sharing/labelSharingContract';
import type {OnboardingLanguage} from '@/lib/onboardingI18n';
import {localizedSection} from '@/lib/i18n/catalog';
import {CollectionAccessIcon} from './CollectionAccessIcon';
import s from './organization.module.css';
type Group=LabelSharingCatalog['received'][number];
/** Select a catalog scope; received groups never become editable personal labels. */
export function ReceivedGroupScopes({locale,groups,query,selectedId,onSelect}:{locale:OnboardingLanguage;groups:Group[];query:string;selectedId:string|null;onSelect:(group:Group)=>void}){
 const label=localizedSection('sharedWorkspace')[locale].received;
 return <>{groups.filter(row=>row.name.toLocaleLowerCase(locale).includes(query.trim().toLocaleLowerCase(locale))).map(row=><div className={`${s.labelRow} ${s.receivedScopeRow}`} key={row.labelId}><span className={s.treeSpacer} aria-hidden="true"/><button type="button" aria-label={row.name} aria-pressed={selectedId===row.labelId} title={label} onClick={()=>onSelect(row)}><CollectionAccessIcon kind="label" received label={label}/><span>{row.name}</span></button></div>)}</>;
}
