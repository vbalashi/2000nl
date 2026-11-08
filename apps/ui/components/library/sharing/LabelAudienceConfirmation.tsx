'use client';
import React,{useState} from 'react';
import {DialogSurface} from '@/components/practice/ui/DialogSurface';
import {localizedSection,formatMessage} from '@/lib/i18n/catalog';
import type {OnboardingLanguage} from '@/lib/onboardingI18n';
import type {WordListSummary} from '@/lib/types';
import {organizationCopy} from '../organization/copy';
import type {useLabelOrganizationPlan} from './useLabelOrganizationPlan';
import {CorruptLocalRecovery} from './CorruptLocalRecovery';
import {labelOrganizationJournalKey,readLabelOrganizationJournal} from '@/lib/collections/sharing/labelOrganizationJournal';
import {localRecordSnapshotStore} from '@/lib/collections/sharing/corruptLocalRecord';
import {requestLabels} from '@/lib/collections/labels/client';
import {BorrowedCollectionCopies,type BorrowedCopyScope} from './BorrowedCollectionCopies';
import overlays from '@/components/practice/library/libraryOverlays.module.css';
import s from '../organization/organization.module.css';

export function LabelAudienceConfirmation({controller,collections,locale,onConfirm,onCheck}:{controller:ReturnType<typeof useLabelOrganizationPlan>;collections:WordListSummary[];locale:OnboardingLanguage;onConfirm:()=>void;onCheck:()=>void}){
 const {state}=controller,t=localizedSection('labelSharing')[locale],common=organizationCopy(locale),sharing=localizedSection('collectionSharing')[locale];
 const busy=state.status==='confirming'||state.status==='checking';
 const uncertain=state.status==='uncertain'||state.status==='checking';
 const delta=state.plan?.delta;
 const [copyOpen,setCopyOpen]=useState(false),operation=controller.preparedOperation;
 const copyScope:BorrowedCopyScope|null=operation?.type==='set-collection-labels'?{kind:'collection',id:operation.collection_id}:operation&&'id'in operation&&operation.id?{kind:'label',id:operation.id}:null;
 const affected=(kind:'added'|'removed')=>{
  const pairs=delta?.[kind]??[];if(!pairs.length)return null;
  const ids=[...new Set(pairs.map(pair=>pair.collectionId))];
  return <section><p>{formatMessage(kind==='added'?t.audienceAdded:t.audienceRemoved,{readers:new Set(pairs.map(pair=>pair.userId)).size.toLocaleString(locale),collections:ids.length.toLocaleString(locale)})}</p><ul>{ids.map(id=><li key={id}>{collections.find(row=>row.id===id)?.name??common.collections}</li>)}</ul></section>;
 };
 return <><DialogSurface className={overlays.dialog} aria-label={t.audienceTitle} onDismiss={()=>{if(!busy)controller.cancel();}}>
  <div className={`${s.editor} ${s.sharingAction}`}><CorruptLocalRecovery scopeKey={state.userId} storageKey={labelOrganizationJournalKey(state.userId)} valid={raw=>Boolean(readLabelOrganizationJournal(localRecordSnapshotStore(raw),state.userId))} verify={async signal=>{await requestLabels(signal,undefined,state.userId);}} trigger={state.status} locale={locale} onClose={controller.cancel} onReset={controller.cancel}/><h2>{t.audienceTitle}</h2>
   {uncertain?<p role="alert">{t.saveUncertain}</p>:<><p>{t.audienceIntro}</p>{affected('added')}{affected('removed')}{delta?.pathsChanged&&<p>{t.pathsChanged}</p>}</>}
   {state.plan?.copyRequired&&<><p role="alert">{t.copyRequired}</p>{copyScope&&<button onClick={()=>setCopyOpen(true)}>{t.copyTitle}</button>}</>}
   {state.error==='storage'&&<p role="alert">{common.failed}</p>}
   {busy&&<p role="status">{state.status==='checking'?common.loading:common.saving}</p>}
   <footer><button disabled={busy} onClick={controller.cancel}>{common.cancel}</button>
    {uncertain&&<button disabled={busy} onClick={onCheck}>{sharing.check}</button>}
    <button disabled={busy||state.plan?.copyRequired} onClick={onConfirm}>{uncertain?t.retrySave:sharing.confirm}</button>
   </footer>
  </div>
 </DialogSurface>{copyOpen&&copyScope&&<BorrowedCollectionCopies userId={state.userId} scope={copyScope} name={copyScope.kind==='collection'?collections.find(row=>row.id===copyScope.id)?.name??common.collections:common.labels} collections={collections} locale={locale} onClose={()=>{setCopyOpen(false);controller.cancel();}}/>}</>;
}
