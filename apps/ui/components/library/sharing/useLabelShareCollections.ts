'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {readLabelShareCollections} from '@/lib/collections/sharing/labelSharingClient';
import type {LabelShareCollectionsPage} from '@/lib/collections/sharing/labelSharingContract';
import {useUserEventHints} from '@/lib/events/userEventHints';

type State={key:string;status:'loading'|'ready'|'error';page:LabelShareCollectionsPage|null;loadingMore:boolean};
export function useLabelShareCollections(userId:string,labelId:string){
 const key=JSON.stringify([userId,labelId]),scope=useRef({key,userId,labelId});scope.current={key,userId,labelId};
 const [state,setState]=useState<State>({key,status:'loading',page:null,loadingMore:false});
 const latest=useRef(state),request=useRef<AbortController|null>(null);
 const commit=useCallback((value:State)=>{latest.current=value;setState(value);},[]);
 const load=useCallback(async(append:boolean)=>{
  const context=scope.current,base=latest.current;
  if(append&&(request.current||base.key!==context.key||base.status!=='ready'||!base.page?.nextCursor))return;
  request.current?.abort();const abort=new AbortController();request.current=abort;
  commit(append?{...base,loadingMore:true}:base.key===context.key&&base.status==='ready'?{...base,loadingMore:false}:{key:context.key,status:'loading',page:null,loadingMore:false});
  try{
   const page=await readLabelShareCollections(context.userId,context.labelId,append?base.page!.nextCursor:null,abort.signal);
   if(abort.signal.aborted||scope.current.key!==context.key)return;
   commit({key:context.key,status:'ready',page:{...page,collections:[...new Map([...(append?base.page!.collections:[]),...page.collections].map(row=>[row.collectionId,row])).values()]},loadingMore:false});
  }catch{if(!abort.signal.aborted&&scope.current.key===context.key)commit({key:context.key,status:'error',page:null,loadingMore:false});}
  finally{if(request.current===abort)request.current=null;}
 },[commit]);
 useEffect(()=>{void load(false);return()=>request.current?.abort();},[key,load]);
 const refresh=useCallback(()=>load(false),[load]);
 useUserEventHints(userId,['collections.changed'],refresh);
 useEffect(()=>{const focus=()=>{void refresh();};window.addEventListener('focus',focus);return()=>window.removeEventListener('focus',focus);},[refresh]);
 return {...(state.key===key?state:{key,status:'loading' as const,page:null,loadingMore:false}),refresh:()=>{void load(false);},loadMore:()=>{void load(true);}};
}
