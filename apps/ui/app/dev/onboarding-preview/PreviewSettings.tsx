"use client";
import React from "react";
import { SettingsPanel, SettingsRow } from "@/components/practice/settings/SettingsLayout";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import { previewLocales } from "./content";
import type { PreviewTopic } from "./checkpoint";
import styles from "./preview.module.css";
export const topics: PreviewTopic[] = ["collections", "card", "stats", "sharing", "languages", "appearance"];
/** Content of the app's Settings → Getting started section, never a modal. */
export function OnboardingSettingsSection(p: { language: OnboardingLanguage; saveError: boolean;
 onTopic: (topic: PreviewTopic) => void; onAll: () => void; onResume: () => void; onRestart: () => void }) {
 const copy=previewLocales[p.language];
 return <SettingsPanel title={copy.tourName}>
  <p>{copy.resumeHelp}</p>{p.saveError&&<p role="alert" className={styles.error}>{copy.saveError}</p>}
  <SettingsRow title={copy.tourName}><div className={styles.hubActions}><button className={styles.confirm} onClick={p.onResume}>{copy.resume}</button><button className={styles.confirm} onClick={p.onRestart}>{copy.restart}</button></div></SettingsRow>
  <h3>{copy.topicHeading}</h3><p>{copy.topicHelp}</p>
  <div className={styles.topicList}>{topics.map(topic=><button key={topic} onClick={()=>p.onTopic(topic)}><strong>{copy[`${topic}Topic`]}</strong><span>{copy[`${topic}TopicBody`]}</span></button>)}</div>
  <button className={styles.confirm} onClick={p.onAll}>{copy.allTopics}</button>
 </SettingsPanel>;
}
