"use client";
import React from "react";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import type { VocabularyMaterialKind } from "@/lib/vocabulary/selection";
import { SegmentedControl } from "../ui/SegmentedControl";
import { BuilderChoice } from "../builder/BuilderChoice";
import { SettingsHelp } from "../settings/SettingsHelp";
const copy={
 ru:{title:"Материал",all:"Всё",word:"Слова",expression:"Выражения",sentence:"Предложения",help:["Слова — отдельные словарные статьи. В «Выражения» входят также идиомы и устойчивые обороты. Предложения — примеры из словаря.","Можно выбрать несколько видов материала. Части речи выбираются отдельно."]},
 en:{title:"Material",all:"All",word:"Words",expression:"Expressions",sentence:"Sentences",help:["Words are separate dictionary entries. Expressions also include idioms and fixed phrases. Sentences are examples from the dictionary.","You can select several kinds of material. Parts of speech are a separate choice."]},
 nl:{title:"Materiaal",all:"Alles",word:"Woorden",expression:"Uitdrukkingen",sentence:"Zinnen",help:["Woorden zijn aparte woordenboekartikelen. Onder uitdrukkingen vallen ook idiomen en vaste woordgroepen. Zinnen zijn voorbeelden uit het woordenboek.","Je kunt meerdere soorten materiaal kiezen. Woordsoorten kies je apart."]},
};
export function materialKindSummary(value:readonly VocabularyMaterialKind[],language:OnboardingLanguage){const t=copy[language];return value.length?value.map(kind=>t[kind]).join(" · "):t.all;}
export function MaterialKindSelection({value,onChange,language}:{value:readonly VocabularyMaterialKind[];onChange:(value:VocabularyMaterialKind[])=>void;language:OnboardingLanguage}){
 const t=copy[language],kinds:VocabularyMaterialKind[]=["word","expression","sentence"];
 return <><SegmentedControl standard label={t.title}>
  <BuilderChoice active={!value.length} onClick={()=>onChange([])}>{t.all}</BuilderChoice>
  {kinds.map(kind=><BuilderChoice key={kind} active={value.includes(kind)} onClick={()=>{const next=value.includes(kind)?value.filter(item=>item!==kind):[...value,kind];onChange(next.length===kinds.length?[]:next);}}>{t[kind]}</BuilderChoice>)}
 </SegmentedControl></>;
}

export function MaterialKindHelp({language}:{language:OnboardingLanguage}){const t=copy[language];return <SettingsHelp label={t.title} text={t.help}/>;}
