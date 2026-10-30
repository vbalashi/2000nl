"use client";
import React from "react";
import { DialogSurface } from "@/components/practice/ui/DialogSurface";
import { getUiMessages } from "@/lib/uiMessages";
import type { PreviewPreferences, PreviewTranslationLanguage } from "./preferences";
import { previewTranslationLanguages } from "./preferences";
import { previewLanguageOptions, previewLocales } from "./content";
import { languageDisplayName } from "@/lib/languages/languageDisplayName";
import type { PreviewTopic } from "./checkpoint";
import styles from "./preview.module.css";
export const topics: PreviewTopic[] = ["collections", "card", "stats", "sharing", "languages", "appearance"];
export function PreviewSettings(p: {
  preferences: PreviewPreferences; saveError: boolean; pane: "home" | "languages" | "appearance";
  theme: "light" | "dark"; onTheme: (theme: "light" | "dark") => void;
  onChoose: (patch: Partial<PreviewPreferences>) => void;
  onTopic: (topic: PreviewTopic) => void; onAll: () => void;
  onResume: () => void; onRestart: () => void; onClose: () => void; onDone: () => void;
}) {
 const lang=p.preferences.interfaceLanguage, copy=previewLocales[lang], ui=getUiMessages(lang);
 return <DialogSurface className={styles.hub} lang={lang} aria-labelledby="preview-settings-title" onDismiss={p.onClose}>
  <header><h2 id="preview-settings-title">{ui.settings.title} → {copy.tourName}</h2><button onClick={p.onClose}>{copy.backApp}</button></header>
  {p.saveError && <p role="alert" className={styles.error}>{copy.saveError}</p>}
  {p.pane === "home" ? <>
   <p>{copy.resumeHelp}</p><div className={styles.hubActions}><button className={styles.confirm} onClick={p.onResume}>{copy.resume}</button><button onClick={p.onRestart}>{copy.restart}</button></div>
   <h3>{copy.topicHeading}</h3><p>{copy.topicHelp}</p>
   <div className={styles.topicList}>{topics.map(topic=><button key={topic} onClick={()=>p.onTopic(topic)}><strong>{copy[`${topic}Topic`]}</strong><span>{copy[`${topic}TopicBody`]}</span></button>)}</div>
   <button className={styles.confirm} onClick={p.onAll}>{copy.allTopics}</button>
  </> : p.pane === "appearance" ? <><p>{copy.appearanceTopicBody}</p><div className={styles.hubActions}><button aria-pressed={p.theme==="light"} onClick={()=>p.onTheme("light")}>{copy.lightTheme}</button><button aria-pressed={p.theme==="dark"} onClick={()=>p.onTheme("dark")}>{copy.darkTheme}</button></div><p>{copy.previewSettingsOnly}</p><button className={styles.confirm} onClick={p.onDone}>{copy.done}</button></> : <>
   <p>{copy.languagesTopicBody}</p><label>{ui.settings.interfaceLanguage}<select value={lang} onChange={event=>p.onChoose({interfaceLanguage:event.target.value as PreviewPreferences["interfaceLanguage"]})}>{previewLanguageOptions.map(item=><option key={item.code} value={item.code}>{item.name}</option>)}</select></label>
   <label>{ui.settings.translationLanguage}<select value={p.preferences.translationLanguage} onChange={event=>p.onChoose({translationLanguage:event.target.value as PreviewTranslationLanguage})}><option value="off">{ui.settings.off}</option>{previewTranslationLanguages.map(code=><option key={code} value={code}>{languageDisplayName(lang,code)}</option>)}</select></label>
   <p>{copy.secondaryMention}</p><p>{copy.previewSettingsOnly}</p><button className={styles.confirm} onClick={p.onDone}>{copy.done}</button>
  </>}
 </DialogSurface>;
}
