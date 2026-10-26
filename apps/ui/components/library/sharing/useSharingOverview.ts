'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {useUserEventHints} from '@/lib/events/userEventHints';
import {readSharingOverview} from '@/lib/collections/sharing/ownedCatalogClient';
import type {SharingOverview} from '@/lib/collections/sharing/ownedCatalogContract';

type State={key:string;status:'idle'|'loading'|'ready'|'error';data:SharingOverview|null};
export function useSharingOverview(userId:string,active:boolean){
 const key=JSON.stringify([userId,active]),scope=useRef({key,userId,active});scope.current={key,userId,active};
 const [state,setState]=useState<State>({key:'',status:'idle',data:null});
 const request=useRef<AbortController|null>(null);
 const refresh=useCallback(async()=>{
  const current=scope.current;request.current?.abort();
  if(!current.active||!current.userId){setState({key:current.key,status:'idle',data:null});return;}
  const abort=new AbortController();request.current=abort;setState({key:current.key,status:'loading',data:null});
  try{const data=await readSharingOverview(current.userId,abort.signal);if(!abort.signal.aborted&&scope.current.key===current.key)setState({key:current.key,status:'ready',data});}
  catch{if(!abort.signal.aborted&&scope.current.key===current.key)setState({key:current.key,status:'error',data:null});}
  finally{if(request.current===abort)request.current=null;}
 },[]);
 useEffect(()=>{void refresh();return()=>request.current?.abort();},[key,refresh]);
 useUserEventHints(active?userId:undefined,['collections.changed'],refresh);
 useEffect(()=>{if(!active)return;const focus=()=>void refresh();window.addEventListener('focus',focus);return()=>window.removeEventListener('focus',focus);},[active,refresh]);
 return {status:state.key===key?state.status:active?'loading' as const:'idle' as const,data:state.key===key?state.data:null,refresh};
}
