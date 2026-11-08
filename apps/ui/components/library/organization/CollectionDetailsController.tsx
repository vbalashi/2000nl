'use client';
import React,{useCallback,useEffect,useRef,useState} from 'react';
import {platformV2AuthenticatedJsonHeaders} from '@/lib/platform/platformV2Http';
import {platformFetchWithTimeout} from '@/lib/platform/platformFetchWithTimeout';
import {parseDetailsRecord,type DetailsRecord} from '@/lib/collections/details/contract';
import type {CollectionDetailsPatch} from '@/lib/collections/details/model';
import type {OnboardingLanguage} from '@/lib/onboardingI18n';
import {organizationCopy} from './copy';
import {CollectionDetailsPanel} from './CollectionDetailsPanel';
import s from './organization.module.css';

type Props={userId:string;id:string;itemCount:number|null;labelNames:string[];canEditLabels:boolean;locale:OnboardingLanguage;isShared:boolean;onClose:()=>void;onLabels:(name:string)=>void;onOpen:(name:string)=>void;onChanged?:()=>void;onUnavailable?:()=>void};
export function CollectionDetailsController(props:Props){
 const {userId,id,locale}=props;const t=organizationCopy(locale);
 const [record,setRecord]=useState<DetailsRecord|null>(null),[status,setStatus]=useState<'loading'|'ready'|'error'|'conflict'|'saving'>('loading');
 const generation=useRef(0),mounted=useRef(true),saveBusy=useRef(false),callbacks=useRef(props);callbacks.current=props;
 const read=useCallback(async(silent=false)=>{
  if(saveBusy.current)return null;const n=++generation.current;if(!silent){setRecord(null);setStatus('loading');}
  try{const headers=await platformV2AuthenticatedJsonHeaders(userId);const response=await platformFetchWithTimeout(`/api/library/collection-details?collectionId=${encodeURIComponent(id)}`,{headers,credentials:'same-origin',cache:'no-store'});
   const value=response.ok?parseDetailsRecord(await response.json()):null;await platformV2AuthenticatedJsonHeaders(userId);
   if(!mounted.current||n!==generation.current)return null;
   if(!value||value.id!==id.toLowerCase())throw new Error('unavailable');setRecord(value);setStatus(previous=>previous==='conflict'?'conflict':'ready');return value;
  }catch{if(mounted.current&&n===generation.current){setRecord(null);setStatus('error');callbacks.current.onUnavailable?.();}return null;}
 },[userId,id]);
 useEffect(()=>{const generationRef=generation;mounted.current=true;void read();const refresh=()=>{if(document.visibilityState==='visible')void read(true);};window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',refresh);const timer=window.setInterval(refresh,15000);return()=>{mounted.current=false;generationRef.current++;window.clearInterval(timer);window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',refresh);};},[read]);
 const save=async(patch:CollectionDetailsPatch,expectedRevision:string)=>{
  if(!record||saveBusy.current)return false;saveBusy.current=true;const n=++generation.current;setStatus('saving');
  try{const headers=await platformV2AuthenticatedJsonHeaders(userId);const response=await platformFetchWithTimeout('/api/library/collection-details',{method:'POST',headers,credentials:'same-origin',cache:'no-store',body:JSON.stringify({collectionId:id,expectedRevision,patch})});
   const value=response.ok?parseDetailsRecord(await response.json()):null;await platformV2AuthenticatedJsonHeaders(userId);
   if(!mounted.current||n!==generation.current)return false;
   if(response.status===409){setStatus('conflict');return false;}
   if(response.status===404){setRecord(null);setStatus('error');callbacks.current.onUnavailable?.();return false;}
   if(!value||value.id!==id.toLowerCase())throw new Error('save');setRecord(value);setStatus('ready');props.onChanged?.();return true;
  }catch{if(mounted.current&&n===generation.current){setRecord(null);setStatus('error');callbacks.current.onUnavailable?.();}return false;}finally{saveBusy.current=false;}
 };
 if(!record)return <section className={s.editor}><header><h2>{t.collections}</h2><button onClick={props.onClose}>{t.close}</button></header><p role="status">{status==='loading'?t.loading:t.unavailable}</p>{status!=='loading'&&<button onClick={()=>void read()}>{t.retry}</button>}</section>;
 return <CollectionDetailsPanel details={{id:record.id,name:record.name,description:record.description,itemCount:props.itemCount,revision:record.revision,source:record.source,sourceStatus:record.source?'available':'not-specified',capabilities:{canEditDetails:record.isOwner,canEditSource:record.isOwner,canEditLabels:props.canEditLabels},persistence:'saved'}} labelNames={props.labelNames} locale={locale} isShared={props.isShared} onClose={props.onClose} onLabels={()=>props.onLabels(record.name)} onOpen={()=>props.onOpen(record.name)} onSave={save} saving={status==='saving'} error={status==='conflict'?t.conflict:status==='error'?t.failed:null} onRetry={async()=>{const current=await read(true);if(current)setStatus('ready');return current?.revision??null;}}/>;
}
