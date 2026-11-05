"use client";
import React, {useState} from "react";
import {TrainingSessionChrome} from "@/components/training/v2/TrainingSessionChrome";
import {TrainingInteractionPreferencesProvider, defaultTrainingInteractions} from "@/components/practice/ui/TrainingInteractionPreferences";
import {TrainingInteractionSettings} from "@/components/practice/ui/TrainingInteractionSettings";
import theme from "@/components/practice/ui/practiceTheme.module.css";

const repository = {load: async () => defaultTrainingInteractions, save: async () => {}};

/** Compare exact card marks at the same phone width, using the real session header. */
export function ProgressDensityGate() {
  const [completed, setCompleted] = useState(6);
  const [dark, setDark] = useState(false);
  return <main className={theme.theme} data-practice-palette="indigo" data-colour-mode={dark ? "dark" : "light"} style={{minHeight:"100dvh",background:"var(--practice-canvas)",padding:24}}>
    <div style={{maxWidth:393,margin:"auto"}}>
      <nav style={{display:"flex",gap:16,flexWrap:"wrap",fontSize:13,marginBottom:24}}>
        <button onClick={() => setCompleted(value => value === 20 ? 0 : value + 1)}>Следующая карточка</button>
        <button onClick={() => setDark(value => !value)}>Светлая / тёмная</button>
      </nav>
      <section data-settings-preview style={{marginBottom:32}}>
        <TrainingInteractionPreferencesProvider userId="density-settings" initial={defaultTrainingInteractions} repository={repository}><TrainingInteractionSettings language="en" /></TrainingInteractionPreferencesProvider>
      </section>
      <div data-density-examples style={{display:"grid",gap:24}}>
        {[20,30,40,50].map(total => <section key={total} data-density={total}>
          <h2 style={{fontSize:14,fontWeight:500,margin:"0 0 8px"}}>{total} карточек · пройдено {completed}</h2>
          <div style={{padding:"14px 16px 16px",background:"var(--practice-canvas)"}}>
            <TrainingInteractionPreferencesProvider userId={`density-${total}`} initial={defaultTrainingInteractions} repository={repository}>
              <TrainingSessionChrome interfaceLanguage="ru" scenario="understanding" mode="word-to-definition" cardFilter="both" approvedPresentation showProgress sessionName="VanDale 2k words" presentation={{kind:"planned",position:completed,total,fraction:completed/total}} onClose={() => {}} onHistory={() => {}} />
            </TrainingInteractionPreferencesProvider>
            <div aria-hidden="true" style={{height:44,marginTop:10,borderRadius:"var(--practice-radius-panel)",background:"var(--practice-surface)"}} />
          </div>
        </section>)}
      </div>
    </div>
  </main>;
}
