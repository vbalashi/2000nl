"use client";
import React, { useState } from "react";
import { Check, Search } from "lucide-react";
import { sources, type Draft } from "./model";
import { Choice } from "./VariantControls";
import type {OnboardingLanguage} from "@/lib/onboardingI18n";
import {getUiMessages} from "@/lib/uiMessages";
import {previewLanguageName} from "./previewLanguage";
import s from "./prototype.module.css";
import f from "@/components/practice/library/libraryFilters.module.css";
import p from "./builderScope.module.css";

export function BuilderScopePicker({ page, draft, onApply, interfaceLanguage="en" }: {
  page: "language" | "source"; draft: Draft; onApply: (patch: Partial<Draft>) => void; interfaceLanguage?:OnboardingLanguage;
}) {
  const copy=getUiMessages(interfaceLanguage).builderScope;
  const selected = page === "language" ? draft.language : draft.source;
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("All");
  const options = page === "language"
    ? [{ id: "Dutch", name: previewLanguageName(interfaceLanguage,"Dutch"), kind: "Nederlands · nl · nld" }, { id: "English", name: previewLanguageName(interfaceLanguage,"English"), kind: "English · en · eng" }]
    : sources.filter(source => source.language === draft.language && (kind === "All" || source.kind === kind)).map(source=>({...source,kind:source.kind==="Dictionary"?copy.dictionary:copy.collection}));
  const results = options.filter(option => `${option.name} ${option.kind} ${option.id}`.toLowerCase().includes(query.trim().toLowerCase()));
  const select = (id: string) => {
    if (page === "source") onApply({ source: id });
    else if (id !== draft.language) onApply({ language: id as Draft["language"], source: id === "Dutch" ? "core" : "english-core", parts: [], article: null });
  };
  return <div className={p.inlinePicker} lang={interfaceLanguage} aria-label={page === "language" ? copy.chooseLanguage : copy.chooseSource}>
    <div className={p.tools}>
      {page === "source" && <div className={s.choices}>{["All", "Dictionary", "Collection"].map(value => <Choice key={value} active={kind === value} onClick={() => setKind(value)}>{value === "Dictionary" ? copy.dictionaries : value === "Collection" ? copy.collections : copy.all}</Choice>)}</div>}
      <label className={f.search}><Search size={17}/><input aria-label={page === "language" ? copy.searchLanguages : copy.searchSources} placeholder={page === "language" ? copy.searchLanguagesPlaceholder : copy.searchSourcesPlaceholder} value={query} onChange={event => setQuery(event.target.value)}/></label>
    </div>
    <div className={p.list}><div className={f.group}>{results.map(option => <button className={f.row} key={option.id} aria-pressed={selected === option.id} onClick={() => select(option.id)}><span>{option.name}<small className={p.kind}>{option.kind}</small></span><span className={f.check} aria-hidden="true">{selected === option.id && <Check size={13}/>}</span></button>)}</div>{!results.length && <p className={f.help}>{copy.noMatches[page]}</p>}</div>
  </div>;
}
