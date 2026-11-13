"use client";
import React from 'react';
import type {OnboardingLanguage} from '@/lib/onboardingI18n';
import {getUiMessages} from '@/lib/uiMessages';
import {fetchExerciseKnownChoices,resumeExerciseKnownChoice,type ExerciseKnownChoice} from '@/lib/platform/exerciseKnownChoicesClient';
import s from './meaningLearningProgress.module.css';
/** Library > meaning > learning progress remains available after the undo toast. */
export function ExerciseKnownChoices({entryId,language,blocked,onChanged}:{entryId:string;language:OnboardingLanguage;blocked:boolean;onChanged?:()=>void|Promise<void>}){
 const messages=getUiMessages(language),t=messages.trainingSession.knownChoice;
 const [choices,setChoices]=React.useState<ExerciseKnownChoice[]>([]),[failed,setFailed]=React.useState(false),[busy,setBusy]=React.useState(false),[version,setVersion]=React.useState(0);
 const pending=React.useRef<{exclusionId:string;eventId:string}|null>(null);
 React.useEffect(()=>{let active=true;setFailed(false);setChoices([]);void fetchExerciseKnownChoices(entryId).then(value=>{if(active)setChoices(value);},()=>{if(active)setFailed(true);});return()=>{active=false;};},[entryId,version]);
 const resume=async(choice:ExerciseKnownChoice)=>{
  if(busy||blocked)return;
  if(pending.current?.exclusionId!==choice.exclusionId)pending.current={exclusionId:choice.exclusionId,eventId:crypto.randomUUID()};
  setBusy(true);setFailed(false);
  try{await resumeExerciseKnownChoice(entryId,choice,pending.current.eventId);pending.current=null;setVersion(v=>v+1);void onChanged?.();}catch{setFailed(true);}finally{setBusy(false);}
 };
 return <section aria-label={t.known}>
  {failed&&<p role="alert">{t.loadFailed} <button type="button" onClick={()=>setVersion(v=>v+1)}>{messages.learningProgress.retry}</button></p>}
  {choices.map(choice=><div className={s.footer} key={choice.exclusionId}>
   <strong>{choice.text??messages.trainingHistory.exercises[choice.family==='translation'?'translation':'idiom']}</strong>
   <p>{choice.directions.map(d=>messages.trainingHistory.exercises[d==='recall'?'translation':d==='direct'?'idiomDirect':'idiomReverse']).join(' · ')} · {t.known}</p>
   <button type="button" disabled={blocked||busy} onClick={()=>void resume(choice)}>{t.returnToLearning}</button>
  </div>)}
 </section>;
}
