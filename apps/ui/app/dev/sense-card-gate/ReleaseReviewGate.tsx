"use client";
import React, {useState} from "react";
import {TrainingSessionChrome} from "@/components/training/v2/TrainingSessionChrome";
import {TrainingInteractionPreferencesProvider, defaultTrainingInteractions} from "@/components/practice/ui/TrainingInteractionPreferences";
import {ArticleContentNode, ArticleReadingFrame} from "@/components/practice/article/ArticleContent";
import {ArticleSenseRelations} from "@/components/practice/article/ArticleWordDetails";
import {lexicalRelationDetail} from "@/components/practice/article/wordDetailsPresentation";
import {AdditionalCardTranslationProvider, CardTranslationLanguagesProvider} from "@/components/practice/article/AdditionalCardTranslation";
import {reviewIdiom, reviewPrimaryEntry} from "@/lib/platform/fixtures/releaseReviewFixture";
import theme from "@/components/practice/ui/practiceTheme.module.css";

const repository = {load: async () => defaultTrainingInteractions, save: async () => {}};
const panel: React.CSSProperties = {background:"var(--practice-surface)",borderRadius:"var(--practice-radius-panel)",padding:24};

/** Development-only composition of production components for visual approval. */
export function ReleaseReviewGate() {
  const [position, setPosition] = useState(6);
  const [dark, setDark] = useState(false);
  const [unlimited, setUnlimited] = useState(false);
  return <main data-colour-mode={dark ? "dark" : "light"} className={theme.theme} style={{background:"var(--practice-canvas)",color:"var(--practice-text)",minHeight:"100dvh",padding:24,fontFamily:"var(--practice-font-ui)"}}>
    <div style={{maxWidth:680,margin:"auto",display:"grid",gap:24}}>
      <nav style={{display:"flex",gap:20,flexWrap:"wrap",fontSize:14}}>
        <button onClick={() => setDark(value => !value)}>Светлая / тёмная</button>
        <button onClick={() => setUnlimited(value => !value)}>{unlimited ? "Ограниченная сессия" : "Безлимитная сессия"}</button>
        <button onClick={() => setPosition(value => value === 10 ? 0 : value + 1)}>Следующая карточка</button>
      </nav>
      <section data-review="progress" style={panel}>
        <h2 style={{fontSize:14,fontWeight:600,margin:"0 0 20px"}}>Прогресс сессии</h2>
        <TrainingInteractionPreferencesProvider userId="review" initial={defaultTrainingInteractions} repository={repository}>
          <TrainingSessionChrome interfaceLanguage="ru" scenario="understanding" mode="word-to-definition" cardFilter="both" sessionName="VanDale 2k" approvedPresentation showProgress unlimited={unlimited} presentation={{kind:"planned",position:unlimited?42:position,total:unlimited?2661:10,fraction:unlimited?42/2661:position/10}} onClose={() => {}} />
        </TrainingInteractionPreferencesProvider>
      </section>
      <CardTranslationLanguagesProvider primary="ru" secondary="en">
        <AdditionalCardTranslationProvider entryId={reviewPrimaryEntry.entryId} contentLanguage="nl" visible>
          <section data-review="idiom" style={panel}>
            <h2 style={{fontSize:14,fontWeight:600,margin:"0 0 20px"}}>Идиома · два языка</h2>
            <ArticleReadingFrame><ArticleContentNode node={reviewIdiom} interfaceLanguage="ru" contentLanguage="nl" translationLanguage="ru" translationVisible lead /></ArticleReadingFrame>
          </section>
          <section data-review="relations" style={panel}>
            <h2 style={{fontSize:14,fontWeight:600,margin:"0 0 20px"}}>Синонимы и антонимы · два языка</h2>
            <ArticleSenseRelations relation={lexicalRelationDetail(reviewPrimaryEntry.wordDetails,"ru")} interfaceLanguage="ru" contentLanguage="nl" translationLanguage="ru" translationVisible />
          </section>
        </AdditionalCardTranslationProvider>
      </CardTranslationLanguagesProvider>
    </div>
  </main>;
}
