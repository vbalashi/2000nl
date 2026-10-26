'use client';
import React,{useEffect,useRef,useState} from 'react';
import type {OnboardingLanguage} from '@/lib/onboardingI18n';
import {DialogSurface} from '@/components/practice/ui/DialogSurface';
import {inspectLocalRecord,clearCorruptLocalRecord} from '@/lib/collections/sharing/corruptLocalRecord';
import overlays from '@/components/practice/library/libraryOverlays.module.css';
import s from '../organization/organization.module.css';
import {organizationCopy} from '../organization/copy';
const copy={en:{retry:'Retry',failed:'Could not check the current state. Local data has not changed.',title:'Local recovery',checking:'Local recovery data in this tab is damaged. Checking the current saved state. An earlier request may have completed.',ready:'The current saved state has been checked. Only the damaged local record will be cleared. Your articles, collections and progress are kept. No request will be resent.',clear:'Clear local record'},ru:{retry:'Повторить',failed:'Не удалось проверить текущее состояние. Локальные данные не изменены.',title:'Локальное восстановление',checking:'Локальные данные этой вкладки повреждены. Проверяем текущее сохранённое состояние. Ранее отправленный запрос мог выполниться.',ready:'Текущее сохранённое состояние проверено. Будет очищена только повреждённая запись в этой вкладке. Статьи, коллекции и прогресс сохранятся. Запрос не будет отправлен повторно.',clear:'Очистить запись'},nl:{retry:'Opnieuw proberen',failed:'De huidige toestand kon niet worden gecontroleerd. Lokale gegevens zijn niet gewijzigd.',title:'Lokaal herstel',checking:'Lokale herstelgegevens in dit tabblad zijn beschadigd. De huidige opgeslagen toestand wordt gecontroleerd. Een eerder verzoek kan al zijn uitgevoerd.',ready:'De huidige opgeslagen toestand is gecontroleerd. Alleen het beschadigde lokale record wordt gewist. Artikelen, collecties en voortgang blijven behouden. Geen verzoek wordt opnieuw verzonden.',clear:'Lokaal record wissen'}};
/** Approved DyED8: automatic read, explicit corrupt-only cleanup; no write retry. */
export function CorruptLocalRecovery({scopeKey,storageKey,valid,verify,trigger,locale,onClose,onReset,suspended=false}:{scopeKey:string;storageKey:string;valid:(raw:string)=>boolean;verify:(signal:AbortSignal)=>Promise<void>;trigger:string;locale:OnboardingLanguage;onClose:()=>void;onReset:()=>void;suspended?:boolean}){
 const current=useRef({scopeKey,valid,verify,onReset});current.current={scopeKey,valid,verify,onReset};
 const [state,setState]=useState<{key:string;snapshot:string;status:'checking'|'ready'|'error'}|null>(null),[retry,setRetry]=useState(0);
 useEffect(()=>{
  const store={getItem:(key:string)=>window.sessionStorage.getItem(key),removeItem:(key:string)=>window.sessionStorage.removeItem(key)};
  const record=inspectLocalRecord(store,storageKey,current.current.valid);
  if(record.kind!=='corrupt'){setState(null);return;}
  const abort=new AbortController();setState({key:scopeKey,snapshot:record.snapshot,status:'checking'});
  void current.current.verify(abort.signal).then(()=>{if(!abort.signal.aborted&&current.current.scopeKey===scopeKey)setState({key:scopeKey,snapshot:record.snapshot,status:'ready'});},()=>{if(!abort.signal.aborted&&current.current.scopeKey===scopeKey)setState({key:scopeKey,snapshot:record.snapshot,status:'error'});});
  return()=>abort.abort();
 },[scopeKey,storageKey,trigger,retry]);
 if(suspended||!state||state.key!==scopeKey)return null;
 const t=copy[locale],common=organizationCopy(locale);
 const clear=()=>{if(state.status!=='ready'||current.current.scopeKey!==scopeKey)return;const okay=clearCorruptLocalRecord({getItem:key=>window.sessionStorage.getItem(key),removeItem:key=>window.sessionStorage.removeItem(key)},storageKey,state.snapshot,current.current.valid);if(okay){setState(null);current.current.onReset();}else setState({...state,status:'error'});};
 return <DialogSurface className={overlays.dialog} aria-label={t.title} onDismiss={onClose}><div className={`${s.editor} ${s.sharingAction}`}><h2>{t.title}</h2><p role={state.status==='error'?'alert':'status'}>{state.status==='error'?t.failed:state.status==='ready'?t.ready:t.checking}</p><footer><button onClick={onClose}>{common.close}</button>{state.status==='error'?<button onClick={()=>setRetry(value=>value+1)}>{t.retry}</button>:<button disabled={state.status!=='ready'} onClick={clear}>{state.status==='checking'?common.loading:t.clear}</button>}</footer></div></DialogSurface>;
}
