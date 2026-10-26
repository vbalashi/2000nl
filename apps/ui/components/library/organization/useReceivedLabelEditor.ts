'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {readReceivedLabels,writeReceivedLabels,ReceivedLabelsError} from '@/lib/collections/sharing/receivedLabelsClient';
import type {ReceivedLabelState} from '@/lib/collections/sharing/receivedLabelsContract';
type State={key:string;status:'loading'|'ready'|'saving'|'uncertain'|'conflict'|'error'|'missing'|'saved';data:ReceivedLabelState|null;selected:string[]};
const same=(a:string[],b:string[])=>JSON.stringify([...a].sort())===JSON.stringify([...b].sort());
export function useReceivedLabelEditor(userId:string,collectionId:string){
 const key=JSON.stringify([userId,collectionId]),scope=useRef({key,userId,collectionId});scope.current={key,userId,collectionId};
 const [state,setState]=useState<State>({key:'',status:'loading',data:null,selected:[]}),latest=useRef(state);latest.current=state;
 const request=useRef<AbortController|null>(null),busy=useRef(false);
 const pending=useRef<{key:string;selected:string[]}|null>(null);
 const read=useCallback(async(check=false)=>{
  if(busy.current)return;const current=scope.current,prior=latest.current;
  const desired=pending.current?.key===current.key?pending.current.selected:check&&prior.key===current.key?prior.selected:null;
  request.current?.abort();const abort=new AbortController();request.current=abort;busy.current=true;
  setState({key:current.key,status:'loading',data:null,selected:desired??[]});
  try{
   const data=await readReceivedLabels(current.userId,current.collectionId,abort.signal);
   if(abort.signal.aborted||scope.current.key!==current.key)return;
   const selected=desired?desired.filter(id=>data.catalog.labels.some(label=>label.id===id)):data.labelIds;
   pending.current=null;
   setState({key:current.key,data,selected,status:desired?(same(desired,data.labelIds)?'saved':'conflict'):'ready'});
  }catch(error){if(!abort.signal.aborted&&scope.current.key===current.key)setState({key:current.key,status:error instanceof ReceivedLabelsError&&error.kind==='missing'?'missing':'error',data:null,selected:desired??[]});}
  finally{if(request.current===abort){request.current=null;busy.current=false;}}
 },[]);
 useEffect(()=>{busy.current=false;void read();return()=>{request.current?.abort();busy.current=false;};},[key,read]);
 const toggle=(id:string)=>{if(busy.current||latest.current.key!==key||!['ready','conflict'].includes(latest.current.status)||!latest.current.data?.catalog.labels.some(label=>label.id===id))return;setState(current=>({...current,selected:current.selected.includes(id)?current.selected.filter(value=>value!==id):[...current.selected,id]}));};
 const save=async()=>{
  const current=scope.current,prior=latest.current;
  if(busy.current||prior.key!==current.key||!prior.data||!['ready','conflict'].includes(prior.status))return;
  const abort=new AbortController();request.current=abort;busy.current=true;setState({...prior,status:'saving'});
  pending.current={key:current.key,selected:[...prior.selected]};
  try{
   await writeReceivedLabels(current.userId,current.collectionId,{expectedRevision:prior.data.catalog.revision,labelIds:prior.selected},abort.signal);
   if(!abort.signal.aborted&&scope.current.key===current.key){pending.current=null;setState({...prior,status:'saved'});}
  }catch(error){
   if(!abort.signal.aborted&&scope.current.key===current.key)setState({...prior,status:error instanceof ReceivedLabelsError&&error.kind==='missing'?'missing':'uncertain'});
  }finally{if(request.current===abort){request.current=null;busy.current=false;}}
 };
 const visible:State=state.key===key?state:{key,status:'loading',data:null,selected:[]};
 return {...visible,toggle,save,check:()=>read(true),reload:()=>read(false)};
}
