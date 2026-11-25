'use client';
import {DelayedReadNotice} from "@/components/system/DelayedReadNotice";
import { localizedSection } from "@/lib/i18n/catalog";

import {localRecordSnapshotStore} from '@/lib/collections/sharing/corruptLocalRecord';
import {CorruptLocalRecovery} from '../sharing/CorruptLocalRecovery';
import {readOwnNoteDraft} from '@/lib/collections/sharing/ownNoteDraft';
import {readOwnNote} from '@/lib/collections/sharing/ownNoteClient';
import React,{useEffect,useId,useRef,useState} from 'react';
import {StickyNote} from 'lucide-react';
import reading from '@/components/practice/article/articleContent.module.css';
import actions from '@/components/practice/article/articleActions.module.css';
import type {OnboardingLanguage} from '@/lib/onboardingI18n';
import {organizationCopy} from '../organization/copy';
import {useOwnNoteEditor} from './useOwnNoteEditor';
import s from '@/components/training/library-v2/AuthorEntryArchiveDialog.module.css';
import n from './ownNoteEditor.module.css';
const copy=localizedSection("personalNote");
export const ownNoteEditorLabel=(locale:OnboardingLanguage)=>copy[locale].title;
export function OwnNoteEditor({userId,entryId,locale,onClose,onSaved}:{userId:string;entryId:string;locale:OnboardingLanguage;onClose:()=>void;onSaved:()=>void}){
 const {state,setDraft,save,check,reload,valid,dirty,discard:discardDraft,repairLocal}=useOwnNoteEditor(userId,entryId);const t=copy[locale],common=organizationCopy(locale),title=useId();
 const [discard,setDiscard]=useState(false);const completed=useRef(false);
 useEffect(()=>{if(state.status==='saved'&&!completed.current){completed.current=true;onSaved();}},[state.status,onSaved]);
 const blocked=state.status==='saving';
 const close=()=>{if(blocked)return;if(state.status==='uncertain'){onClose();return;}if(dirty)setDiscard(true);else{discardDraft();onClose();}};
 return <section data-own-note-editor className={reading.contentSection} aria-labelledby={title}
 onKeyDown={event=>{if(event.key==='Escape' && !event.nativeEvent.isComposing){event.stopPropagation();event.preventDefault();if(discard)setDiscard(false);else close();}}}><CorruptLocalRecovery scopeKey={JSON.stringify([userId,entryId])} storageKey={'2000nl.own-note-draft.v1.'+encodeURIComponent(userId)+'.'+entryId} valid={raw=>['saving','uncertain'].includes(state.status)||Boolean(readOwnNoteDraft(localRecordSnapshotStore(raw),userId,entryId))} verify={async signal=>{const result=await readOwnNote(userId,entryId,signal);if(result.state!=='ready')throw Error('note_check_unavailable');}} trigger={state.status+String(state.storageError)} locale={locale} suspended={discard} onClose={close} onReset={repairLocal}/>
 <h3 id={title}><StickyNote size={13} aria-hidden="true"/>{discard?t.discard:t.title}</h3><div className={reading.ownNoteRail}>{discard?<div className={n.actions}><button className={actions.quiet} onClick={()=>setDiscard(false)}>{t.keep}</button><button className={actions.quiet} onClick={()=>{discardDraft();onClose();}}>{t.discardYes}</button></div>:<>
 {state.status==='loading'?<DelayedReadNotice><p role="status" className={s.body}>{common.loading}</p></DelayedReadNotice>:state.status==='error'?<p role="alert" className={s.body}>{common.failed}</p>:<>
 {state.status==='conflict'&&<><p role="alert" className={s.body}>{t.conflict}</p><label className={n.label}>{t.current}<div className={n.current}>{state.server?.notes??'—'}</div></label></>}
 <label className={n.label}>{state.status==='conflict'&&t.mine}<textarea aria-label={state.status==='conflict'?t.mine:t.title} className={n.textarea} autoFocus rows={3} value={state.draft} disabled={blocked||state.status==='uncertain'||state.status==='saved'} onChange={event=>setDraft(event.target.value)}/></label>
 {state.storageError&&<p role="alert" className={s.body}>{common.failed}</p>}
 {!valid&&<p role="alert" className={s.body}>{t.invalid}</p>}{state.status==='uncertain'&&<p role="alert" className={s.body}>{t.uncertain}</p>}
 </>}
 <div className={n.actions}><button className={actions.quiet} disabled={blocked} onClick={close}>{common.cancel}</button>{state.status==='error'?<button className={actions.quiet} onClick={()=>void reload()}>{common.retry}</button>:state.status==='uncertain'?<button className={actions.quiet} onClick={()=>void check()}>{t.check}</button>:<button className={actions.primary} disabled={!valid||!['editing','conflict'].includes(state.status)} onClick={()=>void save(state.status==='conflict')}>{state.status==='saving'?common.saving:state.status==='conflict'?t.overwrite:common.save}</button>}</div>
 </>}</div></section>;
}
