'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {readTrainingCollectionReferences} from '@/lib/collections/sharing/readableTrainingCatalog';
import {copyUuid} from '@/lib/platform/independentEntryCopyContract';
import {useUserEventHints} from '@/lib/events/userEventHints';
import {useCollectionSelectionScope} from './CollectionSelectionContext';
/** Only explicit saved/current recipe IDs; never enumerate received collections at startup. */
export function useTrainingSourceReferences(values:string[]){
 const scope=useCollectionSelectionScope(),active=process.env.NEXT_PUBLIC_COLLECTION_SHARING_ENABLED==='true'&&Boolean(scope?.onTrainingResolved);
 const ids=[...new Set(values.flatMap(value=>value.startsWith('user:')&&copyUuid(value.slice(5))?[value.slice(5).toLowerCase()]:[]))].sort();
 const key=JSON.stringify([scope?.userId,scope?.languageCode,active,ids]),current=useRef({key,scope,ids,active});current.current={key,scope,ids,active};
 const [state,setState]=useState<{key:string;status:'loading'|'ready'|'error'}>({key:'',status:'ready'}),request=useRef<AbortController|null>(null);
 const refresh=useCallback(async()=>{
  const expected=current.current;request.current?.abort();if(expected.ids.length>128){setState({key:expected.key,status:'error'});return;}if(!expected.active||!expected.scope||!expected.ids.length){setState({key:expected.key,status:'ready'});return;}
  const abort=new AbortController();request.current=abort;expected.scope.onTrainingResolved?.(expected.ids,[]);setState({key:expected.key,status:'loading'});
  try{const rows=[];for(let start=0;start<expected.ids.length;start+=100)rows.push(...await readTrainingCollectionReferences(expected.scope.userId,expected.scope.languageCode,expected.ids.slice(start,start+100),abort.signal));
   if(!abort.signal.aborted&&current.current.key===expected.key){current.current.scope?.onTrainingResolved?.(expected.ids,rows);setState({key:expected.key,status:'ready'});}}
  catch{if(!abort.signal.aborted&&current.current.key===expected.key)setState({key:expected.key,status:'error'});}
 },[]);
 useEffect(()=>{void refresh();return()=>request.current?.abort();},[key,refresh]);
 useUserEventHints(active?scope?.userId:undefined,['collections.changed'],refresh);
 useEffect(()=>{if(!active)return;const focus=()=>void refresh();window.addEventListener('focus',focus);return()=>window.removeEventListener('focus',focus);},[active,refresh]);
 return {status:state.key===key?state.status:active&&ids.length?'loading' as const:'ready' as const,refresh};
}
