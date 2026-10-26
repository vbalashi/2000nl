'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {useUserEventHints} from '@/lib/events/userEventHints';
import {readOwnedPublicationBadges} from '@/lib/collections/sharing/publicationBadgesClient';

type State={key:string;status:'idle'|'loading'|'ready'|'error';openIds:Set<string>|null};
/** A bounded read per 100 visible owner rows, never one request per collection. */
export function useOwnedPublicationBadges(userId:string,active:boolean,collectionIds:string[]){
 const ids=[...new Set(collectionIds)].sort(),key=JSON.stringify([userId,active,ids]);
 const scope=useRef({key,userId,active,ids});scope.current={key,userId,active,ids};
 const [state,setState]=useState<State>({key:'',status:'idle',openIds:null});
 const request=useRef<AbortController|null>(null);
 const refresh=useCallback(async()=>{
  const current=scope.current;request.current?.abort();
  if(!current.active||!current.userId){setState({key:current.key,status:'idle',openIds:null});return;}
  if(current.ids.length===0){setState({key:current.key,status:'ready',openIds:new Set()});return;}
  const abort=new AbortController();request.current=abort;setState({key:current.key,status:'loading',openIds:null});
  try{
   const openIds=new Set<string>();
   for(let offset=0;offset<current.ids.length;offset+=100){
    const batch=await readOwnedPublicationBadges(current.userId,current.ids.slice(offset,offset+100),abort.signal);
    for(const id of batch)openIds.add(id);
   }
   if(!abort.signal.aborted&&scope.current.key===current.key)setState({key:current.key,status:'ready',openIds});
  }catch{if(!abort.signal.aborted&&scope.current.key===current.key)setState({key:current.key,status:'error',openIds:null});}
  finally{if(request.current===abort)request.current=null;}
 },[]);
 useEffect(()=>{void refresh();return()=>request.current?.abort();},[key,refresh]);
 useUserEventHints(active?userId:undefined,['collections.changed'],refresh);
 useEffect(()=>{if(!active)return;const focus=()=>void refresh();window.addEventListener('focus',focus);return()=>window.removeEventListener('focus',focus);},[active,refresh]);
 return {status:state.key===key?state.status:active?'loading' as const:'idle' as const,openIds:state.key===key?state.openIds:null,refresh};
}
