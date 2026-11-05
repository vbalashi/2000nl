"use client";
import React from "react";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import type { VocabularyMaterialKind } from "@/lib/vocabulary/selection";
import { SegmentedControl } from "../ui/SegmentedControl";
import { BuilderChoice } from "../builder/BuilderChoice";
import { SettingsHelp } from "../settings/SettingsHelp";
const copy={
 ru:{title:"Тип статьи",all:"Всё",word:"Слова",other:"Другое",help:["Выберите слова или другие самостоятельные статьи. Части речи — например, существительные и глаголы — выбираются отдельно и относятся к словам.","В «Другое» входят статьи с пометой other: в Dilum Nederlands так отмечены, в частности, выражения. В личном словаре также могут быть фразы и целые предложения. Это самостоятельные записи, а не примеры внутри слова.","Фразы, идиомы и предложения не всегда отмечены по-разному, поэтому отдельного выбора между ними здесь пока нет."]},
 en:{title:"Entry type",all:"All",word:"Words",other:"Other",help:["Choose words or other standalone entries. Parts of speech, such as nouns and verbs, are a separate choice and apply to words.","Other includes entries marked other: in Dilum Nederlands, this includes expressions. A personal dictionary can also contain phrases and whole sentences. These are separate entries, not examples within a word.","Phrases, idioms and sentences are not always labelled differently, so they cannot be selected separately here yet."]},
 nl:{title:"Soort artikel",all:"Alles",word:"Woorden",other:"Overig",help:["Kies woorden of andere zelfstandige artikelen. Woordsoorten, zoals zelfstandige naamwoorden en werkwoorden, kies je apart en gelden voor woorden.","Overig bevat artikelen met het label other: in Dilum Nederlands zijn dit onder meer uitdrukkingen. Een persoonlijk woordenboek kan ook woordgroepen en hele zinnen bevatten. Dit zijn aparte artikelen, geen voorbeelden binnen een woord.","Woordgroepen, idiomen en zinnen zijn niet altijd verschillend gemarkeerd. Daarom kun je ze hier nog niet apart kiezen."]},
};
export function materialKindSummary(value:readonly VocabularyMaterialKind[],language:OnboardingLanguage){const t=copy[language];return value.length?value.map(kind=>t[kind]).join(" · "):t.all;}
export function MaterialKindSelection({value,onChange,language}:{value:readonly VocabularyMaterialKind[];onChange:(value:VocabularyMaterialKind[])=>void;language:OnboardingLanguage}){
 const t=copy[language],kinds:VocabularyMaterialKind[]=["word","other"];
 return <><SegmentedControl standard label={t.title}>
  <BuilderChoice active={!value.length} onClick={()=>onChange([])}>{t.all}</BuilderChoice>
  {kinds.map(kind=><BuilderChoice key={kind} active={value.includes(kind)} onClick={()=>{const next=value.includes(kind)?value.filter(item=>item!==kind):[...value,kind];onChange(next.length===kinds.length?[]:next);}}>{t[kind]}</BuilderChoice>)}
 </SegmentedControl></>;
}

export function MaterialKindHelp({language}:{language:OnboardingLanguage}){const t=copy[language];return <SettingsHelp label={t.title} text={t.help}/>;}
