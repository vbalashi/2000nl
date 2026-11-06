"use client";
import React from "react";
import {getUiMessages} from "@/lib/uiMessages";
import type {OnboardingLanguage} from "@/lib/onboardingI18n";
import type {TrainingAvailabilityState} from "@/lib/training/availability/useTrainingAvailability";
import {SettingsHelp} from "@/components/practice/settings/SettingsHelp";
import s from "@/components/practice/trainingOverview.module.css";
import local from "./trainingAvailabilityStrip.module.css";
export function TrainingAvailabilityStrip({state,language,onRetry}:{state:TrainingAvailabilityState;language:OnboardingLanguage;onRetry?:()=>void}){
 const t=getUiMessages(language).trainingOverview;
 const labels=[t.dueToday,t.totalReviews,t.stillNew];
 const values=state.status==="ready"?[state.value.dueToday,state.value.totalReviews,state.value.newCards]:[null,null,null];
 const pending=state.status==="loading";
 const updating=pending||(state.status==="ready"&&state.refreshing);
 const failed=state.status==="error"||(state.status==="ready"&&state.refreshFailed);
 return <section className={local.strip} data-updating={updating} aria-label={{ru:"Доступно для тренировки",en:"Available for training",nl:"Beschikbaar voor training"}[language]}>
  <p className={local.status} role="status" aria-live="polite">{updating?{ru:"Обновляем количество карточек…",en:"Updating card counts…",nl:"Kaartaantallen bijwerken…"}[language]:null}</p>
  <dl className={s.numbers} aria-busy={updating} aria-hidden={updating}>{labels.map((label,index)=><div key={label}><dt>{label}</dt><dd>{pending?<span className={s.pulse} aria-label={t.loading}/>:values[index]?.toLocaleString(language)??"—"}</dd></div>)}</dl>
  <span className={local.help}><SettingsHelp label={{ru:"Что означают числа",en:"About these counts",nl:"Over deze aantallen"}[language]} text={{ru:"Это все доступные карточки с вашими настройками. Размер сессии и соотношение новых и повторений определяют, сколько из них попадёт в тренировку.",en:"These are all available cards matching your settings. Session size and the balance of new cards and reviews determine how many enter the training.",nl:"Dit zijn alle beschikbare kaarten bij je instellingen. De sessiegrootte en de verhouding tussen nieuwe kaarten en herhalingen bepalen hoeveel er in de training komen."}[language]}/></span>
  {failed&&<p role="alert" className={s.emptyMessage}>{{ru:"Не удалось обновить количество карточек.",en:"Could not update the card counts.",nl:"De aantallen konden niet worden bijgewerkt."}[language]}<button type="button" className={s.retry} onClick={onRetry}>{t.retry}</button></p>}
 </section>;
}
