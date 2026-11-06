"use client";
import React, {useId, useState} from "react";
import {ChevronDown, ListOrdered} from "lucide-react";
import {localizedField, localizedSection} from "@/lib/i18n/catalog";
import {formatUiCount, formatUiMessage, getUiMessages} from "@/lib/uiMessages";
import type {OnboardingLanguage} from "@/lib/onboardingI18n";
import type {VocabularySelection} from "@/lib/vocabulary/selection";
import {VOCABULARY_PART_LABELS} from "@/lib/vocabulary/partsOfSpeech";
import {AdaptiveFilterSummary} from "@/components/training/pilot/AdaptiveFilterSummary";
import {VocabularySelectionFields} from "./VocabularySelectionFields";
import {PartOfSpeechSelection, type PartSelection} from "./PartOfSpeechSelection";
import {MaterialKindSelection, MaterialKindHelp, materialKindSummary} from "./MaterialKindSelection";
import {FrequencyProfileIcon} from "./FrequencyProfileIcon";
import s from "./vocabularyFilters.module.css";

export type VocabularyFilterValue = PartSelection & {vocabulary: VocabularySelection};
type Context = {value: VocabularyFilterValue; language: OnboardingLanguage; languageCode: string};

function partSummaries({parts,article}: PartSelection, language: OnboardingLanguage) {
 const b=getUiMessages(language).builder, t=localizedSection("vocabularySelection")[language];
 const abbreviations=localizedSection("vocabularyPartShort")[language];
 const withArticle=(text:string)=>[text,article].filter(Boolean).join(" · ");
 return {
  full:withArticle(parts.length?parts.map(part=>b.parts[VOCABULARY_PART_LABELS[part]]).join(" · "):b.allParts),
  abbreviated:withArticle(parts.length?parts.map(part=>abbreviations[part]).join(" · "):b.allParts),
  short:withArticle(parts.length?formatUiMessage(t.partsSelected,{count:parts.length}):b.allParts),
 };
}

/** The content criteria and their presentation are shared by browsing and training. */
export function VocabularyFilterSummary({value,language}: Pick<Context,"value"|"language">) {
 const {vocabulary}=value;
 const t=localizedSection("vocabularySelection")[language];
 const kind=vocabulary.materialKinds.length?materialKindSummary(vocabulary.materialKinds,language):null;
 const other=vocabulary.materialKinds.includes("other");
 const summaries=partSummaries(value,language);
 const range=vocabulary.mode==="frequency"?(vocabulary.from===1?formatUiMessage(t.top,{count:vocabulary.to.toLocaleString(language)}):`${vocabulary.from.toLocaleString(language)}–${vocabulary.to.toLocaleString(language)}`):null;
 const meaning=vocabulary.meanings==="all"?null:vocabulary.meanings===1?t.firstMeaning:formatUiCount(language,vocabulary.meanings,t,"firstMeanings");
 const text=(part:string)=>other?kind!:[kind,part].filter(Boolean).join(" · ");
 return <AdaptiveFilterSummary parts={text(summaries.abbreviated)} accessibleParts={text(summaries.full)} shortParts={text(summaries.short)} suffix={range??undefined} meaning={meaning?String(vocabulary.meanings):undefined} meaningIcon={meaning?<ListOrdered size={15} aria-hidden="true"/>:undefined} suffixIcon={range?<FrequencyProfileIcon profile={vocabulary.profile}/>:undefined} accessibleSuffix={[range?(vocabulary.profile==="spoken"?t.spoken:t.written):null,range,meaning].filter(Boolean).join(" · ")} lines={2}/>;
}

export function VocabularyFilters({value,onChange,language,languageCode}: Context & {onChange:(next:VocabularyFilterValue)=>void}) {
 const id=useId(), [partsExpanded,setPartsExpanded]=useState(false);
 const b=getUiMessages(language).builder, {vocabulary,parts,article}=value;
 const updateVocabulary=(next:VocabularySelection)=>onChange({...value,vocabulary:next});
 const summaries=partSummaries(value,language);
 const showParts=!vocabulary.materialKinds.includes("other");
 return <div className={s.fields}>
  <VocabularySelectionFields compact learningLanguage={languageCode} section="selection" value={vocabulary} language={language} onChange={updateVocabulary}/>
  <div className={s.row}><h2>{localizedField("libraryFilters","entryType")[language]}<MaterialKindHelp language={language}/></h2><MaterialKindSelection language={language} value={vocabulary.materialKinds} onChange={materialKinds=>updateVocabulary({...vocabulary,materialKinds})}/></div>
  <div className={`${s.reveal} ${showParts?s.revealOpen:""}`} aria-hidden={!showParts} ref={node=>{node?.toggleAttribute("inert",!showParts);}}><div>
   <button type="button" className={s.partsHeading} aria-expanded={partsExpanded} aria-controls={`${id}-parts`} onClick={()=>setPartsExpanded(!partsExpanded)}><span>{b.partOfSpeech}</span><AdaptiveFilterSummary parts={summaries.abbreviated} accessibleParts={summaries.full} shortParts={summaries.short} lines={1}/><ChevronDown size={16} className={partsExpanded?s.chevronOpen:s.chevron}/></button>
   <div id={`${id}-parts`} className={`${s.reveal} ${partsExpanded?s.revealOpen:""}`} aria-hidden={!partsExpanded} ref={node=>{node?.toggleAttribute("inert",!partsExpanded);}}><div className={s.parts}><PartOfSpeechSelection compact value={{parts,article}} language={language} languageCode={languageCode} onChange={next=>onChange({...value,...next})}/></div></div>
  </div></div>
  <VocabularySelectionFields compact section="meanings" value={vocabulary} language={language} onChange={updateVocabulary}/>
 </div>;
}
