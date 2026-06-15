import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ActiveTrainingScope, WordListSummary, WordListType } from "@/lib/types";
import {
  fetchActiveTrainingScope,
  fetchAvailableLists,
  fetchListSummaryById,
  updateActiveTrainingScope,
} from "../trainingService";

type SelectedListScope = {
  listId: string;
  listType: WordListType;
};

type ListUpdatedCallbacks = {
  onResolvedActiveList?: (list: WordListSummary) => void;
  onPrimaryFallback?: (list: WordListSummary) => void;
};

const isDictionarySourceList = (list: WordListSummary | null | undefined) =>
  Boolean(list && list.type === "curated" && /^vandale$/i.test(list.name.trim()));

const isTrainingEligibleList = (list: WordListSummary) =>
  !isDictionarySourceList(list);

export function useTrainingActiveList(params: {
  userId?: string;
  language: string;
  showSettings: boolean;
}) {
  const { userId, language, showSettings } = params;
  const [wordListId, setWordListId] = useState<string | null>(null);
  const [wordListType, setWordListType] = useState<WordListType | null>(null);
  const [wordListLabel, setWordListLabel] = useState<string>("");
  const [activeList, setActiveList] = useState<WordListSummary | null>(null);
  const [activeTrainingScope, setActiveTrainingScope] =
    useState<ActiveTrainingScope | null>(null);
  const [availableLists, setAvailableLists] = useState<WordListSummary[]>([]);
  const [listHydrated, setListHydrated] = useState(false);
  const currentLanguageRef = useRef(language);
  const listRequestIdRef = useRef(0);

  const applyList = useCallback((list: WordListSummary) => {
    setWordListId(list.id);
    setWordListType(list.type);
    setWordListLabel(list.name);
    setActiveList(list);
  }, []);

  const clearList = useCallback(() => {
    setWordListId(null);
    setWordListType(null);
    setWordListLabel("");
    setActiveList(null);
  }, []);

  useEffect(() => {
    currentLanguageRef.current = language;
    listRequestIdRef.current += 1;
    setAvailableLists([]);
    setListHydrated(false);
    setActiveTrainingScope(null);
    clearList();
  }, [clearList, language]);

  const refreshAvailableLists = useCallback(async () => {
    if (!userId) return [];
    const requestId = ++listRequestIdRef.current;
    const requestedLanguage = language;
    const lists = await fetchAvailableLists(userId, language);
    if (
      requestId === listRequestIdRef.current &&
      requestedLanguage === currentLanguageRef.current
    ) {
      setAvailableLists(lists);
    }
    return lists;
  }, [language, userId]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const hydrateActiveList = async () => {
      setListHydrated(false);
      const active = await fetchActiveTrainingScope({
        userId,
        languageCode: language,
      });
      if (cancelled) return;
      setActiveTrainingScope(active);

      if (active.activeListId) {
        const listType = active.activeListType ?? "curated";
        const resolved = await fetchListSummaryById({
          userId,
          listId: active.activeListId,
          listType,
        });
        if (cancelled) return;

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
          setListHydrated(true);
          return;
        }

        applyList(resolved);
      } else {
        clearList();
      }
      setListHydrated(true);
    };
    void hydrateActiveList();
    return () => {
      cancelled = true;
    };
  }, [applyList, clearList, language, userId]);

  useEffect(() => {
    void refreshAvailableLists();
  }, [refreshAvailableLists, showSettings]);

  const trainingAvailableLists = useMemo(
    () => availableLists.filter(isTrainingEligibleList),
    [availableLists],
  );

  useEffect(() => {
    if (listHydrated && !wordListId && trainingAvailableLists.length > 0) {
      applyList(trainingAvailableLists[0]);
    }
  }, [applyList, trainingAvailableLists, listHydrated, wordListId]);

  const persistListChange = useCallback(
    async (list: WordListSummary) => {
      if (!isTrainingEligibleList(list)) return null;

      applyList(list);

      if (userId) {
        const result = await updateActiveTrainingScope({
          userId,
          languageCode: language,
          listId: list.id,
          listType: list.type,
        });
        if (result.scope) {
          setActiveTrainingScope(result.scope);
        }
      }

      return {
        listId: list.id,
        listType: list.type,
      } satisfies SelectedListScope;
    },
    [applyList, language, userId],
  );

  const handleListSelectValue = useCallback(
    async (value: string) => {
      const [type, id] = value.split(":") as [WordListType, string];
      const found = trainingAvailableLists.find(
        (list) => list.id === id && list.type === type,
      );
      if (!found) return null;
      return persistListChange(found);
    },
    [trainingAvailableLists, persistListChange],
  );

  const handleListsUpdated = useCallback(
    async (callbacks: ListUpdatedCallbacks = {}) => {
      if (!userId) return null;

      const lists = await fetchAvailableLists(userId, language);
      if (language === currentLanguageRef.current) {
        setAvailableLists(lists);
      }

      const active = await fetchActiveTrainingScope({
        userId,
        languageCode: language,
      });
      if (language === currentLanguageRef.current) {
        setActiveTrainingScope(active);
      }
      if (active.activeListId) {
        const listType = active.activeListType ?? "curated";
        const resolved = await fetchListSummaryById({
          userId,
          listId: active.activeListId,
          listType,
        });
        if (resolved && isTrainingEligibleList(resolved)) {
          applyList(resolved);
          callbacks.onResolvedActiveList?.(resolved);
          return resolved;
        }
      }

      const primary = lists.find(isTrainingEligibleList);
      if (primary) {
        applyList(primary);
        callbacks.onPrimaryFallback?.(primary);
        return primary;
      }

      clearList();
      return null;
    },
    [applyList, clearList, language, userId],
  );

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
      })),
    [trainingAvailableLists],
  );

  return {
    activeList,
    activeTrainingScope,
    activeListValue,
    availableLists,
    handleListSelectValue,
    handleListsUpdated,
    listHydrated,
    listOptions,
    persistListChange,
    refreshAvailableLists,
    wordListId,
    wordListLabel,
    wordListType,
  };
}
