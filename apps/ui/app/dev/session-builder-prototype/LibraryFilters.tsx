"use client";

import React, { useContext, useEffect, useRef, useState } from "react";
import { ArrowLeft, Check, ChevronDown, ChevronRight, Search, X } from "lucide-react";
import type {OnboardingLanguage} from "@/lib/onboardingI18n";
import { Action } from "./VariantControls";
import { parts, type Part } from "./model";
import {getUiMessages,formatUiMessage,formatUiCount} from "@/lib/uiMessages";
import {InterfaceLanguageContext} from "./VariantControls";
import {previewLanguageName} from "./previewLanguage";
import s from "./prototype.module.css";
import f from "./libraryFilters.module.css";
import {DialogSurface} from "@/components/practice/ui/DialogSurface";
import { NounFilterPopover } from "./NounFilterPopover";

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

export function LibraryFilters({ value, sources, count, onClose, onApply, layout = "rows" }: {
  layout?: "rows" | "chips"; value: LibraryFilter; sources: string[]; count: (filter: LibraryFilter) => number;
  onClose: () => void; onApply: (filter: LibraryFilter) => void;
}) {
  const locale=useContext(InterfaceLanguageContext);const messages=getUiMessages(locale);const copy=messages.library;const builder=messages.builder;
  const optionName=(option:string)=>page==="language"?previewLanguageName(locale,option):option==="All sources"?copy.allSources:option;
  const [draft, setDraft] = useState(value);
  const update = (patch: Partial<LibraryFilter>) => setDraft(current => ({ ...current, ...patch }));
  const togglePart = (part: Part) => {
    const removing = draft.parts.includes(part);
    update({ parts: removing ? draft.parts.filter(p => p !== part) : [...draft.parts, part], ...(part === "Nouns" && removing ? { article: null } : {}) });
  };
  const [page, setPage] = useState<"main" | "language" | "source" | "noun">("main");
  const [query, setQuery] = useState("");
  const [nounAnchor, setNounAnchor] = useState<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const backRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLButtonElement | null>(null);
  const wasChild = useRef(false);
  useEffect(() => {
    if (page !== "main") backRef.current?.focus();
    else if (wasChild.current) openerRef.current?.focus();
    wasChild.current = page !== "main";
  }, [page]);
  const navigate = (next: typeof page, opener: HTMLButtonElement) => {
    openerRef.current = opener;
    setQuery("");
    setPage(next);
  };
  const back = () => setPage("main");
  const title = page === "main" ? copy.filterTitle : page === "language" ? builder.language : page === "source" ? builder.source : builder.nounArticle;
  const options = page === "language" ? ["Dutch", "English", "German"] : ["All sources", ...(draft.language === "Dutch" ? sources : [])];
  const visibleOptions = options.filter(option => `${option} ${optionName(option)}`.toLowerCase().includes(query.trim().toLowerCase()));
  const matches = count(draft);
  return <DialogSurface onDismiss={onClose} ref={dialogRef} className={`${s.modal} ${f.dialog}`} aria-label={copy.filterTitle} lang={locale}
    onCancel={event => { event.preventDefault(); if (page === "main") onClose(); else back(); }}
    >
    <header className={f.header}>
      {page !== "main" && <button ref={backRef} className={f.icon} aria-label={copy.backFilters} onClick={back}><ArrowLeft size={19}/></button>}
      <h2>{title}</h2><button className={f.icon} aria-label={copy.closeFilters} onClick={onClose}><X size={19}/></button>
    </header>
    <div className={f.viewport}>
      <div className={f.track} data-child={page !== "main"}>
        <div className={f.page} inert={page !== "main"} aria-hidden={page !== "main"}>
          <div className={f.group}>
            <button className={f.row} onClick={event => navigate("language", event.currentTarget)}><span>{builder.language}</span><span className={f.value}>{previewLanguageName(locale,draft.language)}</span><ChevronRight size={17}/></button>
            <button className={f.row} onClick={event => navigate("source", event.currentTarget)}><span>{builder.source}</span><span className={f.value}>{draft.source==="All sources"?copy.allSources:draft.source}</span><ChevronRight size={17}/></button>
          </div>
          <h3 className={f.label}>{builder.partOfSpeech}</h3>
          {layout === "chips" ? <div className={s.parts}>{parts.map(part => <div className={`${s.part} ${draft.parts.includes(part) ? s.selected : ""}`} key={part}>
            <button aria-pressed={draft.parts.includes(part)} onClick={() => togglePart(part)}>{builder.parts[part]}{part === "Nouns" && draft.article && <span className={f.dot} role="img" aria-label={formatUiMessage(copy.articleFilter,{article:draft.article??""})}/>}</button>
            {part === "Nouns" && draft.language === "Dutch" && <button className={s.disclosure} aria-label={builder.nounSubfilters} aria-haspopup="dialog" onClick={event => {
              if (!draft.parts.includes("Nouns")) update({ parts: [...draft.parts, "Nouns"] });
              setNounAnchor(event.currentTarget);
            }}><ChevronDown size={15}/></button>}
          </div>)}</div> : <div className={f.group}>{parts.map(part => <div className={f.partRow} key={part}>
            <button className={f.partToggle} aria-pressed={draft.parts.includes(part)} onClick={() => togglePart(part)}>
              <span className={f.check} aria-hidden="true">{draft.parts.includes(part) && <Check size={13}/>}</span>
              {builder.parts[part]}{part === "Nouns" && draft.article && <span className={f.dot} role="img" aria-label={formatUiMessage(copy.articleFilter,{article:draft.article??""})}/>}
            </button>
            {part === "Nouns" && draft.language === "Dutch" && <button className={f.disclosure} aria-label={builder.nounSubfilters} onClick={event => {
              if (!draft.parts.includes("Nouns")) update({ parts: [...draft.parts, "Nouns"] });
              navigate("noun", event.currentTarget);
            }}><ChevronRight size={17}/></button>}
          </div>)}</div>}

        </div>
        <div className={f.page} inert={page === "main"} aria-hidden={page === "main"}>
          {page === "noun" ? <>
            <p className={f.help}>{copy.articleHelp}</p>
            <div className={f.group}>{(["de", "het"] as const).map(article => <button key={article} className={f.row} aria-pressed={!draft.article || draft.article === article} onClick={() => update({ article: draft.article ? null : article })}>
              <span>{article}</span><span className={f.check} aria-hidden="true">{(!draft.article || draft.article === article) && <Check size={13}/>}</span>
            </button>)}</div>
          </> : <>
            <label className={f.search}><Search size={17}/><input aria-label={page === "language" ? copy.searchLanguages : copy.searchSources} placeholder={page === "language" ? copy.languagesPlaceholder : copy.sourcesPlaceholder} value={query} onChange={event => setQuery(event.target.value)}/></label>
            <div className={f.group}>{visibleOptions.map(option => <button key={option} className={f.row} aria-pressed={(page === "language" ? draft.language : draft.source) === option} onClick={() => {
              if (page === "language") { if (option !== draft.language) update({ language: option, source: "All sources", article: null }); }
              else update({ source: option });
            }}><span>{optionName(option)}</span><span className={f.check} aria-hidden="true">{(page === "language" ? draft.language : draft.source) === option && <Check size={13}/>}</span></button>)}</div>
            {!visibleOptions.length && <p className={f.help}>{page === "language" ? copy.noLanguages : copy.noSources}</p>}
          </>}
        </div>
      </div>
    </div>
    <footer className={f.footer}>
      {page === "main" ? <>
        <p className={f.count} role="status">{formatUiCount(locale,matches,copy,"matching")}</p>
        <div className={f.actions}><button className={f.reset} onClick={() => setDraft({ ...defaultLibraryFilter, language: draft.language })}>{copy.resetFilters}</button><Action onClick={onClose}>{builder.cancel}</Action><Action primary onClick={() => onApply(draft)}>{copy.showResults}</Action></div>
      </> : <div className={f.actions}><Action primary onClick={back}>{copy.ok}</Action></div>}
    </footer>
    {nounAnchor && <NounFilterPopover anchor={nounAnchor} article={draft.article} onChange={article => update({ article })} onClose={() => setNounAnchor(null)}/>}
  </DialogSurface>;
}
