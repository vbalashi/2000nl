'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {prepareCollectionComposition,confirmCollectionComposition,readCollectionCompositionReceipt} from '@/lib/collections/sharing/collectionCompositionClient';
import {collectionCompositionPlanMatchesScope,type CollectionCompositionOperation,type CollectionCompositionPlan} from '@/lib/collections/sharing/collectionCompositionContract';
import {readCollectionCompositionJournal,retainCollectionCompositionJournal,clearCollectionCompositionJournal,type CompositionIntent} from '@/lib/collections/sharing/collectionCompositionJournal';
import {labelSharingStore} from '@/lib/collections/sharing/labelSharingJournal';

type State={key:string;userId:string;collectionId:string;status:'idle'|'preparing'|'awaiting'|'confirming'|'checking'|'uncertain'|'failed';plan:CollectionCompositionPlan|null;intent:CompositionIntent|null;error:string|null};
const initial=(userId:string,collectionId:string):State=>({key:JSON.stringify([userId,collectionId]),userId,collectionId,status:'idle',plan:null,intent:null,error:null});

/** All composition writers share one consent and recovery boundary. Reads never execute plans. */
export function useCollectionComposition(userId:string,collectionId:string,onCommitted:()=>void){
 const context=useRef({userId,collectionId,onCommitted,key:JSON.stringify([userId,collectionId])});context.current={userId,collectionId,onCommitted,key:JSON.stringify([userId,collectionId])};
 const [state,setState]=useState(()=>initial(userId,collectionId)),latest=useRef(state),request=useRef<AbortController|null>(null),busy=useRef(false);
 const commit=useCallback((value:State)=>{latest.current=value;setState(value);},[]);
 const resume=useCallback(()=>{
  const current=context.current,intent=readCollectionCompositionJournal(labelSharingStore(),current.userId,current.collectionId);
  commit({...initial(current.userId,current.collectionId),...(intent?{status:'uncertain' as const,intent}:{})});
 },[commit]);
 useEffect(()=>{busy.current=false;resume();return()=>request.current?.abort();},[userId,collectionId,resume]);
 const run=useCallback(async(mode:'confirm'|'check',fresh?:CollectionCompositionPlan):Promise<boolean>=>{
  const current=context.current,base=fresh?{...initial(current.userId,current.collectionId),plan:fresh,intent:{userId:current.userId,collectionId:current.collectionId,planId:fresh.planId,action:fresh.action},status:'awaiting' as const}:latest.current;
  if(base.key!==current.key||!base.intent||!['awaiting','uncertain'].includes(base.status))return false;
  const intent=base.intent;
  if(mode==='confirm'&&!retainCollectionCompositionJournal(labelSharingStore(),intent)){commit({...base,error:'storage'});return false;}
  request.current?.abort();const abort=new AbortController();request.current=abort;
  const valid=()=>!abort.signal.aborted&&context.current.key===current.key;
  commit({...base,status:mode==='check'?'checking':'confirming',error:null});
  const complete=()=>{clearCollectionCompositionJournal(labelSharingStore(),intent);commit(initial(current.userId,current.collectionId));context.current.onCommitted();return true;};
  try{
   // A restored intent is never trusted as authority for a different target or action.
   if(base.status==='uncertain'||mode==='check'){
    const receipt=await readCollectionCompositionReceipt(current.userId,intent.planId,abort.signal);if(!valid())return false;
    if(!collectionCompositionPlanMatchesScope(receipt,current.collectionId,intent.action)){commit({...base,status:'uncertain',error:'scope'});return false;}
    if(receipt.status==='committed')return complete();
    if(receipt.status==='expired'){clearCollectionCompositionJournal(labelSharingStore(),intent);commit({...initial(current.userId,current.collectionId),status:'failed',error:'collection_audience_changed'});return false;}
    if(mode==='check'){commit({...base,status:'uncertain',error:null});return false;}
   }
   const receipt=await confirmCollectionComposition(current.userId,intent.planId,abort.signal);if(!valid())return false;
   if(receipt.collectionId!==current.collectionId){commit({...base,status:'uncertain',error:'scope'});return false;}
   return complete();
  }catch(error){
   if(!valid())return false;
   const reason=error instanceof Error?error.message:'';
   if(mode==='confirm'&&['collection_audience_changed','share_copy_required'].includes(reason)){
    clearCollectionCompositionJournal(labelSharingStore(),intent);commit({...initial(current.userId,current.collectionId),status:'failed',error:reason});
   }else commit({...base,status:'uncertain',error:null});
   return false;
  }
 },[commit]);
 const save=useCallback(async(operation:CollectionCompositionOperation):Promise<boolean>=>{
  const current=context.current;if(busy.current||!current.collectionId)return false;
  if(readCollectionCompositionJournal(labelSharingStore(),current.userId,current.collectionId)){resume();return false;}
  if(latest.current.key===current.key&&['awaiting','uncertain'].includes(latest.current.status))return false;
  busy.current=true;request.current?.abort();const abort=new AbortController();request.current=abort;
  commit({...initial(current.userId,current.collectionId),status:'preparing'});
  try{
   const plan=await prepareCollectionComposition(current.userId,current.collectionId,operation,abort.signal);
   if(abort.signal.aborted||context.current.key!==current.key)return false;
   const intent={userId:current.userId,collectionId:current.collectionId,planId:plan.planId,action:plan.action};
   if(plan.audience.length){commit({...initial(current.userId,current.collectionId),status:'awaiting',plan,intent});return false;}
   return await run('confirm',plan);
  }catch(error){if(!abort.signal.aborted&&context.current.key===current.key)commit({...initial(current.userId,current.collectionId),status:'failed',error:error instanceof Error?error.message:'unavailable'});return false;}
  finally{if(context.current.key===current.key)busy.current=false;}
 },[commit,resume,run]);
 const act=useCallback(async(mode:'confirm'|'check')=>{
  if(busy.current)return false;const key=context.current.key;busy.current=true;
  try{return await run(mode);}finally{if(context.current.key===key)busy.current=false;}
 },[run]);
 return {state:state.key===context.current.key?state:initial(userId,collectionId),save,confirm:()=>act('confirm'),check:()=>act('check'),resume,cancel:()=>{if(!busy.current)commit(initial(context.current.userId,context.current.collectionId));}};
}
