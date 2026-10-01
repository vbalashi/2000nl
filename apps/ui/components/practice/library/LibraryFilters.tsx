"use client";
import React, { useEffect, useRef, useState } from "react";
import { ArrowLeft, Check, ChevronDown, ChevronRight, Search, X } from "lucide-react";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import { getUiMessages, formatUiMessage } from "@/lib/uiMessages";
import { LIBRARY_PARTS, type LibraryEntryFilters, type LibraryPart } from "@/lib/platform/librarySearchScope";
import { DialogSurface } from "../ui/DialogSurface";
import { NounArticleChoices } from "../ui/NounArticleChoices";
import { NounFilterPopover } from "./NounFilterPopover";
import f from "./libraryFilters.module.css";
export type LibraryFilterDraft = LibraryEntryFilters & { languageCode: string; dictionaryId: string | null };
export type LibraryFilterOption = { id: string | null; label: string };
export const LIBRARY_PART_LABELS = {
 noun: "Nouns", verb: "Verbs", adjective: "Adjectives", adverb: "Adverbs", pronoun: "Pronouns",
 preposition: "Prepositions", conjunction: "Conjunctions", numeral: "Numerals", article: "Articles", interjection: "Interjections",
} as const;
export function LibraryFilters({ value, languageOptions, sourceOptions, locale, countContent, sourceNotice,
  canApply = true, onDraftChange, onClose, onApply, layout = "chips" }: {
  value: LibraryFilterDraft; languageOptions: LibraryFilterOption[]; sourceOptions: LibraryFilterOption[];
  locale: OnboardingLanguage; countContent: React.ReactNode; sourceNotice?: React.ReactNode; canApply?: boolean;
  onDraftChange?: (draft: LibraryFilterDraft) => void; onClose: () => void; onApply: (draft: LibraryFilterDraft) => void;
  layout?: "rows" | "chips";
}) {
  const messages = getUiMessages(locale), copy = messages.library, builder = messages.builder;
  const [draft, setDraft] = useState(value);
  const update = (patch: Partial<LibraryFilterDraft>) => setDraft(current => ({ ...current, ...patch }));
  const togglePart = (part: LibraryPart) => {
    const removing = draft.parts.includes(part);
    update({ parts: removing ? draft.parts.filter(p => p !== part) : [...draft.parts, part], ...(part === "noun" && removing ? { article: null } : {}) });
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
  const options = page === "language" ? languageOptions : [{ id: null, label: copy.allSources }, ...sourceOptions];
  const languageName = languageOptions.find(option => option.id === draft.languageCode)?.label ?? draft.languageCode;
  const sourceName = draft.dictionaryId ? sourceOptions.find(option => option.id === draft.dictionaryId)?.label ?? copy.noSources : copy.allSources;
  const visibleOptions = options.filter(option => `${option.id ?? ""} ${option.label}`.toLowerCase().includes(query.trim().toLowerCase()));
  useEffect(() => { onDraftChange?.(draft); }, [draft, onDraftChange]);
  return <DialogSurface onDismiss={onClose} ref={dialogRef} className={f.dialog} aria-label={copy.filterTitle} lang={locale}
    onCancel={event => { event.preventDefault(); if (page === "main") onClose(); else back(); }}
    >
    <header className={f.header}>
      {page !== "main" && <button type="button" ref={backRef} className={f.icon} aria-label={copy.backFilters} onClick={back}><ArrowLeft size={19}/></button>}
      <h2>{title}</h2><button type="button" className={f.icon} aria-label={copy.closeFilters} onClick={onClose}><X size={19}/></button>
    </header>
    <div className={f.viewport}>
      <div className={f.track} data-child={page !== "main"}>
        <div className={f.page} ref={node=>{node?.toggleAttribute("inert",page !== "main");}} aria-hidden={page !== "main"}>
          <div className={f.group}>
            <button type="button" className={f.row} onClick={event => navigate("language", event.currentTarget)}><span>{builder.language}</span><span className={f.value}>{languageName}</span><ChevronRight size={17}/></button>
            <button type="button" className={f.row} onClick={event => navigate("source", event.currentTarget)}><span>{builder.source}</span><span className={f.value}>{sourceName}</span><ChevronRight size={17}/></button>
          </div>
          <h3 className={f.label}>{builder.partOfSpeech}</h3>
          {layout === "chips" ? <div className={f.parts}>{LIBRARY_PARTS.map(part => <div className={`${f.part} ${draft.parts.includes(part) ? f.selected : ""}`} key={part}>
            <button type="button" aria-pressed={draft.parts.includes(part)} onClick={() => togglePart(part)}>{builder.parts[LIBRARY_PART_LABELS[part]]}{part === "noun" && draft.article && <span className={f.dot} role="img" aria-label={formatUiMessage(copy.articleFilter,{article:draft.article??""})}/>}</button>
            {part === "noun" && draft.languageCode === "nl" && <button type="button" className={f.chipDisclosure} aria-label={builder.nounSubfilters} aria-haspopup="dialog" onClick={event => {
              if (!draft.parts.includes("noun")) update({ parts: [...draft.parts, "noun"] });
              setNounAnchor(event.currentTarget);
            }}><ChevronDown size={15}/></button>}
          </div>)}</div> : <div className={f.group}>{LIBRARY_PARTS.map(part => <div className={f.partRow} key={part}>
            <button type="button" className={f.partToggle} aria-pressed={draft.parts.includes(part)} onClick={() => togglePart(part)}>
              <span className={f.check} aria-hidden="true">{draft.parts.includes(part) && <Check size={13}/>}</span>
              {builder.parts[LIBRARY_PART_LABELS[part]]}{part === "noun" && draft.article && <span className={f.dot} role="img" aria-label={formatUiMessage(copy.articleFilter,{article:draft.article??""})}/>}
            </button>
            {part === "noun" && draft.languageCode === "nl" && <button type="button" className={f.disclosure} aria-label={builder.nounSubfilters} onClick={event => {
              if (!draft.parts.includes("noun")) update({ parts: [...draft.parts, "noun"] });
              navigate("noun", event.currentTarget);
            }}><ChevronRight size={17}/></button>}
          </div>)}</div>}

        </div>
        <div className={f.page} ref={node=>{node?.toggleAttribute("inert",page === "main");}} aria-hidden={page === "main"}>
          {page === "noun" ? <>
            <p className={f.help}>{copy.articleHelp}</p>
            <div className={f.group}><NounArticleChoices article={draft.article} onChange={article => update({ article })} className={f.row}/></div>
          </> : <>
            <label className={f.search}><Search size={17}/><input aria-label={page === "language" ? copy.searchLanguages : copy.searchSources} placeholder={page === "language" ? copy.languagesPlaceholder : copy.sourcesPlaceholder} value={query} onChange={event => setQuery(event.target.value)}/></label>
            {page === "source" && sourceNotice}
            <div className={f.group}>{visibleOptions.map(option => <button type="button" key={option.id ?? "all"} className={f.row} aria-pressed={(page === "language" ? draft.languageCode : draft.dictionaryId) === option.id} onClick={() => {
              if (page === "language") { if (option.id && option.id !== draft.languageCode) update({ languageCode: option.id, dictionaryId: null, article: null }); }
              else update({ dictionaryId: option.id });
            }}><span>{option.label}</span><span className={f.check} aria-hidden="true">{(page === "language" ? draft.languageCode : draft.dictionaryId) === option.id && <Check size={13}/>}</span></button>)}</div>
            {!visibleOptions.length && <p className={f.help}>{page === "language" ? copy.noLanguages : copy.noSources}</p>}
          </>}
        </div>
      </div>
    </div>
    <footer className={f.footer}>
      {page === "main" ? <>
        <p className={f.count} role="status">{countContent}</p>
        <div className={f.actions}><button type="button" className={f.reset} onClick={() => setDraft({ languageCode: draft.languageCode, dictionaryId: null, parts: [], article: null })}>{copy.resetFilters}</button><button type="button" className={f.action} onClick={onClose}>{builder.cancel}</button><button type="button" className={`${f.action} ${f.primary}`} disabled={!canApply} onClick={() => onApply(draft)}>{copy.showResults}</button></div>
      </> : <div className={f.actions}><button type="button" className={`${f.action} ${f.primary}`} onClick={back}>{copy.ok}</button></div>}
    </footer>
    {nounAnchor && <NounFilterPopover locale={locale} anchor={nounAnchor} article={draft.article} onChange={article => update({ article })} onClose={() => setNounAnchor(null)}/>}
  </DialogSurface>;
}
