"use client";
import React, { useEffect, useRef, useState } from "react";
import { ArrowLeft, Check, ChevronDown, ChevronRight, Search, X } from "lucide-react";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import { getUiMessages, formatUiMessage } from "@/lib/uiMessages";
import { LIBRARY_PARTS, type LibraryEntryFilters, type LibraryPart } from "@/lib/platform/librarySearchScope";
import { DialogSurface } from "../ui/DialogSurface";
import { NounArticleChoices } from "../ui/NounArticleChoices";
import { NounFilterPopover } from "./NounFilterPopover";
import { BuilderSection } from "../builder/BuilderSection";
import { LanguageScopeControl } from "../ui/LanguageScopeControl";
import f from "./libraryFilters.module.css";
export type LibraryFilterDraft = LibraryEntryFilters & { languageCode: string; dictionaryId: string | null; applyListFilter?: boolean; collectionId?: string | null };
export type LibraryFilterOption = { id: string | null; label: string };
export const LIBRARY_PART_LABELS = {
 noun: "Nouns", verb: "Verbs", adjective: "Adjectives", adverb: "Adverbs", pronoun: "Pronouns",
 preposition: "Prepositions", conjunction: "Conjunctions", numeral: "Numerals", article: "Articles", interjection: "Interjections",
} as const;
export function LibraryFilters({ value, languageOptions, sourceOptions, locale, countContent, sourceNotice,
  canApply = true, collectionOptions = [], onDraftChange, onClose, onApply, layout = "chips" }: {
  collectionLabel?: string; collectionOptions?: LibraryFilterOption[];
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
  const [page, setPage] = useState<"main" | "noun">("main");
  const [query, setQuery] = useState("");
  const [sourceOpen, setSourceOpen] = useState(false);
  const [partsOpen, setPartsOpen] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
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
  const title = page === "main" ? copy.filterTitle : builder.nounArticle;
  const options = [{ id: null, label: copy.allSources }, ...sourceOptions.map(option => ({...option,id:option.id ? `dictionary:${option.id}` : null})), ...collectionOptions.map(option => ({...option,id:option.id ? `collection:${option.id}` : null}))];
  const selectedSource = draft.applyListFilter && draft.collectionId ? `collection:${draft.collectionId}` : draft.dictionaryId ? `dictionary:${draft.dictionaryId}` : null;
  const selectLanguage = (id: string) => {
    if (id !== draft.languageCode) {
      update({ languageCode: id, dictionaryId: null, collectionId: null, applyListFilter: false, article: null });
      setQuery("");
    }
  };
  const selectSource = (id: string | null) => {
    if (id?.startsWith("collection:")) update({ collectionId: id.slice(11), applyListFilter: true, dictionaryId: null, parts: [], article: null });
    else update({ dictionaryId: id?.slice(11) ?? null, collectionId: null, applyListFilter: false });
  };
  const sourceName = draft.applyListFilter && draft.collectionId ? collectionOptions.find(option=>option.id===draft.collectionId)?.label ?? copy.noSources : draft.dictionaryId ? sourceOptions.find(option => option.id === draft.dictionaryId)?.label ?? copy.noSources : copy.allSources;
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
          <div className={`session-builder-standard ${f.sections}`}>
          <div className="builder-section-group">
          <div className={f.languageRow}>
            <h3>{builder.language}</h3>
            <LanguageScopeControl label={builder.language} menuLabel={copy.searchLanguages} language={locale}
              options={languageOptions.flatMap(option => option.id ? [{ id: option.id, label: option.label }] : [])}
              value={draft.languageCode} onChange={selectLanguage}/>
          </div>
          <BuilderSection title={builder.source} summary={sourceName} open={sourceOpen} onToggle={() => setSourceOpen(open => !open)}>
            <div className={f.sourceToolbar}>
              {searchOpen || options.length > 10 ? <label className={f.search}><Search size={16}/><input autoFocus={searchOpen} aria-label={copy.searchSources} placeholder={copy.sourcesPlaceholder} value={query} onChange={event => setQuery(event.target.value)}/></label>
                : <button type="button" className={f.icon} aria-label={copy.searchSources} aria-expanded={searchOpen} onClick={() => setSearchOpen(true)}><Search size={16}/></button>}
            </div>
            {sourceNotice}
            <div className={f.sourceList}>{visibleOptions.map(option => <button type="button" key={option.id ?? "all"} className={f.sourceOption} aria-pressed={selectedSource === option.id} onClick={() => selectSource(option.id)}>
              <span>{option.label}</span>{selectedSource === option.id && <Check size={14} aria-hidden="true"/>}
            </button>)}</div>
            {!visibleOptions.length && <p className={f.help}>{copy.noSources}</p>}
          </BuilderSection>
          {!draft.applyListFilter && <BuilderSection title={builder.partOfSpeech} summary={draft.parts.length ? draft.parts.map(part => builder.parts[LIBRARY_PART_LABELS[part]]).join(" · ") : builder.allParts} open={partsOpen} onToggle={() => setPartsOpen(open => !open)}>
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

          </BuilderSection>}
          </div></div>
        </div>
        <div className={f.page} ref={node=>{node?.toggleAttribute("inert",page === "main");}} aria-hidden={page === "main"}>
          <p className={f.help}>{copy.articleHelp}</p>
          <div className={f.group}><NounArticleChoices article={draft.article} onChange={article => update({ article })} className={f.row}/></div>
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
