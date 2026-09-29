"use client";
import React from "react";
import {TrainingOverview} from "@/components/practice/TrainingOverview";
import {matchMeanings, sources} from "./model";
import type {TrainingPreset} from "./trainingHomeFixtures";
import s from "./trainingHome.module.css";
export {sampleTrainings, type TrainingPreset} from "./trainingHomeFixtures";
type Props={resume?:{sessionId:string;trainingId:string;completed:number;total:number};onResume?:()=>void;presets:TrainingPreset[];mainIndex:number;onEdit:(index:number)=>void;onLaunch:(index:number)=>void;onNew:()=>void;translation:string};
/** The preview adapter is the only owner of synthetic activity and resume states. */
export function TrainingHome({presets,mainIndex,onEdit,onLaunch,onNew,translation,resume,onResume}:Props){
 const main=presets[mainIndex];
 const trainings=presets.map(item=>{
  const count=matchMeanings(item.draft).length;
  const blocked=item.draft.types.includes("Translation")&&(translation==="Off"||translation===item.draft.language);
  return {id:item.id,name:item.name,language:item.draft.language,
   description:`${item.draft.types.join(" + ")} · ${item.draft.types.includes("Translation")?`${translation} → ${item.draft.language}`:item.draft.directions.join(" + ")}`,
   summary:`${item.draft.language} · ${sources.find(source=>source.id===item.draft.source)?.name||"Source unavailable"} · ${item.draft.size} exercises`,
   completedToday:item.today??0,meaningCount:count,sessionSize:item.draft.size,canLaunch:count>0&&!blocked,
   unavailableReason:blocked?"Choose a different translation language in Settings.":count===0?"No matching meanings. Adjust this training.":undefined};
 });
 return <><TrainingOverview state={{status:"ready",trainings,mainId:main?.id??null,resume}}
 onEdit={id=>onEdit(presets.findIndex(item=>item.id===id))} onLaunch={id=>onLaunch(presets.findIndex(item=>item.id===id))} onResume={()=>onResume?.()} onCreate={onNew} onRetry={()=>{}}/>
 <p className={s.demo}>Illustrative activity · saved for this preview only.</p>
 </>;
}
