"use client";
import React, {useId} from "react";
import {CircleHelp} from "lucide-react";
import settings from "../settings/settings.module.css";
import styles from "./TrainingInteractionSettings.module.css";
import {getUiMessages} from "@/lib/uiMessages";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import { SettingsRow } from "../settings/SettingsLayout";
import s from "@/components/reading/textPreferences.module.css";
import { useTrainingInteractions, type TrainingInteractions } from "./TrainingInteractionPreferences";
const messages = {
 en: {animation:"Card animation", gestures:"Gestures", gradeSwipe:"Swipe to rate", translationSwipe:"Swipe for translation", audioSwipe:"Swipe for audio", syllableDoubleTap:"Double-tap for syllables", error:"Could not save. Your previous settings are still active."},
 ru: {animation:"Анимация карточки", gestures:"Жесты", gradeSwipe:"Оценка свайпом", translationSwipe:"Перевод свайпом", audioSwipe:"Озвучка свайпом", syllableDoubleTap:"Слоги двойным нажатием", error:"Не удалось сохранить. Продолжают действовать предыдущие настройки."},
 nl: {animation:"Kaartanimatie", gestures:"Gebaren", gradeSwipe:"Beoordelen met een veeg", translationSwipe:"Vertaling met een veeg", audioSwipe:"Audio met een veeg", syllableDoubleTap:"Lettergrepen met dubbeltik", error:"Opslaan is niet gelukt. Je vorige instellingen blijven actief."},
};
export function TrainingInteractionSettings({language}: {language: OnboardingLanguage}) {
 const {preferences, save, loadStatus, saveStatus, reload} = useTrainingInteractions();
 const copy = messages[language];
 const status = getUiMessages(language).appearancePreferences;
 const help = {
 en: {audioSwipe:"Swipe up in a non-scrolling area of either side of the card to hear the word.", animation:"A short shift when revealing the answer. Turn off for an instant change.", gradeSwipe:"Swipe left or right to rate the answer.", translationSwipe:"Swipe down in a non-scrolling area of the revealed card to show or hide translation.", syllableDoubleTap:"Double-tap or double-click the headword to show or hide syllable breaks."},
 ru: {audioSwipe:"Короткий свайп вверх по непрокручиваемой области любой стороны карточки озвучивает слово.", animation:"Короткий сдвиг при показе ответа. Без анимации ответ появляется сразу.", gradeSwipe:"Свайп влево или вправо позволяет оценить ответ.", translationSwipe:"Свайп вниз по непрокручиваемой области открытой карточки показывает или скрывает перевод.", syllableDoubleTap:"Двойное нажатие или двойной клик по слову показывает или скрывает деление на слоги."},
 nl: {audioSwipe:"Veeg kort omhoog op een niet-scrollbaar deel van beide kaartzijden om het woord te horen.", animation:"Een korte verschuiving bij het tonen van het antwoord. Uitgeschakeld verschijnt het antwoord meteen.", gradeSwipe:"Veeg naar links of rechts om het antwoord te beoordelen.", translationSwipe:"Veeg omlaag op een niet-scrollbaar deel van de geopende kaart om de vertaling te tonen of te verbergen.", syllableDoubleTap:"Dubbeltik of dubbelklik op het trefwoord om de lettergreepverdeling te tonen of te verbergen."},
 }[language];
 const row = (key: Exclude<keyof TrainingInteractions,"showSyllables">) => <SettingsRow key={key} className={s.preferenceRow} title={<span className={styles.label}>{copy[key]}<Help label={copy[key]} text={help[key]} /></span>}>
   <button type="button" role="switch" aria-label={copy[key]} aria-checked={preferences[key]} className={settings.materialToggle} disabled={loadStatus!=="ready"||saveStatus==="saving"} onClick={()=>void save({...preferences,[key]:!preferences[key]})}><span /></button>
 </SettingsRow>;
 return <>{row("animation")}<div className={s.preferenceRow}><h3>{copy.gestures}</h3></div><div className={styles.gestures} role="group" aria-label={copy.gestures}>{row("gradeSwipe")}{row("translationSwipe")}{row("audioSwipe")}{row("syllableDoubleTap")}</div>{saveStatus==="error"?<p role="alert">{copy.error}</p>:null}{loadStatus==="loading"?<p role="status">{status.loading}</p>:null}{loadStatus==="error"?<div role="alert"><p>{status.loadError}</p><button type="button" onClick={reload}>{status.retry}</button></div>:null}</>;
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
