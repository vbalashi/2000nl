'use client';
import {useEffect,useRef,useState} from 'react';
import {useUserEventHints} from '@/lib/events/userEventHints';
import {readEntryNoteMaterial} from '@/lib/platform/entryNoteMaterialClient';
import type {PlatformEntryNoteMaterialV2} from '../../../../packages/shared/types/platformV2';
/** Supplement lifetime is independent of a latched exercise/current-card permit. */
export function useEntryNoteMaterial(input:{userId:string;entryId?:string;scope:string;active?:boolean;busy?:boolean}){
 const key=JSON.stringify([input.userId,input.entryId,input.scope,input.active!==false]);
 const scope=useRef(key);scope.current=key;
 const read=useRef<AbortController|null>(null);
 const [state,setState]=useState<{key:string;notes:PlatformEntryNoteMaterialV2[]}>({key:'',notes:[]});
 const refresh=async()=>{
  read.current?.abort();const controller=new AbortController();read.current=controller;
  setState({key,notes:[]});
  if(!input.entryId||input.active===false)return;
  try{const notes=await readEntryNoteMaterial(input.userId,input.entryId,controller.signal);
   if(!controller.signal.aborted&&scope.current===key)setState({key,notes});
  }catch{/* A failed read never restores old overlay authority. */}
 };
 useEffect(()=>{void refresh();return()=>{read.current?.abort();};
 // Scope identity owns cancellation; event hints use the latest callback separately.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[key]);
 const flush=useUserEventHints(input.userId,['notes.changed'],refresh,()=>input.active===false||Boolean(input.busy));
 useEffect(()=>{if(input.active!==false&&!input.busy)flush();},[input.active,input.busy,flush]);
 return state.key===key?state.notes:[];
}
