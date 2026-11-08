'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {readCollectionAccessPaths} from '@/lib/collections/sharing/labelSharingClient';
import type {CollectionAccessPaths} from '@/lib/collections/sharing/labelSharingContract';

export function useCollectionAccessPaths(userId:string,collectionId:string|null){
 const key=JSON.stringify([userId,collectionId]),current=useRef(key);current.current=key;
 const [state,setState]=useState<{key:string;status:'loading'|'ready'|'error';data:CollectionAccessPaths|null}>({key,status:'loading',data:null});
 const request=useRef<AbortController|null>(null);
 const refresh=useCallback(async()=>{
  request.current?.abort();if(!collectionId)return;
  const abort=new AbortController();request.current=abort;setState({key,status:'loading',data:null});
  try{const data=await readCollectionAccessPaths(userId,collectionId,abort.signal);if(!abort.signal.aborted&&current.current===key)setState({key,status:'ready',data});}
  catch{if(!abort.signal.aborted&&current.current===key)setState({key,status:'error',data:null});}
 },[key,userId,collectionId]);
 useEffect(()=>{void refresh();return()=>request.current?.abort();},[refresh]);
 return {...(state.key===key?state:{key,status:'loading' as const,data:null}),refresh};
}
