import { isDictionarySourceList } from "@/lib/dictionary/sourceProfile";
import type {OnboardingLanguage} from '@/lib/onboardingI18n';
import {unavailableReceivedSelection} from '@/lib/collections/sharing/sharedTrainingSelection';
import { useUserEventHints } from "@/lib/events/userEventHints";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ActiveTrainingScope, WordListSummary, WordListType } from "@/lib/types";
import {
  fetchActiveTrainingScope,
  fetchAvailableLists,
  fetchListSummaryById,
  updateActiveTrainingScope,
} from "../trainingService";
import { measureTrainingTransitionStage } from "./trainingTransitionTiming";

type SelectedListScope = {
  listId: string;
  listType: WordListType;
};

type ListUpdatedCallbacks = {
  onResolvedActiveList?: (
    list: WordListSummary,
    scope: ActiveTrainingScope,
  ) => void;
  onPrimaryFallback?: (
    list: WordListSummary,
    scope: ActiveTrainingScope,
  ) => void;
};

export type TrainingListCatalogStatus = "loading" | "ready" | "error";

const isTrainingEligibleList = (list: WordListSummary) =>
  !isDictionarySourceList(list);

export function useTrainingActiveList(params: {
  userId?: string;
  language: string;
  showSettings: boolean;
  initialTransitionId?: string;
  interfaceLanguage?: OnboardingLanguage;
}) {
  const { userId, language, showSettings, initialTransitionId,interfaceLanguage="en" } = params;
  const [wordListId, setWordListId] = useState<string | null>(null);
  const [wordListType, setWordListType] = useState<WordListType | null>(null);
  const [wordListLabel, setWordListLabel] = useState<string>("");
  const [activeList, setActiveList] = useState<WordListSummary | null>(null);
  const [activeTrainingScope, setActiveTrainingScope] =
    useState<ActiveTrainingScope | null>(null);
  const [readableLists, setReadableLists] = useState<WordListSummary[]>([]);
  const [listCatalogStatus, setListCatalogStatus] =
    useState<TrainingListCatalogStatus>("loading");
  const [scopeReadError,setScopeReadError]=useState<string|null>(null);
  const [catalogOwner, setCatalogOwner] = useState<{userId: string; language: string} | null>(null);
  const [listHydrated, setListHydrated] = useState(false);
  const [hydratedLanguage, setHydratedLanguage] = useState<string | null>(null);
  const currentLanguageRef = useRef(language);
  const listRequestIdRef = useRef(0);
  const scopeRefreshIdRef = useRef(0);
  const languageGenerationRef = useRef(0);
  const initialHydrationTransitionIdRef = useRef(initialTransitionId);

  const applyList = useCallback((list: WordListSummary) => {
    setWordListId(list.id);
    setWordListType(list.type);
    setWordListLabel(list.name);
    setActiveList(list);
    if(list.ownership==='received')setReadableLists(current=>[...current.filter(row=>row.id!==list.id||row.type!==list.type),list]);
  }, []);

  const applyUnavailableSelection=useCallback((scope:ActiveTrainingScope)=>{
    const unavailable=unavailableReceivedSelection(scope,interfaceLanguage);if(unavailable)applyList(unavailable);
  },[applyList,interfaceLanguage]);
  const pendingSelection=useRef<{scope:string}|null>(null);
  const [savingSelection,setSavingSelection]=useState<{scope:string}|null>(null);
  const selectionScope=useRef('');const nextSelectionScope=JSON.stringify([userId,language]);
  if(selectionScope.current!==nextSelectionScope){selectionScope.current=nextSelectionScope;pendingSelection.current=null;}
  const catalogAbort=useRef<AbortController|null>(null);
  useEffect(()=>()=>catalogAbort.current?.abort(),[userId,language]);
  const clearList = useCallback(() => {
    setWordListId(null);
    setWordListType(null);
    setWordListLabel("");
    setActiveList(null);
  }, []);

  useEffect(() => {
    currentLanguageRef.current = language;
    listRequestIdRef.current += 1;
    scopeRefreshIdRef.current += 1;
    languageGenerationRef.current += 1;
    setReadableLists([]);
    setListCatalogStatus("loading");
    setCatalogOwner(null);
    setListHydrated(false);
    setHydratedLanguage(null);
    setActiveTrainingScope(null);
    clearList();
  }, [clearList, language, userId]);

  const refreshAvailableLists = useCallback(async () => {
    if (!userId) return [];
    const requestId = ++listRequestIdRef.current;
    const requestedLanguage = language;
    // Navigation revalidates the same catalog; keep usable setup visible meanwhile.
    // Owner/language changes reset status to loading in the scoping effect above.
    setListCatalogStatus((current) => current === "ready" ? "ready" : "loading");
    catalogAbort.current?.abort();const abort=new AbortController();catalogAbort.current=abort;
    try {
      const owned = await fetchAvailableLists(userId, language);
      const lists=owned;
      if (
        requestId === listRequestIdRef.current &&
        requestedLanguage === currentLanguageRef.current
      ) {
        setReadableLists(current=>[...lists,...current.filter(row=>row.ownership==='received'&&!lists.some(owned=>owned.id===row.id&&owned.type===row.type))]);
        setCatalogOwner({userId, language: requestedLanguage});
        setListCatalogStatus("ready");
      }
      return lists;
    } catch {
      if (
        requestId === listRequestIdRef.current &&
        requestedLanguage === currentLanguageRef.current
      ) {
        // An unavailable catalog is not an empty catalog. Keep the last
        // successful snapshot so callers cannot revoke a saved run because
        // a transient request failed.
        setCatalogOwner({userId, language: requestedLanguage});
        setListCatalogStatus("error");
      }
      return [];
    }
  }, [language, userId]);

  const scopeHintRefresh=useRef<(()=>Promise<unknown>)|null>(null);
  useUserEventHints(userId,["collections.changed"],async()=>{if(scopeHintRefresh.current)await scopeHintRefresh.current();else await refreshAvailableLists();});
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const hydrateActiveList = async () => {
      setListHydrated(false);
      setHydratedLanguage(null);
      let active:ActiveTrainingScope;
      try{active=await fetchActiveTrainingScope({userId,languageCode:language});}
      catch{if(!cancelled)setScopeReadError(JSON.stringify([userId,language]));return;}
      if(cancelled)return;
      setScopeReadError(null);
      setActiveTrainingScope(active);

      if (active.activeListId) {
        if(active.activeListOwnership==='received'&&!active.isValid){applyUnavailableSelection(active);setHydratedLanguage(language);setListHydrated(true);return;}
        const listType = active.activeListType ?? "curated";
        const resolved = await fetchListSummaryById({
          userId,
          listId: active.activeListId,
          listType,
        });
        if (cancelled) return;

        if (!resolved && active.activeListOwnership==='received'){applyUnavailableSelection(active);setHydratedLanguage(language);setListHydrated(true);return;}
        if (!resolved) {
          await updateActiveTrainingScope({
            userId,
            languageCode: language,
            listId: null,
            listType: null,
          });
          setActiveTrainingScope((current) =>
            current ? { ...current, activeListId: null, activeListType: null } : current,
          );
          clearList();
          setHydratedLanguage(language);
          setListHydrated(true);
          return;
        }

        if (!isTrainingEligibleList(resolved)) {
          await updateActiveTrainingScope({
            userId,
            languageCode: language,
            listId: null,
            listType: null,
          });
          setActiveTrainingScope((current) =>
            current ? { ...current, activeListId: null, activeListType: null } : current,
          );
          clearList();
          setHydratedLanguage(language);
          setListHydrated(true);
          return;
        }

        applyList(resolved);
      } else {
        clearList();
      }
      setHydratedLanguage(language);
      setListHydrated(true);
    };
    const hydrationTransitionId = initialHydrationTransitionIdRef.current;
    initialHydrationTransitionIdRef.current = undefined;
    void (hydrationTransitionId
      ? measureTrainingTransitionStage(
          hydrationTransitionId,
          "training.active-scope-hydration",
          hydrateActiveList,
        )
      : hydrateActiveList());
    return () => {
      cancelled = true;
    };
  }, [applyList, applyUnavailableSelection, clearList, language, userId]);

  useEffect(() => {
    void refreshAvailableLists();
  }, [refreshAvailableLists, showSettings]);

  const scopedReadableLists=useMemo(()=>catalogOwner?.userId===userId&&catalogOwner?.language===language?readableLists:[],[catalogOwner,userId,language,readableLists]);
  const trainingAvailableLists = useMemo(
    () => scopedReadableLists.filter(isTrainingEligibleList),
    [scopedReadableLists],
  );

  const resolveListValue = useCallback(
    (value: string) => {
      const [type, id] = value.split(":") as [WordListType, string];
      return (
        trainingAvailableLists.find(
          (list) => list.id === id && list.type === type,
        ) ?? null
      );
    },
    [trainingAvailableLists],
  );

  useEffect(() => {
    if (listHydrated && !wordListId && trainingAvailableLists.length > 0) {
      applyList(trainingAvailableLists[0]);
    }
  }, [applyList, trainingAvailableLists, listHydrated, wordListId]);

  const persistListChange = useCallback(
    async (
      list: WordListSummary,
      scopeOverrides: { activeScenario?: string } = {},
    ) => {
      const scope=selectionScope.current;
      if (!isTrainingEligibleList(list)||pendingSelection.current?.scope===scope) return null;
      const lease={scope};pendingSelection.current=lease;setSavingSelection(lease);
      try{

      if(list.ownership==='received'&&userId){
        const expected=selectionScope.current;
        const result=await updateActiveTrainingScope({userId,languageCode:language,listId:list.id,listType:list.type,activeScenario:scopeOverrides.activeScenario});
        if(pendingSelection.current!==lease||selectionScope.current!==expected||result.error||!result.scope?.isValid||result.scope.activeListId!==list.id||result.scope.activeListType!==list.type||result.scope.languageCode!==language)return null;
        setActiveTrainingScope(result.scope);applyList(list);return {listId:list.id,listType:list.type} satisfies SelectedListScope;
      }
      applyList(list);

      if (userId) {
        const result = await updateActiveTrainingScope({
          userId,
          languageCode: language,
          listId: list.id,
          listType: list.type,
          activeScenario: scopeOverrides.activeScenario,
        });
        if (result.scope) {
          setActiveTrainingScope(result.scope);
        }
      }

      return {
        listId: list.id,
        listType: list.type,
      } satisfies SelectedListScope;
      }finally{if(pendingSelection.current===lease){pendingSelection.current=null;setSavingSelection(null);}}
    },
    [applyList, language, userId],
  );

  const handleListsUpdated = useCallback(
    async (callbacks: ListUpdatedCallbacks = {}) => {
      if (!userId) return null;
      // The authoritative post-mutation snapshot supersedes any older
      // list-only query, while later list-only observations remain allowed.
      listRequestIdRef.current += 1;
      const refreshId = ++scopeRefreshIdRef.current;
      const languageGeneration = languageGenerationRef.current;
      const requestedLanguage = language;
      const isCurrentRequest = () =>
        refreshId === scopeRefreshIdRef.current &&
        languageGeneration === languageGenerationRef.current &&
        requestedLanguage === currentLanguageRef.current;

      catalogAbort.current?.abort();const abort=new AbortController();catalogAbort.current=abort;
      let lists: WordListSummary[];
      try {
        const owned=await fetchAvailableLists(userId,language);
        lists=owned;
      } catch {
        if (isCurrentRequest()) {
          setCatalogOwner({userId, language: requestedLanguage});
          setListCatalogStatus("error");
        }
        return null;
      }
      if (!isCurrentRequest()) return null;
      setReadableLists(current=>[...lists,...current.filter(row=>row.ownership==='received'&&!lists.some(owned=>owned.id===row.id&&owned.type===row.type))]);
      setCatalogOwner({userId, language: requestedLanguage});
      setListCatalogStatus("ready");

      let active:ActiveTrainingScope;
      try{active=await fetchActiveTrainingScope({userId,languageCode:language});}
      catch{if(isCurrentRequest())setScopeReadError(JSON.stringify([userId,language]));return null;}
      if(!isCurrentRequest())return null;
      setScopeReadError(null);
      setHydratedLanguage(language);setListHydrated(true);
      setActiveTrainingScope(active);
      if (active.activeListId) {
        if(active.activeListOwnership==='received'&&!active.isValid){applyUnavailableSelection(active);return null;}
        const listType = active.activeListType ?? "curated";
        const resolved = await fetchListSummaryById({
          userId,
          listId: active.activeListId,
          listType,
        });
        if (!isCurrentRequest()) return null;
        if(!resolved&&active.activeListOwnership==='received'){applyUnavailableSelection(active);return null;}
        if (resolved && isTrainingEligibleList(resolved)) {
          applyList(resolved);
          callbacks.onResolvedActiveList?.(resolved, active);
          return resolved;
        }
      }

      const primary = lists.find(isTrainingEligibleList);
      if (primary) {
        applyList(primary);
        callbacks.onPrimaryFallback?.(primary, active);
        return primary;
      }

      clearList();
      return null;
    },
    [applyList, applyUnavailableSelection, clearList, language, userId],
  );

  scopeHintRefresh.current=handleListsUpdated;
  const activeListValue = wordListId
    ? `${wordListType ?? "curated"}:${wordListId}`
    : trainingAvailableLists[0]
      ? `${trainingAvailableLists[0].type}:${trainingAvailableLists[0].id}`
      : "";

  const listOptions = useMemo(
    () =>
      trainingAvailableLists.map((list) => ({
        value: `${list.type}:${list.id}`,
        label: list.name,
        ...(list.ownership?{ownership:list.ownership}:{}),
        ...(list.ownership==='received'&&list.available_item_count===0?{disabled:true}:{}),
      })),
    [trainingAvailableLists],
  );

  const editableLists=useMemo(()=>scopedReadableLists.filter(list=>list.ownership!=="received"),[scopedReadableLists]);
  const rememberTrainingReferences=useCallback((ids:string[],rows:WordListSummary[])=>{
    const requested=new Set(ids);setReadableLists(current=>[...current.filter(row=>row.ownership!=='received'||!requested.has(row.id)),...rows.filter(row=>row.ownership==='received')]);
  },[]);
  return {
    rememberTrainingReferences,
    selectionSaving:Boolean(savingSelection&&savingSelection===pendingSelection.current&&savingSelection.scope===selectionScope.current),
    activeList,
    activeTrainingScope,
    activeListValue,
    availableLists: editableLists,
    readableLists: scopedReadableLists,
    handleListsUpdated,
    hydratedLanguage,
    // A new owner/language must never observe the previous catalogue as ready,
    // including the render before the scoping effect clears local state.
    listCatalogStatus: scopeReadError===JSON.stringify([userId,language])?"error" as const:catalogOwner?.userId === userId && catalogOwner?.language === language ? listCatalogStatus : "loading" as TrainingListCatalogStatus,
    listHydrated,
    listOptions,
    persistListChange,
    refreshAvailableLists,
    applyListLocal: applyList,
    resolveListValue,
    wordListId,
    wordListLabel,
    wordListType,
  };
}
