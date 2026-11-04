"use client";
import { localizedSection, localizedField } from "@/lib/i18n/catalog";

import React, {useId} from "react";
import {CircleHelp} from "lucide-react";
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
 const row = (key: Exclude<keyof TrainingInteractions,"showSyllables"|"progressAnimation">) => <SettingsRow key={key} className={s.preferenceRow} title={<span className={styles.label}>{copy[key]}<Help label={copy[key]} text={help[key]} /></span>}>
   <button type="button" role="switch" aria-label={copy[key]} aria-checked={preferences[key]} className={settings.materialToggle} disabled={loadStatus!=="ready"||saveStatus==="saving"} onClick={()=>void save({...preferences,[key]:!preferences[key]})}><span /></button>
 </SettingsRow>;
 return <><SettingsRow className={s.preferenceRow} title={copy.progress}><SettingsOptions label={copy.progress} items={(["off","dots","wave"] as const).map(id=>({id,label:copy[id]}))} value={preferences.progressAnimation} disabled={loadStatus!=="ready"||saveStatus==="saving"} onChange={progressAnimation=>void save({...preferences,progressAnimation})} /></SettingsRow>{row("animation")}<div className={s.preferenceRow}><h3>{copy.gestures}</h3></div><div className={styles.gestures} role="group" aria-label={copy.gestures}>{row("gradeSwipe")}{row("translationSwipe")}{row("audioSwipe")}{row("syllableDoubleTap")}</div>{saveStatus==="error"?<p role="alert">{copy.error}</p>:null}{loadStatus==="loading"?<p role="status">{status.loading}</p>:null}{loadStatus==="error"?<div role="alert"><p>{status.loadError}</p><button type="button" onClick={reload}>{status.retry}</button></div>:null}</>;
}

function Help({label,text}: {label:string;text:string}) {
 const id=useId();
 return <><button type="button" className={styles.help} aria-label={`? ${label}`} aria-controls={id} onClick={event=>{
 const box=event.currentTarget.getBoundingClientRect(), popup=document.getElementById(id);
 if (!popup) return;
 if (popup.matches(":popover-open")) {popup.hidePopover?.(); event.preventDefault(); return;}
 popup.style.left=`${Math.max(12,Math.min(box.left,window.innerWidth-292))}px`;
 popup.style.top="12px"; popup.showPopover?.();
 const height=popup.getBoundingClientRect().height;
 popup.style.top=`${box.bottom+8+height<window.innerHeight-12?box.bottom+8:Math.max(12,box.top-height-8)}px`;
 event.preventDefault();
 }}><CircleHelp size={14} aria-hidden="true" /></button><div id={id} popover="auto" className={styles.popup}>{text}</div></>;
}
