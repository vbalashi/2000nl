"use client";
import {ActionButton} from '@/components/practice/ui/ActionButton';

import React, { useEffect, useRef, useState } from "react";
import { BookOpen, Check, Folder, Layers, Search, X } from "lucide-react";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import { getUiMessages } from "@/lib/uiMessages";
import { type LibraryEntryFilters } from "@/lib/platform/librarySearchScope";
import { DialogSurface } from "../ui/DialogSurface";
import { BuilderSection } from "../builder/BuilderSection";
import { LanguageScopeControl } from "../ui/LanguageScopeControl";
import f from "./libraryFilters.module.css";
import {DEFAULT_VOCABULARY_SELECTION} from "@/lib/vocabulary/selection";
import {VocabularyFilters,VocabularyFilterSummary} from "../vocabulary/VocabularyFilters";
import {VOCABULARY_PART_LABELS} from "@/lib/vocabulary/partsOfSpeech";
import { LibraryPresentationContext } from "./LibraryPresentationContext";
import {SourceTypeControl,type SourceKind} from "../ui/SourceTypeControl";
import {localizedField} from "@/lib/i18n/catalog";
export type LibraryFilterDraft = LibraryEntryFilters & { languageCode: string; dictionaryId: string | null; applyListFilter?: boolean; collectionId?: string | null; labelId?: string | null; labelName?: string | null };
export type LibraryFilterOption = { id: string | null; label: string };
export const LIBRARY_PART_LABELS = VOCABULARY_PART_LABELS;
export function LibraryFilters({ value, languageOptions, sourceOptions, locale, countContent, sourceNotice,
  canApply = true, collectionOptions = [], labelOptions = [], onDraftChange, onClose, onApply, renderSources }: {
  renderSources?:(props:{options:LibraryFilterOption[];selected:string|null;select:(id:string|null)=>void;query:string;locale:OnboardingLanguage;kind:SourceKind})=>React.ReactNode;
  collectionLabel?: string; collectionOptions?: LibraryFilterOption[]; labelOptions?: LibraryFilterOption[];
  value: LibraryFilterDraft; languageOptions: LibraryFilterOption[]; sourceOptions: LibraryFilterOption[];
  locale: OnboardingLanguage; countContent: React.ReactNode; sourceNotice?: React.ReactNode; canApply?: boolean;
  onDraftChange?: (draft: LibraryFilterDraft) => void; onClose: () => void; onApply: (draft: LibraryFilterDraft) => void;
}) {
  const presentation = React.useContext(LibraryPresentationContext);
  const close = () => { presentation?.onDismissAdditionalFilters?.(); onClose(); };
  const inlinePanel = presentation?.filterPlacement === "panel";
  const messages = getUiMessages(locale), copy = messages.library, builder = messages.builder;
  const [draft, setDraft] = useState(value);
  const update = (patch: Partial<LibraryFilterDraft>) => setDraft(current => ({ ...current, ...patch }));
  const [query, setQuery] = useState("");
  const [kind,setKind]=useState<SourceKind>("all");
  const [filtersOpen,setFiltersOpen]=useState(true);
  const [sourceOpen, setSourceOpen] = useState(inlinePanel);
  const vocabulary=draft.vocabulary??DEFAULT_VOCABULARY_SELECTION;
  const showParts=!vocabulary.materialKinds.includes("other");
  const [searchOpen, setSearchOpen] = useState(false);
  const searchButton=useRef<HTMLButtonElement>(null),restoreSearchFocus=useRef(false);
  const closeSourceSearch=()=>{restoreSearchFocus.current=true;setSearchOpen(false);setQuery("");};
  useEffect(()=>{if(!searchOpen&&restoreSearchFocus.current){restoreSearchFocus.current=false;searchButton.current?.focus();}},[searchOpen]);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const options = [{ id: null, label: copy.allSources }, ...sourceOptions.map(option => ({...option,id:option.id ? `dictionary:${option.id}` : null})), ...collectionOptions.map(option => ({...option,id:option.id ? `collection:${option.id}` : null})), ...labelOptions.map(option => ({...option,id:option.id ? `label:${option.id}` : null}))];
  const selectedSource = draft.labelId ? `label:${draft.labelId}` : draft.applyListFilter && draft.collectionId ? `collection:${draft.collectionId}` : draft.dictionaryId ? `dictionary:${draft.dictionaryId}` : null;
  const selectLanguage = (id: string) => {
    if (id !== draft.languageCode) {
      update({ languageCode: id, dictionaryId: null, collectionId: null, labelId: null, labelName: null, applyListFilter: false, article: null });
      setQuery("");
    }
  };
  const selectSource = (id: string | null) => {
    if (id?.startsWith("label:")) {
      const labelId = id.slice(6);
      update({ labelId, labelName: labelOptions.find(option => option.id === labelId)?.label ?? null,
        collectionId: null, applyListFilter: false, dictionaryId: null });
    } else if (id?.startsWith("collection:")) update({ collectionId: id.slice(11), applyListFilter: true, dictionaryId: null, labelId: null, labelName: null });
    else update({ dictionaryId: id?.slice(11) ?? null, collectionId: null, applyListFilter: false, labelId: null, labelName: null });
  };
  const sourceName = draft.labelId ? labelOptions.find(option => option.id === draft.labelId)?.label ?? copy.noSources : draft.applyListFilter && draft.collectionId ? collectionOptions.find(option=>option.id===draft.collectionId)?.label ?? copy.noSources : draft.dictionaryId ? sourceOptions.find(option => option.id === draft.dictionaryId)?.label ?? copy.noSources : copy.allSources;
  const visibleOptions = options.filter(option => kind==='all'||(kind==='dictionary'&&(!option.id||option.id.startsWith('dictionary:')))||(kind==='collection'&&(option.id?.startsWith('collection:')||option.id?.startsWith('label:')))).filter(option => `${option.id ?? ""} ${option.label}`.toLowerCase().includes(query.trim().toLowerCase()));
  // Keep word choices as a draft for returning to Words, but never submit hidden restrictions.
  const effectiveDraft = React.useMemo<LibraryFilterDraft>(() => !showParts
    ? { ...draft, parts: [], article: null } : draft, [draft, showParts]);
  useEffect(() => { onDraftChange?.(effectiveDraft); }, [effectiveDraft, onDraftChange]);
  const content = <>
    <header className={f.header}>
      <h2>{copy.filterTitle}</h2><button type="button" className={f.icon} aria-label={copy.closeFilters} onClick={close}><X size={19}/></button>
    </header>
    <div className={f.viewport}>
      <div className={f.track}>
        <div className={f.page}>
          <div className={`session-builder-standard ${f.sections}`}>
          <div className="builder-section-group">
          <div className={f.languageRow}>
            <h3>{builder.language}</h3>
            <LanguageScopeControl label={builder.language} menuLabel={copy.searchLanguages} language={locale}
              options={languageOptions.flatMap(option => option.id ? [{ id: option.id, label: option.label }] : [])}
              value={draft.languageCode} onChange={selectLanguage}/>
          </div>
          <BuilderSection title={builder.source} summary={sourceName} open={sourceOpen} onToggle={() => {if(sourceOpen){restoreSearchFocus.current=false;setSearchOpen(false);setQuery("");}setSourceOpen(!sourceOpen);}}>
            <div className={f.sourceToolbar}>
              {searchOpen ? <label className={f.search}><Search size={16}/><input autoFocus={searchOpen} aria-label={copy.searchSources} placeholder={copy.sourcesPlaceholder} value={query} maxLength={200} onChange={event => setQuery([...event.target.value].slice(0,100).join(''))} onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();closeSourceSearch();}}}/></label>
                : <button ref={searchButton} type="button" className={f.icon} aria-label={copy.searchSources} aria-expanded={searchOpen} onClick={() => setSearchOpen(true)}><Search size={16}/></button>}
              <SourceTypeControl locale={locale} value={kind} onChange={setKind}/>
            </div>
            {sourceNotice}
            <div className={f.sourceList}>{(renderSources??presentation?.renderSources) ? (renderSources??presentation?.renderSources)!({options, selected: selectedSource, select: selectSource, query, locale, kind}) : visibleOptions.map(option => <button type="button" key={option.id ?? "all"} className={f.sourceOption} aria-label={option.label} aria-pressed={selectedSource === option.id} onClick={() => selectSource(option.id)}>
              <span className={f.sourceName}>{option.id?.startsWith("label:") ? <Folder size={15} aria-hidden="true"/> : option.id?.startsWith("collection:") ? <Layers size={15} aria-hidden="true"/> : option.id ? <BookOpen size={15} aria-hidden="true"/> : null}{option.label}</span><span className={f.sourceMeta}>{selectedSource === option.id && <Check size={14} aria-hidden="true"/>}{option.id&&!option.id.startsWith("label:")&&<small>{localizedField("sourcePicker",option.id.startsWith("dictionary:")?"dictionarySingular":"collectionSingular")[locale]}</small>}</span>
            </button>)}</div>
            {!renderSources&&!presentation?.renderSources&&!visibleOptions.length && <p className={f.help}>{copy.noSources}</p>}
            {presentation?.renderSourceActions?.()}
          </BuilderSection>
          <BuilderSection title={builder.filters} summary={<VocabularyFilterSummary value={{vocabulary,parts:draft.parts,article:draft.article}} language={locale}/>} open={filtersOpen} onToggle={()=>setFiltersOpen(!filtersOpen)}>
            <VocabularyFilters value={{vocabulary,parts:draft.parts,article:draft.article}} language={locale} languageCode={draft.languageCode} onChange={next=>update({...next,...(next.vocabulary===vocabulary?{vocabulary:draft.vocabulary}:{})})}/>
          </BuilderSection>
          </div></div>
        </div>
      </div>
    </div>
    <footer className={f.footer}>
        <p className={f.count} role="status">{countContent}</p>
        <div className={f.actions}><button type="button" className={f.reset} onClick={() => { setDraft({ languageCode: draft.languageCode, dictionaryId: null, parts: [], article: null, ...(draft.sort?{sort:draft.sort}:{}) }); presentation?.onResetAdditionalFilters?.(); }}>{copy.resetFilters}</button><ActionButton onClick={close}>{builder.cancel}</ActionButton><ActionButton variant="primary" disabled={!canApply} onClick={() => { presentation?.onApplyAdditionalFilters?.(); onApply(effectiveDraft); }}>{copy.showResults}</ActionButton></div>
    </footer>
  </>;
  // Keep the controlled draft mounted while the dev organizer occupies Library.
  if (presentation?.organizerOpen) return <div hidden>{content}</div>;
  if (inlinePanel) return <section className={`${f.dialog} ${f.inlinePanel}`} aria-label={copy.filterTitle} lang={locale}>{content}</section>;
  return <DialogSurface onDismiss={close} ref={dialogRef} className={f.dialog} aria-label={copy.filterTitle} lang={locale}
    onCancel={event => { event.preventDefault(); close(); }}
  >{content}</DialogSurface>;
}
