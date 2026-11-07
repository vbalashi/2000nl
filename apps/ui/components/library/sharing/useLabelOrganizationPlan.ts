'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {prepareLabelOrganization,confirmLabelOrganization,readLabelOrganizationReceipt} from '@/lib/collections/sharing/labelOrganizationClient';
import type {LabelOrganizationPlan} from '@/lib/collections/sharing/labelOrganizationContract';
import type {CollectionLabelOperation,CollectionLabelsSnapshot} from '@/lib/collections/labels/model';
import {readLabelOrganizationJournal,retainLabelOrganizationJournal,clearLabelOrganizationJournal} from '@/lib/collections/sharing/labelOrganizationJournal';
import {labelSharingStore} from '@/lib/collections/sharing/labelSharingJournal';

type State={userId:string;status:'idle'|'preparing'|'awaiting'|'confirming'|'checking'|'uncertain'|'failed';plan:LabelOrganizationPlan|null;planId:string|null;error:string|null};
const idle=(userId:string):State=>({userId,status:'idle',plan:null,planId:null,error:null});
const terminal=new Set(['label_audience_changed','label_catalog_conflict','share_copy_required','label_plan_unavailable']);

export function useLabelOrganizationPlan(userId:string,onSaved:(snapshot:CollectionLabelsSnapshot)=>void){
 const current=useRef({userId,onSaved});current.current={userId,onSaved};
 const [state,setState]=useState<State>(()=>idle(userId)),latest=useRef(state),busy=useRef(false),request=useRef<AbortController|null>(null);
 const commit=useCallback((value:State)=>{latest.current=value;setState(value);},[]);
 const resume=useCallback(()=>{
  const owner=current.current.userId,planId=readLabelOrganizationJournal(labelSharingStore(),owner);
  if(planId)commit({userId:owner,status:'uncertain',plan:null,planId,error:null});
 },[commit]);
 useEffect(()=>{busy.current=false;commit(idle(userId));resume();return()=>request.current?.abort();},[userId,resume,commit]);

 const persist=useCallback(async(planId:string,plan:LabelOrganizationPlan|null,owner:string):Promise<boolean>=>{
  if(!retainLabelOrganizationJournal(labelSharingStore(),owner,planId)){
   commit({userId:owner,status:plan?'awaiting':'uncertain',plan,planId,error:'storage'});return false;
  }
  request.current?.abort();const abort=new AbortController();request.current=abort;
  const valid=()=>!abort.signal.aborted&&current.current.userId===owner;
  commit({userId:owner,status:'confirming',plan,planId,error:null});
  try{
   const snapshot=await confirmLabelOrganization(owner,planId,abort.signal);
   if(!valid())return false;
   clearLabelOrganizationJournal(labelSharingStore(),owner,planId);
   current.current.onSaved(snapshot);commit(idle(owner));return true;
  }catch(error){
   if(!valid())return false;
   const reason=error instanceof Error?error.message:'';
   if(terminal.has(reason)){
    clearLabelOrganizationJournal(labelSharingStore(),owner,planId);
    commit({userId:owner,status:'failed',plan:null,planId:null,error:reason});
   }else commit({userId:owner,status:'uncertain',plan,planId,error:null});
   return false;
  }
 },[commit]);

 const save=useCallback(async(expectedRevision:number,operation:CollectionLabelOperation):Promise<boolean>=>{
  const owner=current.current.userId;
  if(busy.current||latest.current.userId===owner&&['uncertain','awaiting','confirming'].includes(latest.current.status))return false;
  if(readLabelOrganizationJournal(labelSharingStore(),owner)){resume();return false;}
  busy.current=true;request.current?.abort();const abort=new AbortController();request.current=abort;
  commit({...idle(owner),status:'preparing'});
  try{
   const plan=await prepareLabelOrganization(owner,{expectedRevision,operation},abort.signal);
   if(abort.signal.aborted||current.current.userId!==owner)return false;
   if(plan.copyRequired||plan.delta.pathsChanged||plan.delta.added.length||plan.delta.removed.length){
    commit({userId:owner,status:'awaiting',plan,planId:plan.planId,error:null});return false;
   }
   return await persist(plan.planId,plan,owner);
  }catch(error){
   if(!abort.signal.aborted&&current.current.userId===owner)commit({userId:owner,status:'failed',plan:null,planId:null,error:error instanceof Error?error.message:'unavailable'});
   return false;
  }finally{if(current.current.userId===owner)busy.current=false;}
 },[commit,persist,resume]);
 const confirm=useCallback(async()=>{
  const owner=current.current.userId,base=latest.current;
  if(busy.current||base.userId!==owner||!base.planId||!['awaiting','uncertain'].includes(base.status)||base.plan?.copyRequired)return false;
  busy.current=true;
  try{return await persist(base.planId,base.plan,owner);}finally{if(current.current.userId===owner)busy.current=false;}
 },[persist]);
 const check=useCallback(async()=>{
  const owner=current.current.userId,base=latest.current;
  if(busy.current||base.userId!==owner||base.status!=='uncertain'||!base.planId)return false;
  busy.current=true;request.current?.abort();const abort=new AbortController();request.current=abort;
  const valid=()=>!abort.signal.aborted&&current.current.userId===owner;
  commit({...base,status:'checking',error:null});
  try{
   const receipt=await readLabelOrganizationReceipt(owner,base.planId,abort.signal);
   if(!valid())return false;
   if(receipt.status==='committed'){
    clearLabelOrganizationJournal(labelSharingStore(),owner,base.planId);current.current.onSaved(receipt.result);commit(idle(owner));return true;
   }
   if(receipt.status==='expired'){
    clearLabelOrganizationJournal(labelSharingStore(),owner,base.planId);commit({...idle(owner),status:'failed',error:'label_audience_changed'});
   }else commit({...base,status:'uncertain',error:receipt.status==='unknown'?'unknown':null});
   return false;
  }catch{if(valid())commit({...base,status:'uncertain',error:'receipt_unavailable'});return false;}
  finally{if(current.current.userId===owner)busy.current=false;}
 },[commit]);
 return {state:state.userId===userId?state:idle(userId),hasPending:Boolean(readLabelOrganizationJournal(labelSharingStore(),userId)),save,confirm,check,resume,cancel:()=>{if(!busy.current)commit(idle(current.current.userId));}};
}
