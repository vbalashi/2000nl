"use client";
import type { LibraryEntryFilters } from "@/lib/platform/librarySearchScope";
import { useAccountMaterial } from "@/components/practice/material/AccountMaterialProvider";

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
  defaultFilters?: LibraryEntryFilters;
};

export function useLibraryHeadwordGroupSearch({
  state,
  setState,
  contentLanguageCode,
  translationLanguageCode,
  dictionaryId,
  defaultFilters,
}: Input) {
  const material = useAccountMaterial();
  const scoped = Boolean(material);
  const currentFilters = state.entryFilters ?? defaultFilters;
  const filterKey = currentFilters ? JSON.stringify({
    parts: [...new Set(currentFilters.parts)].sort(), article: currentFilters.article,
  }) : null;
  const filters = useMemo(() => filterKey ? JSON.parse(filterKey) as NonNullable<DictionarySearchTabState["entryFilters"]> : undefined, [filterKey]);
  const scopeKey = JSON.stringify([
    material?.userId,
    material?.snapshot?.revision,
    contentLanguageCode,
    dictionaryId,
    state.query,
    ...(filters ? [filters] : []),
  ]);
  const sameScope = !material || state.groupScopeKey === scopeKey;
  const requestSequenceRef = useRef(0);
  const groupCursor = sameScope
    ? (state.groupPageCursors[state.page - 1] ?? null)
    : null;
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
      groupTotal: null,
      selectedHeadwordGroupId: null,
    }));
  }, [setState]);

  const runGroupSearch = useCallback(
    async (query: string, requestId: number) => {
      let result;
      try {
        result = await fetchPlatformV2LibraryGroupPage({
          query,
          ...(scoped
            ? {
                libraryScope: {
                  dictionaryIds: dictionaryId ? [dictionaryId] : null,
                  ...(filters ? { filters } : {}),
                },
              }
            : {}),
          cardTypeId: "word-to-definition",
          contentLanguageCode,
          translationTargetLanguageCode:
            translationLanguageCode === "off" ? null : translationLanguageCode,
          cursor: groupCursor,
        });
      } catch (cause) {
        if (
          scoped &&
          groupCursor &&
          cause instanceof Error &&
          cause.name === "PlatformV2LibraryLookupError" &&
          "kind" in cause &&
          cause.kind === "invalid-cursor"
        ) {
          if (isCurrentSearch(requestId))
            setState((current) => ({
              ...current,
              page: 1,
              groupPageCursors: [null],
              groupHasMore: false,
              groupScopeKey: null,
            }));
          return false;
        }
        throw cause;
      }
      if (!isCurrentSearch(requestId)) return false;

      const nextGroups = buildLibraryHeadwordGroupResults(result.groups, result.librarySearch?.matchingEntryIds).filter(
        (group) =>
          scoped ||
          !dictionaryId ||
          group.group.dictionary.dictionaryId === dictionaryId,
      );
      setState((current) => {
        const previousScope = !scoped || current.groupScopeKey === scopeKey;
        const page = previousScope ? current.page : 1;
        const nextCursors = previousScope
          ? current.groupPageCursors.slice(0, page)
          : [null];
        nextCursors[page] = result.nextGroupCursor;
        const selectedStillVisible = nextGroups.find(
          (group) => group.headwordGroupId === current.selectedHeadwordGroupId,
        );
        const selected = selectedStillVisible ?? nextGroups[0] ?? null;
        return {
          ...current,
          groupResults: nextGroups,
          page,
          groupScopeKey: scopeKey,
          groupPageCursors: nextCursors,
          groupHasMore: Boolean(result.nextGroupCursor),
          selectedHeadwordGroupId:
            current.detailSelection && !selectedStillVisible
              ? current.selectedHeadwordGroupId
              : (selected?.headwordGroupId ?? null),
          wordResults: [],
          wordTotal: result.librarySearch?.totalGroups ?? nextGroups.length,
          groupTotal: result.librarySearch?.totalGroups ?? null,
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
      });
      return true;
    },
    [
      contentLanguageCode,
      scoped,
      filters,
      scopeKey,
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
        detailSelection: {
          entryId: result.selectedEntryId,
          headword: result.headword,
          contentLanguageCode: result.group.dictionary.sourceLanguageCode,
        },
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
