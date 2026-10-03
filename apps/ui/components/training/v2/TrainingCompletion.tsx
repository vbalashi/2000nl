"use client";
import React, { useEffect, useState } from "react";
import { authenticatedAccountRequest } from "@/lib/preferences/accountRequest";
import { settleStudyTime } from "@/lib/training/studyTime/delivery";
import { ArrowRight, Check, BookOpen } from "lucide-react";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import styles from "./TrainingCompletion.module.css";
export type TrainingCompletionActions = { onRestart?: () => void; onEdit?: () => void; pending?: boolean; startFailed?: boolean };
export function TrainingCompletion({ interfaceLanguage, completedCount, onExit, onRestart, onEdit, pending=false, startFailed=false, activeMilliseconds, ownerId, sessionId, empty=false, emptyDetail }: TrainingCompletionActions & { empty?:boolean; emptyDetail?:string; interfaceLanguage: OnboardingLanguage; completedCount: number; onExit: () => void; activeMilliseconds?: number | null; ownerId?: string; sessionId?: string | null }) {
 const t = {en:{title:"Session complete",cards:"cards",next:"Another 10 cards",edit:"Modify training",home:"Back to home",min:"min",sec:"sec"},nl:{title:"Sessie voltooid",cards:"kaarten",next:"Nog 10 kaarten",edit:"Training aanpassen",home:"Terug naar start",min:"min",sec:"sec"},ru:{title:"Сессия завершена",cards:"карточек",next:"Ещё 10 карточек",edit:"Изменить тренировку",home:"На главный экран",min:"мин",sec:"сек"}}[interfaceLanguage];
 const [savedTime,setSavedTime] = useState<number | null>(null);
 useEffect(() => {
   let cancelled=false;
   setSavedTime(null);
   if (empty || !ownerId || !sessionId) return;
   // Run after card cleanup flushed its final attention interval. No recurring poll.
   const controller = new AbortController();
   const timer = window.setTimeout(async () => {
     if (!await settleStudyTime(ownerId,sessionId) || cancelled) return;
     try {
       const response=await authenticatedAccountRequest(`/api/training/study-time?session=${encodeURIComponent(sessionId)}`,ownerId,{signal:controller.signal});
       if (!response.ok) return;
       const result=await response.json();
       if (!cancelled && result.sessionId === sessionId && Number.isSafeInteger(result.activeMilliseconds) && result.activeMilliseconds >= 0) setSavedTime(result.activeMilliseconds);
     } catch { /* Unavailable time is omitted, never displayed as zero. */ }
   },0);
   const timeout=window.setTimeout(()=>controller.abort(),8000);
   return () => {cancelled=true;window.clearTimeout(timer);window.clearTimeout(timeout);controller.abort();};
 },[ownerId,sessionId,empty]);
 const emptyCopy={en:{title:"No cards available",detail:"No cards available for this training right now"},nl:{title:"Geen kaarten beschikbaar",detail:"Er zijn nu geen kaarten beschikbaar voor deze training"},ru:{title:"Нет доступных карточек",detail:"Сейчас нет доступных карточек для этой тренировки"}}[interfaceLanguage];
 const effectiveTime=activeMilliseconds ?? savedTime;
 const seconds=effectiveTime == null ? null : Math.floor(effectiveTime/1000);
 return <section className={styles.panel} data-testid="training-completion"><div className={styles.content}>
 <span className={styles.check} aria-hidden="true">{empty?<BookOpen size={36}/>:<Check size={36} />}</span>
 <h2 className={styles.title} role="status">{empty?emptyCopy.title:t.title}</h2>
 <p className={styles.summary}>{empty?(emptyDetail??emptyCopy.detail):<>{completedCount} {t.cards}{seconds !== null ? ` · ${Math.floor(seconds/60)} ${t.min} ${seconds%60} ${t.sec}` : ""}</>}</p>
 {onRestart && !empty ? <button className={styles.primary} disabled={pending} onClick={onRestart}>{t.next}<ArrowRight size={20} aria-hidden="true" /></button> : null}
 {startFailed && !pending && !empty ? <p role="alert">{{en:"Could not start the next batch. Try again or modify training.",nl:"De volgende reeks kon niet starten. Probeer opnieuw of pas de training aan.",ru:"Не удалось продолжить. Попробуйте ещё раз или измените тренировку."}[interfaceLanguage]}</p> : null}
 {onEdit ? <button className={empty?styles.primary:styles.secondary} disabled={pending} onClick={onEdit}>{t.edit}{empty?<ArrowRight size={20} aria-hidden="true"/>:null}</button> : null}
 <button className={styles.home} disabled={pending} onClick={onExit}>{t.home}</button>
 </div></section>;
}
