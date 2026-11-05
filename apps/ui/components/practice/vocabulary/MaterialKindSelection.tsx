"use client";
import React from "react";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import type { VocabularyMaterialKind } from "@/lib/vocabulary/selection";
import { SegmentedControl } from "../ui/SegmentedControl";
import { BuilderChoice } from "../builder/BuilderChoice";
import { SettingsHelp } from "../settings/SettingsHelp";
const copy={
 ru:{title:"Тип статьи",all:"Любые",word:"Слова",other:"Другое",help:["Выберите слова или другие самостоятельные записи. Части речи — например, существительные и глаголы — уточняют выбор слов.","В «Другое» входят выражения, фразы и целые предложения. Это отдельные записи в словаре, а не примеры внутри слова.","В будущем планируем расширить этот выбор, чтобы фразы, идиомы и предложения можно было выбирать отдельно."]},
 en:{title:"Entry type",all:"All",word:"Words",other:"Other",help:["Choose words or other standalone entries. Parts of speech, such as nouns and verbs, narrow the word selection.","Other includes expressions, phrases and whole sentences. These are separate dictionary entries, not examples within a word.","We plan to expand this choice so phrases, idioms and sentences can be selected separately."]},
 nl:{title:"Soort artikel",all:"Alles",word:"Woorden",other:"Overig",help:["Kies woorden of andere zelfstandige artikelen. Woordsoorten, zoals zelfstandige naamwoorden en werkwoorden, verfijnen de woordkeuze.","Overig bevat uitdrukkingen, woordgroepen en hele zinnen. Dit zijn aparte woordenboekartikelen, geen voorbeelden binnen een woord.","We willen deze keuze later uitbreiden, zodat je woordgroepen, idiomen en zinnen apart kunt kiezen."]},
};
export function materialKindSummary(value:readonly VocabularyMaterialKind[],language:OnboardingLanguage){const t=copy[language];return value.length?value.map(kind=>t[kind]).join(" · "):t.all;}
export function MaterialKindSelection({value,onChange,language}:{value:readonly VocabularyMaterialKind[];onChange:(value:VocabularyMaterialKind[])=>void;language:OnboardingLanguage}){
 const t=copy[language],kinds:VocabularyMaterialKind[]=["word","other"];
 return <><SegmentedControl standard label={t.title}>
  <BuilderChoice active={!value.length} onClick={()=>onChange([])}>{t.all}</BuilderChoice>
  {kinds.map(kind=><BuilderChoice key={kind} active={value.includes(kind)} onClick={()=>onChange([kind])}>{t[kind]}</BuilderChoice>)}
 </SegmentedControl></>;
}

export function MaterialKindHelp({language}:{language:OnboardingLanguage}){const t=copy[language];return <SettingsHelp label={t.title} text={t.help}/>;}
