"use client";
import React,{useEffect,useRef,useState} from "react";
import {Plus} from "lucide-react";
import {prepareLabelOrganization,confirmLabelOrganization} from "@/lib/collections/sharing/labelOrganizationClient";
import {readLabelOrganizationJournal,retainLabelOrganizationJournal,clearLabelOrganizationJournal} from "@/lib/collections/sharing/labelOrganizationJournal";
import {labelSharingStore} from "@/lib/collections/sharing/labelSharingJournal";
import {requestLabels} from "@/lib/collections/labels/client";
import type {CollectionLabelsSnapshot} from "@/lib/collections/labels/model";
import {organizationCopy} from "./copy";
import s from "./organization.module.css";
/** Creating an empty root label grants no collection access. Assignments still
 * use their original owner, revision checks and audience confirmation. */
export function InlineLabelCreate({userId,snapshot,locale,disabled,onCreated,onBusyChange}:{userId:string;snapshot:CollectionLabelsSnapshot|null;locale:string;disabled?:boolean;onCreated:(snapshot:CollectionLabelsSnapshot,id:string)=>void;onBusyChange?:(busy:boolean)=>void}){
 const t=organizationCopy(locale),[open,setOpen]=useState(false),[name,setName]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(false);
 const planId=useRef<string|null>(null);
 const pending=useRef<{id:string;name:string}|null>(null),request=useRef<AbortController|null>(null),lock=useRef(false);
 useEffect(()=>()=>request.current?.abort(),[]);
 const create=async()=>{
  if(!snapshot||!name.trim()||lock.current)return;
  lock.current=true;setBusy(true);onBusyChange?.(true);setError(false);
  const abort=new AbortController();request.current=abort;
  const command=pending.current??{id:crypto.randomUUID(),name:name.trim()};pending.current=command;
  try{
   // Reconcile a previous uncertain create before retrying its stable UUID.
   const current=await requestLabels(abort.signal,undefined,userId);
   let next=current;
   if(!current.labels.some(label=>label.id===command.id)){
    const operation={type:'create' as const,...command,parent_id:null};
    if(process.env.NEXT_PUBLIC_LABEL_SHARING_ENABLED==='true'){
     const stored=readLabelOrganizationJournal(labelSharingStore(),userId);
     if(stored&&stored!==planId.current)throw new Error('pending organization change');
     if(!planId.current){
      const plan=await prepareLabelOrganization(userId,{expectedRevision:current.revision,operation},abort.signal);
      if(plan.copyRequired||plan.delta.pathsChanged||plan.delta.added.length||plan.delta.removed.length)throw new Error('unexpected audience change');
      if(!retainLabelOrganizationJournal(labelSharingStore(),userId,plan.planId))throw new Error('storage');
      planId.current=plan.planId;
     }
     next=await confirmLabelOrganization(userId,planId.current,abort.signal);
    }else next=await requestLabels(abort.signal,{expectedRevision:current.revision,operation},userId);
   }
   if(planId.current){clearLabelOrganizationJournal(labelSharingStore(),userId,planId.current);planId.current=null;}
   if(!abort.signal.aborted){onCreated(next,command.id);pending.current=null;setOpen(false);setName('');}
  }catch{if(!abort.signal.aborted)setError(true);}
  finally{lock.current=false;if(!abort.signal.aborted){setBusy(false);onBusyChange?.(false);}}
 };
 return <div className={s.inlineCreate}>{!open?<button type="button" disabled={disabled} onClick={()=>setOpen(true)}><Plus size={16} aria-hidden="true"/>{t.newLabel}</button>:<><label>{t.newLabel}<input autoFocus aria-label={t.name} maxLength={100} value={name} disabled={busy||Boolean(pending.current)} onChange={event=>setName(event.target.value)} onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();void create();}}}/></label><div><button type="button" disabled={busy} onClick={()=>{setOpen(false);setName('');setError(false);pending.current=null;}}>{t.cancel}</button><button type="button" disabled={busy||!name.trim()} onClick={()=>void create()}>{busy?t.saving:error?t.retry:t.save}</button></div>{error&&<p role="alert">{t.uncertain}</p>}</>}</div>;
}
