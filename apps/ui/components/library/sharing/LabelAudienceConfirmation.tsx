'use client';
import React,{useEffect,useState} from 'react';
import {DialogSurface} from '@/components/practice/ui/DialogSurface';
import {localizedSection,formatMessage} from '@/lib/i18n/catalog';
import type {OnboardingLanguage} from '@/lib/onboardingI18n';
import type {WordListSummary} from '@/lib/types';
import {formatUiCount} from '@/lib/uiMessages';
import {sharedPlacementChanges,type SharedPlacementChange} from '@/lib/collections/labels/sharedPlacementChanges';
import {readLabelSharingCatalog,readLabelShareState} from '@/lib/collections/sharing/labelSharingClient';
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
 const contextKey=JSON.stringify([state.userId,state.planId]);
 const [context,setContext]=useState<{key:string;loading:boolean;groups:Array<SharedPlacementChange&{subscriberCount:number}>}>({key:'',loading:false,groups:[]});
 useEffect(()=>{
  const abort=new AbortController();const operation=controller.preparedOperation,revision=controller.preparedRevision;
  if(!state.planId||!operation||revision==null){setContext({key:contextKey,loading:false,groups:[]});return;}
  setContext({key:contextKey,loading:true,groups:[]});
  void (async()=>{try{
   const [snapshot,catalog]=await Promise.all([requestLabels(abort.signal,undefined,state.userId),readLabelSharingCatalog(state.userId,abort.signal)]);
   if(snapshot.revision!==revision)throw new Error('stale_context');
   const changes=sharedPlacementChanges(snapshot,operation,catalog.owned,collections.filter(row=>!('ownership'in row)||row.ownership!=='received').map(row=>row.id));
   if(changes.length>20)throw new Error('large_context');
   const groups=await Promise.all(changes.map(async group=>{const sharing=await readLabelShareState(state.userId,group.labelId,abort.signal);if(!sharing.isOpen)throw new Error('changed_context');return {...group,subscriberCount:sharing.subscriberCount};}));
   if(!abort.signal.aborted)setContext({key:contextKey,loading:false,groups});
  }catch{if(!abort.signal.aborted)setContext({key:contextKey,loading:false,groups:[]});}})();
  return()=>abort.abort();
 // Freeze explanatory context for this prepared plan. Confirmation still rechecks server authority.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[contextKey]);
 const groups=context.key===contextKey?context.groups:[],loadingContext=!uncertain&&Boolean(state.planId&&controller.preparedOperation&&controller.preparedRevision!=null)&&(context.key!==contextKey||context.loading);
 const named=groups.flatMap(group=>(['added','removed'] as const).flatMap(kind=>(kind==='added'?group.addedCollectionIds:group.removedCollectionIds).map(id=><p key={`${group.labelId}:${kind}:${id}`}>{formatMessage(kind==='added'?t.placementAdded:t.placementRemoved,{collection:collections.find(row=>row.id===id)?.name??common.collections,group:group.name,subscribers:formatUiCount(locale,group.subscriberCount,t,'subscriber')})}</p>)));
 const hasAdded=Boolean(delta?.added.length),hasRemoved=Boolean(delta?.removed.length);
 const confirmLabel=uncertain?t.retrySave:hasAdded&&hasRemoved?t.confirmMixed:hasAdded?t.confirmAdded:hasRemoved?t.confirmRemoved:sharing.confirm;
 const affected=(kind:'added'|'removed')=>{
  const pairs=delta?.[kind]??[];if(!pairs.length)return null;
  const ids=[...new Set(pairs.map(pair=>pair.collectionId))];
  return <section><p>{kind==='added'?t.accessAddedTitle:t.accessRemovedTitle}</p><ul>{ids.map(id=><li key={id}>{collections.find(row=>row.id===id)?.name??common.collections} · {formatUiCount(locale,new Set(pairs.filter(pair=>pair.collectionId===id).map(pair=>pair.userId)).size,t,'subscriber')}</li>)}</ul></section>;
 };
 return <><DialogSurface className={overlays.dialog} aria-label={t.audienceTitle} onDismiss={()=>{if(!busy)controller.cancel();}}>
  <div className={`${s.editor} ${s.sharingAction}`}><CorruptLocalRecovery scopeKey={state.userId} storageKey={labelOrganizationJournalKey(state.userId)} valid={raw=>Boolean(readLabelOrganizationJournal(localRecordSnapshotStore(raw),state.userId))} verify={async signal=>{await requestLabels(signal,undefined,state.userId);}} trigger={state.status} locale={locale} onClose={controller.cancel} onReset={controller.cancel}/><h2>{t.audienceTitle}</h2>
   {uncertain?<p role="alert">{t.saveUncertain}</p>:<div className={s.audienceExplanation}>{loadingContext?<p role="status">{common.loading}</p>:<>{named.length?named:<p>{t.audienceIntro}</p>}{affected('added')}{affected('removed')}</>}{!loadingContext&&!hasAdded&&!hasRemoved&&<p>{t.accessUnchanged}</p>}</div>}
   {state.plan?.copyRequired&&<><p role="alert">{t.copyRequired}</p>{copyScope&&<button onClick={()=>setCopyOpen(true)}>{t.copyTitle}</button>}</>}
   {state.error==='storage'&&<p role="alert">{common.failed}</p>}
   {busy&&<p role="status">{state.status==='checking'?common.loading:common.saving}</p>}
   <footer><button disabled={busy} onClick={controller.cancel}>{common.cancel}</button>
    {uncertain&&<button disabled={busy} onClick={onCheck}>{sharing.check}</button>}
    <button disabled={busy||loadingContext||state.plan?.copyRequired} onClick={onConfirm}>{confirmLabel}</button>
   </footer>
  </div>
 </DialogSurface>{copyOpen&&copyScope&&<BorrowedCollectionCopies userId={state.userId} scope={copyScope} name={copyScope.kind==='collection'?collections.find(row=>row.id===copyScope.id)?.name??common.collections:common.labels} collections={collections} locale={locale} onClose={()=>{setCopyOpen(false);controller.cancel();}}/>}</>;
}
