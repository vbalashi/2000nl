'use client';
import {localRecordSnapshotStore} from '@/lib/collections/sharing/corruptLocalRecord';
import {readAcceptJournal} from '@/lib/collections/sharing/acceptJournal';
import {previewCollectionShare} from '@/lib/collections/sharing/shareCommandClient';

import {CorruptLocalRecovery} from './CorruptLocalRecovery';
import React,{useEffect} from 'react';
import {Eye,FileText} from 'lucide-react';
import type {OnboardingLanguage} from '@/lib/onboardingI18n';
import {organizationCopy} from '../organization/copy';
import s from '../organization/organization.module.css';
import {useShareInvitation} from './useShareInvitation';
const copy={
 en:{view:'View only',description:'You can view meanings and practise. Changes made by the owner appear in this collection.',add:'Add to library',check:'Check result',retry:'Retry same request',uncertain:'Could not confirm the result. Check before retrying.',unavailable:'This invitation is unavailable.',accepted:'Collection added',revoked:'The action was confirmed, but this collection is no longer available.',already:'Already in your library',count:'meanings'},
 ru:{view:'Только просмотр',description:'Вы сможете смотреть значения и тренироваться. Изменения владельца будут появляться в этой коллекции.',add:'Добавить в библиотеку',check:'Проверить результат',retry:'Повторить запрос',uncertain:'Не удалось подтвердить результат. Проверьте его перед повтором.',unavailable:'Это приглашение недоступно.',accepted:'Коллекция добавлена',revoked:'Действие подтверждено, но коллекция больше недоступна.',already:'Уже в вашей библиотеке',count:'значений'},
 nl:{view:'Alleen bekijken',description:'Je kunt betekenissen bekijken en oefenen. Wijzigingen van de eigenaar verschijnen in deze collectie.',add:'Toevoegen aan bibliotheek',check:'Resultaat controleren',retry:'Zelfde verzoek opnieuw proberen',uncertain:'Het resultaat kon niet worden bevestigd. Controleer het voordat je opnieuw probeert.',unavailable:'Deze uitnodiging is niet beschikbaar.',accepted:'Collectie toegevoegd',revoked:'De actie is bevestigd, maar deze collectie is niet meer beschikbaar.',already:'Staat al in je bibliotheek',count:'betekenissen'},
};
type InvitationProps={userId:string;code:string;locale:OnboardingLanguage;onClose:()=>void;onConfirmed?:()=>void;onOpen:(id:string,name?:string,entryCount?:number)=>void};
export function InvitationPreview(props:InvitationProps){
 const controller=useShareInvitation(props.userId,props.code);
 return <InvitationPreviewView {...props} controller={controller}/>;
}
export function InvitationPreviewView({userId,code,locale,onClose,onOpen,onConfirmed,controller}:InvitationProps&{controller:ReturnType<typeof useShareInvitation>}){
 const {state,accept,reconcile,retry,refresh}=controller;
 useEffect(()=>{if(state.status==='accepted')onConfirmed?.();},[state.status,onConfirmed]);
 const t=copy[locale],common=organizationCopy(locale);
 return <section data-onboarding="invitation-preview" className={`${s.catalog} ${s.invitation}`} aria-busy={state.status==='loading'||state.status==='saving'}><CorruptLocalRecovery scopeKey={JSON.stringify([userId,code])} storageKey={'2000nl.pending-share-accept.v1.'+encodeURIComponent(userId)} valid={raw=>['saving','uncertain'].includes(state.status)||Boolean(readAcceptJournal(localRecordSnapshotStore(raw),userId))} verify={async signal=>{try{await previewCollectionShare(userId,code,signal);}catch(error){if(!(error instanceof Error)||error.message!=='share_preview_not_found')throw error;};}} trigger={state.status} locale={locale} onClose={onClose} onReset={()=>{void refresh();}}/>
  {state.status==='loading'?<p role="status">{common.loading}</p>:state.status==='unavailable'||state.status==='error'?<><p role="alert">{state.status==='error'?(locale==='ru'?'Не удалось загрузить приглашение. Попробуйте ещё раз.':locale==='nl'?'Uitnodiging kon niet worden geladen. Probeer opnieuw.':'Could not load invitation. Try again.'):t.unavailable}</p><div><button onClick={()=>void refresh()}>{common.retry}</button><button onClick={onClose}>{common.close}</button></div></>:state.status==='accepted'?<><h2>{state.available?t.accepted:t.revoked}</h2><div>{state.available&&<button data-onboarding="invitation-open" onClick={()=>onOpen(state.collectionId,state.name,state.entryCount)}>{common.open}</button>}<button onClick={onClose}>{common.close}</button></div></>:<>
   <header className={s.catalogHeader}><h2><FileText size={18} aria-hidden="true"/> {state.preview?.name??t.add}</h2></header>
   <p className={s.muted}>{state.preview?`${state.preview.entryCount.toLocaleString(locale)} ${t.count}`:null}</p>
   <p><Eye size={16} aria-hidden="true"/> {t.view}</p><p className={s.muted}>{t.description}</p>
   {Boolean(state.preview?.samples.length)&&<dl className={s.previewSamples}>{state.preview?.samples.map((sample,index)=><div key={index}><dt>{sample.headword}</dt><dd>{sample.definition}</dd></div>)}</dl>}
   {state.preview?.alreadyAdded&&<p>{t.already}</p>}
   {state.status==='uncertain'&&<p role="alert">{t.uncertain}</p>}{state.status==='storage-error'&&<p role="alert">{common.failed}</p>}
   <div>{state.status==='uncertain'?<><button onClick={()=>void reconcile()}>{t.check}</button><button onClick={()=>void retry()}>{t.retry}</button></>:<button disabled={state.status==='saving'} data-onboarding="invitation-accept" onClick={()=>void accept()}>{state.status==='saving'?common.saving:t.add}</button>}
    <button disabled={state.status==='saving'||state.status==='uncertain'} onClick={onClose}>{common.cancel}</button></div>
  </>}
 </section>;
}
