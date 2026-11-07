"use client";
import {formatLibraryCounts} from "@/lib/platform/libraryCountLabel";
import { languageAutonym } from "@/lib/languages/languageDisplayName";
import { localizedField } from "@/lib/i18n/catalog";

import {useRecentLibraryScopes} from "./useRecentLibraryScopes";
import {recentLibraryScopeKey,type RecentLibraryScope} from "./recentLibraryScopes";
import {materialKindSummary} from "@/components/practice/vocabulary/MaterialKindSelection";
import {localizedSection} from "@/lib/i18n/catalog";
import {WordsBulkDialog} from "./WordsBulkDialog";
import {emptyBulkArticleSelection,reconcileBulkArticleSelection,setBulkArticlesSelected} from "./bulkArticleSelection";
import {ActionMenu} from "@/components/practice/ui/ActionMenu";
import {LibrarySortControl} from "@/components/practice/library/LibrarySortControl";
import {librarySelectionToTraining,type LibraryTrainingHandoff} from "@/lib/vocabulary/libraryTrainingHandoff";
import {vocabularySelectionActive} from "@/lib/vocabulary/selection";
import {useOnboardingQueryLocked} from "@/components/onboarding/Onboarding";
import { dictionarySourceProfile } from "@/lib/dictionary/sourceProfile";
import { useLibraryMaterialSelection } from "@/components/practice/material/useLibraryMaterialSelection";
import {
  formatUiMessage,
  formatUiCount,
  getPartOfSpeechLabel,
  getUiMessages,
} from "@/lib/uiMessages";

import React from "react";
import { LibraryCategoryResults } from "./LibraryCategoryResults";
import type { LibraryMaterialScope } from "@/lib/platform/librarySearchScope";
import { LibraryPresentationContext } from "@/components/practice/library/LibraryPresentationContext";
import { LIBRARY_PAGE_SIZE } from "@/lib/platform/libraryPagination";
import { SlidersHorizontal, ChevronLeft, ChevronRight, FileText, Folder, Play, Check, Layers, ListChecks, FolderPlus, X, History, RotateCcw } from "lucide-react";
import { LibraryResultList, LibraryResultRow } from "@/components/practice/library/LibraryResultList";
import { AccountLibraryFilters } from "@/components/practice/library/AccountLibraryFilters";
import {SelectedCollectionSourceStatus,collectionSourceMessage,type CollectionSourceRead} from '@/components/library/sharing/SelectedCollectionSourceStatus';
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
import { authorEntryArchiveCopy } from "@/lib/platform/authorEntryArchiveCopy";
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
  collectionSourceRead?: CollectionSourceRead;
  viewedListId: string | null;
  viewedList: WordListSummary | null;
  viewedListName: string;
  reloadLists: () => Promise<void>;
  notifyListsUpdated: () => void;
  onOpenListMembership?: (membership: EntryLearningListMembership) => void;
  onTrainSelection?:(selection:LibraryTrainingHandoff)=>void;
  onTrainWord?: (wordId: string) => void;
  autoFocusQuery?: boolean;
  searchState: DictionarySearchTabState;
  onSearchStateChange: React.Dispatch<
    React.SetStateAction<DictionarySearchTabState>
  >;
};

const languageLabel = languageAutonym;

const firstDefinition = (entry: DictionaryEntry, fallback: string) => {
  const meaning = getAllMeanings(entry.raw, fallback)[0] as
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
  return dictionarySourceProfile().displayName;
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
  collectionSourceRead,
  viewedListId: defaultViewedListId,
  viewedList: defaultViewedList,
  viewedListName: defaultViewedListName,
  reloadLists,
  notifyListsUpdated,
  onOpenListMembership,
  onTrainWord,onTrainSelection,
  autoFocusQuery,
  searchState,
  onSearchStateChange,
}: Props) {

  const [categoryTabsHost, setCategoryTabsHost] = useState<HTMLDivElement | null>(null);
  const [categoryCountHost, setCategoryCountHost] = useState<HTMLSpanElement | null>(null);
  React.useEffect(()=>{
    if(!categoryCountHost)return;
    const update=()=>setCategoryCountText(categoryCountHost.querySelector("[data-count-detail]")?.getAttribute("data-count-detail") || categoryCountHost.textContent || "");
    const observer=new MutationObserver(update);observer.observe(categoryCountHost,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:["data-count-detail"]});update();
    return ()=>observer.disconnect();
  },[categoryCountHost]);
  const categoryAppearance = "plain" as const;
  const [categoryRevision, setCategoryRevision] = useState(0);
  const [categoryBulkCount,setCategoryBulkCount]=useState<number|null>(null);
  const presentation = React.useContext(LibraryPresentationContext);
  const {
    query,
    applyListFilter,
    wordResults,
    groupResults,
    groupPageCursors,
    groupHasMore,
    groupTotal,
    meaningTotal,
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
  const viewedListId = searchState.collectionId ?? defaultViewedListId;
  const selectedSourceRead=collectionSourceRead?.collectionId===viewedListId?collectionSourceRead:undefined;
  const viewedListName = viewedList?.name ?? (searchState.collectionId ? '' : defaultViewedListName);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [countAnchor, setCountAnchor] = useState<HTMLButtonElement | null>(null);
  const [categoryCountText,setCategoryCountText]=useState("");
  const [scopeAnchor, setScopeAnchor] = useState<HTMLButtonElement | null>(null);
  const closeCount = () => { setCountAnchor(null); countAnchor?.focus({preventScroll:true}); };
  const [availableLanguages, setAvailableLanguages] = useState<
    AvailableLearningLanguage[]
  >([]);
  const [dictionarySources, setDictionarySources] = useState<
    AvailableDictionarySource[]
  >([]);
  const onboardingQueryLocked=useOnboardingQueryLocked();
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
  const categorySearchActive = materialEnabled && Boolean(query.trim());
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
  const closeAfterArchive = React.useRef(false);
  const projectGroupSelection = useCallback(
    (
      current: DictionarySearchTabState,
      nextGroups: LibraryHeadwordGroupResult[],
    ) => {
      if (closeAfterArchive.current) {
        closeAfterArchive.current = false;
        return { selectedHeadwordGroupId: null, detailSelection: null };
      }
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
  const [archiveStatus, setArchiveStatus] = React.useState(false);
  const {
    loading: searchLoading,
    error: searchError,
    hasCurrentResults,
    runSearch,
    refresh: refreshLegacySearch,
    invalidateFreshness,
  } = useLibrarySearchLifecycle({
    state: searchState,
    setState: onSearchStateChange,
    open,
    readiness: {
      active: searchEnabled && !categorySearchActive,
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
      collectionType: useViewedListFilter ? viewedList?.type ?? selectedSourceRead?.type ?? "curated" : null,
      materialRevision: material?.revision,
    },
    copy,
    projectGroupSelection,
  });
  const applyCategoryWordResults = useCallback((results: LibraryHeadwordGroupResult[]) => {
    onSearchStateChange(current => ({...current,groupResults:results,...projectGroupSelection(current,results)}));
  }, [onSearchStateChange,projectGroupSelection]);
  const refreshSearch = useCallback(() => {
    refreshLegacySearch();
    setCategoryRevision(current => current + 1);
  }, [refreshLegacySearch]);
  const categoryMaterial = useMemo<LibraryMaterialScope | undefined>(() => searchState.labelId
    ? { kind: "label", id: searchState.labelId }
    : useViewedListFilter && viewedListId ? { kind: "collection", id: viewedListId, collectionType: viewedList?.type === "user" || selectedSourceRead?.type === "user" ? "user" : "curated" }
    : undefined, [searchState.labelId, useViewedListFilter, viewedListId, viewedList?.type, selectedSourceRead?.type]);
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
      if (presentation?.filterPlacement === "panel") setFiltersOpen(false);
    },
    [updateSearchState, presentation?.filterPlacement],
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
      if (presentation?.filterPlacement === "panel") setFiltersOpen(false);

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
    [onSearchStateChange, searchLanguage, updateSearchState, userId, presentation?.filterPlacement],
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
    if (!autoFocusQuery || onboardingQueryLocked) return;
    const raf = window.requestAnimationFrame(() => {
      queryRef.current?.focus();
      queryRef.current?.select();
    });
    return () => window.cancelAnimationFrame(raf);
  }, [autoFocusQuery,onboardingQueryLocked]);

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
  const resultScopeLabel = searchState.labelId ? searchState.labelName ?? copy.allSources : useViewedListFilter
    ? viewedListName || (selectedSourceRead?collectionSourceMessage(interfaceLanguage,selectedSourceRead.status):copy.noSources)
    : sourceLabel;
  const groupedSearchActive = materialEnabled || !useViewedListFilter;
  const bulkScopeKey = JSON.stringify([userId,searchLanguage,query,searchState.searchCategory,categoryMaterial,dictionaryId,searchState.entryFilters ?? EMPTY_LIBRARY_ENTRY_FILTERS]);
  const [bulkSelection,setBulkSelection]=useState(()=>emptyBulkArticleSelection(userId,bulkScopeKey));
  const [bulkMode,setBulkMode]=useState(false);
  const [bulkAll,setBulkAll]=useState(false);
  const [bulkDialogScope,setBulkDialogScope]=useState<string|null>(null);
  const [bulkNotice,setBulkNotice]=useState<string|null>(null);
  const currentBulk=reconcileBulkArticleSelection(bulkSelection,userId,bulkScopeKey);
  const bulkCopy=getUiMessages(interfaceLanguage).wordsBulk;
  React.useEffect(()=>{setBulkSelection(emptyBulkArticleSelection(userId,bulkScopeKey));setBulkMode(false);setBulkAll(false);setBulkDialogScope(null);setBulkNotice(null);},[userId,bulkScopeKey]);
  React.useEffect(()=>{if(!bulkNotice)return;const timer=window.setTimeout(()=>setBulkNotice(null),4000);return()=>window.clearTimeout(timer);},[bulkNotice]);
  const bulkRequest=useMemo(()=>({groups:[...currentBulk.articleIds].sort(),all:bulkAll,category:categorySearchActive ? "headwords" as const : "browse" as const,query,language:searchLanguage,
    dictionaryIds:categoryMaterial ? null : dictionaryId ? [dictionaryId] : null,
    filters:searchState.entryFilters ?? EMPTY_LIBRARY_ENTRY_FILTERS,...(categoryMaterial?{material:categoryMaterial}:{})}),
    [bulkAll,currentBulk.articleIds,query,searchLanguage,dictionaryId,searchState.entryFilters,categoryMaterial,categorySearchActive]);
  const categoryHeadwords=categorySearchActive && (searchState.searchCategory ?? 'headwords')==='headwords';
  const canBulk=groupedSearchActive && (!categorySearchActive || (categoryHeadwords && categoryBulkCount!==null));
  const bulkTotal=categorySearchActive ? categoryBulkCount : groupTotal;
  const bulkCountLabel=bulkNotice ?? (bulkMode ? formatUiMessage(bulkAll ? (currentBulk.articleIds.size ? bulkCopy.allExceptShort : bulkCopy.allShort) : bulkCopy.selectedShort,{count:number(bulkAll ? (currentBulk.articleIds.size || (bulkTotal ?? 0)) : currentBulk.articleIds.size)}) : null);
  const pageIds=groupResults.filter(result=>result.meaningCount>0).map(result=>result.headwordGroupId);
  const pageSelected=pageIds.length>0 && pageIds.every(id=>bulkAll ? !currentBulk.articleIds.has(id) : currentBulk.articleIds.has(id));
  const setSelected=(ids:string[],selected:boolean)=>setBulkSelection(previous=>setBulkArticlesSelected(reconcileBulkArticleSelection(previous,userId,bulkScopeKey),ids,bulkAll ? !selected : selected));
  const {items:recentItems,ready:recentReady,remember:rememberScope}=useRecentLibraryScopes(userId);
  const historyScope=useMemo<RecentLibraryScope>(()=>({query:query.trim(),languageCode:searchLanguage,
    dictionaryId:categoryMaterial ? null : dictionaryId,collectionId:categoryMaterial?.kind==='collection'?categoryMaterial.id:null,
    collectionOwnership:categoryMaterial?.kind==='collection' ? (viewedList?.ownership==='received' || searchState.collectionOwnership==='received' ? 'received' : 'owned') : null,
    labelId:categoryMaterial?.kind==='label'?categoryMaterial.id:null,labelName:categoryMaterial?.kind==='label'?searchState.labelName ?? null:null,
    sourceName:resultScopeLabel,filters:searchState.entryFilters ?? EMPTY_LIBRARY_ENTRY_FILTERS,category:query.trim() ? searchState.searchCategory ?? 'headwords' : 'headwords'}),
    [query,searchLanguage,categoryMaterial,dictionaryId,viewedList?.ownership,searchState.collectionOwnership,searchState.labelName,resultScopeLabel,searchState.entryFilters,searchState.searchCategory]);
  const rememberHistory=useCallback(()=>{if(open && recentReady)rememberScope(historyScope);},[open,recentReady,rememberScope,historyScope]);
  React.useEffect(()=>{if(!categorySearchActive && hasCurrentResults && !searchLoading && !searchError && searchMaterialReady)rememberHistory();},[categorySearchActive,hasCurrentResults,searchLoading,searchError,searchMaterialReady,rememberHistory]);
  const historyChoices=recentItems.filter(item=>recentLibraryScopeKey(item)!==recentLibraryScopeKey(historyScope)).slice(0,5);
  const historySource=(item:RecentLibraryScope)=>item.dictionaryId || item.collectionId || item.labelId ? item.sourceName : copy.allSources;
  const historyDescription=(item:RecentLibraryScope)=>{
    const vocab=item.filters.vocabulary, text=localizedSection('vocabularySelection')[interfaceLanguage];
    const parts=item.filters.parts.map(part=>getUiMessages(interfaceLanguage).builder.parts[LIBRARY_PART_LABELS[part]]);
    const details=[copy.recentSearch,languageDisplayName(interfaceLanguage,item.languageCode),historySource(item),...parts,
      item.filters.article, vocab?.materialKinds.length ? materialKindSummary(vocab.materialKinds,interfaceLanguage) : null,
      vocab?.mode==='frequency' ? `${vocab.profile==='spoken'?text.spokenShort:text.writtenShort} ${number(vocab.from)}–${number(vocab.to)}` : null,
      vocab && vocab.meanings!=='all' ? (vocab.meanings===1?text.firstMeaning:formatUiCount(interfaceLanguage,vocab.meanings,text,'firstMeanings')) : null,
      item.query && item.category!=='headwords'?getUiMessages(interfaceLanguage).librarySearch.labels[item.category]:null];
    return details.filter(Boolean).join(' · ');
  };
  const restoreHistory=(item:RecentLibraryScope)=>{
    setScopeAnchor(null);
    onSearchStateChange({...createDictionarySearchTabState(),query:item.query,languageCode:item.languageCode,dictionaryId:item.dictionaryId,
      applyListFilter:Boolean(item.collectionId),collectionId:item.collectionId,collectionOwnership:item.collectionOwnership,
      labelId:item.labelId,labelName:item.labelName,entryFilters:item.filters,searchCategory:item.category});
    refreshSearch();
  };
  const resultCountLabel =
    query.trim() || useViewedListFilter || (materialEnabled)
      ? formatUiMessage(copy.pageScope, {
          count: formatUiCount(
            interfaceLanguage,
            !groupedSearchActive ? wordTotal : (groupTotal ?? groupResults.length),
            copy,
            !groupedSearchActive ? "entry" : "group",
          ),
          page: number(page),
          source: resultScopeLabel,
        })
      : null;
  const unresolvedSource=useViewedListFilter&&selectedSourceRead&&selectedSourceRead.status!=='ready';
  const emptyHeading = unresolvedSource ? collectionSourceMessage(interfaceLanguage,selectedSourceRead.status) : useViewedListFilter
    ? copy.emptyCollection
    : query.trim() || (materialEnabled)
      ? copy.noWords
      : copy.emptyQuery;
  const emptyDescription = unresolvedSource ? '' : useViewedListFilter
    ? formatUiMessage(copy.emptyCollectionHint, { name: viewedListName })
    : query.trim() || (materialEnabled)
      ? formatUiMessage(copy.noResultsHint, { source: resultScopeLabel })
      : copy.emptyQueryHint;

  const presentationController = {
    collections: filterCollections,
    state: searchState,
    setState: onSearchStateChange,
    openFilters: () => setFiltersOpen(true),
    closeFilters: () => setFiltersOpen(false),
    filtersOpen,
    interfaceLanguage,
  };
  const filterButton = (
    materialEnabled && <button type="button" className={workspace.filterButton}
          aria-label={copy.filters} aria-haspopup={presentation?.filterPlacement === "panel" ? undefined : "dialog"} aria-expanded={presentation ? filtersOpen : undefined} disabled={!searchMaterialReady}
          data-active={Boolean(searchState.entryFilters?.parts.length || vocabularySelectionActive(searchState.entryFilters?.vocabulary) || dictionaryId)} onClick={()=>setFiltersOpen(current=>presentation?.filterPlacement === "panel" ? !current : true)}>
          <SlidersHorizontal size={18}/>
        </button>
  );
  const filters = (
    filtersOpen && <AccountLibraryFilters category={categorySearchActive ? searchState.searchCategory ?? "headwords" : undefined} locale={interfaceLanguage} query={query} collection={viewedList} collections={filterCollections}
          value={{languageCode:searchLanguage,dictionaryId,applyListFilter,labelId:searchState.labelId,labelName:searchState.labelName,collectionId:applyListFilter ? viewedListId : null,...(searchState.entryFilters ?? EMPTY_LIBRARY_ENTRY_FILTERS)}}
          onClose={()=>setFiltersOpen(false)} onApply={draft=>{
            updateSearchState({labelId:draft.labelId ?? null,labelName:draft.labelName ?? null,languageCode:draft.languageCode,dictionaryId:draft.dictionaryId,applyListFilter:Boolean(draft.applyListFilter),collectionId:draft.collectionId ?? null,collectionOwnership:draft.applyListFilter && draft.collectionId ? (filterCollections.find(list=>list.id===draft.collectionId)?.ownership === "received" ? "received" : "owned") : null,
              entryFilters:{parts:[...draft.parts].sort(),article:draft.article,vocabulary:draft.vocabulary,sort:draft.sort},page:1,groupPageCursors:[null],groupHasMore:false,
              groupTotal:null,meaningTotal:null,groupResults:[],wordTotal:0,selectedHeadwordGroupId:null,detailSelection:null,mobileDetailOpen:false});
            refreshSearch();
            setFiltersOpen(false);
          }}/>
  );
  const results = (
    <div className={`flex min-h-0 min-w-0 flex-1 flex-col ${workspace.listPane}`}>
      <div
        className={
          `${workspace.toolbar} space-y-3`
        }
      >
        <div className={materialEnabled ? workspace.searchRow : undefined}>
        {presentation?.filterButtonSide === "left" && filterButton}
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
            readOnly={onboardingQueryLocked}
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
              disabled={onboardingQueryLocked} className={workspace.clearSearch}
            >
              <span className="sr-only">{copy.clearSearch}</span>x
            </button>
          ) : null}
        </div>
        {presentation?.filterButtonSide !== "left" && filterButton}
        {(!categorySearchActive||(searchState.searchCategory??"headwords")==="headwords")&&<LibrarySortControl language={interfaceLanguage} value={searchState.entryFilters?.sort??"alphabetical"} onChange={sort=>{updateSearchState({entryFilters:{...(searchState.entryFilters??EMPTY_LIBRARY_ENTRY_FILTERS),sort},page:1,groupPageCursors:[null],groupHasMore:false});refreshSearch();}}/>}
        {presentation?.renderSearchActions?.(interfaceLanguage)}
        </div>


        <div className={workspace.scopeRow}>
          <div className={workspace.scopeSummary}>
            <button type="button" className={`${workspace.scope} ${workspace.scopeButton}`} title={copy.scopeActions} aria-haspopup="menu" aria-expanded={Boolean(scopeAnchor)} onClick={event => setScopeAnchor(scopeAnchor ? null : event.currentTarget)}>
              {languageDisplayName(interfaceLanguage, searchLanguage)} ·{" "}
              {searchState.labelId ? <Folder size={14} aria-hidden="true" className="inline align-text-bottom"/> : useViewedListFilter ? <FileText size={14} aria-hidden="true" className="inline align-text-bottom"/> : null}{" "}{resultScopeLabel}
              {searchState.entryFilters?.parts.map(part=>
                <React.Fragment key={part}> · {getUiMessages(interfaceLanguage).builder.parts[LIBRARY_PART_LABELS[part]]}
                  {part === "noun" && searchState.entryFilters?.article ? ` (${searchState.entryFilters.article})` : ""}
                </React.Fragment>)}
            </button>

          </div>
          {scopeAnchor && <ActionMenu anchor={scopeAnchor} title={copy.scopeActions} language={interfaceLanguage} onClose={() => setScopeAnchor(null)} items={[
            {id:"reset",label:copy.resetFilters,icon:<RotateCcw size={14}/>,onSelect:()=>{setScopeAnchor(null);updateSearchState({labelId:null,labelName:null,dictionaryId:null,applyListFilter:false,collectionId:null,collectionOwnership:null,entryFilters:{...EMPTY_LIBRARY_ENTRY_FILTERS,sort:searchState.entryFilters?.sort},page:1,groupPageCursors:[null],groupHasMore:false,groupTotal:null,meaningTotal:null,groupResults:[],wordTotal:0,selectedHeadwordGroupId:null,detailSelection:null,mobileDetailOpen:false});refreshSearch();}},
            ...historyChoices.map((item,index)=>({id:`recent-${index}`,label:item.query || historySource(item),description:historyDescription(item),icon:<History size={14}/>,onSelect:()=>restoreHistory(item)})),
          ]}/>}
          {categorySearchActive && ((onTrainSelection && searchMaterialReady) || canBulk ? <button type="button" className={`${workspace.scope} ${workspace.countTrigger}`} aria-label={bulkCountLabel || categoryCountText || copy.entries} aria-haspopup="menu" aria-expanded={Boolean(countAnchor)} onClick={event=>{setBulkNotice(null);setCountAnchor(countAnchor ? null : event.currentTarget);}}><span ref={setCategoryCountHost} className={`${workspace.categoryCountContent} ${bulkCountLabel ? 'sr-only' : ''}`}/>{bulkCountLabel}</button> : <span ref={setCategoryCountHost} className={workspace.scope}/>)}

          {!categorySearchActive && hasCurrentResults && (!groupedSearchActive || groupTotal != null) && <button type="button" className={`${workspace.scope} ${workspace.countTrigger}`} aria-haspopup="menu" aria-expanded={Boolean(countAnchor)} onClick={event => {setBulkNotice(null);setCountAnchor(countAnchor ? null : event.currentTarget);}}>{bulkCountLabel ?? formatUiCount(interfaceLanguage, !groupedSearchActive ? wordTotal : (groupTotal ?? groupResults.length), getUiMessages(interfaceLanguage).librarySearch, "articleCount")}</button>}
          {countAnchor && <ActionMenu anchor={countAnchor} title={categorySearchActive ? categoryCountText : formatLibraryCounts(interfaceLanguage,!groupedSearchActive ? wordTotal : (groupTotal ?? groupResults.length),groupedSearchActive ? meaningTotal : undefined)} language={interfaceLanguage} notice={categorySearchActive ? categoryCountText : formatLibraryCounts(interfaceLanguage,!groupedSearchActive ? wordTotal : (groupTotal ?? groupResults.length),groupedSearchActive ? meaningTotal : undefined)} onClose={closeCount} items={[
            ...(onTrainSelection && searchMaterialReady ? [{id:"train",label:localizedField("libraryWordSelection", "setup")[interfaceLanguage],icon:<Play size={14}/>,onSelect:()=>{closeCount();onTrainSelection(librarySelectionToTraining({languageCode:searchLanguage,filters:searchState.entryFilters ?? EMPTY_LIBRARY_ENTRY_FILTERS,dictionaryId,labelId:searchState.labelId,labelName:searchState.labelName,collection:useViewedListFilter && viewedList ? {id:viewedList.id,type:viewedList.type} : undefined,query,category:categorySearchActive ? searchState.searchCategory ?? "headwords" : undefined}));}}] : []),
            ...(canBulk && !bulkMode ? [{id:"select",label:bulkCopy.select,icon:<Check size={15}/>,onSelect:()=>{closeCount();setBulkMode(true);}}] : []),
            ...(canBulk && !bulkMode ? [{id:"all",label:formatUiMessage(bulkCopy.selectAll,{count:number(bulkTotal ?? 0)}),description:(bulkTotal ?? 0)>2500?bulkCopy.limit:undefined,icon:<Layers size={15}/>,disabled:!bulkTotal || bulkTotal>2500,onSelect:()=>{closeCount();setBulkMode(true);setBulkAll(true);setBulkSelection(emptyBulkArticleSelection(userId,bulkScopeKey));}}] : []),
            ...(canBulk && bulkMode ? [
              ...([{id:"page",label:pageSelected?bulkCopy.clearPage:bulkCopy.selectPage,description:currentBulk.articleIds.size>=200?bulkCopy.manualLimit:undefined,icon:<ListChecks size={15}/>,disabled:!pageIds.length || ((bulkAll ? pageSelected : !pageSelected) && new Set([...currentBulk.articleIds,...pageIds]).size>200),onSelect:()=>{closeCount();setSelected(pageIds,!pageSelected);}}]),
              {id:"all",label:formatUiMessage(bulkCopy.selectAll,{count:number(bulkTotal ?? 0)}),description:(bulkTotal ?? 0)>2500?bulkCopy.limit:undefined,icon:<Layers size={15}/>,disabled:(bulkAll && !currentBulk.articleIds.size) || !bulkTotal || bulkTotal>2500,onSelect:()=>{closeCount();setBulkAll(true);setBulkSelection(emptyBulkArticleSelection(userId,bulkScopeKey));}},
              {id:"add",label:bulkCopy.add,icon:<FolderPlus size={15}/>,disabled:bulkAll ? (bulkTotal ?? 0)<=currentBulk.articleIds.size : !currentBulk.articleIds.size,onSelect:()=>{closeCount();setBulkDialogScope(bulkScopeKey);}},
              {id:"cancel",label:bulkCopy.cancel,icon:<X size={15}/>,onSelect:()=>{closeCount();setBulkMode(false);setBulkAll(false);setBulkSelection(emptyBulkArticleSelection(userId,bulkScopeKey));}},
            ] : []),
          ]}/> }
          <span className="sr-only" role="status" aria-live="polite">{bulkNotice}</span>
        </div>
        {bulkDialogScope===bulkScopeKey && (bulkAll || currentBulk.articleIds.size>0) && <WordsBulkDialog key={bulkScopeKey} userId={userId} language={interfaceLanguage} lists={userLists} selection={bulkRequest} onListsUpdated={()=>{void reloadLists();notifyListsUpdated();}} onClose={()=>setBulkDialogScope(null)} onDone={count=>{setBulkDialogScope(null);setBulkMode(false);setBulkAll(false);setBulkSelection(emptyBulkArticleSelection(userId,bulkScopeKey));setBulkNotice(formatUiMessage(bulkCopy.success,{count:number(count)}));void reloadLists();notifyListsUpdated();}}/>}
        {categorySearchActive && <div ref={setCategoryTabsHost}/> }

        {useViewedListFilter&&selectedSourceRead&&<SelectedCollectionSourceStatus read={selectedSourceRead} locale={interfaceLanguage}/>}

        {((useViewedListFilter && (viewedList?.unavailable_source_count ?? 0) > 0) || (hasCurrentResults && (searchState.unavailableEntryCount ?? 0) > 0)) ? (
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
        {categorySearchActive ? <LibraryCategoryResults onWordResults={applyCategoryWordResults} onWordCount={setCategoryBulkCount} onSearchComplete={rememberHistory}
          bulkSelected={bulkMode ? (bulkAll ? new Set(pageIds.filter(id=>!currentBulk.articleIds.has(id))) : currentBulk.articleIds) : undefined} bulkAll={bulkAll} bulkExcludedCount={currentBulk.articleIds.size} onBulkSelect={bulkMode ? (id,selected)=>{if(bulkAll && !selected && currentBulk.articleIds.size>=200)return;setSelected([id],selected);} : undefined} appearance={categoryAppearance} userId={userId} onSelectGroup={openGroupDetail} tabsHost={categoryTabsHost} countHost={categoryCountHost}
          interfaceLanguage={interfaceLanguage} query={query} languageCode={searchLanguage} dictionaryId={dictionaryId}
          filters={searchState.entryFilters ?? EMPTY_LIBRARY_ENTRY_FILTERS} material={categoryMaterial}
          materialRevision={material?.revision} refreshRevision={categoryRevision} enabled={searchEnabled && searchMaterialReady && !unresolvedSource}
          category={searchState.searchCategory ?? "headwords"} onCategoryChange={searchCategory => updateSearchState({searchCategory})}
          selectedResultKey={detailSelection?.searchResultKey} selectedId={detailSelection?.entryId} onSelect={item => updateSearchState({ selectedHeadwordGroupId:null, detailSelection:{searchResultKey:item.resultKey,entryId:item.entry.id,headword:item.entry.headword,contentLanguageCode:item.entry.languageCode ?? searchLanguage},mobileDetailOpen:true })}/> : <>
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
          <LibraryHeadwordGroupResultsList appearance={categoryAppearance}
            results={groupResults}
            interfaceLanguage={interfaceLanguage}
            selectedHeadwordGroupId={selectedHeadwordGroupId}
            bulkSelected={bulkMode ? (bulkAll ? new Set(pageIds.filter(id=>!currentBulk.articleIds.has(id))) : currentBulk.articleIds) : undefined}
            bulkAll={bulkAll}
            bulkExcludedCount={currentBulk.articleIds.size}
            onBulkSelect={bulkMode ? (id,selected)=>{if(bulkAll && !selected && currentBulk.articleIds.size>=200)return;setSelected([id],selected);} : undefined}
            onSelect={openGroupDetail}
          />
        ) : wordResults.length ? (
          <LibraryResultList appearance={categoryAppearance} language={interfaceLanguage} listing="preview" entrySelection hasDetail={Boolean(detailSelection)}
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
        </>}
      </div>

      {!categorySearchActive && hasCurrentResults && <div
        data-testid={
          groupedSearchActive ? "library-group-pagination" : undefined
        }
        className={
          workspace.pagination
        }
      >
        {<span className={workspace.pageIndicator}>{number(page)} / {number(Math.max(1,Math.ceil((!groupedSearchActive ? wordTotal : (groupTotal ?? 0))/pageSize)))}</span>}
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

  const handleOpenCopied = (copy: {entryId:string;dictionaryId:string;headword:string;contentLanguageCode:string}) => {
    material?.reload();
    updateSearchState({query:copy.headword,languageCode:copy.contentLanguageCode,dictionaryId:copy.dictionaryId,
      applyListFilter:false,collectionId:null,labelId:null,labelName:null,entryFilters:EMPTY_LIBRARY_ENTRY_FILTERS,
      detailSelection:{entryId:copy.entryId,headword:copy.headword,contentLanguageCode:copy.contentLanguageCode},
      selectedHeadwordGroupId:null,mobileDetailOpen:true,groupResults:[],wordResults:[],groupTotal:null,meaningTotal:null,wordTotal:0,
      page:1,groupPageCursors:[null],groupHasMore:false});
    invalidateFreshness();
    refreshSearch();
  };

  const handleArchived = () => {
    closeAfterArchive.current = true;
    material?.reload();
    updateSearchState({ detailSelection: null, selectedHeadwordGroupId: null, mobileDetailOpen: false,
      groupResults:[],wordResults:[],groupTotal:null,meaningTotal:null,wordTotal:0,page:1,groupPageCursors:[null],groupHasMore:false });
    invalidateFreshness();
    refreshSearch();
    void reloadLists().catch(() => undefined);
    notifyListsUpdated();
    setArchiveStatus(true);
  };

  const detail = (
        <aside
          className={
            workspace.detail
          }
        >
          {detailSelection ? (
            <div className="flex h-full min-h-0 flex-col">
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
                  currentCollection={useViewedListFilter ? viewedList ?? undefined : undefined}
                  dictionaryIdInSummary={dictionaryId}
                  onArchived={handleArchived}
                  onOpenCopied={handleOpenCopied}
                  onListsUpdated={async () => {
                    if (useViewedListFilter || searchState.labelId) invalidateFreshness();
                    await reloadLists();
                    if (useViewedListFilter || searchState.labelId) void runSearch(true);
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
  );
  const defaultColumns = (
      <div className={workspace.columns}
        data-detail-open={detailSelection ? "true" : "false"}>
        {results}
        {detail}
      </div>
  );

  return (
    <div
      className={
        `${theme.theme} ${workspace.shell}`
      }
      data-colour-mode={"app"}
    >
      {archiveStatus ? <p role="status" className="px-4 py-2 text-sm text-[var(--practice-text-muted)]">{authorEntryArchiveCopy(interfaceLanguage).success}</p> : null}
      {presentation?.renderColumns?.({controller: presentationController, results, detail, defaultColumns, filters}) ?? <>{defaultColumns}{filters}</>}

      <div className={workspace.mobileDetail}>
        <WordDetailDrawer
          selection={detailSelection}
          initialGroup={selectedGroupResult?.group}
          open={mobileDetailOpen && Boolean(detailSelection) && !presentation?.organizerOpen}
          onClose={() => updateSearchState({ mobileDetailOpen: false })}
          userId={userId}
          contentLanguageCode={searchLanguage}
          translationLang={translationLang}
          interfaceLanguage={interfaceLanguage}
          userLists={userLists}
          currentCollection={useViewedListFilter ? viewedList ?? undefined : undefined}
          dictionaryIdInSummary={dictionaryId}
                  onArchived={handleArchived}
                  onOpenCopied={handleOpenCopied}
          onListsUpdated={async () => {
            if (useViewedListFilter || searchState.labelId) invalidateFreshness();
            await reloadLists();
            if (useViewedListFilter || searchState.labelId) void runSearch(true);
            notifyListsUpdated();
          }}
          onOpenListMembership={onOpenListMembership}
          onTrainWord={onTrainWord}
        />
      </div>
    </div>
  );
}
