import { useCallback, useEffect, useMemo, useState } from "react";
import type { WordListSummary, WordListType } from "@/lib/types";
import {
  fetchActiveList,
  fetchAvailableLists,
  fetchListSummaryById,
  updateActiveList,
} from "../trainingService";

type SelectedListScope = {
  listId: string;
  listType: WordListType;
};

type ListUpdatedCallbacks = {
  onResolvedActiveList?: (list: WordListSummary) => void;
  onPrimaryFallback?: (list: WordListSummary) => void;
};

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
  const [availableLists, setAvailableLists] = useState<WordListSummary[]>([]);
  const [listHydrated, setListHydrated] = useState(false);

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

  const refreshAvailableLists = useCallback(async () => {
    if (!userId) return [];
    const lists = await fetchAvailableLists(userId, language);
    setAvailableLists(lists);
    return lists;
  }, [language, userId]);

  useEffect(() => {
    if (!userId) return;
    const hydrateActiveList = async () => {
      const active = await fetchActiveList(userId);
      if (active.listId) {
        const listType = active.listType ?? "curated";
        const resolved = await fetchListSummaryById({
          userId,
          listId: active.listId,
          listType,
        });

        if (!resolved) {
          await updateActiveList({
            userId,
            listId: null,
            listType: null,
          });
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
  }, [applyList, clearList, userId]);

  useEffect(() => {
    void refreshAvailableLists();
  }, [refreshAvailableLists, showSettings]);

  useEffect(() => {
    if (listHydrated && !wordListId && availableLists.length > 0) {
      applyList(availableLists[0]);
    }
  }, [applyList, availableLists, listHydrated, wordListId]);

  const persistListChange = useCallback(
    async (list: WordListSummary) => {
      applyList(list);

      if (userId) {
        await updateActiveList({
          userId,
          listId: list.id,
          listType: list.type,
        });
      }

      return {
        listId: list.id,
        listType: list.type,
      } satisfies SelectedListScope;
    },
    [applyList, userId],
  );

  const handleListSelectValue = useCallback(
    async (value: string) => {
      const [type, id] = value.split(":") as [WordListType, string];
      const found = availableLists.find((list) => list.id === id && list.type === type);
      if (!found) return null;
      return persistListChange(found);
    },
    [availableLists, persistListChange],
  );

  const handleListsUpdated = useCallback(
    async (callbacks: ListUpdatedCallbacks = {}) => {
      if (!userId) return null;

      const lists = await fetchAvailableLists(userId, language);
      setAvailableLists(lists);

      const active = await fetchActiveList(userId);
      if (active.listId) {
        const listType = active.listType ?? "curated";
        const resolved = await fetchListSummaryById({
          userId,
          listId: active.listId,
          listType,
        });
        if (resolved) {
          applyList(resolved);
          callbacks.onResolvedActiveList?.(resolved);
          return resolved;
        }
      }

      const primary = lists[0];
      if (primary) {
        await updateActiveList({
          userId,
          listId: primary.id,
          listType: primary.type,
        });
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
    : availableLists[0]
      ? `${availableLists[0].type}:${availableLists[0].id}`
      : "";

  const listOptions = useMemo(
    () =>
      availableLists.map((list) => ({
        value: `${list.type}:${list.id}`,
        label: list.name,
      })),
    [availableLists],
  );

  return {
    activeList,
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
