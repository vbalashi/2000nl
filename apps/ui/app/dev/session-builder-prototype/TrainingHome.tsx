"use client";
import React from "react";
import {TrainingOverview} from "@/components/practice/TrainingOverview";
import type {OnboardingLanguage} from "@/lib/onboardingI18n";
import {formatExerciseCount,getUiMessages} from "@/lib/uiMessages";
import {matchMeanings, sources} from "./model";
import type {TrainingPreset} from "./trainingHomeFixtures";
import s from "./trainingHome.module.css";
export {sampleTrainings, type TrainingPreset} from "./trainingHomeFixtures";
type Props={resume?:{sessionId:string;trainingId:string;completed:number;total:number};onResume?:()=>void;presets:TrainingPreset[];mainIndex:number;onEdit:(index:number)=>void;onLaunch:(index:number)=>void;onNew:()=>void;translation:string;interfaceLanguage?:OnboardingLanguage};
/** The preview adapter is the only owner of synthetic activity and resume states. */
export function TrainingHome({presets,mainIndex,onEdit,onLaunch,onNew,translation,resume,onResume,interfaceLanguage="en"}:Props){
 const main=presets[mainIndex];
 const copy=getUiMessages(interfaceLanguage).trainingOverview;
 const trainings=presets.map(item=>{
  const count=matchMeanings(item.draft).length;
  const blocked=item.draft.types.includes("Translation")&&(translation==="Off"||translation===item.draft.language);
  const learningLanguage=copy.learningLanguage[item.draft.language];
  return {id:item.id,name:item.name,language:learningLanguage,
   description:`${item.draft.types.map(type=>copy.exerciseType[type]).join(" + ")} · ${item.draft.types.includes("Translation")?`${translation} → ${learningLanguage}`:item.draft.directions.map(direction=>copy.direction[direction]).join(" + ")}`,
   summary:`${learningLanguage} · ${sources.find(source=>source.id===item.draft.source)?.name||copy.sourceUnavailable} · ${formatExerciseCount(interfaceLanguage,item.draft.size)}`,
   completedToday:item.today??0,meaningCount:count,sessionSize:item.draft.size,canLaunch:count>0&&!blocked,
   unavailableReason:blocked?copy.translationLanguageBlocked:count===0?copy.noMatchingMeanings:undefined};
 });
 return <><TrainingOverview interfaceLanguage={interfaceLanguage} state={{status:"ready",trainings,mainId:main?.id??null,resume}}
 onEdit={id=>onEdit(presets.findIndex(item=>item.id===id))} onLaunch={id=>onLaunch(presets.findIndex(item=>item.id===id))} onResume={()=>onResume?.()} onCreate={onNew} onRetry={()=>{}}/>
 <p className={s.demo} lang={interfaceLanguage}>{copy.illustrativeActivity}</p>
 </>;
}
