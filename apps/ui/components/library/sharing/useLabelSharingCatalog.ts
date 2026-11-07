'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {useUserEventHints} from '@/lib/events/userEventHints';
import {readLabelSharingCatalog} from '@/lib/collections/sharing/labelSharingClient';
import type {LabelSharingCatalog} from '@/lib/collections/sharing/labelSharingContract';

type State={key:string;status:'idle'|'loading'|'ready'|'error';data:LabelSharingCatalog|null};
export function useLabelSharingCatalog(userId:string,active:boolean){
 const key=JSON.stringify([userId,active]),scope=useRef({key,userId,active});scope.current={key,userId,active};
 const [state,setState]=useState<State>({key:'',status:'idle',data:null});
 const request=useRef<AbortController|null>(null);
 const refresh=useCallback(async()=>{
  const context=scope.current;request.current?.abort();
  if(!context.active||!context.userId){setState({key:context.key,status:'idle',data:null});return;}
  const abort=new AbortController();request.current=abort;
  setState(previous=>previous.key===context.key&&previous.status==='ready'?previous:{key:context.key,status:'loading',data:null});
  try{const data=await readLabelSharingCatalog(context.userId,abort.signal);if(!abort.signal.aborted&&scope.current.key===context.key)setState({key:context.key,status:'ready',data});}
  catch{if(!abort.signal.aborted&&scope.current.key===context.key)setState({key:context.key,status:'error',data:null});}
  finally{if(request.current===abort)request.current=null;}
 },[]);
 useEffect(()=>{void refresh();return()=>request.current?.abort();},[key,refresh]);
 useUserEventHints(active?userId:undefined,['collections.changed'],refresh);
 useEffect(()=>{if(!active)return;const focus=()=>void refresh();window.addEventListener('focus',focus);return()=>window.removeEventListener('focus',focus);},[active,refresh]);
 return {status:state.key===key?state.status:active?'loading' as const:'idle' as const,data:state.key===key?state.data:null,refresh};
}
