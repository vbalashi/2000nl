"use client";
import { localizedField } from "@/lib/i18n/catalog";

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
 return <section className={local.strip} aria-label={localizedField("trainingAvailability", "title")[language]}>
  <p className={local.status} role="status" aria-live="polite">{updating?<><span className={local.spinner} aria-hidden="true"/>{localizedField("trainingAvailability", "updating")[language]}</>:null}</p>
  <dl className={s.numbers} aria-busy={updating}>{labels.map((label,index)=><div key={label}><dt>{label}</dt><dd>{pending?<span className={s.pulse} aria-label={t.loading}/>:values[index]?.toLocaleString(language)??"—"}</dd></div>)}</dl>
  <span className={local.help}><SettingsHelp label={localizedField("trainingAvailability", "helpTitle")[language]} text={localizedField("trainingAvailability", "help")[language]}/></span>
  {failed&&<p role="alert" className={s.emptyMessage}>{localizedField("trainingAvailability", "error")[language]}<button type="button" className={s.retry} onClick={onRetry}>{t.retry}</button></p>}
 </section>;
}
