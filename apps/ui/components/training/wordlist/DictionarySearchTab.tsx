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
import { AccountLibraryFilters } from "@/components/practice/library/AccountLibraryFilters";
import { EMPTY_LIBRARY_ENTRY_FILTERS } from "@/lib/platform/librarySearchScope";
import { LIBRARY_PART_LABELS } from "@/components/practice/library/LibraryFilters";
import theme from "@/components/practice/ui/practiceTheme.module.css";
import workspace from "@/components/practice/library/libraryWorkspace.module.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  fetchAvailableDictionarySources,
  fetchAvailableLearningLanguages,
  fetchDictionaryEntryById,
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
import { useLibrarySearchLifecycle } from "./useLibrarySearchLifecycle";
import type { LibraryHeadwordGroupResult } from "./libraryHeadwordGroupResults";
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
  onTrainWord?: (wordId: string) => void;
  autoFocusQuery?: boolean;
  searchState: DictionarySearchTabState;
  onSearchStateChange: React.Dispatch<
    React.SetStateAction<DictionarySearchTabState>
  >;
};

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
  onTrainWord,
  autoFocusQuery,
  searchState,
  onSearchStateChange,
}: Props) {

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
  const [availableLanguages, setAvailableLanguages] = useState<
    AvailableLearningLanguage[]
  >([]);
  const [dictionarySources, setDictionarySources] = useState<
    AvailableDictionarySource[]
  >([]);
  const queryRef = useRef<HTMLInputElement | null>(null);
  const latestDetailRequestRef = useRef(0);
  const pageSize = LIBRARY_PAGE_SIZE;
  const updateSearchState = useCallback(
    (patch: Partial<DictionarySearchTabState>) => {
      onSearchStateChange((current) => ({ ...current, ...patch }));
    },
    [onSearchStateChange],
  );

  const searchEnabled = open || preload;
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
  const selectedGroupResult = useMemo(
    () =>
      groupResults.find(
        (result) => result.headwordGroupId === selectedHeadwordGroupId,
      ) ?? null,
    [groupResults, selectedHeadwordGroupId],
  );
  const projectGroupSelection = useCallback(
    (
      current: DictionarySearchTabState,
      nextGroups: LibraryHeadwordGroupResult[],
    ) => {
      const selectedStillVisible = nextGroups.find(
        (group) => group.headwordGroupId === current.selectedHeadwordGroupId,
      );
      const selected = selectedStillVisible ?? nextGroups[0] ?? null;
      return {
        selectedHeadwordGroupId:
          current.detailSelection && !selectedStillVisible
            ? current.selectedHeadwordGroupId
            : (selected?.headwordGroupId ?? null),
        detailSelection:
          current.detailSelection ??
          (selected
            ? {
                entryId: selected.selectedEntryId,
                headword: selected.headword,
                contentLanguageCode:
                  selected.group.dictionary.sourceLanguageCode,
              }
            : null),
      };
    },
    [],
  );
  const {
    loading: searchLoading,
    error: searchError,
    hasCurrentResults,
    runSearch,
    refresh: refreshSearch,
    invalidateFreshness,
  } = useLibrarySearchLifecycle({
    state: searchState,
    setState: onSearchStateChange,
    open,
    readiness: {
      active: searchEnabled,
      ready: searchMaterialReady,
      materialEnabled,
      defaultFilters: materialEnabled ? EMPTY_LIBRARY_ENTRY_FILTERS : undefined,
    },
    scope: {
      userId,
      contentLanguageCode: searchLanguage,
      translationLanguageCode: translationLang,
      dictionaryId,
      query,
      page,
      collectionId: useViewedListFilter ? viewedListId : null,
      collectionType: useViewedListFilter ? viewedList?.type ?? "curated" : null,
      materialRevision: material?.revision,
    },
    copy,
    projectGroupSelection,
  });
  const openGroupDetail = useCallback(
    (result: LibraryHeadwordGroupResult) => {
      updateSearchState({
        selectedHeadwordGroupId: result.headwordGroupId,
        detailSelection: {
          entryId: result.selectedEntryId,
          headword: result.headword,
          contentLanguageCode: result.group.dictionary.sourceLanguageCode,
        },
        mobileDetailOpen: true,
      });
    },
    [updateSearchState],
  );
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
    ? viewedListName
    : sourceLabel;
  const groupedSearchActive = !useViewedListFilter;
  const resultCountLabel =
    query.trim() || useViewedListFilter || (materialEnabled)
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
      : null;
  const emptyHeading = useViewedListFilter
    ? copy.emptyCollection
    : query.trim() || (materialEnabled)
      ? copy.noWords
      : copy.emptyQuery;
  const emptyDescription = useViewedListFilter
    ? formatUiMessage(copy.emptyCollectionHint, { name: viewedListName })
    : query.trim() || (materialEnabled)
      ? formatUiMessage(copy.noResultsHint, { source: sourceLabel })
      : copy.emptyQueryHint;

  const results = (
    <div className={`flex min-h-0 min-w-0 flex-1 flex-col ${workspace.listPane}`}>
      <div
        className={
          `${workspace.toolbar} space-y-3`
        }
      >
        <div className={materialEnabled ? workspace.searchRow : undefined}>
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
              workspace.input
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
              className={workspace.clearSearch}
            >
              <span className="sr-only">{copy.clearSearch}</span>x
            </button>
          ) : null}
        </div>
        {materialEnabled && <button type="button" className={workspace.filterButton}
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
            refreshSearch();
            setFiltersOpen(false);
          }}/>}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div
            className={
              workspace.scope
            }
          >
            {languageDisplayName(interfaceLanguage, searchLanguage)} ·{" "}
            {resultScopeLabel}
            {!useViewedListFilter && searchState.entryFilters?.parts.map(part=>
              <React.Fragment key={part}> · {getUiMessages(interfaceLanguage).builder.parts[LIBRARY_PART_LABELS[part]]}
                {part === "noun" && searchState.entryFilters?.article ? ` (${searchState.entryFilters.article})` : ""}
              </React.Fragment>)}
          </div>
          {hasCurrentResults && <span className={workspace.scope}>{formatUiCount(interfaceLanguage,
            useViewedListFilter ? wordTotal : (groupTotal ?? groupResults.length),copy,"matchingGroup")}</span>}
        </div>

        {useViewedListFilter && (viewedList?.unavailable_source_count ?? 0) > 0 ? (
          <p
            className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100"
            role="status"
          >
            {copy.unavailableCollectionSource}
          </p>
        ) : null}

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
        {!(materialEnabled) && (<>
        <div
          className={
            workspace.scopeControls
          }
        >
          <div
            className={
              workspace.caption
            }
          >
            {copy.searchScope}
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <label
              className={
                workspace.label
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
                  workspace.field
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
                workspace.label
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
                  workspace.field
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

      </div>

      <div
        className={
          workspace.results
        }
      >
        {searchError ? (
          <div
            role="alert"
            className={workspace.error}
          >
            <p>{searchError}</p>
            <button
              type="button"
              className={workspace.button}
              onClick={() => void runSearch(true)}
            >
              {copy.retry}
            </button>
          </div>
        ) : null}
        {searchError && !hasCurrentResults ? null : searchLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div
                key={index}
                className={workspace.skeleton}
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
        ) : wordResults.length ? (
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
        ) : (
          <div className={workspace.empty}>
            <div className={workspace.emptyTitle}>
              {emptyHeading}
            </div>
            <div className={workspace.notice}>
              {emptyDescription}
            </div>
            {hasResettableLookupState ? (
              <button
                type="button"
                onClick={resetLookup}
                className={workspace.button}
              >
                {copy.clearSearch}
              </button>
            ) : null}
          </div>
        )}
      </div>

      {hasCurrentResults && <div
        data-testid={
          groupedSearchActive ? "library-group-pagination" : undefined
        }
        className={
          workspace.pagination
        }
      >
        {<span className={workspace.pageIndicator}>{number(page)} / {number(Math.max(1,Math.ceil((useViewedListFilter ? wordTotal : (groupTotal ?? 0))/pageSize)))}</span>}
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
              workspace.button
            }
          >
            {<ChevronLeft size={18} aria-hidden="true"/>}
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
              workspace.button
            }
          >
            {<ChevronRight size={18} aria-hidden="true"/>}
          </button>
        </div>
      </div>}
    </div>
  );

  return (
    <div
      className={
        `${theme.theme} ${workspace.shell}`
      }
      data-colour-mode={"app"}
    >
      <div className={workspace.columns}
        data-detail-open={detailSelection ? "true" : "false"}>
        {results}
        <aside
          className={
            workspace.detail
          }
        >
          {detailSelection ? (
            <div className="flex h-full min-h-0 flex-col">
              {(
                <div className={detailEntryInCurrentResults ? workspace.srOnly : workspace.detailNotice}>
                  <h2>{copy.details}</h2>
                  {!detailEntryInCurrentResults ? <p>{copy.retainedEntry}</p> : null}
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
                    invalidateFreshness();
                    await reloadLists();
                    if (useViewedListFilter || query.trim() || (materialEnabled)) {
                      void runSearch(true);
                    }
                    notifyListsUpdated();
                  }}
                  onOpenListMembership={onOpenListMembership}
                  onTrainWord={onTrainWord}
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

      <div className={workspace.mobileDetail}>
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
            invalidateFreshness();
            await reloadLists();
            if (useViewedListFilter || query.trim() || (materialEnabled)) {
              void runSearch(true);
            }
            notifyListsUpdated();
          }}
          onOpenListMembership={onOpenListMembership}
          onTrainWord={onTrainWord}
        />
      </div>
    </div>
  );
}
