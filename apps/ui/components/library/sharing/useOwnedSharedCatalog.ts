'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {useUserEventHints} from '@/lib/events/userEventHints';
import {readOwnedSharedCatalog} from '@/lib/collections/sharing/ownedCatalogClient';
import {parseOwnedCatalogQuery,type OwnedCatalogPage,type OwnedCatalogQuery} from '@/lib/collections/sharing/ownedCatalogContract';

type State=OwnedCatalogPage&{key:string;status:'idle'|'loading'|'ready'|'error';loadingMore:boolean};
const empty=(key:string,status:State['status']):State=>({key,status,loadingMore:false,collections:[],nextCursor:null});
/** Search and pagination are account-bound and restart on sharing change. */
export function useOwnedSharedCatalog(input:{userId:string;active:boolean;query:Omit<OwnedCatalogQuery,'cursor'>}){
 const query=parseOwnedCatalogQuery({...input.query,cursor:null});const key=JSON.stringify([input.userId,input.active,query]);
 const current=useRef({key,...input,query});current.current={key,...input,query};
 const [state,setState]=useState<State>(()=>empty('','idle'));const latest=useRef(state);
 const read=useRef<AbortController|null>(null),sequence=useRef(0),cursors=useRef(new Set<string>());
 const commit=useCallback((next:State)=>{latest.current=next;setState(next);},[]);
 const load=useCallback(async function run(append:boolean):Promise<void>{
  const scope=current.current,base=latest.current;
  if(append&&(read.current||base.key!==scope.key||base.status!=='ready'||!base.nextCursor))return;
  read.current?.abort();const generation=++sequence.current;
  if(!scope.active||!scope.userId){commit(empty(scope.key,'idle'));return;}
  if(!scope.query){commit(empty(scope.key,'error'));return;}
  const controller=new AbortController();read.current=controller;
  const valid=()=>!controller.signal.aborted&&generation===sequence.current&&current.current.key===scope.key;
  const cursor=append?base.nextCursor:null;
  if(append){cursors.current.add(JSON.stringify(cursor));commit({...base,loadingMore:true});}
  else{cursors.current.clear();commit(empty(scope.key,'loading'));}
  try{
   const page=await readOwnedSharedCatalog(scope.userId,{...scope.query,cursor},controller.signal);if(!valid())return;
   if(page.nextCursor&&cursors.current.has(JSON.stringify(page.nextCursor)))throw new Error('catalog_cursor_cycle');
   const collections=[...new Map([...(append?base.collections:[]),...page.collections].map(row=>[row.id,row])).values()];
   commit({...page,collections,key:scope.key,status:'ready',loadingMore:false});
  }catch{if(valid())commit(empty(scope.key,'error'));}
  finally{if(read.current===controller)read.current=null;}
 },[commit]);
 const refresh=useCallback(()=>load(false),[load]),loadMore=useCallback(()=>load(true),[load]);
 useEffect(()=>{void refresh();return()=>read.current?.abort();},[key,refresh]);
 useUserEventHints(input.active?input.userId:undefined,['collections.changed'],refresh);
 useEffect(()=>{if(!input.active)return;const focus=()=>void refresh();window.addEventListener('focus',focus);return()=>window.removeEventListener('focus',focus);},[input.active,refresh]);
 const visible=state.key===key?state:empty(key,!input.active?'idle':query?'loading':'error');
 return {status:visible.status,collections:visible.collections,nextCursor:visible.nextCursor,loadingMore:visible.loadingMore,refresh,loadMore};
}
