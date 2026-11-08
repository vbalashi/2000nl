'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {readLabelShareCollections,readLabelShareReferences} from '@/lib/collections/sharing/labelSharingClient';
import type {LabelShareCollectionsPage,LabelShareReferences} from '@/lib/collections/sharing/labelSharingContract';
import {useUserEventHints} from '@/lib/events/userEventHints';

type State={key:string;status:'loading'|'ready'|'error';page:LabelShareCollectionsPage|null;references:LabelShareReferences['references'];loadingMore:boolean};
export function useLabelShareCollections(userId:string,labelId:string){
 const key=JSON.stringify([userId,labelId]),scope=useRef({key,userId,labelId});scope.current={key,userId,labelId};
 const [state,setState]=useState<State>({key,status:'loading',page:null,references:[],loadingMore:false});
 const latest=useRef(state),request=useRef<AbortController|null>(null);
 const commit=useCallback((value:State)=>{latest.current=value;setState(value);},[]);
 const load=useCallback(async(append:boolean)=>{
  const context=scope.current,base=latest.current;
  if(append&&(request.current||base.key!==context.key||base.status!=='ready'||!base.page?.nextCursor))return;
  request.current?.abort();const abort=new AbortController();request.current=abort;
  commit(append?{...base,loadingMore:true}:base.key===context.key&&base.status==='ready'?{...base,loadingMore:false}:{key:context.key,status:'loading',page:null,references:[],loadingMore:false});
  try{
   const [page,references]=await Promise.all([readLabelShareCollections(context.userId,context.labelId,append?base.page!.nextCursor:null,abort.signal),append?Promise.resolve({references:base.references}):readLabelShareReferences(context.userId,context.labelId,abort.signal)]);
   if(abort.signal.aborted||scope.current.key!==context.key)return;
   commit({key:context.key,status:'ready',page:{...page,collections:[...new Map([...(append?base.page!.collections:[]),...page.collections].map(row=>[row.collectionId,row])).values()]},references:references.references,loadingMore:false});
  }catch{if(!abort.signal.aborted&&scope.current.key===context.key)commit({key:context.key,status:'error',page:null,references:[],loadingMore:false});}
  finally{if(request.current===abort)request.current=null;}
 },[commit]);
 useEffect(()=>{void load(false);return()=>request.current?.abort();},[key,load]);
 const refresh=useCallback(()=>load(false),[load]);
 useUserEventHints(userId,['collections.changed'],refresh);
 useEffect(()=>{const focus=()=>{void refresh();};window.addEventListener('focus',focus);return()=>window.removeEventListener('focus',focus);},[refresh]);
 return {...(state.key===key?state:{key,status:'loading' as const,page:null,references:[],loadingMore:false}),refresh:()=>{void load(false);},loadMore:()=>{void load(true);}};
}
