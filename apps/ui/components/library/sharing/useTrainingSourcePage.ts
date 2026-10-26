'use client';
import {useUserEventHints} from '@/lib/events/userEventHints';
import {useCallback,useEffect,useRef,useState} from 'react';
import {readTrainingCollectionPage} from '@/lib/collections/sharing/readableTrainingCatalog';
import type {TrainingCollectionPage} from '@/lib/collections/sharing/trainingCollectionCatalogContract';
import {useCollectionSelectionScope} from './CollectionSelectionContext';
export function useTrainingSourcePage(query:string){
 const scope=useCollectionSelectionScope(),active=process.env.NEXT_PUBLIC_COLLECTION_SHARING_ENABLED==='true'&&Boolean(scope?.onTrainingResolved);
 const key=JSON.stringify([scope?.userId,scope?.languageCode,query,active]),latest=useRef({key,scope,active,query});latest.current={key,scope,active,query};
 const [state,setState]=useState<{key:string;page:TrainingCollectionPage;status:'loading'|'ready'|'error';more:boolean}>({key:'',page:{collections:[],nextCursor:null},status:'loading',more:false}),request=useRef<AbortController|null>(null),stateRef=useRef(state);stateRef.current=state;
 const load=useCallback(async(more=false)=>{
  const current=latest.current,base=stateRef.current;if(!current.active||!current.scope||more&&(base.key!==current.key||base.status!=='ready'||base.more||!base.page.nextCursor))return;
  request.current?.abort();const abort=new AbortController();request.current=abort;
  setState(more?{...base,more:true}:{key:current.key,page:{collections:[],nextCursor:null},status:'loading',more:false});
  try{const page=await readTrainingCollectionPage(current.scope.userId,current.scope.languageCode,current.query,more?base.page.nextCursor:null,abort.signal);if(!abort.signal.aborted&&latest.current.key===current.key)setState({key:current.key,page:{...page,collections:more?[...base.page.collections,...page.collections.filter(row=>!base.page.collections.some(old=>old.id===row.id))]:page.collections},status:'ready',more:false});}
  catch{if(!abort.signal.aborted&&latest.current.key===current.key)setState(more?{...base,status:'error',more:false}:{key:current.key,page:{collections:[],nextCursor:null},status:'error',more:false});}
 },[]);
 useEffect(()=>{const timer=setTimeout(()=>void load(),150);return()=>{clearTimeout(timer);request.current?.abort();};},[key,load]);
 useUserEventHints(active?scope?.userId:undefined,['collections.changed'],load);
 useEffect(()=>{if(!active)return;const focus=()=>void load();window.addEventListener('focus',focus);return()=>window.removeEventListener('focus',focus);},[active,load]);
 const current=state.key===key?state:{key,page:{collections:[],nextCursor:null},status:'loading' as const,more:false};
 return {...current,active,scope,retry:()=>load(),loadMore:()=>load(true)};
}
