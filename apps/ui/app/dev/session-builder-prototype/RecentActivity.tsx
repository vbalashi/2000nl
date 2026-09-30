"use client";
import React,{useContext} from "react";
import {PracticePanel} from "@/components/practice/ui/PracticePanel";
import type {PreviewAction} from "./sessionPreviewModel";
import {InterfaceLanguageContext} from "./VariantControls";
import {getUiMessages} from "@/lib/uiMessages";
import {getTrainingRatingLabels} from "@/components/training/trainingHotkeys";
import {sessionExerciseLabel} from "./sessionPreviewCopy";
import s from "./trainingSession.module.css";

export function RecentActivity({items,onClose}:{items:PreviewAction[];onClose:()=>void}){
 const locale=useContext(InterfaceLanguageContext);const copy=getUiMessages(locale).trainingSession;
 const results={...getTrainingRatingLabels(locale),Known:copy.knownResult,Excluded:copy.excludedResult};
 const groups=new Map<string,PreviewAction[]>();
 for(const item of items){const day=new Date(item.at).toLocaleDateString(locale,{day:"numeric",month:"long",year:"numeric"});groups.set(day,[...(groups.get(day)||[]),item]);}
 return <PracticePanel title={copy.history} language={locale} closeLabel={copy.closeHistory} onClose={onClose}><div className={s.history}>
  <p className={s.caption}>{copy.historyScope}</p>
  {!items.length&&<p>{copy.emptyHistory}</p>}
  {[...groups].map(([day,actions])=><section key={day}><h3>{day}</h3><ol>{actions.map(item=><li key={item.id}><div><strong>{item.word}</strong><span>{sessionExerciseLabel(locale,item.exercise)}</span></div><div className={s.result}><strong data-rating={item.result}>{results[item.result]}</strong><time dateTime={item.at}>{new Date(item.at).toLocaleTimeString(locale,{hour:"2-digit",minute:"2-digit"})}</time></div></li>)}</ol></section>)}
 </div></PracticePanel>;
}
