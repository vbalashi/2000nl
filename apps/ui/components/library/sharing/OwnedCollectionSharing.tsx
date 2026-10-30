'use client';
import {localRecordSnapshotStore} from '@/lib/collections/sharing/corruptLocalRecord';
import {readOwnerShareJournal} from '@/lib/collections/sharing/ownerShareJournal';
import {readCollectionShareManagement} from '@/lib/collections/sharing/shareManagementClient';

import {CorruptLocalRecovery} from './CorruptLocalRecovery';
import {signalOnboarding} from '@/lib/onboarding/signals';
import React,{useEffect,useState} from 'react';
import {DialogSurface} from '@/components/practice/ui/DialogSurface';
import type {OnboardingLanguage} from '@/lib/onboardingI18n';
import {shareInvitationUrl} from '@/lib/collections/sharing/shareCode';
import {organizationCopy} from '../organization/copy';
import {useOwnedCollectionSharing} from './useOwnedCollectionSharing';
import overlays from '@/components/practice/library/libraryOverlays.module.css';
import s from '../organization/organization.module.css';
const copy={en:{title:'Share collection',open:'Create view-only link',rotate:'Replace link',close:'Close shared access',rotateNotice:'The previous invitation stops working. Existing subscribers keep access.',closeNotice:'Subscribers lose this shared access. Your collection and their learning progress are kept.',openNotice:'People with the link or code can add this collection and forward the invitation.',confirm:'Confirm',check:'Check result',retry:'Retry same request',uncertain:'Could not confirm the change. Check before retrying.',readError:'Could not load sharing settings.',copyLink:'Copy link',copyCode:'Copy code',copied:'Copied',copyFailed:'Could not copy. Select and copy the text.',subscribers:'Subscribers',view:'View only'},ru:{title:'Общий доступ к коллекции',open:'Создать ссылку просмотра',rotate:'Сменить ссылку',close:'Закрыть общий доступ',rotateNotice:'Прежнее приглашение перестанет работать. Подписавшиеся пользователи сохранят доступ.',closeNotice:'Подписчики потеряют этот общий доступ. Ваша коллекция и их учебный прогресс сохранятся.',openNotice:'По ссылке или коду можно добавить коллекцию и переслать приглашение другим.',confirm:'Подтвердить',check:'Проверить результат',retry:'Повторить запрос',uncertain:'Не удалось подтвердить изменение. Проверьте результат перед повтором.',readError:'Не удалось загрузить настройки общего доступа.',copyLink:'Копировать ссылку',copyCode:'Копировать код',copied:'Скопировано',copyFailed:'Не удалось скопировать. Выделите и скопируйте текст.',subscribers:'Подписчики',view:'Только просмотр'},nl:{title:'Collectie delen',open:'Alleen-lezenlink maken',rotate:'Link vervangen',close:'Gedeelde toegang sluiten',rotateNotice:'De vorige uitnodiging werkt niet meer. Bestaande abonnees behouden toegang.',closeNotice:'Abonnees verliezen deze gedeelde toegang. Jouw collectie en hun leervoortgang blijven bewaard.',openNotice:'Met de link of code kan iemand de collectie toevoegen en de uitnodiging doorsturen.',confirm:'Bevestigen',check:'Resultaat controleren',retry:'Zelfde verzoek opnieuw proberen',uncertain:'De wijziging kon niet worden bevestigd. Controleer het resultaat voordat je opnieuw probeert.',readError:'Instellingen voor delen konden niet worden geladen.',copyLink:'Link kopiëren',copyCode:'Code kopiëren',copied:'Gekopieerd',copyFailed:'Kopiëren mislukt. Selecteer en kopieer de tekst.',subscribers:'Abonnees',view:'Alleen bekijken'}};
type SharingProps={userId:string;collectionId:string;name:string;locale:OnboardingLanguage;onClose:()=>void;initialAction?:'close'|null;onCopied?:(kind:'link'|'code')=>void};
export function OwnedCollectionSharing(props:SharingProps){
 const controller=useOwnedCollectionSharing(props.userId,props.collectionId);
 return <OwnedCollectionSharingView {...props} controller={controller}/>;
}
/** Same production dialog with its data/commands supplied by the caller. */
export function OwnedCollectionSharingView({userId,collectionId,name,locale,onClose,initialAction=null,controller,onCopied}:SharingProps&{controller:ReturnType<typeof useOwnedCollectionSharing>}){
 const {state,refresh,run,rejection}=controller;
 const [confirmation,setConfirmation]=useState<'open'|'rotate'|'close'|null>(initialAction),[notice,setNotice]=useState('');
 const [origin,setOrigin]=useState<string|null>(null);
 useEffect(()=>setOrigin(window.location.origin),[]);
 const t=copy[locale],common=organizationCopy(locale);
 const data=state.data,code=data?.invitationCode,link=code&&origin?shareInvitationUrl(code,origin):null;
 const copyText=async(value:string,kind:'link'|'code')=>{try{await navigator.clipboard.writeText(value);setNotice(t.copied);onCopied?.(kind);signalOnboarding(kind==='link'?'link-copied':'code-copied');}catch{setNotice(t.copyFailed);}};
 return <DialogSurface className={overlays.dialog} aria-label={t.title} onDismiss={()=>{if(state.status!=='saving')onClose();}}><div className={`${s.editor} ${s.sharingAction}`}><CorruptLocalRecovery scopeKey={JSON.stringify([userId,collectionId])} storageKey={'2000nl.pending-owner-share.v1.'+encodeURIComponent(userId)} valid={raw=>['saving','uncertain'].includes(state.status)||Boolean(readOwnerShareJournal(localRecordSnapshotStore(raw),userId))} verify={async signal=>{await readCollectionShareManagement(userId,collectionId,signal);}} trigger={state.status} locale={locale} onClose={onClose} onReset={()=>{void refresh();}}/><h2>{t.title}</h2><p>{name}</p>

 {rejection&&<p role="alert">{locale==='ru'?'Запрос отклонён. Проверьте актуальные настройки перед новым подтверждением.':locale==='nl'?'Het verzoek is afgewezen. Controleer de huidige instellingen voordat je opnieuw bevestigt.':'Request rejected. Review current settings before confirming again.'}</p>}
 {state.status==='loading'?<p role="status">{common.loading}</p>:state.status==='error'?<><p role="alert">{t.readError}</p><button onClick={()=>void refresh()}>{common.retry}</button></>:state.status==='uncertain'?<><p role="alert">{t.uncertain}</p><button onClick={()=>void run('check')}>{t.check}</button><button onClick={()=>void run('retry')}>{t.retry}</button></>:state.status==='saving'?<p role="status">{common.saving}</p>:data?<>
 {state.status==='storage-error'&&<p role="alert">{common.failed}</p>}
 {confirmation?<><p>{confirmation==='rotate'?t.rotateNotice:confirmation==='close'?t.closeNotice:t.openNotice}</p><footer><button onClick={()=>setConfirmation(null)}>{common.cancel}</button><button data-onboarding="share-confirm" onClick={()=>{const action=confirmation;setConfirmation(null);void run(action);}}>{t.confirm}</button></footer></>:<>
 <p>{t.view} · {t.subscribers}: {data.subscriberCount.toLocaleString(locale)}</p>
 {data.isOpen?link&&code?<><label>{t.copyLink}<input readOnly value={link}/></label><button data-onboarding="copy-link" onClick={()=>void copyText(link,'link') }>{t.copyLink}</button><label>{t.copyCode}<input readOnly value={code}/></label><button data-onboarding="copy-code" onClick={()=>void copyText(code,'code') }>{t.copyCode}</button><button onClick={()=>setConfirmation('rotate')}>{t.rotate}</button><button onClick={()=>setConfirmation('close')}>{t.close}</button></>:<p role="status">{common.loading}</p>:<button data-onboarding="share-open" onClick={()=>setConfirmation('open')}>{t.open}</button>}
 </>}
 </>:null}{notice&&<p role="status">{notice}</p>}<footer><button data-onboarding="share-close" disabled={state.status==='saving'} onClick={onClose}>{common.close}</button></footer></div></DialogSurface>;
}
