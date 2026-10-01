"use client";
import React,{useContext} from "react";
import {PracticePanel} from "@/components/practice/ui/PracticePanel";
import type {PreviewAction} from "./sessionPreviewModel";
import {InterfaceLanguageContext} from "./VariantControls";
import {getUiMessages} from "@/lib/uiMessages";
import {getTrainingRatingLabels} from "@/components/training/trainingHotkeys";
import {sessionExerciseLabel} from "./sessionPreviewCopy";
import {RecentActivityList} from "@/components/practice/RecentActivityList";

export function RecentActivity({items,onClose}:{items:PreviewAction[];onClose:()=>void}){
 const locale=useContext(InterfaceLanguageContext);const copy=getUiMessages(locale).trainingSession;
 const results={...getTrainingRatingLabels(locale),Known:copy.knownResult,Excluded:copy.excludedResult};
 return <PracticePanel title={copy.history} language={locale} closeLabel={copy.closeHistory} onClose={onClose}>
  <RecentActivityList items={items.map(item=>({id:item.id,word:item.word,at:item.at,exercise:sessionExerciseLabel(locale,item.exercise),result:results[item.result],tone:item.result}))}
   locale={locale} scopeLabel={copy.historyScope} emptyLabel={copy.emptyHistory} listLabel={copy.history}/>
 </PracticePanel>;
}
