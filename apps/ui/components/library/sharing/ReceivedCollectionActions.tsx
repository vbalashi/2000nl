'use client';
import {localRecordSnapshotStore} from '@/lib/collections/sharing/corruptLocalRecord';
import {readUnsubscribeJournal} from '@/lib/collections/sharing/unsubscribeJournal';
import {readReceivedSource} from '@/lib/collections/sharing/receivedSourceClient';

import {CorruptLocalRecovery} from './CorruptLocalRecovery';
import React,{useEffect,useState,useCallback,useRef} from 'react';
import type {OnboardingLanguage} from '@/lib/onboardingI18n';
import type {ReceivedCollection} from '@/lib/collections/sharing/receivedCatalogContract';
import {readCollectionShareForward} from '@/lib/collections/sharing/shareManagementClient';
import {shareInvitationUrl} from '@/lib/collections/sharing/shareCode';
import {useUserEventHints} from '@/lib/events/userEventHints';
import {DialogSurface} from '@/components/practice/ui/DialogSurface';
import overlays from '@/components/practice/library/libraryOverlays.module.css';
import s from '../organization/organization.module.css';
import {organizationCopy} from '../organization/copy';
import {useUnsubscribeCollection} from './useShareMutation';
const copy={en:{leave:'Remove from my library',confirm:'The owner’s collection and your learning progress are kept.',check:'Check result',retry:'Retry same request',uncertain:'Could not confirm the result. Check before retrying.',forward:'Share collection',link:'Invitation link',code:'Invitation code',copyLink:'Copy link',copyCode:'Copy code',copied:'Copied',copyError:'Could not copy. Select and copy the text.',unavailable:'This invitation can no longer be forwarded. Ask the owner for a new link.'},ru:{leave:'Убрать из моей библиотеки',confirm:'Коллекция владельца и ваш учебный прогресс сохранятся.',check:'Проверить результат',retry:'Повторить запрос',uncertain:'Не удалось подтвердить результат. Проверьте его перед повтором.',forward:'Поделиться коллекцией',link:'Ссылка приглашения',code:'Код приглашения',copyLink:'Копировать ссылку',copyCode:'Копировать код',copied:'Скопировано',copyError:'Не удалось скопировать. Выделите и скопируйте текст.',unavailable:'Это приглашение больше нельзя переслать. Попросите владельца прислать новую ссылку.'},nl:{leave:'Uit mijn bibliotheek verwijderen',confirm:'De collectie van de eigenaar en je leervoortgang blijven bewaard.',check:'Resultaat controleren',retry:'Zelfde verzoek opnieuw proberen',uncertain:'Het resultaat kon niet worden bevestigd. Controleer het voordat je opnieuw probeert.',forward:'Collectie delen',link:'Uitnodigingslink',code:'Uitnodigingscode',copyLink:'Link kopiëren',copyCode:'Code kopiëren',copied:'Gekopieerd',copyError:'Kopiëren mislukt. Selecteer en kopieer de tekst.',unavailable:'Deze uitnodiging kan niet meer worden doorgestuurd. Vraag de eigenaar om een nieuwe link.'}};
export const receivedActionCopy=(locale:OnboardingLanguage)=>copy[locale];
export function UnsubscribeCollection({userId,row,locale,onClose,onDone}:{userId:string;row:Pick<ReceivedCollection,'id'|'name'>;locale:OnboardingLanguage;onClose:()=>void;onDone:()=>void}){
 const {state,start,check,retry}=useUnsubscribeCollection(userId,row.id);
 const t=copy[locale],common=organizationCopy(locale);
 const done=useRef(false);
 useEffect(()=>{if(state.status==='committed'&&!done.current){done.current=true;onDone();}},[state.status,onDone]);
 const blocked=state.status==='saving';
 return <DialogSurface className={overlays.dialog} aria-label={t.leave} onDismiss={()=>{if(!blocked)onClose();}}><div className={`${s.editor} ${s.sharingAction}`}><CorruptLocalRecovery scopeKey={JSON.stringify([userId,row.id])} storageKey={'2000nl.pending-unsubscribe.v1.'+encodeURIComponent(userId)} valid={raw=>['saving','uncertain'].includes(state.status)||Boolean(readUnsubscribeJournal(localRecordSnapshotStore(raw),userId))} verify={async signal=>{await readReceivedSource(userId,row.id,signal);}} trigger={state.status} locale={locale} onClose={onClose} onReset={()=>{onClose();}}/><h2>{t.leave}</h2><p>{row.name}</p><p>{t.confirm}</p>{state.status==='uncertain'&&<p role="alert">{t.uncertain}</p>}{state.status==='storage-error'&&<p role="alert">{common.failed}</p>}<footer><button disabled={blocked} onClick={onClose}>{common.cancel}</button>{state.status==='uncertain'?<><button onClick={()=>void check()}>{t.check}</button><button onClick={()=>void retry()}>{t.retry}</button></>:<button disabled={state.status!=='ready'&&state.status!=='storage-error'} onClick={()=>void start()}>{state.status==='saving'?common.saving:t.leave}</button>}</footer></div></DialogSurface>;
}
export function ForwardCollection({userId,row,locale,onClose}:{userId:string;row:ReceivedCollection;locale:OnboardingLanguage;onClose:()=>void}){
 const key=JSON.stringify([userId,row.id]);
 const [state,setState]=useState<{key:string;code:string|null;loading:boolean}>({key,code:null,loading:true});
 const [notice,setNotice]=useState('');
 const controller=useRef<AbortController|null>(null);
 const t=copy[locale],common=organizationCopy(locale);
 const refresh=useCallback(async()=>{
  controller.current?.abort();const abort=new AbortController();controller.current=abort;
  setState({key,code:null,loading:true});setNotice('');
  try{const result=await readCollectionShareForward(userId,row.id,abort.signal);if(!abort.signal.aborted)setState({key,code:result.canForward?result.invitationCode:null,loading:false});}
  catch{if(!abort.signal.aborted)setState({key,code:null,loading:false});}
 },[key,userId,row.id]);
 useEffect(()=>{void refresh();const focused=()=>void refresh();window.addEventListener('focus',focused);return()=>{controller.current?.abort();window.removeEventListener('focus',focused);};},[refresh]);
 useUserEventHints(userId,['collections.changed'],refresh);
 const code=state.key===key?state.code:null;
 const link=code?shareInvitationUrl(code,window.location.origin):null;
 const copyText=async(value:string)=>{try{await navigator.clipboard.writeText(value);if(!controller.current?.signal.aborted)setNotice(t.copied);}catch{setNotice(t.copyError);}};
 return <DialogSurface className={overlays.dialog} aria-label={t.forward} onDismiss={onClose}><div className={`${s.editor} ${s.sharingAction}`}><h2>{t.forward}</h2><p>{row.name}</p>{state.key!==key||state.loading?<p role="status">{common.loading}</p>:code&&link?<><label>{t.link}<input readOnly value={link}/></label><button onClick={()=>void copyText(link)}>{t.copyLink}</button><label>{t.code}<input readOnly value={code}/></label><button onClick={()=>void copyText(code)}>{t.copyCode}</button></>:<p role="alert">{t.unavailable}</p>}{notice&&<p role="status">{notice}</p>}<footer><button onClick={onClose}>{common.close}</button></footer></div></DialogSurface>;
}
