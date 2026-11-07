'use client';

import React,{useEffect,useState} from 'react';
import {DialogSurface} from '@/components/practice/ui/DialogSurface';
import {localizedSection} from '@/lib/i18n/catalog';
import type {OnboardingLanguage} from '@/lib/onboardingI18n';
import type {LabelShareState} from '@/lib/collections/sharing/labelSharingContract';
import {shareInvitationUrl} from '@/lib/collections/sharing/shareCode';
import {organizationCopy} from '../organization/copy';
import overlays from '@/components/practice/library/libraryOverlays.module.css';
import s from '../organization/organization.module.css';

export type LabelSharingController={
 status:'loading'|'ready'|'saving'|'error'|'uncertain';
 data:LabelShareState|null;
 refresh:()=>void;
 run:(action:'open'|'rotate'|'close')=>void;
 reconcile:()=>void;
 retry:()=>void;
};

/** The caller supplies authoritative state; an open dialog never implies publication. */
export function LabelSharingDialog({name,locale,controller,onClose}:{name:string;locale:OnboardingLanguage;controller:LabelSharingController;onClose:()=>void}){
 const group=localizedSection('labelSharing')[locale],t=localizedSection('collectionSharing')[locale],common=organizationCopy(locale);
 const [confirmation,setConfirmation]=useState<'open'|'rotate'|'close'|null>(null);
 const [origin,setOrigin]=useState<string|null>(null),[notice,setNotice]=useState('');
 useEffect(()=>setOrigin(window.location.origin),[]);
 const {status,data}=controller;
 const link=data?.invitationCode&&origin?shareInvitationUrl(data.invitationCode,origin):null;
 const copy=async(value:string)=>{try{await navigator.clipboard.writeText(value);setNotice(t.copied);}catch{setNotice(t.copyFailed);}};
 return <DialogSurface className={overlays.dialog} aria-label={group.title} onDismiss={()=>{if(status!=='saving')onClose();}}>
  <div className={`${s.editor} ${s.sharingAction}`}>
   <h2>{group.title}</h2><p>{name}</p>
   {status==='loading'?<p role="status">{common.loading}</p>:status==='saving'?<p role="status">{common.saving}</p>:status==='error'?<>
    <p role="alert">{t.readError}</p><button onClick={controller.refresh}>{common.retry}</button>
   </>:status==='uncertain'?<>
    <p role="alert">{t.uncertain}</p><button onClick={controller.reconcile}>{t.check}</button><button onClick={controller.retry}>{t.retry}</button>
   </>:data?confirmation?<>
    <p>{confirmation==='open'?group.openNotice:confirmation==='close'?group.closeNotice:t.rotateNotice}</p>
    <footer><button onClick={()=>setConfirmation(null)}>{common.cancel}</button><button onClick={()=>{controller.run(confirmation);setConfirmation(null);}}>{t.confirm}</button></footer>
   </>:<>
    <p>{group.description}</p><p>{t.view} · {t.subscribers}: {data.subscriberCount.toLocaleString(locale)}</p>
    {data.isOpen?link&&data.invitationCode?<>
     <label>{t.copyLink}<input readOnly value={link}/></label><button onClick={()=>void copy(link)}>{t.copyLink}</button>
     <label>{t.copyCode}<input readOnly value={data.invitationCode}/></label><button onClick={()=>void copy(data.invitationCode!)}>{t.copyCode}</button>
     <button onClick={()=>setConfirmation('rotate')}>{t.rotate}</button><button onClick={()=>setConfirmation('close')}>{t.close}</button>
    </>:null:<button onClick={()=>setConfirmation('open')}>{t.open}</button>}
   </>:null}
   {notice&&<p role="status">{notice}</p>}
   <footer><button disabled={status==='saving'} onClick={onClose}>{common.close}</button></footer>
  </div>
 </DialogSurface>;
}
