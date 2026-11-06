'use client';
import { localizedSection, localizedField } from "@/lib/i18n/catalog";

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
const copy=localizedSection("collectionSharing");
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

 {rejection&&<p role="alert">{localizedField("collectionSharing", "rejected")[locale]}</p>}
 {state.status==='loading'?<p role="status">{common.loading}</p>:state.status==='error'?<><p role="alert">{t.readError}</p><button onClick={()=>void refresh()}>{common.retry}</button></>:state.status==='uncertain'?<><p role="alert">{t.uncertain}</p><button onClick={()=>void run('check')}>{t.check}</button><button onClick={()=>void run('retry')}>{t.retry}</button></>:state.status==='saving'?<p role="status">{common.saving}</p>:data?<>
 {state.status==='storage-error'&&<p role="alert">{common.failed}</p>}
 {confirmation?<><p>{confirmation==='rotate'?t.rotateNotice:confirmation==='close'?t.closeNotice:t.openNotice}</p><footer><button onClick={()=>setConfirmation(null)}>{common.cancel}</button><button data-onboarding="share-confirm" onClick={()=>{const action=confirmation;setConfirmation(null);void run(action);}}>{t.confirm}</button></footer></>:<>
 <p>{t.view} · {t.subscribers}: {data.subscriberCount.toLocaleString(locale)}</p>
 {data.isOpen?link&&code?<><label>{t.copyLink}<input readOnly value={link}/></label><button data-onboarding="copy-link" onClick={()=>void copyText(link,'link') }>{t.copyLink}</button><label>{t.copyCode}<input readOnly value={code}/></label><button data-onboarding="copy-code" onClick={()=>void copyText(code,'code') }>{t.copyCode}</button><button onClick={()=>setConfirmation('rotate')}>{t.rotate}</button><button onClick={()=>setConfirmation('close')}>{t.close}</button></>:<p role="status">{common.loading}</p>:<button data-onboarding="share-open" onClick={()=>setConfirmation('open')}>{t.open}</button>}
 </>}
 </>:null}{notice&&<p role="status">{notice}</p>}<footer><button data-onboarding="share-close" disabled={state.status==='saving'} onClick={onClose}>{common.close}</button></footer></div></DialogSurface>;
}
