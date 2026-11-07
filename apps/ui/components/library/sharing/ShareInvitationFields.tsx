'use client';
import React,{useState} from 'react';
import {Copy,MoreHorizontal,RefreshCw,Link2Off} from 'lucide-react';
import {ActionMenu} from '@/components/practice/ui/ActionMenu';
import {localizedSection} from '@/lib/i18n/catalog';
import type {OnboardingLanguage} from '@/lib/onboardingI18n';
import {organizationCopy} from '../organization/copy';
import s from '../organization/organization.module.css';

export function ShareInvitationFields({link,code,locale,onCopy}:{link:string;code:string;locale:OnboardingLanguage;onCopy:(value:string,kind:'link'|'code')=>void}){
 const t=localizedSection('collectionSharing')[locale];
 return <div className={s.invitationFields}>{([{kind:'link',label:t.copyLink,value:link},{kind:'code',label:t.copyCode,value:code}] as const).map(field=><label key={field.kind}>
  <span>{field.label}</span><span className={s.invitationField}><input readOnly value={field.value}/><button type="button" data-onboarding={`copy-${field.kind}`} aria-label={field.label} title={field.label} onClick={()=>onCopy(field.value,field.kind)}><Copy size={16} strokeWidth={1.5}/></button></span>
 </label>)}</div>;
}
export function ShareManagementMenu({locale,onAction}:{locale:OnboardingLanguage;onAction:(action:'rotate'|'close')=>void}){
 const [anchor,setAnchor]=useState<HTMLButtonElement|null>(null),t=localizedSection('collectionSharing')[locale],common=organizationCopy(locale);
 return <><button type="button" aria-label={common.more} aria-haspopup="menu" aria-expanded={Boolean(anchor)} onClick={event=>setAnchor(event.currentTarget)}><MoreHorizontal size={16} strokeWidth={1.5}/></button>{anchor&&<ActionMenu anchor={anchor} title={common.more} language={locale} onClose={()=>setAnchor(null)} items={[{id:'rotate',label:t.rotate,icon:<RefreshCw size={16}/>,onSelect:()=>{setAnchor(null);onAction('rotate');}},{id:'close',label:t.close,icon:<Link2Off size={16}/>,onSelect:()=>{setAnchor(null);onAction('close');}}]}/>}</>;
}
