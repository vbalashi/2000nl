"use client";
import { useLibraryMaterialSelection } from "@/components/practice/material/useLibraryMaterialSelection";
import {
  formatUiMessage,
  formatUiCount,
  getPartOfSpeechLabel,
  getUiMessages,
} from "@/lib/uiMessages";

import React from "react";
import { LIBRARY_PAGE_SIZE } from "@/lib/platform/libraryPagination";
import { SlidersHorizontal, ChevronLeft, ChevronRight } from "lucide-react";
import { LibraryResultList, LibraryResultRow } from "@/components/practice/library/LibraryResultList";
import { LibraryEntryEditor } from "@/components/practice/library/LibraryEntryEditor";
import { AccountLibraryFilters } from "@/components/practice/library/AccountLibraryFilters";
import { EMPTY_LIBRARY_ENTRY_FILTERS } from "@/lib/platform/librarySearchScope";
import { LIBRARY_PART_LABELS } from "@/components/practice/library/LibraryFilters";
import { sharedArticlePresentationV1Enabled } from "@/lib/platform/platformV2Rollout";
import theme from "@/components/practice/ui/practiceTheme.module.css";
import workspace from "@/components/practice/library/libraryWorkspace.module.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  copyEntryToUserDictionary,
  createUserDictionaryEntry,
  fetchAvailableDictionarySources,
  fetchAvailableLearningLanguages,
  fetchDictionaryEntryById,
  fetchWordsForList,
} from "@/lib/trainingService";
import type {
  AvailableDictionarySource,
  AvailableLearningLanguage,
  DictionaryEntry,
  EntryLearningListMembership,
  WordListSummary,
} from "@/lib/types";
import { hidePerfectParticiple } from "@/lib/definitionFormat";
import { getAllMeanings } from "@/lib/wordUtils";
import { WordDetailsCloseProvider } from "../WordDetailsHeader";
import { WordDetailDrawer } from "./WordDetailDrawer";
import { LibraryWordDetail } from "../library-v2/LibraryWordDetail";
import { languageDisplayName } from "@/lib/languages/languageDisplayName";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import { LibraryHeadwordGroupResultsList } from "./LibraryHeadwordGroupResultsList";
import { useLibraryHeadwordGroupSearch } from "./useLibraryHeadwordGroupSearch";
import {
  createDictionarySearchTabState,
  type DictionarySearchTabState,
} from "./dictionarySearchTabState";

export {
  createDictionarySearchTabState,
  type DictionarySearchTabState,
} from "./dictionarySearchTabState";

type Props = {
  open: boolean;
  preload?: boolean;
  userId: string;
  language: string;
  translationLang: string | null;
  interfaceLanguage: OnboardingLanguage;
  userLists: WordListSummary[];
  collections?: WordListSummary[];
  viewedListId: string | null;
  viewedList: WordListSummary | null;
  viewedListName: string;
  reloadLists: () => Promise<void>;
  notifyListsUpdated: () => void;
  onOpenListMembership?: (membership: EntryLearningListMembership) => void;
  onUserDictionaryEntryCreated?: (entry: DictionaryEntry) => void;
  onTrainWord?: (wordId: string) => void;
  autoFocusQuery?: boolean;
  searchState: DictionarySearchTabState;
  onSearchStateChange: React.Dispatch<
    React.SetStateAction<DictionarySearchTabState>
  >;
};

const SEARCH_INPUT_DEBOUNCE_MS = 250;

const languageLabel = (code: string) => {
  if (code === "nl") return "Nederlands";
  if (code === "en") return "English";
  if (code === "de") return "Deutsch";
  if (code === "fr") return "Français";
  return code;
};

const firstDefinition = (entry: DictionaryEntry, fallback: string) => {
  const meaning = getAllMeanings(entry.raw)[0] as
    { definition?: string; context?: string; examples?: unknown } | undefined;
  const definition = (
    hidePerfectParticiple(meaning?.definition ?? "") ?? ""
  ).trim();
  if (definition) return definition;
  if (meaning?.context?.trim()) return meaning.context.trim();
  return fallback;
};

const meaningLabel = (entry: DictionaryEntry, language: OnboardingLanguage) => {
  const raw = entry.raw as Record<string, unknown>;
  const metadata = raw?._metadata as Record<string, unknown> | undefined;
  const meaningId =
    typeof raw?.meaning_id === "number" || typeof raw?.meaning_id === "string"
      ? raw.meaning_id
      : typeof metadata?.meaning_id === "number" ||
          typeof metadata?.meaning_id === "string"
        ? metadata.meaning_id
        : null;
  return meaningId
    ? formatUiMessage(getUiMessages(language).library.meaningOrdinal, {
        ordinal: meaningId,
      })
    : formatUiCount(language, 1, getUiMessages(language).library, "meaning");
};

const dictionaryLabel = (entry: DictionaryEntry) => {
  if (entry.dictionary_name) return entry.dictionary_name;
  const raw = entry.raw as Record<string, unknown>;
  const metadata = raw?._metadata as Record<string, unknown> | undefined;
  if (typeof metadata?.dictionary_name === "string") {
    return metadata.dictionary_name;
  }
  return "VanDale";
};

const searchMatchLabel = (entry: DictionaryEntry, fallback: string) =>
  entry.search_match_label ?? fallback;

export function DictionarySearchTab({
  open,
  preload = false,
  userId,
  language,
  translationLang,
  interfaceLanguage,
  userLists,
  collections,
  viewedListId: defaultViewedListId,
  viewedList: defaultViewedList,
  viewedListName: defaultViewedListName,
  reloadLists,
  notifyListsUpdated,
  onOpenListMembership,
  onUserDictionaryEntryCreated,
  onTrainWord,
  autoFocusQuery,
  searchState,
  onSearchStateChange,
}: Props) {
  const approved = sharedArticlePresentationV1Enabled();
  const {
    query,
    applyListFilter,
    wordResults,
    groupResults,
    groupPageCursors,
    groupHasMore,
    groupTotal,
    selectedHeadwordGroupId,
    wordTotal,
    page,
    languageCode,
    dictionaryId,
    detailSelection,
    mobileDetailOpen,
  } = searchState;
  const filterCollections = collections ?? [...userLists,...(defaultViewedList ? [defaultViewedList] : [])].filter((item,index,items)=>items.findIndex(other=>other.id===item.id)===index);
  const viewedList = searchState.collectionId ? filterCollections.find(item=>item.id===searchState.collectionId) ?? null : defaultViewedList;
  const viewedListId = searchState.collectionId ? viewedList?.id ?? null : defaultViewedListId;
  const viewedListName = viewedList?.name ?? defaultViewedListName;
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [availableLanguages, setAvailableLanguages] = useState<
    AvailableLearningLanguage[]
  >([]);
  const [dictionarySources, setDictionarySources] = useState<
    AvailableDictionarySource[]
  >([]);
  const [customEntryOpen, setCustomEntryOpen] = useState(false);
  const [customHeadword, setCustomHeadword] = useState("");
  const [customDefinition, setCustomDefinition] = useState("");
  const [customTranslation, setCustomTranslation] = useState("");
  const [customTranslationLanguage, setCustomTranslationLanguage] =
    useState(translationLang);
  const [customExample, setCustomExample] = useState("");
  const [customNotes, setCustomNotes] = useState("");
  const [customEntrySaving, setCustomEntrySaving] = useState(false);
  const [customEntryMessage, setCustomEntryMessage] = useState<string | null>(
    null,
  );
  const queryRef = useRef<HTMLInputElement | null>(null);
  const latestDetailRequestRef = useRef(0);
  const pageSize = approved ? LIBRARY_PAGE_SIZE : 20;
  const updateSearchState = useCallback(
    (patch: Partial<DictionarySearchTabState>) => {
      onSearchStateChange((current) => ({ ...current, ...patch }));
    },
    [onSearchStateChange],
  );

  const searchEnabled = open || preload;
  const searchFreshRef = useRef<{ key: string; at: number } | null>(null);
  const searchPendingRef = useRef<string | null>(null);
  const searchLanguage = languageCode ?? language;
  const material = useLibraryMaterialSelection(
    searchEnabled,
    searchLanguage,
    interfaceLanguage,
  );
  const materialEnabled = Boolean(material);
  const materialCopy = getUiMessages(interfaceLanguage).materialPreferences;
  const copy = getUiMessages(interfaceLanguage).library;
  const number = (value: number) =>
    new Intl.NumberFormat(interfaceLanguage).format(value);
  const scopeLanguages = material ? material.languages : availableLanguages;
  const scopeDictionaries = material
    ? material.dictionaries
    : dictionarySources;
  const searchMaterialReady =
    !material ||
    (material.status === "ready" &&
      material.currentLanguageAllowed &&
      (!dictionaryId ||
        scopeDictionaries.some((item) => item.id === dictionaryId)));

  const selectedDictionary = scopeDictionaries.find(
    (source) => source.id === dictionaryId,
  );
  const sourceLabel = selectedDictionary?.name ?? copy.allSources;
  const useViewedListFilter = applyListFilter && Boolean(viewedListId);
  const {
    beginSearch,
    clearGroupSearch,
    isCurrentSearch,
    openGroupDetail,
    runGroupSearch,
    selectedGroupResult,
  } = useLibraryHeadwordGroupSearch({
    state: searchState,
    setState: onSearchStateChange,
    contentLanguageCode: searchLanguage,
    translationLanguageCode: translationLang,
    dictionaryId,
    defaultFilters: approved && materialEnabled ? EMPTY_LIBRARY_ENTRY_FILTERS : undefined,
  });
  const detailEntryInCurrentResults = useMemo(
    () =>
      Boolean(
        detailSelection &&
        (useViewedListFilter
          ? wordResults.some(
              (resultEntry) => resultEntry.id === detailSelection.entryId,
            )
          : selectedGroupResult),
      ),
    [detailSelection, selectedGroupResult, useViewedListFilter, wordResults],
  );

  const listPage = useViewedListFilter ? page : 1;
  const searchReadKey = JSON.stringify([
    userId,
    searchLanguage,
    translationLang,
    dictionaryId,
    query.trim(),
    page,
    useViewedListFilter,
    useViewedListFilter ? viewedListId : null,
    useViewedListFilter ? viewedList?.type : null,
    searchState.entryFilters,
    material?.revision,
  ]);
  const runSearch = useCallback(
    async (force = false) => {
      if (!searchEnabled) return;
      if (!useViewedListFilter && !searchMaterialReady) {
        searchFreshRef.current = null;
        searchPendingRef.current = null;
      }
      if (
        !force &&
        (searchPendingRef.current === searchReadKey ||
          (searchFreshRef.current?.key === searchReadKey &&
            Date.now() - searchFreshRef.current.at < 30000))
      )
        return;
      const requestId = beginSearch();
      if (!useViewedListFilter && !searchMaterialReady) {
        updateSearchState({
          wordResults: [],
          groupResults: [],
          wordTotal: 0,
          groupHasMore: false,
        });
        setSearchLoading(false);
        setSearchError(null);
        return;
      }
      const hasQuery = Boolean(query.trim());
      if (!hasQuery && !useViewedListFilter && !(approved && materialEnabled)) {
        updateSearchState({
          wordResults: [],
          groupResults: [],
          groupPageCursors: [null],
          groupHasMore: false,
          selectedHeadwordGroupId: null,
          wordTotal: 0,
          detailSelection: null,
          mobileDetailOpen: false,
        });
        return;
      }
      searchPendingRef.current = searchReadKey;
      setSearchLoading(searchFreshRef.current?.key !== searchReadKey);
      setSearchError(null);
      try {
        const trimmedQuery = query.trim() || undefined;
        if (!useViewedListFilter) {
          if (await runGroupSearch(trimmedQuery ?? "", requestId))
            searchFreshRef.current = { key: searchReadKey, at: Date.now() };
          return;
        }

        const result = await fetchWordsForList(
          viewedListId!,
          viewedList?.type ?? "curated",
          {
            query: trimmedQuery,
            page: listPage,
            pageSize,
          },
        );

        if (!isCurrentSearch(requestId)) return;
        searchFreshRef.current = { key: searchReadKey, at: Date.now() };
        clearGroupSearch();
        onSearchStateChange((current) => ({
          ...current,
          wordResults: result.items,
          wordTotal: result.total,
          detailSelection:
            current.detailSelection ??
            (result.items[0]
              ? {
                  entryId: result.items[0].id,
                  headword: result.items[0].headword,
                  contentLanguageCode:
                    result.items[0].language_code ?? searchLanguage,
                }
              : null),
        }));
      } catch (cause) {
        if (
          isCurrentSearch(requestId) &&
          !(
            cause &&
            typeof cause === "object" &&
            "name" in cause &&
            cause.name === "AbortError"
          )
        ) {
          setSearchError(
            cause instanceof Error &&
              cause.message === "platform_request_timeout"
              ? copy.searchTimeout
              : copy.searchError,
          );
        }
      } finally {
        if (isCurrentSearch(requestId)) {
          searchPendingRef.current = null;
          setSearchLoading(false);
        }
      }
    },
    [
      searchEnabled,
      searchReadKey,
      approved,
      materialEnabled,
      beginSearch,
      clearGroupSearch,
      isCurrentSearch,
      onSearchStateChange,
      listPage,
      pageSize,
      query,
      updateSearchState,
      useViewedListFilter,
      runGroupSearch,
      searchLanguage,
      searchMaterialReady,
      copy.searchTimeout,
      copy.searchError,
      viewedList?.type,
      viewedListId,
    ],
  );

  const openEntryDetail = useCallback(
    async (entry: DictionaryEntry) => {
      const requestId = latestDetailRequestRef.current + 1;
      latestDetailRequestRef.current = requestId;
      updateSearchState({
        detailSelection: {
          entryId: entry.id,
          headword: entry.headword,
          contentLanguageCode: entry.language_code ?? searchLanguage,
        },
        mobileDetailOpen: true,
      });

      const hydrated = await fetchDictionaryEntryById(entry.id, userId);
      if (!hydrated || latestDetailRequestRef.current !== requestId) return;
      onSearchStateChange((current) => ({
        ...current,
        detailSelection: {
          entryId: hydrated.id,
          headword: hydrated.headword,
          contentLanguageCode: hydrated.language_code ?? searchLanguage,
        },
        wordResults: current.wordResults.map((item) =>
          item.id === hydrated.id ? { ...item, ...hydrated } : item,
        ),
      }));
    },
    [onSearchStateChange, searchLanguage, updateSearchState, userId],
  );

  const handleUserDictionaryEntryCreated = useCallback(
    (entry: DictionaryEntry) => {
      searchFreshRef.current = null;
      onUserDictionaryEntryCreated?.(entry);
      onSearchStateChange((current) => ({
        ...current,
        detailSelection: {
          entryId: entry.id,
          headword: entry.headword,
          contentLanguageCode: entry.language_code ?? searchLanguage,
        },
        wordResults: [
          entry,
          ...current.wordResults.filter((item) => item.id !== entry.id),
        ],
        wordTotal: Math.max(current.wordTotal, current.wordResults.length + 1),
      }));
    },
    [onSearchStateChange, onUserDictionaryEntryCreated, searchLanguage],
  );

  const handleCopyToUserDictionary = useCallback(
    async (entryId: string) => {
      const copiedEntryId = await copyEntryToUserDictionary({ entryId });
      const copiedEntry = await fetchDictionaryEntryById(copiedEntryId, userId);
      if (copiedEntry) handleUserDictionaryEntryCreated(copiedEntry);
    },
    [handleUserDictionaryEntryCreated, userId],
  );

  const createCustomEntry = useCallback(async () => {
    const headword = (customHeadword || query).trim();
    const definition = customDefinition.trim();
    const translation =
      translationLang && customTranslationLanguage === translationLang
        ? customTranslation.trim()
        : "";
    const example = customExample.trim();
    const notes = customNotes.trim();

    if (!headword) {
      setCustomEntryMessage(copy.entryRequired);
      return;
    }
    if (!definition && !translation && !example && !notes) {
      setCustomEntryMessage(copy.entryContentRequired);
      return;
    }

    setCustomEntrySaving(true);
    setCustomEntryMessage(null);
    try {
      const entryId = await createUserDictionaryEntry({
        entry: {
          headword,
          languageCode: searchLanguage,
          ...(definition ? { definition } : {}),
          ...(translation
            ? {
                translation: {
                  languageCode: translationLang!,
                  text: translation,
                },
              }
            : {}),
          ...(example ? { example: { source: example } } : {}),
          ...(notes ? { notes } : {}),
        },
      });
      const createdEntry = await fetchDictionaryEntryById(entryId, userId);
      if (createdEntry) {
        handleUserDictionaryEntryCreated(createdEntry);
      }
      setCustomHeadword("");
      setCustomDefinition("");
      setCustomTranslation("");
      setCustomExample("");
      setCustomNotes("");
      setCustomEntryOpen(false);
      setCustomEntryMessage(copy.entryCreated);
    } catch (error) {
      console.error("Error creating user dictionary entry", error);
      setCustomEntryMessage(copy.entrySaveError);
    } finally {
      setCustomEntrySaving(false);
    }
  }, [
    copy.entryRequired,
    copy.entryContentRequired,
    copy.entryCreated,
    copy.entrySaveError,
    customDefinition,
    customExample,
    customHeadword,
    customNotes,
    customTranslation,
    customTranslationLanguage,
    translationLang,
    handleUserDictionaryEntryCreated,
    query,
    searchLanguage,
    userId,
  ]);

  useEffect(() => {
    if (!searchEnabled || searchState.languageCode) return;
    updateSearchState({ languageCode: language });
  }, [language, searchEnabled, searchState.languageCode, updateSearchState]);

  useEffect(() => {
    if (!searchEnabled || materialEnabled) return;
    let cancelled = false;
    const loadSearchScope = async () => {
      try {
        const languages = await fetchAvailableLearningLanguages(userId);
        if (!cancelled) setAvailableLanguages(languages);
      } catch {
        if (!cancelled) setAvailableLanguages([]);
      }
    };
    void loadSearchScope();
    return () => {
      cancelled = true;
    };
  }, [searchEnabled, userId, materialEnabled]);

  useEffect(() => {
    if (!searchEnabled || materialEnabled || !searchLanguage) return;
    let cancelled = false;
    const loadSources = async () => {
      const sources = await fetchAvailableDictionarySources({
        userId,
        languageCode: searchLanguage,
      });
      if (!cancelled) {
        setDictionarySources(sources);
        if (
          dictionaryId &&
          !sources.some((source) => source.id === dictionaryId)
        ) {
          updateSearchState({
            dictionaryId: null,
            page: 1,
            groupPageCursors: [null],
            groupHasMore: false,
          });
        }
      }
    };
    void loadSources();
    return () => {
      cancelled = true;
    };
  }, [
    dictionaryId,
    searchEnabled,
    searchLanguage,
    updateSearchState,
    userId,
    materialEnabled,
  ]);

  const activeLanguage = material?.languages[0]?.code;
  const materialReady = material?.status === "ready";
  const selectedSourceAvailable =
    !dictionaryId || scopeDictionaries.some((item) => item.id === dictionaryId);
  useEffect(() => {
    if (!searchEnabled || !materialReady || useViewedListFilter) return;
    if (!material?.currentLanguageAllowed && activeLanguage) {
      updateSearchState({
        languageCode: activeLanguage,
        dictionaryId: null,
        page: 1,
        groupPageCursors: [null],
        groupHasMore: false,
      });
    } else if (!selectedSourceAvailable) {
      updateSearchState({
        dictionaryId: null,
        page: 1,
        groupPageCursors: [null],
        groupHasMore: false,
      });
    }
  }, [
    searchEnabled,
    materialReady,
    material?.currentLanguageAllowed,
    activeLanguage,
    selectedSourceAvailable,
    useViewedListFilter,
    updateSearchState,
  ]);

  const lastSearchedQueryRef = useRef<string | null>(null);
  useEffect(() => {
    const trimmed = query.trim();
    const typed =
      lastSearchedQueryRef.current !== null &&
      lastSearchedQueryRef.current !== trimmed;
    const run = () => {
      lastSearchedQueryRef.current = trimmed;
      void runSearch();
    };
    // Typing debounces; restored queries, pagination, filters and clearing run at once.
    if (!typed || !trimmed) {
      run();
      return;
    }
    const timer = window.setTimeout(run, SEARCH_INPUT_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [query, runSearch, open]);

  useEffect(() => {
    if (!autoFocusQuery) return;
    const raf = window.requestAnimationFrame(() => {
      queryRef.current?.focus();
      queryRef.current?.select();
    });
    return () => window.cancelAnimationFrame(raf);
  }, [autoFocusQuery]);

  const resetLookup = () => {
    updateSearchState(createDictionarySearchTabState());
  };
  const hasResettableLookupState = Boolean(
    query.trim() ||
    applyListFilter ||
    page !== 1 ||
    detailSelection ||
    groupResults.length ||
    wordResults.length ||
    wordTotal,
  );
  const resultScopeLabel = useViewedListFilter
    ? approved ? viewedListName : formatUiMessage(copy.collectionScope, { name: viewedListName })
    : approved ? sourceLabel : formatUiMessage(copy.sourceScope, { source: sourceLabel });
  const groupedSearchActive = !useViewedListFilter;
  const resultCountLabel =
    query.trim() || useViewedListFilter || (approved && materialEnabled)
      ? formatUiMessage(copy.pageScope, {
          count: formatUiCount(
            interfaceLanguage,
            useViewedListFilter ? wordTotal : (groupTotal ?? groupResults.length),
            copy,
            useViewedListFilter ? "entry" : "group",
          ),
          page: number(page),
          source: sourceLabel,
        })
      : approved ? null : copy.typeQuery;
  const emptyHeading = useViewedListFilter
    ? copy.emptyCollection
    : query.trim() || (approved && materialEnabled)
      ? copy.noWords
      : copy.emptyQuery;
  const emptyDescription = useViewedListFilter
    ? formatUiMessage(copy.emptyCollectionHint, { name: viewedListName })
    : query.trim() || (approved && materialEnabled)
      ? formatUiMessage(copy.noResultsHint, { source: sourceLabel })
      : copy.emptyQueryHint;

  const results = (
    <div className={`flex min-h-0 min-w-0 flex-1 flex-col ${approved ? workspace.listPane : ""}`}>
      <div
        className={
          approved
            ? `${workspace.toolbar} space-y-3`
            : "shrink-0 space-y-3 border-b border-slate-100 p-4 dark:border-slate-800"
        }
      >
        <div className={approved && materialEnabled ? workspace.searchRow : undefined}>
        <div className="relative min-w-0 flex-1">
          <svg
            className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            ref={queryRef}
            autoComplete="off"
            name="library-query"
            value={query}
            onChange={(event) => {
              updateSearchState({
                query: event.target.value,
                page: 1,
                groupPageCursors: [null],
                groupHasMore: false,
              });
            }}
            aria-label={copy.search}
            placeholder={copy.searchPlaceholder}
            className={
              approved
                ? workspace.input
                : "h-12 w-full rounded-2xl border border-primary/50 bg-white pl-12 pr-12 text-base text-slate-900 shadow-sm outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10 dark:border-primary/60 dark:bg-slate-950 dark:text-white"
            }
          />
          {query ? (
            <button
              type="button"
              onClick={() => {
                updateSearchState({
                  query: "",
                  page: 1,
                  groupPageCursors: [null],
                  groupHasMore: false,
                });
              }}
              className={approved ? workspace.clearSearch : "absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"}
            >
              <span className="sr-only">{copy.clearSearch}</span>x
            </button>
          ) : null}
        </div>
        {approved && materialEnabled && <button type="button" className={workspace.filterButton}
          aria-label={copy.filters} aria-haspopup="dialog" disabled={!searchMaterialReady}
          data-active={Boolean(searchState.entryFilters?.parts.length || dictionaryId)} onClick={()=>setFiltersOpen(true)}>
          <SlidersHorizontal size={18}/>
        </button>}
        </div>
        {filtersOpen && <AccountLibraryFilters locale={interfaceLanguage} query={query} collection={viewedList} collections={filterCollections}
          value={{languageCode:searchLanguage,dictionaryId,applyListFilter,collectionId:applyListFilter ? viewedListId : null,...(searchState.entryFilters ?? EMPTY_LIBRARY_ENTRY_FILTERS)}}
          onClose={()=>setFiltersOpen(false)} onApply={draft=>{
            updateSearchState({languageCode:draft.languageCode,dictionaryId:draft.dictionaryId,applyListFilter:Boolean(draft.applyListFilter),collectionId:draft.collectionId ?? null,
              entryFilters:{parts:[...draft.parts].sort(),article:draft.article},page:1,groupPageCursors:[null],groupHasMore:false,
              groupTotal:null,groupResults:[],wordTotal:0,selectedHeadwordGroupId:null,detailSelection:null,mobileDetailOpen:false});
            setFiltersOpen(false);
          }}/>}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div
            className={
              approved
                ? workspace.scope
                : "text-xs text-slate-500 dark:text-slate-400"
            }
          >
            {languageDisplayName(interfaceLanguage, searchLanguage)} ·{" "}
            {resultScopeLabel}
            {!useViewedListFilter && searchState.entryFilters?.parts.map(part=>
              <React.Fragment key={part}> · {getUiMessages(interfaceLanguage).builder.parts[LIBRARY_PART_LABELS[part]]}
                {part === "noun" && searchState.entryFilters?.article ? ` (${searchState.entryFilters.article})` : ""}
              </React.Fragment>)}
          </div>
          {approved && <span className={workspace.scope}>{formatUiCount(interfaceLanguage,
            useViewedListFilter ? wordTotal : (groupTotal ?? groupResults.length),copy,"matchingGroup")}</span>}
          {!approved && <label className={approved ? workspace.onlyCollection : "hidden items-center gap-2 text-xs font-semibold text-slate-500 md:flex dark:text-slate-300"}>
            {approved ? formatUiMessage(copy.onlyNamedCollection, { name: viewedListName }) : copy.onlyCollection}
            <input
              type="checkbox"
              checked={applyListFilter}
              disabled={!viewedListId}
              onChange={() => {
                onSearchStateChange((current) => ({
                  ...current,
                  applyListFilter: !current.applyListFilter,
                  page: 1,
                  groupPageCursors: [null],
                  groupHasMore: false,
                }));
              }}
              className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary dark:border-slate-600"
            />
          </label>}
        </div>

        {material && material.status !== "ready" && (
          <p role={material.status === "error" ? "alert" : "status"}>
            {material.status === "error"
              ? materialCopy.catalogError
              : materialCopy.loading}
            {material.status === "error" && (
              <button type="button" onClick={material.reload}>
                {materialCopy.retry}
              </button>
            )}
          </p>
        )}
        {!(approved && materialEnabled) && (<>
        <div
          className={
            approved
              ? workspace.scopeControls
              : "rounded-2xl border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-950/40"
          }
        >
          <div
            className={
              approved
                ? workspace.caption
                : "mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
            }
          >
            {copy.searchScope}
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <label
              className={
                approved
                  ? workspace.label
                  : "grid gap-1 text-xs font-semibold text-slate-600 dark:text-slate-300"
              }
            >
              <span>{copy.learningLanguage}</span>
              <select
                value={searchLanguage}
                onChange={(event) => {
                  updateSearchState({
                    languageCode: event.target.value,
                    dictionaryId: null,
                    page: 1,
                    groupPageCursors: [null],
                    groupHasMore: false,
                  });
                }}
                disabled={
                  useViewedListFilter || (Boolean(material) && !materialReady)
                }
                className={
                  approved
                    ? workspace.field
                    : "h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                }
              >
                {(scopeLanguages.length
                  ? scopeLanguages
                  : material
                    ? []
                    : [
                        {
                          code: searchLanguage,
                          label: languageLabel(searchLanguage),
                        },
                      ]
                ).map((option) => (
                  <option key={option.code} value={option.code}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label
              className={
                approved
                  ? workspace.label
                  : "grid gap-1 text-xs font-semibold text-slate-600 dark:text-slate-300"
              }
            >
              <span>{copy.dictionarySource}</span>
              <select
                value={dictionaryId ?? "all"}
                onChange={(event) => {
                  updateSearchState({
                    dictionaryId:
                      event.target.value === "all" ? null : event.target.value,
                    page: 1,
                    groupPageCursors: [null],
                    groupHasMore: false,
                  });
                }}
                disabled={
                  useViewedListFilter || (Boolean(material) && !materialReady)
                }
                className={
                  approved
                    ? workspace.field
                    : "h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                }
              >
                <option value="all">{copy.allSources}</option>
                {scopeDictionaries.map((source) => (
                  <option key={source.id} value={source.id}>
                    {source.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
        </>)}

        {!approved && <div
          className={
            approved
              ? workspace.entryControls
              : "rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900/60"
          }
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div
                className={
                  approved
                    ? workspace.caption
                    : "text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
                }
              >
                {copy.myDictionary}
              </div>
              <div
                className={
                  approved
                    ? workspace.scope
                    : "text-xs text-slate-500 dark:text-slate-400"
                }
              >
                {(!approved || customEntryOpen) && copy.myDictionaryHint}
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setCustomEntryOpen((value) => !value);
                setCustomHeadword((value) => value || query.trim());
                setCustomEntryMessage(null);
              }}
              className={
                approved
                  ? workspace.button
                  : "rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              }
            >
              {customEntryOpen ? copy.closeEntry : copy.addEntry}
            </button>
          </div>

          {customEntryOpen ? (
            <LibraryEntryEditor modal={approved} locale={interfaceLanguage} busy={customEntrySaving} onClose={() => setCustomEntryOpen(false)}>
              <div className="grid gap-2 sm:grid-cols-2">
                <label
                  className={
                    approved
                      ? workspace.label
                      : "grid gap-1 text-xs font-semibold text-slate-600 dark:text-slate-300"
                  }
                >
                  <span>{copy.headword}</span>
                  <input
                    value={customHeadword}
                    onChange={(event) => setCustomHeadword(event.target.value)}
                    className={
                      approved
                        ? workspace.field
                        : "h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                    }
                  />
                </label>
                <label
                  className={
                    approved
                      ? workspace.label
                      : "grid gap-1 text-xs font-semibold text-slate-600 dark:text-slate-300"
                  }
                >
                  <span>{copy.definition}</span>
                  <input
                    value={customDefinition}
                    onChange={(event) =>
                      setCustomDefinition(event.target.value)
                    }
                    className={
                      approved
                        ? workspace.field
                        : "h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                    }
                  />
                </label>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <label
                  className={
                    approved
                      ? workspace.label
                      : "grid gap-1 text-xs font-semibold text-slate-600 dark:text-slate-300"
                  }
                >
                  <span>
                    {copy.translation}
                    {translationLang
                      ? ` · ${languageDisplayName(interfaceLanguage, translationLang)}`
                      : ""}
                  </span>
                  <input
                    disabled={!translationLang}
                    value={
                      translationLang && customTranslationLanguage === translationLang
                        ? customTranslation
                        : ""
                    }
                    onChange={(event) => {
                      setCustomTranslation(event.target.value);
                      setCustomTranslationLanguage(translationLang);
                    }}
                    className={
                      approved
                        ? workspace.field
                        : "h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                    }
                  />
                </label>
                <label
                  className={
                    approved
                      ? workspace.label
                      : "grid gap-1 text-xs font-semibold text-slate-600 dark:text-slate-300"
                  }
                >
                  <span>{copy.example}</span>
                  <input
                    value={customExample}
                    onChange={(event) => setCustomExample(event.target.value)}
                    className={
                      approved
                        ? workspace.field
                        : "h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                    }
                  />
                </label>
              </div>
              <label
                className={
                  approved
                    ? workspace.label
                    : "grid gap-1 text-xs font-semibold text-slate-600 dark:text-slate-300"
                }
              >
                <span>{copy.note}</span>
                <input
                  value={customNotes}
                  onChange={(event) => setCustomNotes(event.target.value)}
                  className={
                    approved
                      ? workspace.field
                      : "h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                  }
                />
              </label>
              <div className={approved ? workspace.editorActions : "flex flex-wrap items-center gap-3"}>
                <button
                  type="button"
                  disabled={customEntrySaving}
                  onClick={() => void createCustomEntry()}
                  className={
                    approved
                      ? workspace.button
                      : "rounded-full bg-primary px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:brightness-105 disabled:opacity-60"
                  }
                >
                  {copy.saveEntry}
                </button>
                {customEntryMessage ? (
                  <span
                    className={
                      approved
                        ? workspace.notice
                        : "text-xs font-semibold text-slate-600 dark:text-slate-300"
                    }
                  >
                    {customEntryMessage}
                  </span>
                ) : null}
              </div>
            </LibraryEntryEditor>
          ) : customEntryMessage ? (
            <div role="status" className={approved ? workspace.notice : "mt-2 text-xs font-semibold text-emerald-700 dark:text-emerald-300"}>
              {customEntryMessage}
            </div>
          ) : null}
        </div>}

        {!approved && resultCountLabel && <div className={approved ? workspace.scope : "space-y-0.5 text-xs text-slate-500 dark:text-slate-400"}>
          <div>{resultCountLabel}</div>
        </div>}
      </div>

      <div
        className={
          approved
            ? workspace.results
            : "scrollbar-hide min-h-0 flex-1 overflow-y-auto p-3"
        }
      >
        {searchError ? (
          <div
            role="alert"
            className={approved ? workspace.error : "rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200"}
          >
            <p>{searchError}</p>
            <button
              type="button"
              className={approved ? workspace.button : "mt-3 rounded-full border border-current px-3 py-1.5 font-semibold"}
              onClick={() => void runSearch(true)}
            >
              {copy.retry}
            </button>
          </div>
        ) : searchLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div
                key={index}
                className={approved ? workspace.skeleton : "h-20 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800"}
              />
            ))}
          </div>
        ) : groupedSearchActive && groupResults.length ? (
          <LibraryHeadwordGroupResultsList
            results={groupResults}
            interfaceLanguage={interfaceLanguage}
            selectedHeadwordGroupId={selectedHeadwordGroupId}
            onSelect={openGroupDetail}
          />
        ) : approved && wordResults.length ? (
          <LibraryResultList language={interfaceLanguage} listing="preview" entrySelection hasDetail={Boolean(detailSelection)}
            showSource={new Set(wordResults.map(entry => entry.dictionary_id)).size > 1}>
            {wordResults.map(entry => <LibraryResultRow
              key={entry.id}
              headword={entry.headword}
              article={entry.gender === "de" || entry.gender === "het" ? entry.gender : null}
              parts={entry.part_of_speech ? [entry.part_of_speech] : []}
              source={entry.dictionary_name ?? copy.dictionaryEntry}
              core={entry.is_nt2_2000 ? "2K" : null}
              meaningCount={1}
              contentLanguage={entry.language_code ?? searchLanguage}
              language={interfaceLanguage}
              selected={detailSelection?.entryId === entry.id}
              preview={firstDefinition(entry, copy.noDefinition)}
              onSelect={() => void openEntryDetail(entry)}
            />)}
          </LibraryResultList>
        ) : wordResults.length ? (
          <div className="space-y-2">
            {wordResults.map((entry, index) => {
              const selected = detailSelection?.entryId === entry.id;
              const previousGroup =
                index > 0 ? wordResults[index - 1]?.search_group_id : null;
              const showGroupHeader =
                groupedSearchActive &&
                entry.search_group_id &&
                entry.search_group_id !== previousGroup;
              return (
                <React.Fragment
                  key={`${entry.search_group_id ?? "flat"}-${entry.id}`}
                >
                  {showGroupHeader ? (
                    <div className="px-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      {entry.search_group_id === "headwords"
                        ? copy.headwords
                        : entry.search_group_id === "examples"
                          ? copy.examples
                          : entry.search_group_id === "definitions"
                            ? copy.definitions
                            : copy.alphabetical}
                    </div>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => void openEntryDetail(entry)}
                    className={`w-full rounded-2xl border p-3 text-left transition ${
                      selected
                        ? "border-primary/50 bg-primary/5 shadow-sm"
                        : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900/70 dark:hover:bg-slate-800"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-slate-900 dark:text-white">
                            {entry.headword}
                          </span>
                          <span
                            className={
                              approved
                                ? workspace.scope
                                : "text-xs text-slate-500 dark:text-slate-400"
                            }
                          >
                            {getPartOfSpeechLabel(
                              interfaceLanguage,
                              entry.part_of_speech ?? null,
                            )}{" "}
                            · {dictionaryLabel(entry)} ·{" "}
                            {meaningLabel(entry, interfaceLanguage)}
                          </span>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                            {searchMatchLabel(entry, copy.dictionaryEntry)}
                          </span>
                        </div>
                        <p className="mt-1 line-clamp-2 text-sm text-slate-700 dark:text-slate-300">
                          {firstDefinition(entry, copy.noDefinition)}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {entry.is_nt2_2000 ? (
                          <span className="rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-200">
                            NT2 2000
                          </span>
                        ) : null}
                        <span className="hidden text-slate-400 sm:inline">
                          ...
                        </span>
                      </div>
                    </div>
                  </button>
                </React.Fragment>
              );
            })}
          </div>
        ) : (
          <div className={approved ? workspace.empty : "flex min-h-[260px] flex-col items-center justify-center gap-3 text-center"}>
            <div className={approved ? workspace.emptyTitle : "text-base font-semibold text-slate-900 dark:text-white"}>
              {emptyHeading}
            </div>
            <div className={approved ? workspace.notice : "max-w-[440px] text-sm text-slate-600 dark:text-slate-300"}>
              {emptyDescription}
            </div>
            {hasResettableLookupState ? (
              <button
                type="button"
                onClick={resetLookup}
                className={approved ? workspace.button : "rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"}
              >
                {copy.clearSearch}
              </button>
            ) : null}
          </div>
        )}
      </div>

      <div
        data-testid={
          groupedSearchActive ? "library-group-pagination" : undefined
        }
        className={
          approved
            ? workspace.pagination
            : "flex shrink-0 items-center justify-between border-t border-slate-100 bg-slate-50 px-4 py-3 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
        }
      >
        {!approved && <span>
          {groupedSearchActive
            ? formatUiMessage(copy.pageCount, {
                page: number(page),
                count: formatUiCount(
                  interfaceLanguage,
                  groupResults.length,
                  copy,
                  "group",
                ),
              })
            : formatUiMessage(copy.wordRange, {
                start: number(
                  wordResults.length ? (page - 1) * pageSize + 1 : 0,
                ),
                end: number(Math.min(wordTotal, page * pageSize)),
                total: number(wordTotal),
              })}
        </span>}
        {approved && <span className={workspace.pageIndicator}>{number(page)} / {number(Math.max(1,Math.ceil((useViewedListFilter ? wordTotal : (groupTotal ?? 0))/pageSize)))}</span>}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() =>
              onSearchStateChange((current) => ({
                ...current,
                page: Math.max(1, current.page - 1),
              }))
            }
            aria-label={copy.previous}
            disabled={page === 1}
            className={
              approved
                ? workspace.button
                : "rounded-full border border-slate-300 px-3 py-1 font-semibold disabled:opacity-50 dark:border-slate-700"
            }
          >
            {approved ? <ChevronLeft size={18} aria-hidden="true"/> : copy.previous}
          </button>
          <button
            type="button"
            onClick={() =>
              onSearchStateChange((current) => ({
                ...current,
                page: current.page + 1,
              }))
            }
            aria-label={copy.next}
            disabled={
              groupedSearchActive ? !groupHasMore : page * pageSize >= wordTotal
            }
            className={
              approved
                ? workspace.button
                : "rounded-full border border-slate-300 px-3 py-1 font-semibold disabled:opacity-50 dark:border-slate-700"
            }
          >
            {approved ? <ChevronRight size={18} aria-hidden="true"/> : copy.next}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div
      className={
        approved
          ? `${theme.theme} ${workspace.shell}`
          : "relative flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900/70"
      }
      data-colour-mode={approved ? "app" : undefined}
    >
      <div className={approved ? workspace.columns : "flex min-h-0 flex-1"}>
        {results}
        <aside
          className={
            approved
              ? workspace.detail
              : "hidden w-[380px] shrink-0 border-l border-slate-100 lg:block dark:border-slate-800"
          }
        >
          {detailSelection ? (
            <div className="flex h-full min-h-0 flex-col">
              {approved ? (
                <div className={detailEntryInCurrentResults ? workspace.srOnly : workspace.detailNotice}>
                  <h2>{copy.details}</h2>
                  {!detailEntryInCurrentResults ? <p>{copy.retainedEntry}</p> : null}
                </div>
              ) : (
              <div className="border-b border-slate-100 bg-slate-50 px-5 py-2 text-xs dark:border-slate-800 dark:bg-slate-900">
                <div className="font-semibold text-slate-700 dark:text-slate-200">
                  {copy.details}
                </div>
                {!detailEntryInCurrentResults ? (
                  <div className="mt-0.5 text-slate-500 dark:text-slate-400">
                    {copy.retainedEntry}
                  </div>
                ) : null}
              </div>
              )}
              <div className="flex min-h-0 flex-1 flex-col">
                <WordDetailsCloseProvider onClose={() => updateSearchState({detailSelection:null,selectedHeadwordGroupId:null,mobileDetailOpen:false})} interfaceLanguage={interfaceLanguage}>
                <LibraryWordDetail
                  entryId={detailSelection.entryId}
                  initialGroup={selectedGroupResult?.group}
                  headword={detailSelection.headword}
                  contentLanguageCode={detailSelection.contentLanguageCode}
                  translationTargetLanguageCode={translationLang}
                  interfaceLanguage={interfaceLanguage}
                  userId={userId}
                  userLists={userLists}
                  onListsUpdated={async () => {
                    searchFreshRef.current = null;
                    await reloadLists();
                    if (useViewedListFilter || query.trim() || (approved && materialEnabled)) {
                      void runSearch(true);
                    }
                    notifyListsUpdated();
                  }}
                  onOpenListMembership={onOpenListMembership}
                  onTrainWord={onTrainWord}
                  onCopyToUserDictionary={handleCopyToUserDictionary}
                  viewport="desktop"
                />
                </WordDetailsCloseProvider>
              </div>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center px-6 text-center text-sm text-slate-500 dark:text-slate-400">
              {copy.selectWord}
            </div>
          )}
        </aside>
      </div>

      <div className={approved ? workspace.mobileDetail : "lg:hidden"}>
        <WordDetailDrawer
          selection={detailSelection}
          initialGroup={selectedGroupResult?.group}
          open={mobileDetailOpen && Boolean(detailSelection)}
          onClose={() => updateSearchState({ mobileDetailOpen: false })}
          userId={userId}
          contentLanguageCode={searchLanguage}
          translationLang={translationLang}
          interfaceLanguage={interfaceLanguage}
          userLists={userLists}
          onListsUpdated={async () => {
            searchFreshRef.current = null;
            await reloadLists();
            if (useViewedListFilter || query.trim() || (approved && materialEnabled)) {
              void runSearch(true);
            }
            notifyListsUpdated();
          }}
          onOpenListMembership={onOpenListMembership}
          onTrainWord={onTrainWord}
          onCopyToUserDictionary={handleCopyToUserDictionary}
        />
      </div>
    </div>
  );
}
