"use client";
import React, {useEffect,useState} from "react";
import {TrainingOverview, type TrainingOverviewItem} from "@/components/practice/TrainingOverview";
import {ProductionArticleReading} from "@/components/practice/article/ProductionArticleReading";
import type {OnboardingLanguage} from "@/lib/onboardingI18n";
import {getUiMessages} from "@/lib/uiMessages";
import type {TrainingSetupDraft} from "@/lib/training/setups/types";
import type {SavedTraining, TrainingSetupsSnapshot} from "@/lib/training/setups/model";
import {isTrainingSetupDraftSupported, isTrainingSetupMaterialAvailable, type TrainingSetupOption} from "@/lib/training/setups/availability";
import {trainingMetadata} from "@/lib/training/setups/metadata";
import {readLastSelectedTraining,writeLastSelectedTraining,resolveHighlightedTraining} from "@/lib/training/setups/lastSelected";
import s from "./accountTrainingOverview.module.css";

export type OwnedTrainingOverviewSession={id:string; completed:number; total:number|null;draft?:TrainingSetupDraft;reviewTiming?:"early"};
type Props={
 ownerId?:string; interfaceLanguage:OnboardingLanguage; languageCode:string;
 emptyTraining?:{trainingId:string;message:string;canReviewAhead?:boolean}; onEarlyReview?:(training:SavedTraining)=>void;
 languageOptions:TrainingSetupOption[]; lists:TrainingSetupOption[]; dictionaries:TrainingSetupOption[]; scenarios:TrainingSetupOption[];
 snapshot:TrainingSetupsSnapshot; accountStatus:"idle"|"loading"|"ready"|"error";
 initialDraft:TrainingSetupDraft; ownedSession?:OwnedTrainingOverviewSession; activeSessionLabel?:string;
 pending:boolean; ready:boolean; continueDisabled:boolean;
 materialUnavailable:string; partialMaterialNotice:string; setupUnavailable:string; translationUnavailable:string; translationLanguage:string|null|undefined;
 onSelect:(training:SavedTraining,action:"edit"|"launch")=>void;
 onCreate:()=>void; onDefaultLaunch:()=>void; onContinue:()=>void; onRetry:()=>void;
 children?:React.ReactNode;
};

/** Displays accepted account configuration. Availability still belongs to the current
 * language's catalog and is checked again by the existing start controller. */
export function AccountTrainingOverview(p:Props){
 const copy=getUiMessages(p.interfaceLanguage).trainingOverview;
 const accountCopy=getUiMessages(p.interfaceLanguage).accountTrainingSetups;
 const trainings=p.snapshot.document.trainings;
 const language=(code:string)=>new Intl.DisplayNames([p.interfaceLanguage],{type:"language"}).of(code)??p.languageOptions.find(item=>item.value===code)?.label??code.toUpperCase();
 const [selected,setSelected]=useState<{ownerId:string|undefined;id:string|null}>(()=>({ownerId:p.ownerId,id:readLastSelectedTraining(p.ownerId)}));
 useEffect(()=>{setSelected({ownerId:p.ownerId,id:readLastSelectedTraining(p.ownerId)});},[p.ownerId]);
 const selectedId=selected.ownerId===p.ownerId?selected.id:null;
 const material=(draft:TrainingSetupDraft)=>draft.materialMode==="all-dictionaries"?copy.allDictionaries:draft.materialMode==="selected-dictionaries"?(draft.dictionaryIds??[]).map(id=>p.dictionaries.find(item=>item.value===id)?.label).filter(Boolean).join(", "):p.lists.find(item=>item.value===draft.listValue)?.label;
 const item=(training:SavedTraining):TrainingOverviewItem=>{
  const local=training.languageCode===p.languageCode;
  const languageAvailable=p.languageOptions.some(option=>option.value===training.languageCode);
  const materialAvailable=!local||isTrainingSetupMaterialAvailable(training.draft,p.lists,p.dictionaries);
  const partial=local&&materialAvailable&&training.draft.materialMode==="selected-dictionaries"&&training.draft.dictionaryIds?.some(id=>!p.dictionaries.some(source=>source.value===id));
  const supported=!local||isTrainingSetupDraftSupported(training.draft,p.scenarios);
  const sentencePaused=training.draft.family==="sentence"||training.draft.scenarioId==="sentences";
  const translationAvailable=training.draft.family!=="word-in-context"||p.translationLanguage!==null;
  const size=training.draft.sessionSize??10;
  return {id:training.id,name:training.name,language:language(training.languageCode),...trainingMetadata(training.draft,p.interfaceLanguage,language(training.languageCode)),
   completedToday:null,meaningCount:null,notice:partial?p.partialMaterialNotice:undefined,sessionSize:size==="all-due-today"?copy.allDue:size,
   canLaunch:!sentencePaused&&p.ready&&!p.pending&&languageAvailable&&materialAvailable&&supported&&translationAvailable,
   unavailableReason:sentencePaused?copy.sentencePaused:!languageAvailable?p.materialUnavailable:!materialAvailable?p.materialUnavailable:!supported?p.setupUnavailable:!translationAvailable?p.translationUnavailable:undefined};
 };
 const defaultTraining:SavedTraining={id:"current-setup",name:material(p.initialDraft)||copy.mainTraining,languageCode:p.languageCode,draft:p.initialDraft};
 const sessionTraining:SavedTraining={...defaultTraining,id:"owned-session",name:p.activeSessionLabel||material(p.initialDraft)||copy.currentTraining,draft:p.ownedSession?.draft??p.initialDraft};
 const items=trainings.map(item);
 // Session identity is independent of a preset: matching by name or equal drafts would
 // wrongly attribute a resumed run after edits or deletion on another device.
 if(p.ownedSession)items.unshift({...item(sessionTraining),saved:false,sessionSize:p.ownedSession.reviewTiming==="early"&&sessionTraining.draft.sessionSize==="all-due-today"?copy.allCards:item(sessionTraining).sessionSize,canLaunch:!p.continueDisabled});
 else if(!trainings.length)items.push({...item(defaultTraining),saved:false});
 const select=(id:string,action:"edit"|"launch")=>{
  const saved=trainings.find(training=>training.id===id);
  if(saved){if(action==="launch"){setSelected({ownerId:p.ownerId,id});writeLastSelectedTraining(p.ownerId,id);}p.onSelect(saved,action);}
  else if(action==="edit")p.onCreate();else p.onDefaultLaunch();
 };
 return <div className={s.viewport}><ProductionArticleReading>
  <TrainingOverview interfaceLanguage={p.interfaceLanguage}
   state={p.accountStatus==="error"?{status:"error",message:accountCopy.loadFailed}:p.accountStatus!=="ready"?{status:"loading"}:{status:"ready",trainings:items,mainId:resolveHighlightedTraining(trainings,selectedId,p.snapshot.document.mainTrainingId)??defaultTraining.id,emptyTraining:p.emptyTraining,
    resume:p.ownedSession?{sessionId:p.ownedSession.id,trainingId:sessionTraining.id,completed:p.ownedSession.completed,total:p.ownedSession.total}:undefined}}
   onEarlyReview={p.onEarlyReview?id=>{const saved=trainings.find(training=>training.id===id);if(saved)p.onEarlyReview?.(saved);}:undefined} onLaunch={id=>select(id,"launch")} onEdit={id=>select(id,"edit")} onCreate={p.onCreate} onRetry={p.onRetry} onResume={p.onContinue}/>
  <div className={s.notices}>{p.children}</div>
 </ProductionArticleReading></div>;
}
