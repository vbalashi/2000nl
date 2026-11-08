'use client';
import React from 'react';
import {localizedSection} from '@/lib/i18n/catalog';
import type {OnboardingLanguage} from '@/lib/onboardingI18n';
import type {LabelSharePreview} from '@/lib/collections/sharing/labelSharingContract';
import {organizationCopy} from '../organization/copy';
import s from '../organization/organization.module.css';

export function LabelInvitationPreviewView({locale,preview,status,accepted=false,onAdd,onOpen,onClose,onRefresh,onReconcile,onRetry}:{
 locale:OnboardingLanguage;preview:LabelSharePreview|null;status:'loading'|'ready'|'saving'|'uncertain'|'error'|'unavailable'|'rejected'|'storage-error';accepted?:boolean;
 onAdd:()=>void;onOpen:()=>void;onClose:()=>void;onRefresh:()=>void;onReconcile:()=>void;onRetry:()=>void;
}){
 const group=localizedSection('labelSharing')[locale],t=localizedSection('invitationPreview')[locale],common=organizationCopy(locale);
 return <section className={`${s.catalog} ${s.invitation}`}>
  {preview&&<><h2>{preview.name}</h2><p>{group.description}</p><p>{group.collections}: {preview.collectionCount.toLocaleString(locale)} · {t.view}</p></>}
  {status==='loading'?<p role="status">{common.loading}</p>:status==='saving'?<p role="status">{common.saving}</p>:status==='uncertain'?<>
   <p role="alert">{t.uncertain}</p><button onClick={onReconcile}>{t.check}</button><button onClick={onRetry}>{t.retry}</button>
  </>:status==='unavailable'?<p role="alert">{t.unavailable}</p>:status==='error'||status==='rejected'?<>
   <p role="alert">{status==='rejected'?localizedSection('collectionSharing')[locale].rejected:t.loadError}</p><button onClick={onRefresh}>{common.retry}</button>
  </>:preview?<>
   {status==='storage-error'&&<p role="alert">{common.failed}</p>}
   {accepted&&<p role="status">{group.accepted}</p>}
   {preview.alreadyAdded?<><p>{t.already}</p><button onClick={onOpen}>{group.openGroup}</button></>:<button onClick={onAdd}>{t.add}</button>}
  </>:null}
  <button disabled={status==='saving'} onClick={onClose}>{common.close}</button>
 </section>;
}
