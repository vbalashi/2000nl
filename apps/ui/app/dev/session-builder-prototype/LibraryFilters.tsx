"use client";
import React, { useContext, useState } from "react";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import type { Part } from "./model";
import { getUiMessages, formatUiCount } from "@/lib/uiMessages";
import { InterfaceLanguageContext } from "./VariantControls";
import { previewLanguageName } from "./previewLanguage";
import { LibraryFilters as SharedFilters, LIBRARY_PART_LABELS, type LibraryFilterDraft } from "@/components/practice/library/LibraryFilters";
import { LIBRARY_PARTS } from "@/lib/platform/librarySearchScope";
export type LibraryFilter = { language: string; source: string; parts: Part[]; article: "de" | "het" | null };
export const defaultLibraryFilter: LibraryFilter = { language: "Dutch", source: "All sources", parts: [], article: null };
const posNames: Record<Part, string> = { Nouns: "noun", Verbs: "verb", Adjectives: "adjective", Adverbs: "adverb", Pronouns: "pronoun", Prepositions: "preposition", Conjunctions: "conjunction", Numerals: "numeral", Articles: "article", Interjections: "interjection" };
export function matchesLibraryFilter(word: { source: string; pos: string; article: string }, filter: LibraryFilter) {
  return filter.language === "Dutch" && (filter.source === "All sources" || word.source === filter.source)
    && (!filter.parts.length || filter.parts.some(part => posNames[part] === word.pos))
    && (word.pos !== "noun" || !filter.article || word.article === filter.article);
}
export function libraryFilterSummary(filter: LibraryFilter,locale:OnboardingLanguage="en") {
  const copy=getUiMessages(locale);
  return [previewLanguageName(locale,filter.language),filter.source==="All sources"?copy.library.allSources:filter.source,...filter.parts.map(part=>`${copy.builder.parts[part]}${part==="Nouns"&&filter.article?` (${filter.article})`:""}`)].join(" · ");
}


const codes: Record<string,string> = { Dutch:"nl", English:"en", German:"de" };
function fromDraft(draft: LibraryFilterDraft): LibraryFilter {
 return {language:Object.keys(codes).find(name=>codes[name]===draft.languageCode) ?? draft.languageCode,
 source:draft.dictionaryId ?? "All sources",parts:draft.parts.map(part=>LIBRARY_PART_LABELS[part]),article:draft.article};
}
export function LibraryFilters({value,sources,count,onClose,onApply,layout="rows"}: {
 value:LibraryFilter;sources:string[];count:(filter:LibraryFilter)=>number;onClose:()=>void;onApply:(filter:LibraryFilter)=>void;layout?:"rows"|"chips";
}) {
 const locale=useContext(InterfaceLanguageContext);
 const initial:LibraryFilterDraft={languageCode:codes[value.language] ?? value.language,dictionaryId:value.source==="All sources"?null:value.source,
 parts:LIBRARY_PARTS.filter(part=>value.parts.includes(LIBRARY_PART_LABELS[part])),article:value.article};
 const [draft,setDraft]=useState(initial);
 return <SharedFilters value={initial} locale={locale} layout={layout}
 languageOptions={Object.entries(codes).map(([name,id])=>({id,label:previewLanguageName(locale,name)}))}
 sourceOptions={(draft.languageCode==="nl"?sources:[]).map(id=>({id,label:id}))}
 countContent={formatUiCount(locale,count(fromDraft(draft)),getUiMessages(locale).library,"matching")}
 onDraftChange={setDraft} onClose={onClose} onApply={next=>onApply(fromDraft(next))}/>;
}
