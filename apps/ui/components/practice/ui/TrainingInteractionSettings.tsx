"use client";
import React from "react";
import {getUiMessages} from "@/lib/uiMessages";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import { SettingsRow, SettingsOptions } from "../settings/SettingsLayout";
import s from "@/components/reading/textPreferences.module.css";
import { useTrainingInteractions, type TrainingInteractions } from "./TrainingInteractionPreferences";
const messages = {
 en: {animation:"Card animation", gestures:"Gestures", gradeSwipe:"Swipe left / right to rate", translationSwipe:"Swipe down to toggle translation", syllableDoubleTap:"Double-tap the headword to toggle syllables", on:"On", off:"Off", device:"These settings apply to your account on all devices.", error:"Could not save. Your previous settings are still active."},
 ru: {animation:"Анимация карточки", gestures:"Жесты", gradeSwipe:"Свайп влево / вправо — оценка", translationSwipe:"Свайп вниз — показать / скрыть перевод", syllableDoubleTap:"Двойное нажатие на слово — слоги", on:"Включено", off:"Выключено", device:"Настройки аккаунта действуют на всех устройствах.", error:"Не удалось сохранить. Продолжают действовать предыдущие настройки."},
 nl: {animation:"Kaartanimatie", gestures:"Gebaren", gradeSwipe:"Veeg links / rechts om te beoordelen", translationSwipe:"Veeg omlaag om de vertaling te tonen of te verbergen", syllableDoubleTap:"Dubbeltik op het trefwoord voor lettergrepen", on:"Aan", off:"Uit", device:"Deze instellingen gelden voor je account op alle apparaten.", error:"Opslaan is niet gelukt. Je vorige instellingen blijven actief."},
};
export function TrainingInteractionSettings({language}: {language: OnboardingLanguage}) {
 const {preferences, save, loadStatus, saveStatus, reload} = useTrainingInteractions();
 const copy = messages[language];
 const status = getUiMessages(language).appearancePreferences;
 const row = (key: keyof TrainingInteractions) => <SettingsRow key={key} className={s.preferenceRow} title={copy[key]}>
   <SettingsOptions label={copy[key]} items={[{id:"off",label:copy.off},{id:"on",label:copy.on}]}
     value={preferences[key]?"on":"off"} disabled={loadStatus!=="ready"||saveStatus==="saving"} onChange={value => void save({...preferences,[key]:value==="on"})} />
 </SettingsRow>;
 return <>{row("animation")}<h3>{copy.gestures}</h3>{row("gradeSwipe")}{row("translationSwipe")}{row("syllableDoubleTap")}<p>{copy.device}</p>{saveStatus==="error"?<p role="alert">{copy.error}</p>:null}{loadStatus==="loading"?<p role="status">{status.loading}</p>:null}{loadStatus==="error"?<div role="alert"><p>{status.loadError}</p><button type="button" onClick={reload}>{status.retry}</button></div>:null}</>;
}
