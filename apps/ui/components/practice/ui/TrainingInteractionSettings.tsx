"use client";
import { localizedSection, localizedField } from "@/lib/i18n/catalog";

import React, {useEffect, useState} from "react";
import {TrainingSessionProgress} from "@/components/training/v2/TrainingSessionProgress";
import type {ProgressAnimation} from "@/lib/preferences/trainingInteractions";
import {SettingsHelp as Help} from "../settings/SettingsHelp";
import settings from "../settings/settings.module.css";
import styles from "./TrainingInteractionSettings.module.css";
import {getUiMessages} from "@/lib/uiMessages";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import { SettingsRow, SettingsOptions } from "../settings/SettingsLayout";
import s from "@/components/reading/textPreferences.module.css";
import { useTrainingInteractions, type TrainingInteractions } from "./TrainingInteractionPreferences";
const messages = localizedSection("interactionSettings");
export function TrainingInteractionSettings({language}: {language: OnboardingLanguage}) {
 const {preferences, save, loadStatus, saveStatus, reload} = useTrainingInteractions();
 const copy = messages[language];
 const status = getUiMessages(language).appearancePreferences;
 const help = localizedField("interactionSettings", "help")[language];
 const row = (key: Exclude<keyof TrainingInteractions,"showSyllables"|"progressAnimation"|"alwaysShowCardCount">) => <SettingsRow key={key} className={s.preferenceRow} title={<span className={styles.label}>{copy[key]}<Help label={copy[key]} text={help[key]} /></span>}>
   <button type="button" role="switch" aria-label={copy[key]} aria-checked={preferences[key]} className={settings.materialToggle} disabled={loadStatus!=="ready"||saveStatus==="saving"} onClick={()=>void save({...preferences,[key]:!preferences[key]})}><span /></button>
 </SettingsRow>;
 return <><SettingsRow className={s.preferenceRow} title={<span className={styles.label}>{copy.progress}<Help hover label={copy.progress} text={copy.progressHelp}/></span>}><SettingsOptions label={copy.progress} items={(["off","dots","wave"] as const).map(id=>({id,label:copy[id]}))} value={preferences.progressAnimation} disabled={loadStatus!=="ready"||saveStatus==="saving"} onChange={progressAnimation=>void save({...preferences,progressAnimation})} /></SettingsRow><ProgressPreview language={language} variant={preferences.progressAnimation} showCount={preferences.alwaysShowCardCount} /><SettingsRow className={s.preferenceRow} title={<span className={styles.label}>{copy.alwaysShowCardCount}<Help label={copy.alwaysShowCardCount} text={copy.countHelp} /></span>}><button type="button" role="switch" aria-label={copy.alwaysShowCardCount} aria-checked={preferences.alwaysShowCardCount} className={settings.materialToggle} disabled={loadStatus!=="ready"||saveStatus==="saving"} onClick={()=>void save({...preferences,alwaysShowCardCount:!preferences.alwaysShowCardCount})}><span /></button></SettingsRow>{row("animation")}<div className={s.preferenceRow}><h3>{copy.gestures}</h3></div><div className={styles.gestures} role="group" aria-label={copy.gestures}>{row("gradeSwipe")}{row("translationSwipe")}{row("audioSwipe")}{row("syllableDoubleTap")}</div>{saveStatus==="error"?<p role="alert">{copy.error}</p>:null}{loadStatus==="loading"?<p role="status">{status.loading}</p>:null}{loadStatus==="error"?<div role="alert"><p>{status.loadError}</p><button type="button" onClick={reload}>{status.retry}</button></div>:null}</>;
}

function ProgressPreview({language,variant,showCount}: {language:OnboardingLanguage;variant:ProgressAnimation;showCount:boolean}) {
 const copy=messages[language];
 const [position,setPosition]=useState(6);
 useEffect(()=>{
  setPosition(6);
  const media=window.matchMedia("(prefers-reduced-motion: reduce)");
  let timer:number | undefined;
  const updateMotion=()=>{
   window.clearInterval(timer);
   if(!media.matches && variant!=="off") timer=window.setInterval(()=>setPosition(value=>value>=16?6:value+1),1800);
  };
  updateMotion();
  media.addEventListener("change",updateMotion);
  return ()=>{window.clearInterval(timer);media.removeEventListener("change",updateMotion);};
 },[variant]);
 return <section className={styles.preview} aria-label={`${copy.progress}: ${copy.preview}`}>
  {[20,40].map(total=><div className={styles.previewExample} key={total}>
   <div className={styles.previewHeading}><span>{copy.preview} · {total} {copy.cards}</span>{showCount || variant==="off"?<span data-testid="progress-preview-count">{position} / {total}</span>:null}</div>
   <TrainingSessionProgress presentation={{kind:"planned",position,total,fraction:position/total}} language={language} variant={variant} />
  </div>)}
 </section>;
}
