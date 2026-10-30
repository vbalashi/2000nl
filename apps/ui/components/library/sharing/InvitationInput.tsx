'use client';
import React,{useState} from 'react';
import type {OnboardingLanguage} from '@/lib/onboardingI18n';
import {parseShareCode} from '@/lib/collections/sharing/shareCode';
import {organizationCopy} from '../organization/copy';
import s from '../organization/organization.module.css';
const copy={en:{title:'Add by link / code',hint:'Paste an invitation link or code',check:'Check invitation',error:'Enter a valid invitation link or code.'},ru:{title:'Добавить по ссылке / коду',hint:'Вставьте ссылку приглашения или код',check:'Проверить приглашение',error:'Введите корректную ссылку приглашения или код.'},nl:{title:'Toevoegen via link / code',hint:'Plak een uitnodigingslink of code',check:'Uitnodiging controleren',error:'Voer een geldige uitnodigingslink of code in.'}};
export function InvitationInput({locale,onSubmit,onCancel,initialValue="",readOnly=false}:{locale:OnboardingLanguage;onSubmit:(code:string)=>void;onCancel:()=>void;initialValue?:string;readOnly?:boolean}){
 const [value,setValue]=useState(initialValue),[error,setError]=useState(false);
 const t=copy[locale],common=organizationCopy(locale);
 return <form className={`${s.catalog} ${s.invitation}`} onSubmit={event=>{event.preventDefault();const code=parseShareCode(value,window.location.origin);if(!code){setError(true);return;}onSubmit(code);}}>
  <h2>{t.title}</h2><label className={s.search}><input type="text" aria-label={t.hint} placeholder={t.hint} maxLength={1024} autoComplete="off" autoCorrect="off" spellCheck={false} readOnly={readOnly} value={value} onChange={event=>{setValue(event.target.value);setError(false);}}/></label>
  {error&&<p role="alert">{t.error}</p>}<div><button type="submit">{t.check}</button><button type="button" onClick={onCancel}>{common.cancel}</button></div>
 </form>;
}
