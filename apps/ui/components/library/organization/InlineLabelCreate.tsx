"use client";
import {ActionButton} from '@/components/practice/ui/ActionButton';
import React,{useEffect,useRef,useState} from "react";
import {Plus} from "lucide-react";
import {prepareLabelOrganization,confirmLabelOrganization,readLabelOrganizationReceipt} from "@/lib/collections/sharing/labelOrganizationClient";
import {readLabelOrganizationJournal,retainLabelOrganizationJournal,clearLabelOrganizationJournal} from "@/lib/collections/sharing/labelOrganizationJournal";
import {labelSharingStore} from "@/lib/collections/sharing/labelSharingJournal";
import {readLabelCreate,retainLabelCreate,clearLabelCreate,type LabelCreateIntent} from "@/lib/collections/labels/createJournal";
import {requestLabels} from "@/lib/collections/labels/client";
import type {CollectionLabelsSnapshot} from "@/lib/collections/labels/model";
import {organizationCopy} from "./copy";
import s from "./organization.module.css";
/** Empty-label creation retains command/plan together. It never rebases the
 * assignment draft over an unrelated catalog revision. */
export function InlineLabelCreate({userId,scope,snapshot,locale,disabled,onCreated,onBusyChange}:{userId:string;scope:string;snapshot:CollectionLabelsSnapshot|null;locale:string;disabled?:boolean;onCreated:(snapshot:CollectionLabelsSnapshot,id:string)=>void;onBusyChange?:(busy:boolean)=>void}){
 const t=organizationCopy(locale);
 const [restored]=useState(()=>readLabelCreate(labelSharingStore(),userId,scope));
 const [open,setOpen]=useState(Boolean(restored)),[name,setName]=useState(restored?.name??''),[busy,setBusy]=useState(false),[error,setError]=useState<'uncertain'|'conflict'|null>(restored?'uncertain':null);
 const safeToForget=useRef(!restored);
 const pending=useRef<LabelCreateIntent|null>(restored),request=useRef<AbortController|null>(null),lock=useRef(false);
 useEffect(()=>()=>request.current?.abort(),[]);
 const create=async()=>{
  if(!snapshot||!name.trim()||lock.current)return;
  lock.current=true;setBusy(true);onBusyChange?.(true);setError(null);
  const abort=new AbortController();request.current=abort;
  let command=pending.current??{userId,scope,id:crypto.randomUUID(),name:name.trim(),baseRevision:snapshot.revision,planId:null};
  const store=labelSharingStore();
  try{
   if(!retainLabelCreate(store,command))throw new Error('storage');pending.current=command;
   const current=await requestLabels(abort.signal,undefined,userId);
   let next:CollectionLabelsSnapshot;
   if(command.planId){
    const receipt=await readLabelOrganizationReceipt(userId,command.planId,abort.signal);
    if(receipt.status==='committed')next=receipt.result;
    else if(receipt.status==='pending'){
     if(!retainLabelOrganizationJournal(store,userId,command.planId))throw new Error('storage');
     safeToForget.current=false;next=await confirmLabelOrganization(userId,command.planId,abort.signal);
    }else {safeToForget.current=receipt.status==='expired';throw new Error('conflict');}
   }else if(current.labels.some(label=>label.id===command.id))next=current;
   else{
    // A concurrent edit must remain a conflict, even if creation itself is safe.
    if(current.revision!==command.baseRevision){safeToForget.current=true;throw new Error('conflict');}
    const operation={type:'create' as const,id:command.id,name:command.name,parent_id:null};
    if(process.env.NEXT_PUBLIC_LABEL_SHARING_ENABLED==='true'){
     if(readLabelOrganizationJournal(store,userId))throw new Error('pending organization change');
     const plan=await prepareLabelOrganization(userId,{expectedRevision:command.baseRevision,operation},abort.signal);
     if(plan.copyRequired||plan.delta.pathsChanged||plan.delta.added.length||plan.delta.removed.length)throw new Error('unexpected audience change');
     command={...command,planId:plan.planId};
     if(!retainLabelCreate(store,command))throw new Error('storage');pending.current=command;
     if(!retainLabelOrganizationJournal(store,userId,plan.planId))throw new Error('storage');
     safeToForget.current=false;next=await confirmLabelOrganization(userId,plan.planId,abort.signal);
    }else {safeToForget.current=false;next=await requestLabels(abort.signal,{expectedRevision:command.baseRevision,operation},userId);}
   }
   if(!next.labels.some(label=>label.id===command.id))throw new Error('conflict');
   safeToForget.current=true;
   if(next.revision!==command.baseRevision+1)throw new Error('conflict');
   if(!abort.signal.aborted){
    if(command.planId)clearLabelOrganizationJournal(store,userId,command.planId);
    clearLabelCreate(store,command);pending.current=null;onCreated(next,command.id);setOpen(false);setName('');
   }
  }catch(failure){if(!abort.signal.aborted)setError(failure instanceof Error&&failure.message==='conflict'?'conflict':'uncertain');}
  finally{lock.current=false;if(!abort.signal.aborted){setBusy(false);onBusyChange?.(false);}}
 };
 // Collapsing must never forget an operation whose response may have been lost.
 return <div className={s.inlineCreate}>{!open?<button type="button" disabled={disabled} onClick={()=>setOpen(true)}><Plus size={16} aria-hidden="true"/>{pending.current?t.retry:t.newLabel}</button>:<><label>{t.newLabel}<input autoFocus aria-label={t.name} maxLength={100} value={name} disabled={busy||Boolean(pending.current)} onChange={event=>setName(event.target.value)} onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();void create();}}}/></label><div><ActionButton type="button" disabled={busy} onClick={()=>{setOpen(false);if(safeToForget.current&&pending.current){if(pending.current.planId)clearLabelOrganizationJournal(labelSharingStore(),userId,pending.current.planId);clearLabelCreate(labelSharingStore(),pending.current);pending.current=null;safeToForget.current=false;}if(!pending.current)setName('');}}>{t.cancel}</ActionButton><ActionButton variant="primary" type="button" disabled={busy||!name.trim()} onClick={()=>void create()}>{busy?t.saving:error?t.retry:t.save}</ActionButton></div>{error&&<p role="alert">{t[error]}</p>}</>}</div>;
}
