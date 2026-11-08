'use client';
import { localizedSection } from "@/lib/i18n/catalog";

import {InlineLabelCreate} from "./InlineLabelCreate";
import {formatMessage} from "@/lib/i18n/catalog";
import React,{useEffect,useState} from 'react';
import {X} from 'lucide-react';
import {DialogSurface} from '@/components/practice/ui/DialogSurface';
import type {OnboardingLanguage} from '@/lib/onboardingI18n';
import {LabelAssignmentPicker} from './LabelAssignmentPicker';
import {organizationCopy} from './copy';
import {useReceivedLabelEditor} from './useReceivedLabelEditor';
import overlays from '@/components/practice/library/libraryOverlays.module.css';
import s from './organization.module.css';
const copy=localizedSection("receivedCollectionLabels");
export function ReceivedCollectionLabels({userId,collectionId,name,locale,onClose,onSaved}:{userId:string;collectionId:string;name:string;locale:OnboardingLanguage;onClose:()=>void;onSaved:()=>void}){
 const editor=useReceivedLabelEditor(userId,collectionId),t=organizationCopy(locale),extra=copy[locale];
 useEffect(()=>{if(editor.status==='saved')onSaved();},[editor.status,onSaved]);
 const [creating,setCreating]=useState(false);
 const saving=editor.status==='saving'||creating;
 return <DialogSurface className={overlays.dialog} aria-label={t.assign} onDismiss={()=>{if(!saving)onClose();}}><form className={s.editor} onSubmit={event=>{event.preventDefault();if(!creating)void editor.save();}}>
  <header><h2>{formatMessage(t.labelsFor,{name})}</h2><button type="button" aria-label={t.close} disabled={saving} onClick={onClose}><X size={20}/></button></header>
  {editor.status==='loading'?<p role="status">{t.loading}</p>:editor.status==='missing'?<p role="alert">{extra.missing}</p>:editor.status==='error'?<p role="alert">{t.unavailable} <button type="button" onClick={()=>void editor.reload()}>{t.retry}</button></p>:<>
   <LabelAssignmentPicker createAction={<InlineLabelCreate scope={collectionId} userId={userId} snapshot={editor.data?.catalog??null} locale={locale} disabled={saving||editor.status==='uncertain'} onBusyChange={setCreating} onCreated={editor.created}/>} name={name} snapshot={editor.data?.catalog??null} selected={editor.selected} disabled={saving||editor.status==='uncertain'} locale={locale} onToggle={id=>editor.toggle(id)}/>
   {editor.status==='conflict'&&<p role="alert">{t.conflict}</p>}
   {editor.status==='uncertain'&&<p role="alert">{t.uncertain} <button type="button" onClick={()=>void editor.check()}>{extra.check}</button></p>}
  </>}
  <footer><button type="button" disabled={saving} onClick={onClose}>{t.cancel}</button><button type="submit" disabled={saving||!['ready','conflict'].includes(editor.status)}>{saving?t.saving:t.save}</button></footer>
 </form></DialogSurface>;
}
