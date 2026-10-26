'use client';
import {localRecordSnapshotStore} from '@/lib/collections/sharing/corruptLocalRecord';
import {CorruptLocalRecovery} from '../sharing/CorruptLocalRecovery';
import {readOwnNoteDraft} from '@/lib/collections/sharing/ownNoteDraft';
import {readOwnNote} from '@/lib/collections/sharing/ownNoteClient';
import React,{useEffect,useId,useRef,useState} from 'react';
import {DialogSurface} from '@/components/practice/ui/DialogSurface';
import type {OnboardingLanguage} from '@/lib/onboardingI18n';
import {organizationCopy} from '../organization/copy';
import {useOwnNoteEditor} from './useOwnNoteEditor';
import s from '@/components/training/library-v2/AuthorEntryArchiveDialog.module.css';
import n from './ownNoteEditor.module.css';
const copy={en:{title:'My note',conflict:'Your note changed elsewhere. Compare before saving.',current:'Current saved note',mine:'Your draft',overwrite:'Save my version',uncertain:'Could not confirm the save. Check the current note.',check:'Check result',discard:'Discard unsaved changes?',discardYes:'Discard',keep:'Keep editing',invalid:'The note is too long or contains invalid characters.'},ru:{title:'Личная заметка',conflict:'Заметка изменилась в другом окне. Сравните перед сохранением.',current:'Сейчас сохранено',mine:'Ваш черновик',overwrite:'Сохранить мой вариант',uncertain:'Не удалось подтвердить сохранение. Проверьте текущую заметку.',check:'Проверить результат',discard:'Не сохранять изменения?',discardYes:'Не сохранять',keep:'Продолжить редактирование',invalid:'Заметка слишком длинная или содержит недопустимые символы.'},nl:{title:'Mijn notitie',conflict:'Je notitie is elders gewijzigd. Vergelijk voordat je opslaat.',current:'Huidige opgeslagen notitie',mine:'Jouw concept',overwrite:'Mijn versie opslaan',uncertain:'Opslaan kon niet worden bevestigd. Controleer de huidige notitie.',check:'Resultaat controleren',discard:'Wijzigingen niet opslaan?',discardYes:'Niet opslaan',keep:'Verder bewerken',invalid:'De notitie is te lang of bevat ongeldige tekens.'}};
export const ownNoteEditorLabel=(locale:OnboardingLanguage)=>copy[locale].title;
export function OwnNoteEditor({userId,entryId,locale,onClose,onSaved}:{userId:string;entryId:string;locale:OnboardingLanguage;onClose:()=>void;onSaved:()=>void}){
 const {state,setDraft,save,check,reload,valid,dirty,discard:discardDraft,repairLocal}=useOwnNoteEditor(userId,entryId);const t=copy[locale],common=organizationCopy(locale),title=useId();
 const [discard,setDiscard]=useState(false);const completed=useRef(false);
 useEffect(()=>{if(state.status==='saved'&&!completed.current){completed.current=true;onSaved();}},[state.status,onSaved]);
 const blocked=state.status==='saving';
 const close=()=>{if(blocked)return;if(state.status==='uncertain'){onClose();return;}if(dirty)setDiscard(true);else{discardDraft();onClose();}};
 return <DialogSurface className={s.dialog} aria-labelledby={title} onDismiss={close}><CorruptLocalRecovery scopeKey={JSON.stringify([userId,entryId])} storageKey={'2000nl.own-note-draft.v1.'+encodeURIComponent(userId)+'.'+entryId} valid={raw=>['saving','uncertain'].includes(state.status)||Boolean(readOwnNoteDraft(localRecordSnapshotStore(raw),userId,entryId))} verify={async signal=>{const result=await readOwnNote(userId,entryId,signal);if(result.state!=='ready')throw Error('note_check_unavailable');}} trigger={state.status+String(state.storageError)} locale={locale} suspended={discard} onClose={close} onReset={repairLocal}/>
 <h2 className={s.title} id={title}>{discard?t.discard:t.title}</h2>{discard?<div className={s.actions}><button className={s.button} onClick={()=>setDiscard(false)}>{t.keep}</button><button className={s.button} onClick={()=>{discardDraft();onClose();}}>{t.discardYes}</button></div>:<>
 {state.status==='loading'?<p role="status" className={s.body}>{common.loading}</p>:state.status==='error'?<p role="alert" className={s.body}>{common.failed}</p>:<>
 {state.status==='conflict'&&<><p role="alert" className={s.body}>{t.conflict}</p><label className={n.label}>{t.current}<div className={n.current}>{state.server?.notes??'—'}</div></label></>}
 <label className={n.label}>{state.status==='conflict'?t.mine:t.title}<textarea className={n.textarea} autoFocus rows={7} value={state.draft} disabled={blocked||state.status==='uncertain'||state.status==='saved'} onChange={event=>setDraft(event.target.value)}/></label>
 {state.storageError&&<p role="alert" className={s.body}>{common.failed}</p>}
 {!valid&&<p role="alert" className={s.body}>{t.invalid}</p>}{state.status==='uncertain'&&<p role="alert" className={s.body}>{t.uncertain}</p>}
 </>}
 <div className={`${s.actions} ${n.actions}`}><button className={s.button} disabled={blocked} onClick={close}>{common.cancel}</button>{state.status==='error'?<button className={s.button} onClick={()=>void reload()}>{common.retry}</button>:state.status==='uncertain'?<button className={s.button} onClick={()=>void check()}>{t.check}</button>:<button className={`${s.button} ${s.primary}`} disabled={!valid||!['editing','conflict'].includes(state.status)} onClick={()=>void save(state.status==='conflict')}>{state.status==='saving'?common.saving:state.status==='conflict'?t.overwrite:common.save}</button>}</div>
 </>}</DialogSurface>;
}
