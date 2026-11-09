'use client';
import React,{useState} from 'react';
import type {LabelSharingCatalog} from '@/lib/collections/sharing/labelSharingContract';
import type {OnboardingLanguage} from '@/lib/onboardingI18n';
import {localizedSection} from '@/lib/i18n/catalog';
import {CollectionAccessIcon} from './CollectionAccessIcon';
import {SharedLabelContents} from '../sharing/SharedLabelContents';
import s from './organization.module.css';
/** Received groups are navigation, never editable personal label parents. */
export function ReceivedGroupScopes({userId,locale,groups,query,onOpen}:{userId:string;locale:OnboardingLanguage;groups:LabelSharingCatalog['received'];query:string;onOpen:(id:string,name:string)=>void}){
 const [selected,setSelected]=useState<{userId:string;id:string}|null>(null);
 const group=selected?.userId===userId?groups.find(row=>row.labelId===selected.id):undefined;
 const label=localizedSection('sharedWorkspace')[locale].received;
 return <>{groups.filter(row=>row.name.toLocaleLowerCase(locale).includes(query.trim().toLocaleLowerCase(locale))).map(row=><div className={`${s.labelRow} ${s.receivedScopeRow}`} key={row.labelId}><span className={s.treeSpacer} aria-hidden="true"/><button type="button" aria-label={row.name} aria-pressed={group?.labelId===row.labelId} title={label} onClick={()=>setSelected({userId,id:row.labelId})}><CollectionAccessIcon kind="label" received label={label}/><span>{row.name}</span></button></div>)}
 {group&&<SharedLabelContents key={`${userId}:${group.labelId}`} userId={userId} labelId={group.labelId} name={group.name} locale={locale} onClose={()=>setSelected(null)} onOpen={()=>{}} onOpenNamed={(id,name)=>{setSelected(null);onOpen(id,name);}}/>}</>;
}
