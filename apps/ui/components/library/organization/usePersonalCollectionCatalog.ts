'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {useUserEventHints} from '@/lib/events/userEventHints';
import {readPersonalCatalog} from '@/lib/collections/sharing/personalCatalogClient';
import {parsePersonalCatalogQuery,type PersonalCatalogQuery,type PersonalCatalogPage} from '@/lib/collections/sharing/personalCatalogContract';
type State=PersonalCatalogPage&{key:string;status:'idle'|'loading'|'ready'|'error';loadingMore:boolean};
const empty=(key:string,status:State['status']):State=>({key,status,revision:0,collections:[],nextCursor:null,loadingMore:false});
export function usePersonalCollectionCatalog(input:{userId:string;active:boolean;query:Omit<PersonalCatalogQuery,'cursor'>}){
 const query=parsePersonalCatalogQuery({...input.query,cursor:null}),key=JSON.stringify([input.userId,input.active,query]);
 const current=useRef({key,...input,query});current.current={key,...input,query};
 const [state,setState]=useState<State>(()=>empty('','idle')),latest=useRef(state);
 const request=useRef<AbortController|null>(null),sequence=useRef(0),cursors=useRef(new Set<string>());
 const commit=useCallback((next:State)=>{latest.current=next;setState(next);},[]);
 const load=useCallback(async function run(append:boolean):Promise<void>{
  const scope=current.current,base=latest.current;
  if(append&&(request.current||base.key!==scope.key||base.status!=='ready'||!base.nextCursor))return;
  request.current?.abort();const generation=++sequence.current;
  if(!scope.active||!scope.userId){commit(empty(scope.key,'idle'));return;}
  if(!scope.query){commit(empty(scope.key,'error'));return;}
  const abort=new AbortController();request.current=abort;
  const valid=()=>!abort.signal.aborted&&current.current.key===scope.key&&sequence.current===generation;
  const cursor=append?base.nextCursor:null;
  if(append){cursors.current.add(JSON.stringify(cursor));commit({...base,loadingMore:true});}else{cursors.current.clear();commit(empty(scope.key,'loading'));}
  try{
   const page=await readPersonalCatalog(scope.userId,{...scope.query,cursor},abort.signal);if(!valid())return;
   if(append&&page.revision!==base.revision){await run(false);return;}
   if(page.nextCursor&&cursors.current.has(JSON.stringify(page.nextCursor)))throw new Error('catalog_cursor_cycle');
   commit({...page,key:scope.key,status:'ready',loadingMore:false,collections:[...new Map([...(append?base.collections:[]),...page.collections].map(row=>[row.id,row])).values()]});
  }catch{if(valid())commit(empty(scope.key,'error'));}
  finally{if(request.current===abort)request.current=null;}
 },[commit]);
 const refresh=useCallback(()=>load(false),[load]),loadMore=useCallback(()=>load(true),[load]);
 useEffect(()=>{void refresh();return()=>request.current?.abort();},[key,refresh]);
 useUserEventHints(input.active?input.userId:undefined,['collections.changed'],refresh);
 useEffect(()=>{if(!input.active)return;const focus=()=>void refresh();window.addEventListener('focus',focus);return()=>window.removeEventListener('focus',focus);},[input.active,refresh]);
 return {...(state.key===key?state:empty(key,!input.active?'idle':query?'loading':'error')),refresh,loadMore};
}
