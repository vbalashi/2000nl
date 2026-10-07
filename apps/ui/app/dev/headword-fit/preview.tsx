"use client";
import React from "react";
import {SenseCardHeadwordLockup} from "@/components/training/SenseCardChrome";
import {TrainingInteractionPreferencesProvider,defaultTrainingInteractions,useTrainingInteractions} from "@/components/practice/ui/TrainingInteractionPreferences";
import theme from "@/components/practice/ui/practiceTheme.module.css";
const initial={...defaultTrainingInteractions,syllableDoubleTap:true};
const repository={load:async()=>initial,save:async()=>{}};
const words=[['arbeidsongeschiktheidsverzekering','ar·beids·on·ge·schikt·heids·ver·ze·ke·ring','de'],['verantwoordelijkheid','ver·ant·woor·de·lijk·heid','de'],['ziekenhuis','zie·ken·huis','het']];
function Examples(){const {preferences,save}=useTrainingInteractions();return <main className={theme.theme} style={{padding:16}}><button onClick={()=>void save({...preferences,showSyllables:!preferences.showSyllables})}>Toggle syllables</button>{words.map(([plain,text,article])=><section key={plain}><p>{plain}</p>{(['training-face','training-answer'] as const).map(variant=><div key={variant} data-fit-case={`${plain}:${variant}`} style={{boxSizing:'border-box',width:'min(100%, 360px)',padding:18,margin:'8px 0',background:'var(--practice-surface)'}}><small>{variant}</small><SenseCardHeadwordLockup headword={text} plainHeadword={plain} article={article} tone="light" variant={variant}/></div>)}</section>)}</main>;}
export function HeadwordFitPreview(){return <TrainingInteractionPreferencesProvider userId="fixture" initial={initial} repository={repository}><Examples/></TrainingInteractionPreferencesProvider>;}
