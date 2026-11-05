"use client";
import { localizedField, localizedSection } from "@/lib/i18n/catalog";

import React from "react";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import type { VocabularyMaterialKind } from "@/lib/vocabulary/selection";
import { SegmentedControl } from "../ui/SegmentedControl";
import { BuilderChoice } from "../builder/BuilderChoice";
import { SettingsHelp } from "../settings/SettingsHelp";
const copy=localizedSection("materialKinds");
export function materialKindSummary(value:readonly VocabularyMaterialKind[],language:OnboardingLanguage){const t=copy[language];return value.length?value.map(kind=>t[kind]).join(" · "):t.all;}
export function MaterialKindSelection({value,onChange,language}:{value:readonly VocabularyMaterialKind[];onChange:(value:VocabularyMaterialKind[])=>void;language:OnboardingLanguage}){
 const t=copy[language],kinds:VocabularyMaterialKind[]=["word","other"];
 return <><SegmentedControl standard label={t.title}>
  <BuilderChoice active={!value.length} onClick={()=>onChange([])}>{t.all}</BuilderChoice>
  {kinds.map(kind=><BuilderChoice key={kind} active={value.includes(kind)} onClick={()=>onChange([kind])}>{t[kind]}</BuilderChoice>)}
 </SegmentedControl></>;
}

export function MaterialKindHelp({language}:{language:OnboardingLanguage}){const t=copy[language];return <SettingsHelp label={t.title} text={t.help}/>;}
