'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {readOwnNote,writeOwnNote} from '@/lib/collections/sharing/ownNoteClient';
import {readOwnNoteDraft,retainOwnNoteDraft,clearOwnNoteDraft,noteDraftStore,type OwnNoteDraft} from '@/lib/collections/sharing/ownNoteDraft';
import {noteText,type OwnNote,type OwnNoteCommand} from '@/lib/collections/sharing/noteContract';
type State={key:string;status:'loading'|'editing'|'saving'|'conflict'|'uncertain'|'error'|'saved';draft:string;base:OwnNote|null;server:OwnNote|null;sent:OwnNoteCommand|null;storageError:boolean};
const initial=(key:string):State=>({key,status:'loading',draft:'',base:null,server:null,sent:null,storageError:false});
export function useOwnNoteEditor(userId:string,entryId:string){
 const key=JSON.stringify([userId,entryId]);const scope=useRef({key,userId,entryId});scope.current={key,userId,entryId};
 const [state,setState]=useState<State>(()=>initial(key));const latest=useRef(state);
 const controller=useRef<AbortController|null>(null),lock=useRef(false);
 const commit=useCallback((next:State)=>{latest.current=next;setState(next);},[]);
 const retained=useRef<OwnNoteDraft|null>(null);
 const read=useCallback(async(check:boolean)=>{
  const current=scope.current,base=latest.current;if(lock.current||check&&(base.key!==current.key||base.status!=='uncertain'))return;
  if(!check&&base.key===current.key&&['saving','uncertain','conflict'].includes(base.status))return;
  lock.current=true;controller.current?.abort();const abort=new AbortController();controller.current=abort;
  const valid=()=>!abort.signal.aborted&&scope.current.key===current.key;
  try{
   const result=await readOwnNote(current.userId,current.entryId,abort.signal);if(!valid())return;
   if(result.state!=='ready'){commit({...base,key:current.key,status:check?'uncertain':'error'});return;}
   if(!check){
    const draft=readOwnNoteDraft(noteDraftStore(),current.userId,current.entryId);retained.current=draft;
    if(!draft){commit({...initial(current.key),status:'editing',base:result.note,draft:result.note.notes??''});return;}
    const restored:State={...initial(current.key),draft:draft.draft,base:{entryId:current.entryId,revision:draft.revision,notes:draft.baseNotes},server:result.note,status:draft.sent?'uncertain':result.note.revision===draft.revision?'editing':'conflict',sent:draft.sent?{expectedRevision:draft.revision,notes:draft.draft===''?null:draft.draft}:null};
    if(draft.sent&&result.note.notes===restored.sent!.notes&&BigInt(result.note.revision)>=BigInt(draft.revision)){clearOwnNoteDraft(noteDraftStore(),draft);commit({...restored,status:'saved',base:result.note});}
    else if(draft.sent&&result.note.revision!==draft.revision)commit({...restored,status:'conflict'});
    else commit(restored);
    return;
   }
   const sent=base.sent;
   if(sent&&result.note.notes===sent.notes&&BigInt(result.note.revision)>=BigInt(sent.expectedRevision)){if(retained.current)clearOwnNoteDraft(noteDraftStore(),retained.current);commit({...base,status:'saved',base:result.note,server:null});}
   else if(sent&&BigInt(result.note.revision)===BigInt(sent.expectedRevision))commit({...base,status:'uncertain',server:result.note});
   else commit({...base,status:'conflict',server:result.note});
  }catch{if(valid())commit({...base,key:current.key,status:check?'uncertain':'error'});}
  finally{if(controller.current===abort)lock.current=false;}
 },[commit]);
 useEffect(()=>{lock.current=false;retained.current=null;commit(initial(key));void read(false);return()=>controller.current?.abort();},[key,read,commit]);
 const save=useCallback(async(overwrite=false)=>{
  const current=scope.current,base=latest.current;if(lock.current||base.key!==current.key||!['editing','conflict'].includes(base.status)||!base.base)return;
  if(base.status==='conflict'&&!overwrite)return;
  const revision=overwrite?base.server?.revision:base.base.revision;if(!revision||!noteText(base.draft))return;
  const command:OwnNoteCommand={expectedRevision:revision,notes:base.draft===''?null:base.draft};
  const journal:OwnNoteDraft={userId:current.userId,entryId:current.entryId,revision:command.expectedRevision,baseNotes:base.base.notes,draft:base.draft,sent:true};
  if(!retainOwnNoteDraft(noteDraftStore(),journal,base.status==='conflict'?retained.current??undefined:undefined)){commit({...base,storageError:true});return;}
  retained.current=journal;
  lock.current=true;const abort=new AbortController();controller.current=abort;
  const valid=()=>!abort.signal.aborted&&scope.current.key===current.key;
  const pending:State={...base,status:'saving',sent:command};commit(pending);
  try{
   const result=await writeOwnNote(current.userId,current.entryId,command,abort.signal);if(!valid())return;
   if(result.state==='ready'){clearOwnNoteDraft(noteDraftStore(),journal);commit({...pending,status:'saved',base:result.note,server:null});}
   else if(result.state==='changed'){
    const actual=await readOwnNote(current.userId,current.entryId,abort.signal);if(valid())commit({...pending,status:actual.state==='ready'?'conflict':'uncertain',server:actual.state==='ready'?actual.note:null});
   }else commit({...pending,status:'uncertain'});
  }catch{if(valid())commit({...pending,status:'uncertain'});}
  finally{if(controller.current===abort)lock.current=false;}
 },[commit]);
 const setDraft=(draft:string)=>{const base=latest.current;if(base.key===key&&['editing','conflict'].includes(base.status)){
  const journal:OwnNoteDraft={userId,entryId,revision:base.base?.revision??'0',baseNotes:base.base?.notes??null,draft,sent:false};
  const stored=retainOwnNoteDraft(noteDraftStore(),journal,base.status==='conflict'?retained.current??undefined:undefined);if(stored)retained.current=journal;commit({...base,draft,storageError:!stored});
 }};
 const repairLocal=()=>{const base=latest.current;if(base.key===key&&!lock.current){retained.current=null;commit({...base,storageError:false});}};
 const discard=()=>{if(retained.current)clearOwnNoteDraft(noteDraftStore(),retained.current);};
 return {state:state.key===key?state:initial(key),setDraft,save,discard,repairLocal,check:()=>read(true),reload:()=>read(false),valid:noteText(state.draft),dirty:state.draft!==(state.base?.notes??'')};
}
