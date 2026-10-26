'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {useUserEventHints} from '@/lib/events/userEventHints';
import {readReceivedSource} from '@/lib/collections/sharing/receivedSourceClient';
import type {ReceivedSource} from '@/lib/collections/sharing/receivedSourceContract';

type State={key:string;source:ReceivedSource|null;status:'idle'|'loading'|'ready'|'error'};
/** A selected source is always read under current authority, never kept from catalog memory. */
export function useReceivedSource(userId:string,id:string|null,active:boolean){
 const key=JSON.stringify([userId,id,active]);
 const scope=useRef({key,userId,id,active});scope.current={key,userId,id,active};
 const [state,setState]=useState<State>({key:'',source:null,status:'idle'});
 const request=useRef<AbortController|null>(null);
 const refresh=useCallback(async()=>{
  const current=scope.current;request.current?.abort();
  if(!current.id||!current.active){setState({key:current.key,source:null,status:'idle'});return;}
  const abort=new AbortController();request.current=abort;
  setState({key:current.key,source:null,status:'loading'});
  try{
   const source=await readReceivedSource(current.userId,current.id,abort.signal);
   if(!abort.signal.aborted&&scope.current.key===current.key)setState({key:current.key,source,status:'ready'});
  }catch{if(!abort.signal.aborted&&scope.current.key===current.key)setState({key:current.key,source:null,status:'error'});}
  finally{if(request.current===abort)request.current=null;}
 },[]);
 useEffect(()=>{void refresh();return()=>request.current?.abort();},[key,refresh]);
 useUserEventHints(active&&id?userId:undefined,['collections.changed'],refresh);
 useEffect(()=>{if(!active||!id)return;const focus=()=>void refresh();window.addEventListener('focus',focus);return()=>window.removeEventListener('focus',focus);},[active,id,refresh]);
 const current:State=state.key===key?state:{key,source:null,status:active&&id?'loading':'idle'};
 return {...current,refresh};
}
