"use client";

// Normal Library search categories; scope and authoritative article metadata stay shared.
import {formatLibraryCounts} from "@/lib/platform/libraryCountLabel";
import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { SegmentedControl } from "@/components/practice/ui/SegmentedControl";
import { getUiMessages, formatUiMessage } from "@/lib/uiMessages";
import { LibraryResultList, LibraryContextResultRow } from "@/components/practice/library/LibraryResultList";
import type { LibraryEntryFilters, LibraryMaterialScope } from "@/lib/platform/librarySearchScope";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import {
  DICTIONARY_SEARCH_CATEGORIES, CONTEXT_SEARCH_PAGE_SIZE, readDictionaryCategory, readMoreDictionaryContext, hydrateDictionaryWordResults,
  type DictionaryCategoryHit, type DictionaryCategoryPage, type DictionarySearchCategory,
} from "@/lib/platform/dictionaryCategorySearch";
import { LibraryHeadwordGroupResultsList } from "./LibraryHeadwordGroupResultsList";
import type { LibraryHeadwordGroupResult } from "./libraryHeadwordGroupResults";
import workspace from "@/components/practice/library/libraryWorkspace.module.css";
import styles from "./libraryCategoryResults.module.css";
export type SearchItem = DictionaryCategoryHit;
function Highlight({ text, query }: { text: string; query: string }) {
  const index = query ? text.toLocaleLowerCase().indexOf(query.toLocaleLowerCase()) : -1;
  return index < 0 ? <>{text}</> : <>{text.slice(0, index)}<b className={styles.match}>{text.slice(index, index + query.length)}</b>{text.slice(index + query.length)}</>;
}
type CategoryState = { page?: DictionaryCategoryPage; complete: boolean; error?: string; moreError?: boolean };
type WordState = { results: LibraryHeadwordGroupResult[]; loading: boolean; error?: boolean };
export function LibraryCategoryResults({ query, languageCode, dictionaryId, selectedId, selectedResultKey, onSelect, onSelectGroup, tabsHost, countHost, interfaceLanguage, userId, filters, material, materialRevision, refreshRevision = 0, enabled = true, category = "headwords", onCategoryChange, onWordResults, appearance = "plain" }: {
  query: string; languageCode: string; dictionaryId: string | null; selectedId?: string; selectedResultKey?: string; userId?: string;
  onSelect: (item: SearchItem) => void; onSelectGroup?: (group: LibraryHeadwordGroupResult) => void;
  tabsHost?: HTMLElement | null; countHost?: HTMLElement | null; interfaceLanguage: OnboardingLanguage;
  filters?: LibraryEntryFilters; material?: LibraryMaterialScope; materialRevision?: number;
  appearance?: "plain" | "framed";
  refreshRevision?: number; enabled?: boolean; category?: DictionarySearchCategory;
  onWordResults?: (results: LibraryHeadwordGroupResult[]) => void;
  onCategoryChange?: (category: DictionarySearchCategory) => void;
}) {
  const copy = getUiMessages(interfaceLanguage).librarySearch;
  const locale = interfaceLanguage;
  const active = category;
  const setActive = (value: DictionarySearchCategory) => onCategoryChange?.(value);
  const [categories, setCategories] = useState<Partial<Record<DictionarySearchCategory, CategoryState>>>({});
  const [words, setWords] = useState<Partial<Record<DictionarySearchCategory, WordState>>>({});
  const [revision, setRevision] = useState(0);
  const [hydrationRevision, setHydrationRevision] = useState(0);
  const scopeKey = JSON.stringify([query.trim(), languageCode, dictionaryId, userId, filters, material, materialRevision, refreshRevision, enabled, revision]);
  const [appliedScope, setAppliedScope] = useState("");
  const generation = useRef(0);
  const hydrated = useRef(new Map<string, LibraryHeadwordGroupResult[]>());
  const currentScope = appliedScope === scopeKey;
  const completed = useRef(new Set<DictionarySearchCategory>());
  useEffect(() => {
    ++generation.current;
    hydrated.current.clear();
    completed.current.clear();
    setCategories({}); setWords({}); setAppliedScope(scopeKey);
  }, [scopeKey]);
  useEffect(() => {
    if (!currentScope || !query.trim() || !enabled || completed.current.has(active)) return;
    const abort = new AbortController();
    const version = generation.current;
    const timer = setTimeout(() => {
      void readDictionaryCategory({ query: query.trim(), languageCode, dictionaryId, userId, filters, material, signal: abort.signal }, active,
        (page, complete) => {
          if (version === generation.current && !abort.signal.aborted) {
            if (complete) completed.current.add(active);
            setCategories(current => ({ ...current, [active]: { page, complete } }));
          }
        },
      ).catch(cause => {
        if (!abort.signal.aborted && version === generation.current) setCategories(current => ({ ...current, [active]: { ...current[active], complete: false, error: cause instanceof Error ? cause.message : "search_failed" } }));
      });
    }, 250);
    return () => { clearTimeout(timer); abort.abort(); };
  }, [scopeKey, currentScope, active, query, languageCode, dictionaryId, userId, filters, material, enabled]);
  const [moreRequest, setMoreRequest] = useState<{scopeKey:string; category:DictionarySearchCategory; page:DictionaryCategoryPage} | null>(null);
  useEffect(() => { setMoreRequest(null); }, [scopeKey, active]);
  useEffect(() => {
    if (!moreRequest || moreRequest.scopeKey !== scopeKey || moreRequest.category !== active) return;
    const abort = new AbortController();
    const version = generation.current;
    const category = moreRequest.category;
    setCategories(current => ({...current, [category]: {...current[category]!, moreError:false}}));
    void readMoreDictionaryContext({query:query.trim(),languageCode,dictionaryId,userId,filters,material,signal:abort.signal}, moreRequest.page).then(page => {
      if (!abort.signal.aborted && version === generation.current) {
        setCategories(current => ({...current,[category]:{page,complete:true}}));
        setMoreRequest(null);
      }
    }).catch(cause => {
      if (!abort.signal.aborted && version === generation.current) {
        const code = cause instanceof Error ? cause.message : "search_failed";
        if (code === "invalid_cursor") setRevision(value => value + 1);
        else if (code === "material_not_accessible") setCategories(current => ({...current,[category]:{complete:false,error:code}}));
        else setCategories(current => ({...current,[category]:{...current[category]!,moreError:true}}));
        setMoreRequest(null);
      }
    });
    return () => abort.abort();
  }, [moreRequest,scopeKey,active,query,languageCode,dictionaryId,userId,filters,material]);
  const current = currentScope ? categories[active] : undefined;
  const isWords = active === "headwords" || active === "alphabetical";
  const hits = current?.page?.items;
  const wordCategory = active === "alphabetical" ? "alphabetical" : "headwords";
  const wordPage = currentScope ? categories[wordCategory] : undefined;
  const wordHits = wordPage?.page?.items;
  const wordReadKey = enabled && currentScope && wordPage?.complete ? `${scopeKey}:${wordCategory}:${hydrationRevision}` : null;
  useEffect(() => {
    if (!wordReadKey || !wordHits) return;
    const cached = hydrated.current.get(wordReadKey);
    if (cached) {
      setWords(current => ({ ...current, [wordCategory]: { results: cached, loading: false } }));
      onWordResults?.(cached);
      return;
    }
    const abort = new AbortController();
    setWords(current => ({ ...current, [wordCategory]: { results: [], loading: true } }));
    void hydrateDictionaryWordResults({ query, languageCode, dictionaryId, userId, filters, material, signal: abort.signal }, wordHits).then(results => {
      if (!abort.signal.aborted) {
        hydrated.current.set(wordReadKey, results);
        onWordResults?.(results);
        setWords(current => ({ ...current, [wordCategory]: { results, loading: false } }));
      }
    }).catch(() => {
      if (!abort.signal.aborted) setWords(current => ({ ...current, [wordCategory]: { results: [], loading: false, error: true } }));
    });
    return () => abort.abort();
  }, [wordReadKey, wordHits, wordCategory, query, languageCode, dictionaryId, userId, filters, material, onWordResults]);
  const wordState = currentScope ? words[active] : undefined;
  const failed = current?.error || wordState?.error;
  const loading = enabled && Boolean(query.trim()) && (!currentScope || !current?.complete || (isWords && (!wordState || wordState.loading)));
  const selectedGroupId = wordState?.results.find(result => result.group.entries.some(entry => (entry.kind === "sense-card" ? entry.entryId : entry.crossReferenceId) === selectedId))?.headwordGroupId ?? null;
  const tabs = <div className={styles.tabs}><SegmentedControl standard label={copy.group}>
    {DICTIONARY_SEARCH_CATEGORIES.map(value => <button key={value} type="button" aria-pressed={active === value} aria-controls="library-search-results" onClick={() => setActive(value)}>{copy.labels[value]}</button>)}
  </SegmentedControl></div>;
  const showSource = new Set(hits?.map(item => item.dictionary?.id)).size > 1;
  const moreLoading = moreRequest?.scopeKey === scopeKey && moreRequest.category === active;
  const moreAvailable = !isWords && current?.complete && current.page?.page.hasMore;
  const countLabel = isWords
    ? formatLibraryCounts(locale,current?.page?.wordGroupCount ?? wordState?.results.length ?? 0,current?.page?.total)
    : formatUiMessage(copy.foundCount, {count:new Intl.NumberFormat(locale).format(hits?.length ?? 0) + (moreAvailable ? "+" : "")});
  return <div className={styles.results}>
    {tabsHost ? createPortal(tabs, tabsHost) : tabs}
    {countHost && createPortal(<span className={styles.count} role="status">{!enabled ? "" : loading ? copy.busy : !failed ? countLabel : ""}</span>, countHost)}
    <div id="library-search-results" aria-busy={loading && !failed} aria-label={copy.labels[active]}>
      {!enabled ? null : !query.trim() ? <p className={styles.empty}>{copy.prompt}</p> : <>
        {failed && <p role="alert" className={styles.empty}>{current?.error === "material_not_accessible" ? getUiMessages(locale).library.materialUnavailable : copy.error} <button type="button" onClick={() => current?.error ? setRevision(value => value + 1) : setHydrationRevision(value => value + 1)}>{copy.retry}</button></p>}
        {loading && !failed && <p role="status" className={styles.empty}>{copy.busy}</p>}
        {isWords ? wordState?.results.length ? <LibraryHeadwordGroupResultsList results={wordState.results} appearance={appearance} interfaceLanguage={locale} selectedHeadwordGroupId={selectedGroupId} onSelect={result => {
          if (onSelectGroup) onSelectGroup(result);
          else onSelect({ entry: { id: result.selectedEntryId, headword: result.headword, languageCode } });
        }}/> : null : currentScope && hits?.length ? <LibraryResultList appearance={appearance} language={locale} listing="preview" entrySelection hasDetail={Boolean(selectedId)} showSource={showSource}>
          {hits.map((item, index) => <LibraryContextResultRow key={item.resultKey ?? `${item.entry.id}:${item.field?.sourcePath ?? index}`}
            text={<Highlight text={item.field?.text || item.displayText || item.entry.summaryDefinition || ""} query={query.trim()}/>}
            headword={item.entry.headword} source={showSource ? item.dictionary?.name : undefined} contentLanguage={languageCode}
            selected={selectedResultKey === (item.resultKey ?? `${item.entry.id}:${item.field?.sourcePath ?? index}`)} onSelect={() => onSelect(item)}/>)}
        </LibraryResultList> : null}
        {moreAvailable && <div className={styles.more}>
          {current?.moreError && <p role="alert">{copy.moreError}</p>}
          <button type="button" className={workspace.button} disabled={moreLoading} onClick={() => setMoreRequest({scopeKey,category:active,page:current!.page!})}>
            {moreLoading ? copy.loadingMore : current?.moreError ? copy.retry : formatUiMessage(copy.more,{count:CONTEXT_SEARCH_PAGE_SIZE})}
          </button>
        </div>}
        {(current?.page?.unavailableEntryCount ?? 0)>0 && <p className={styles.empty} role="status">{getUiMessages(locale).library.unavailableCollectionSource}</p>}
        {!loading && !failed && (isWords ? !wordState?.results.length : !hits?.length) && <p className={styles.empty}>{copy.empty}</p>}
      </>}
    </div>
  </div>;
}
