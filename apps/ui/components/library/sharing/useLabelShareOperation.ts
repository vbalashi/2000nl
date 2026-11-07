'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {createLabelShareIntent,executeLabelShareIntent,reconcileLabelShareIntent,type LabelShareIntent} from '@/lib/collections/sharing/labelSharingClient';
import type {LabelShareCommand,LabelShareReceipt} from '@/lib/collections/sharing/labelSharingContract';
import {readLabelSharingJournal,retainLabelSharingJournal,clearLabelSharingJournal,labelSharingStore} from '@/lib/collections/sharing/labelSharingJournal';

type State={key:string;status:'idle'|'saving'|'uncertain'|'storage-error'|'finished';intent:LabelShareIntent|null;receipt:LabelShareReceipt|null};
/** One operation identity survives retries, reopening, and uncertain transport outcomes. */
export function useLabelShareOperation(userId:string,scope:string,accepts:(command:LabelShareCommand)=>boolean){
 const key=JSON.stringify([userId,scope]);
 const current=useRef({key,userId,scope,accepts});current.current={key,userId,scope,accepts};
 const [state,setState]=useState<State>({key,status:'idle',intent:null,receipt:null});
 const latest=useRef(state),generation=useRef(0),busy=useRef(false),abort=useRef<AbortController|null>(null);
 const commit=useCallback((value:State)=>{latest.current=value;setState(value);},[]);
 useEffect(()=>{
  const saved=readLabelSharingJournal(labelSharingStore(),userId,scope);
  busy.current=false;
  commit({key,status:saved&&current.current.accepts(saved.command)?'uncertain':'idle',intent:saved&&current.current.accepts(saved.command)?saved:null,receipt:null});
  return()=>{abort.current?.abort();};
 },[key,userId,scope,commit]);

 const request=useCallback(async(mode:'execute'|'retry'|'reconcile',command?:LabelShareCommand)=>{
  const context=current.current,base=latest.current;
  if(busy.current||base.key!==context.key)return;
  if(mode==='execute'&&(base.status==='uncertain'||!command||!context.accepts(command)))return;
  if(mode!=='execute'&&(base.status!=='uncertain'||!base.intent))return;
  const intent=mode==='execute'?createLabelShareIntent(context.userId,command!):base.intent!;
  if(mode!=='reconcile'&&!retainLabelSharingJournal(labelSharingStore(),context.scope,intent)){
   commit({...base,status:base.intent?'uncertain':'storage-error'});return;
  }
  busy.current=true;abort.current?.abort();const controller=new AbortController();abort.current=controller;
  const sequence=++generation.current;
  const valid=()=>!controller.signal.aborted&&current.current.key===context.key&&generation.current===sequence;
  commit({key:context.key,status:'saving',intent,receipt:null});
  try{
   const receipt=await(mode==='reconcile'?reconcileLabelShareIntent:executeLabelShareIntent)(intent,controller.signal);
   if(!valid())return;
   if(receipt&&receipt.status!=='unknown'){
    clearLabelSharingJournal(labelSharingStore(),context.scope,intent);
    commit({key:context.key,status:'finished',intent:null,receipt});
   }else commit({key:context.key,status:'uncertain',intent,receipt:null});
  }catch{if(valid())commit({key:context.key,status:'uncertain',intent,receipt:null});}
  finally{if(valid())busy.current=false;}
 },[commit]);

 return {state:state.key===key?state:{key,status:'idle' as const,intent:null,receipt:null},execute:(command:LabelShareCommand)=>request('execute',command),retry:()=>request('retry'),reconcile:()=>request('reconcile')};
}
