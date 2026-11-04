"use client";
import React, {useEffect, useId, useState} from "react";
import {TrainingSessionProgress} from "@/components/training/v2/TrainingSessionProgress";
import type {ProgressAnimation} from "@/lib/preferences/trainingInteractions";
import {CircleHelp} from "lucide-react";
import settings from "../settings/settings.module.css";
import styles from "./TrainingInteractionSettings.module.css";
import {getUiMessages} from "@/lib/uiMessages";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import { SettingsRow, SettingsOptions } from "../settings/SettingsLayout";
import s from "@/components/reading/textPreferences.module.css";
import { useTrainingInteractions, type TrainingInteractions } from "./TrainingInteractionPreferences";
const messages = {
 en: {preview:"Preview", cards:"cards", dotsHint:"Up to 30 cards: dots joined by a straight thread. Above 30: a thin line with a moving bead.", countHelp:"Adds the number of completed cards next to the progress animation in a limited session. The count is always visible in unlimited sessions or when progress animation is Off.", alwaysShowCardCount:"Always show card count", progress:"Progress animation", off:"Off", dots:"Thread", wave:"Wave", animation:"Card animation", gestures:"Gestures", gradeSwipe:"Swipe to rate", translationSwipe:"Swipe for translation", audioSwipe:"Swipe for audio", syllableDoubleTap:"Double-tap for syllables", error:"Could not save. Your previous settings are still active."},
 ru: {preview:"Пример", cards:"карточек", dotsHint:"До 30 карточек — точки с прямой ниточкой. Больше 30 — тонкая линия с движущейся бусинкой.", countHelp:"Добавляет число пройденных карточек рядом с анимацией прогресса в ограниченной сессии. В бесконечной тренировке и при выключенной анимации счётчик виден всегда.", alwaysShowCardCount:"Всегда показывать количество карточек", progress:"Анимация прогресса", off:"Выключена", dots:"Ниточка", wave:"Волна", animation:"Анимация карточки", gestures:"Жесты", gradeSwipe:"Оценка свайпом", translationSwipe:"Перевод свайпом", audioSwipe:"Озвучка свайпом", syllableDoubleTap:"Слоги двойным нажатием", error:"Не удалось сохранить. Продолжают действовать предыдущие настройки."},
 nl: {preview:"Voorbeeld", cards:"kaarten", dotsHint:"Tot en met 30 kaarten: stippen met een rechte draad. Boven 30: een dunne lijn met een bewegende kraal.", countHelp:"Toont het aantal voltooide kaarten naast de voortgangsanimatie in een beperkte sessie. Het aantal is altijd zichtbaar in onbeperkte sessies of als de voortgangsanimatie uit staat.", alwaysShowCardCount:"Aantal kaarten altijd tonen", progress:"Voortgangsanimatie", off:"Uit", dots:"Draad", wave:"Golf", animation:"Kaartanimatie", gestures:"Gebaren", gradeSwipe:"Beoordelen met een veeg", translationSwipe:"Vertaling met een veeg", audioSwipe:"Audio met een veeg", syllableDoubleTap:"Lettergrepen met dubbeltik", error:"Opslaan is niet gelukt. Je vorige instellingen blijven actief."},
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
 const row = (key: Exclude<keyof TrainingInteractions,"showSyllables"|"progressAnimation"|"alwaysShowCardCount">) => <SettingsRow key={key} className={s.preferenceRow} title={<span className={styles.label}>{copy[key]}<Help label={copy[key]} text={help[key]} /></span>}>
   <button type="button" role="switch" aria-label={copy[key]} aria-checked={preferences[key]} className={settings.materialToggle} disabled={loadStatus!=="ready"||saveStatus==="saving"} onClick={()=>void save({...preferences,[key]:!preferences[key]})}><span /></button>
 </SettingsRow>;
 return <><SettingsRow className={s.preferenceRow} title={copy.progress}><SettingsOptions label={copy.progress} items={(["off","dots","wave"] as const).map(id=>({id,label:copy[id]}))} value={preferences.progressAnimation} disabled={loadStatus!=="ready"||saveStatus==="saving"} onChange={progressAnimation=>void save({...preferences,progressAnimation})} /></SettingsRow><ProgressPreview language={language} variant={preferences.progressAnimation} showCount={preferences.alwaysShowCardCount} /><SettingsRow className={s.preferenceRow} title={<span className={styles.label}>{copy.alwaysShowCardCount}<Help label={copy.alwaysShowCardCount} text={copy.countHelp} /></span>}><button type="button" role="switch" aria-label={copy.alwaysShowCardCount} aria-checked={preferences.alwaysShowCardCount} className={settings.materialToggle} disabled={loadStatus!=="ready"||saveStatus==="saving"} onClick={()=>void save({...preferences,alwaysShowCardCount:!preferences.alwaysShowCardCount})}><span /></button></SettingsRow>{row("animation")}<div className={s.preferenceRow}><h3>{copy.gestures}</h3></div><div className={styles.gestures} role="group" aria-label={copy.gestures}>{row("gradeSwipe")}{row("translationSwipe")}{row("audioSwipe")}{row("syllableDoubleTap")}</div>{saveStatus==="error"?<p role="alert">{copy.error}</p>:null}{loadStatus==="loading"?<p role="status">{status.loading}</p>:null}{loadStatus==="error"?<div role="alert"><p>{status.loadError}</p><button type="button" onClick={reload}>{status.retry}</button></div>:null}</>;
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
  {variant==="dots"?<p className={styles.previewHint}>{copy.dotsHint}</p>:null}
 </section>;
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
