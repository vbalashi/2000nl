'use client';
import React,{useEffect} from 'react';
import {Folder,X} from 'lucide-react';
import {DialogSurface} from '@/components/practice/ui/DialogSurface';
import type {OnboardingLanguage} from '@/lib/onboardingI18n';
import {labelRows} from '@/lib/collections/labels/catalog';
import {organizationCopy} from './copy';
import {useReceivedLabelEditor} from './useReceivedLabelEditor';
import overlays from '@/components/practice/library/libraryOverlays.module.css';
import s from './organization.module.css';
const copy={en:{check:'Check saved labels',missing:'This collection is no longer available.'},ru:{check:'Проверить сохранённые метки',missing:'Эта коллекция больше недоступна.'},nl:{check:'Opgeslagen labels controleren',missing:'Deze collectie is niet meer beschikbaar.'}};
export function ReceivedCollectionLabels({userId,collectionId,name,locale,onClose,onSaved}:{userId:string;collectionId:string;name:string;locale:OnboardingLanguage;onClose:()=>void;onSaved:()=>void}){
 const editor=useReceivedLabelEditor(userId,collectionId),t=organizationCopy(locale),extra=copy[locale];
 useEffect(()=>{if(editor.status==='saved')onSaved();},[editor.status,onSaved]);
 const saving=editor.status==='saving',rows=labelRows(editor.data?.catalog??null,locale);
 return <DialogSurface className={overlays.dialog} aria-label={t.assign} onDismiss={()=>{if(!saving)onClose();}}><form className={s.editor} onSubmit={event=>{event.preventDefault();void editor.save();}}>
  <header><h2>{t.assign}</h2><button type="button" aria-label={t.close} disabled={saving} onClick={onClose}><X size={20}/></button></header><p>{name}</p>
  {editor.status==='loading'?<p role="status">{t.loading}</p>:editor.status==='missing'?<p role="alert">{extra.missing}</p>:editor.status==='error'?<p role="alert">{t.unavailable} <button type="button" onClick={()=>void editor.reload()}>{t.retry}</button></p>:<>
   <div className={s.assignmentList}>{rows.map(({label,depth})=><label key={label.id} style={{paddingInlineStart:depth*12}}><input type="checkbox" checked={editor.selected.includes(label.id)} disabled={saving||editor.status==='uncertain'} onChange={()=>editor.toggle(label.id)}/><Folder size={16}/>{label.name}</label>)}{!rows.length&&<p>{t.noLabels}</p>}</div>
   {editor.status==='conflict'&&<p role="alert">{t.conflict}</p>}
   {editor.status==='uncertain'&&<p role="alert">{t.uncertain} <button type="button" onClick={()=>void editor.check()}>{extra.check}</button></p>}
  </>}
  <footer><button type="button" disabled={saving} onClick={onClose}>{t.cancel}</button><button type="submit" disabled={!['ready','conflict'].includes(editor.status)}>{saving?t.saving:t.save}</button></footer>
 </form></DialogSurface>;
}
