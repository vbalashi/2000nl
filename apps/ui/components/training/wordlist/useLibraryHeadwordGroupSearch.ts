"use client";

import { useCallback, useMemo, useRef } from "react";
import type { Dispatch, SetStateAction } from "react";
import { fetchPlatformV2LibraryGroupPage } from "@/lib/platform/platformV2LibraryClient";
import type { DictionarySearchTabState } from "./dictionarySearchTabState";
import {
  buildLibraryHeadwordGroupResults,
  type LibraryHeadwordGroupResult,
} from "./libraryHeadwordGroupResults";

type Input = {
  state: DictionarySearchTabState;
  setState: Dispatch<SetStateAction<DictionarySearchTabState>>;
  contentLanguageCode: string;
  translationLanguageCode: string | null;
  dictionaryId: string | null;
};

export function useLibraryHeadwordGroupSearch({
  state,
  setState,
  contentLanguageCode,
  translationLanguageCode,
  dictionaryId,
}: Input) {
  const requestSequenceRef = useRef(0);
  const groupCursor = state.groupPageCursors[state.page - 1] ?? null;
  const selectedGroupResult = useMemo(
    () =>
      state.groupResults.find(
        (result) => result.headwordGroupId === state.selectedHeadwordGroupId,
      ) ?? null,
    [state.groupResults, state.selectedHeadwordGroupId],
  );

  const beginSearch = useCallback(() => {
    requestSequenceRef.current += 1;
    return requestSequenceRef.current;
  }, []);

  const isCurrentSearch = useCallback(
    (requestId: number) => requestSequenceRef.current === requestId,
    [],
  );

  const clearGroupSearch = useCallback(() => {
    setState((current) => ({
      ...current,
      groupResults: [],
      groupPageCursors: [null],
      groupHasMore: false,
      selectedHeadwordGroupId: null,
    }));
  }, [setState]);

  const runGroupSearch = useCallback(
    async (query: string, requestId: number) => {
      const result = await fetchPlatformV2LibraryGroupPage({
        query,
        cardTypeId: "word-to-definition",
        contentLanguageCode,
        translationTargetLanguageCode:
          translationLanguageCode === "off" ? null : translationLanguageCode,
        cursor: groupCursor,
      });
      if (!isCurrentSearch(requestId)) return false;

      const nextGroups = buildLibraryHeadwordGroupResults(result.groups).filter(
        (group) =>
          !dictionaryId ||
          group.group.dictionary.dictionaryId === dictionaryId,
      );
      setState((current) => {
        const nextCursors = current.groupPageCursors.slice(0, current.page);
        nextCursors[current.page] = result.nextGroupCursor;
        const selectedStillVisible = nextGroups.find(
          (group) =>
            group.headwordGroupId === current.selectedHeadwordGroupId,
        );
        const selected = selectedStillVisible ?? nextGroups[0] ?? null;
        return {
          ...current,
          groupResults: nextGroups,
          groupPageCursors: nextCursors,
          groupHasMore: Boolean(result.nextGroupCursor),
          selectedHeadwordGroupId:
            current.detailEntry && !selectedStillVisible
              ? current.selectedHeadwordGroupId
              : selected?.headwordGroupId ?? null,
          wordResults: [],
          wordTotal: nextGroups.length,
          detailEntry: current.detailEntry ?? selected?.detailEntry ?? null,
        };
      });
      return true;
    },
    [
      contentLanguageCode,
      dictionaryId,
      groupCursor,
      isCurrentSearch,
      setState,
      translationLanguageCode,
    ],
  );

  const openGroupDetail = useCallback(
    (result: LibraryHeadwordGroupResult) => {
      setState((current) => ({
        ...current,
        selectedHeadwordGroupId: result.headwordGroupId,
        detailEntry: result.detailEntry,
        mobileDetailOpen: true,
      }));
    },
    [setState],
  );

  return {
    beginSearch,
    clearGroupSearch,
    isCurrentSearch,
    openGroupDetail,
    runGroupSearch,
    selectedGroupResult,
  };
}
