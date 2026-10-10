"use client";
import React from "react";
import {relatedWordGateGroup as group} from "@/lib/platform/fixtures/relatedWordGateFixture";
import {LibrarySenseCardGroup} from "@/components/training/library-v2/LibrarySenseCardGroup";
import {buildLibrarySenseCardGroupModel} from "@/components/training/library-v2/librarySenseCardModel";
import {TrainingSenseCardStage} from "@/components/training/v2/TrainingSenseCardStage";
import {buildTrainingSenseCardModel} from "@/components/training/v2/trainingSenseCardModel";
import theme from "@/components/practice/ui/practiceTheme.module.css";
export function RelatedWordGate(){
 const [training,setTraining]=React.useState(false);
 const [side,setSide]=React.useState<"face"|"answer">("face");
 return <main className={`${theme.theme} flex h-dvh flex-col gap-3 bg-[var(--practice-canvas)] p-4 text-[var(--practice-text)]`}>
  <nav className="flex gap-4"><button onClick={()=>setTraining(false)}>Library</button><button onClick={()=>setTraining(true)}>Training</button></nav>
  <div className="relative mx-auto min-h-0 w-full max-w-[680px] flex-1">
   {training?<TrainingSenseCardStage model={buildTrainingSenseCardModel({group,entry:group.entries[0],interfaceLanguage:"en"})} interfaceLanguage="en" contentLanguage="nl" translationLanguage="ru" mode="word-to-definition" side={side} onSideChange={setSide} onAction={()=>{}}/>:<LibrarySenseCardGroup model={buildLibrarySenseCardGroupModel(group,"en")} interfaceLanguage="en" contentLanguage="nl" translationLanguage="ru" translationEnabled onAction={()=>{}}/>}
  </div>
 </main>;
}
