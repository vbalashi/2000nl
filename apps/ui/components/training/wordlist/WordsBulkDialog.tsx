"use client";
import React from "react";
import {Search} from "lucide-react";
import {getInterfaceCatalog} from "@/lib/i18n/catalog";
import {CorruptLocalRecovery} from "@/components/library/sharing/CorruptLocalRecovery";
import {AddAction} from "@/components/practice/ui/AddAction";
import {createUserList,fetchUserLists} from "@/lib/training/listService";
import {platformV2Message} from "@/lib/platform/platformV2ClientI18n";
import { DialogSurface } from "@/components/practice/ui/DialogSurface";
import { getUiMessages, formatUiMessage } from "@/lib/uiMessages";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import type { WordListSummary } from "@/lib/types";
import { wordsBulkCollection, wordsBulkReceipt, type WordsBulkRequest, type WordsBulkResult } from "@/lib/platform/wordsBulkClient";
import s from "./wordsBulk.module.css";

const journalUuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function parseBulkJournal(raw:string):{planId:string;collectionId:string}|null {
 try {const value:unknown=JSON.parse(raw);if(!value||typeof value!=="object"||Array.isArray(value))return null;
  const row=value as Record<string,unknown>;return Object.keys(row).length===2 && typeof row.planId==="string" && journalUuid.test(row.planId) && typeof row.collectionId==="string" && journalUuid.test(row.collectionId) ? {planId:row.planId,collectionId:row.collectionId} : null;
 } catch{return null;}
}
export function WordsBulkDialog({userId,language,lists,selection,onClose,onDone,onListsUpdated}:{
 userId:string;language:OnboardingLanguage;lists:WordListSummary[];selection:Omit<WordsBulkRequest,"listId">;
 onClose:()=>void;onDone:(count:number)=>void;onListsUpdated?:()=>void;
}) {
 const copy=getUiMessages(language).wordsBulk;
 const [query,setQuery]=React.useState("");
 const [creating,setCreating]=React.useState(false);
 const [newName,setNewName]=React.useState("");
 const [created,setCreated]=React.useState<WordListSummary[]>([]);
 const [listId,setListId]=React.useState<string|null>(null);
 const [preview,setPreview]=React.useState<WordsBulkResult|null>(null);
 const [busy,setBusy]=React.useState(false);
 const [uncertain,setUncertain]=React.useState<{planId:string;collectionId:string}|null>(null);
 const [expired,setExpired]=React.useState(false);
 const journalKey=`words-bulk-confirm:${encodeURIComponent(userId)}`;
 React.useEffect(()=>{try{const raw=sessionStorage.getItem(journalKey);if(!raw){setUncertain(null);return;} const value=parseBulkJournal(raw);if(!value)throw new Error("journal");setUncertain(value);}catch{setError(getUiMessages(language).collectionComposition.storage);}},[journalKey,language]);
 const [retry,setRetry]=React.useState(0);
 const [error,setError]=React.useState<string|null>(null);
 const action=React.useRef(false);
 const generation=React.useRef(0);
 const titleId=React.useId();
 React.useEffect(()=>()=>{generation.current++;},[userId]);
 React.useEffect(()=>{
  setPreview(null);setError(null);
  if(!listId||uncertain)return;
  const tracker=generation;
  const controller=new AbortController(), expected=++tracker.current;
  setBusy(true);
  wordsBulkCollection(userId,{...selection,listId},controller.signal).then(result=>{if(expected===generation.current)setPreview(result);})
   .catch(e=>{if(expected===generation.current&&!controller.signal.aborted)setError(e instanceof Error && e.message==='selection_too_broad' ? copy.limit : e instanceof Error && e.message==='selection_changed' ? copy.changed : copy.failed);})
   .finally(()=>{if(expected===generation.current)setBusy(false);});
  return ()=>{controller.abort();tracker.current++;};
 },[userId,listId,selection,copy.failed,copy.limit,copy.changed,retry,uncertain]);
 const check=async(retry=false)=>{
  if(!uncertain||action.current)return;action.current=true;setBusy(true);setError(null);const expected=generation.current;
  try{const result=await wordsBulkReceipt(userId,uncertain.planId,false);if(expected!==generation.current)return;
   if(result.status==='committed' && result.collectionId===uncertain.collectionId){sessionStorage.removeItem(journalKey);onDone(result.addedCount);}
   else if(result.status==='expired' && result.collectionId===uncertain.collectionId){setExpired(true);setError(getUiMessages(language).collectionComposition.failed);}
   else if(retry && result.status==='pending' && result.collectionId===uncertain.collectionId){
    const retried=await wordsBulkReceipt(userId,uncertain.planId,true);if(expected!==generation.current)return;
    if(retried.status==='committed' && retried.collectionId===uncertain.collectionId){sessionStorage.removeItem(journalKey);onDone(retried.addedCount);}
    else setError(getUiMessages(language).collectionComposition.pending);
   } else setError(getUiMessages(language).collectionComposition.pending);
  }catch{if(expected===generation.current)setError(getUiMessages(language).collectionComposition.pending);}
  finally{action.current=false;if(expected===generation.current)setBusy(false);}
 };
 const submit=async()=>{
  if(!listId||!preview||busy||action.current||uncertain)return;
  action.current=true;setBusy(true);setError(null);const expected=generation.current;
  try{if(sessionStorage.getItem(journalKey))throw new Error('journal');sessionStorage.setItem(journalKey,JSON.stringify({planId:preview.planId,collectionId:listId}));if(!sessionStorage.getItem(journalKey))throw new Error('journal');}
  catch{action.current=false;setBusy(false);setError(getUiMessages(language).collectionComposition.storage);return;}
  try {const result=await wordsBulkReceipt(userId,preview.planId,true);
   if(expected===generation.current&&result.status==='committed'&&result.collectionId===listId){sessionStorage.removeItem(journalKey);onDone(result.addedCount);}else if(expected===generation.current){setUncertain({planId:preview.planId,collectionId:listId});setError(getUiMessages(language).collectionComposition.pending);}
  } catch(e) {if(expected===generation.current){
   if(e instanceof Error&&e.message==='selection_changed'){sessionStorage.removeItem(journalKey);setPreview(null);setError(copy.changed);}
   else {setUncertain({planId:preview.planId,collectionId:listId});setError(getUiMessages(language).collectionComposition.pending);}
  }}
  finally {action.current=false;if(expected===generation.current)setBusy(false);}
 };
 const create=async()=>{
  const name=newName.trim();if(!name||busy||action.current)return;
  action.current=true;setBusy(true);setError(null);const expected=generation.current;
  try {const list=await createUserList({userId,name,language_code:selection.language});
   if(!list)throw new Error('create_failed');
   if(expected===generation.current){setCreated(previous=>[list,...previous]);setCreating(false);setNewName('');setQuery('');setListId(list.id);onListsUpdated?.();}
  } catch {if(expected===generation.current)setError(copy.failed);}
  finally {action.current=false;if(expected===generation.current)setBusy(false);}
 };
 const available=[...created,...lists.filter(list=>!created.some(item=>item.id===list.id))];
 const choices=available.filter(list=>list.type==='user'&&list.ownership!=='received'&&list.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
 return <><DialogSurface className={s.dialog} onDismiss={()=>{if(!action.current)onClose();}} aria-labelledby={titleId} lang={language}>
  <header className={s.header}><h2 id={titleId}>{copy.choose}</h2><AddAction aria-label={getUiMessages(language).collections.new} title={getUiMessages(language).collections.new} disabled={busy} onClick={()=>setCreating(value=>!value)}><span className={s.createLabel}>{platformV2Message(language,'senseCard.collections.create')}</span></AddAction></header>
  <label className={s.search}><Search size={16} aria-hidden="true"/><input value={query} onChange={event=>setQuery(event.target.value)} aria-label={getUiMessages(language).collections.search} placeholder={getUiMessages(language).collections.search}/></label>
  {creating && <form className={s.create} onSubmit={event=>{event.preventDefault();void create();}}><input autoFocus value={newName} onChange={event=>setNewName(event.target.value)} aria-label={platformV2Message(language,'senseCard.collections.createPlaceholder')} placeholder={platformV2Message(language,'senseCard.collections.createPlaceholder')}/><button type="submit" disabled={!newName.trim()||busy}>{platformV2Message(language,'senseCard.collections.create')}</button></form>}
  <div className={s.choices} role="group" aria-label={copy.choose}>
   {choices.map(list=><button type="button" key={list.id} aria-pressed={listId===list.id} disabled={busy} onClick={()=>setListId(list.id)}>{list.name}</button>)}
   {!choices.length&&<p>{available.some(list=>list.type==='user'&&list.ownership!=='received') ? getUiMessages(language).collections.empty : copy.empty}</p>}
  </div>
  {preview && preview.audience.length>0 && <p>{formatUiMessage(getUiMessages(language).collectionComposition.audience,{count:preview.audience.length})}</p>}
  <p role="status" className={s.status}>{busy?copy.loading:preview?formatUiMessage(copy.preview,{articles:preview.articleCount,meanings:preview.meaningCount}):error}{error && !busy && !uncertain && <button type="button" onClick={()=>setRetry(value=>value+1)}>{getUiMessages(language).library.retry}</button>}</p>
  <div className={s.actions}><button type="button" disabled={busy && action.current} onClick={onClose}>{getUiMessages(language).builder.cancel}</button>{uncertain?<><button type="button" disabled={busy} onClick={()=>{if(expired){sessionStorage.removeItem(journalKey);setUncertain(null);setExpired(false);setError(null);}else void check();}}>{expired?copy.cancel:getInterfaceCatalog(language).features.personalNote.check}</button>{!expired && <button type="button" disabled={busy} onClick={()=>void check(true)}>{copy.retryConfirmed}</button>}</>:<button type="button" disabled={!preview||preview.meaningCount===0||busy} onClick={()=>void submit()}>{copy.confirm}</button>}</div>
 </DialogSurface><CorruptLocalRecovery scopeKey={userId} storageKey={journalKey} valid={raw=>Boolean(parseBulkJournal(raw))} verify={async signal=>{await fetchUserLists(userId,selection.language);signal.throwIfAborted();}} trigger={userId} locale={language} onClose={onClose} onReset={()=>{setUncertain(null);setError(null);}}/></>;
}
