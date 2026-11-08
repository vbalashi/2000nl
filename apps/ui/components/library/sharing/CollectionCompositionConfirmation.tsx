'use client';
import React from 'react';
import {DialogSurface} from '@/components/practice/ui/DialogSurface';
import {localizedSection,formatMessage} from '@/lib/i18n/catalog';
import type {OnboardingLanguage} from '@/lib/onboardingI18n';
import {organizationCopy} from '../organization/copy';
import type {useCollectionComposition} from './useCollectionComposition';
import {CorruptLocalRecovery} from './CorruptLocalRecovery';
import {collectionCompositionJournalKey,readCollectionCompositionJournal} from '@/lib/collections/sharing/collectionCompositionJournal';
import {localRecordSnapshotStore} from '@/lib/collections/sharing/corruptLocalRecord';
import {requestLabels} from '@/lib/collections/labels/client';
import overlays from '@/components/practice/library/libraryOverlays.module.css';
import s from '../organization/organization.module.css';

export function CollectionCompositionConfirmation({controller,collectionName,locale}:{controller:ReturnType<typeof useCollectionComposition>;collectionName:string;locale:OnboardingLanguage}){
 const {state}=controller,t=localizedSection('labelSharing')[locale],common=organizationCopy(locale),sharing=localizedSection('collectionSharing')[locale];
 if(!['awaiting','confirming','uncertain','checking'].includes(state.status))return null;
 const busy=state.status==='confirming'||state.status==='checking',uncertain=state.status==='uncertain'||state.status==='checking'||!state.plan;
 const audience=state.plan?.audience??[],paths=audience.flatMap(row=>row.paths),action=state.intent?.action;
 return <DialogSurface className={overlays.dialog} aria-label={t.compositionTitle} onDismiss={()=>{if(!busy)controller.cancel();}}><div className={`${s.editor} ${s.sharingAction}`}>
  <CorruptLocalRecovery scopeKey={state.key} storageKey={collectionCompositionJournalKey(state.userId,state.collectionId)} valid={raw=>Boolean(readCollectionCompositionJournal(localRecordSnapshotStore(raw),state.userId,state.collectionId))} verify={async signal=>{await requestLabels(signal,undefined,state.userId);}} trigger={state.status} locale={locale} onClose={controller.cancel} onReset={controller.resume}/>
  <h2>{t.compositionTitle}</h2><p>{collectionName}</p>
  {uncertain?<p role="alert">{t.saveUncertain}</p>:<><p>{action==='delete'?t.compositionDelete:action==='remove'?t.compositionRemove:t.compositionAdd}</p><p>{formatMessage(t.compositionReaders,{count:audience.length.toLocaleString(locale)})}</p><p className={s.muted}>{formatMessage(t.compositionPaths,{direct:paths.filter(path=>path.kind==='collection').length.toLocaleString(locale),groups:paths.filter(path=>path.kind==='label').length.toLocaleString(locale)})}</p></>}
  {state.error&&<p role="alert">{common.failed}</p>}
  {busy&&<p role="status">{state.status==='checking'?common.loading:common.saving}</p>}
  <footer><button disabled={busy} onClick={controller.cancel}>{common.cancel}</button>{uncertain&&<button disabled={busy} onClick={()=>void controller.check()}>{sharing.check}</button>}<button disabled={busy} onClick={()=>void controller.confirm()}>{uncertain?t.retrySave:sharing.confirm}</button></footer>
 </div></DialogSurface>;
}
