"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Dispatch, SetStateAction } from "react";
import { useAccountMaterial } from "@/components/practice/material/AccountMaterialProvider";
import { fetchPlatformV2LibraryGroupPage } from "@/lib/platform/platformV2LibraryClient";
import { LIBRARY_PAGE_SIZE } from "@/lib/platform/libraryPagination";
import type { LibraryEntryFilters } from "@/lib/platform/librarySearchScope";
import { fetchWordsForList } from "@/lib/trainingService";
import type { WordListSummary } from "@/lib/types";
import type { DictionarySearchTabState } from "./dictionarySearchTabState";
import {
  buildLibraryHeadwordGroupResults,
  type LibraryHeadwordGroupResult,
} from "./libraryHeadwordGroupResults";

const SEARCH_INPUT_DEBOUNCE_MS = 250;

export type LibrarySearchGroupPage = Awaited<
  ReturnType<typeof fetchPlatformV2LibraryGroupPage>
>;
type GroupPage = LibrarySearchGroupPage;
type GroupSelectionProjection = Pick<
  DictionarySearchTabState,
  "selectedHeadwordGroupId" | "detailSelection"
>;

type Input = {
  state: DictionarySearchTabState;
  setState: Dispatch<SetStateAction<DictionarySearchTabState>>;
  open: boolean;
  readiness: {
    active: boolean;
    ready: boolean;
    materialEnabled: boolean;
    defaultFilters?: LibraryEntryFilters;
  };
  scope: {
    userId: string;
    contentLanguageCode: string;
    translationLanguageCode: string | null;
    dictionaryId: string | null;
    query: string;
    page: number;
    collectionId: string | null;
    collectionType: WordListSummary["type"] | null;
    materialRevision: number | undefined;
  };
  copy: { searchError: string; searchTimeout: string };
  projectGroupSelection: (
    current: DictionarySearchTabState,
    groups: LibraryHeadwordGroupResult[],
  ) => GroupSelectionProjection;
};

/** Owns applied Library reads while keeping result snapshots in the parent state. */
export function useLibrarySearchLifecycle({
  state,
  setState,
  open,
  readiness,
  scope,
  copy,
  projectGroupSelection,
}: Input) {
  const {
    active,
    ready,
    materialEnabled,
    defaultFilters,
  } = readiness;
  const {
    userId,
    contentLanguageCode,
    translationLanguageCode,
    dictionaryId,
    query,
    page,
    collectionId,
    collectionType,
    materialRevision,
  } = scope;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshRevision, setRefreshRevision] = useState(0);
  const freshRef = useRef<{ key: string; at: number } | null>(null);
  const pendingRef = useRef<string | null>(null);
  const lastSearchedQueryRef = useRef<string | null>(null);
  const requestSequenceRef = useRef(0);
  const requestControllerRef = useRef<AbortController | null>(null);
  const material = useAccountMaterial();
  const scoped = Boolean(material);
  const currentFilters = state.entryFilters ?? defaultFilters;
  const filterKey = currentFilters
    ? JSON.stringify({
        parts: [...new Set(currentFilters.parts)].sort(),
        article: currentFilters.article,
      })
    : null;
  const filters = useMemo(
    () =>
      filterKey
        ? (JSON.parse(filterKey) as NonNullable<DictionarySearchTabState["entryFilters"]>)
        : undefined,
    [filterKey],
  );
  const groupScopeKey = JSON.stringify([
    material?.userId,
    material?.snapshot?.revision,
    contentLanguageCode,
    dictionaryId,
    state.query,
    ...(filters ? [filters] : []),
  ]);
  const sameGroupScope = !material || state.groupScopeKey === groupScopeKey;
  const groupCursor = sameGroupScope
    ? (state.groupPageCursors[state.page - 1] ?? null)
    : null;
  const listMode = Boolean(collectionId);
  const listPage = listMode ? page : 1;
  const readKey = JSON.stringify([
    userId,
    contentLanguageCode,
    translationLanguageCode,
    dictionaryId,
    query.trim(),
    page,
    listMode,
    listMode ? collectionId : null,
    listMode ? collectionType : null,
    state.entryFilters,
    materialRevision,
    refreshRevision,
  ]);
  const blockedByMaterial = !listMode && !ready;
  const previousReadScopeRef = useRef({ readKey, blockedByMaterial });

  useLayoutEffect(() => {
    const previous = previousReadScopeRef.current;
    if (previous.readKey !== readKey || (!previous.blockedByMaterial && blockedByMaterial)) {
      // Fence the old read before the query debounce; visibility changes alone must retain pending work.
      requestSequenceRef.current += 1;
      requestControllerRef.current?.abort();
      requestControllerRef.current = null;
      pendingRef.current = null;
      setLoading(false);
    }
    previousReadScopeRef.current = { readKey, blockedByMaterial };
  }, [readKey, blockedByMaterial]);

  const isCurrentSearch = useCallback(
    (requestId: number) => requestSequenceRef.current === requestId,
    [],
  );

  const beginSearch = useCallback(() => {
    requestControllerRef.current?.abort();
    requestControllerRef.current = new AbortController();
    requestSequenceRef.current += 1;
    return requestSequenceRef.current;
  }, []);

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

  const runSearch = useCallback(
    async (force = false) => {
      if (!active) return;
      if (!listMode && !ready) {
        freshRef.current = null;
        pendingRef.current = null;
      }
      if (
        !force &&
        (pendingRef.current === readKey ||
          (freshRef.current?.key === readKey &&
            Date.now() - freshRef.current.at < 30000))
      ) {
        return;
      }

      const requestId = beginSearch();
      if (!listMode && !ready) {
        setState((current) => ({
          ...current,
          wordResults: [],
          groupResults: [],
          wordTotal: 0,
          groupHasMore: false,
        }));
        setLoading(false);
        setError(null);
        return;
      }
      if (!query.trim() && !listMode && !materialEnabled) {
        setState((current) => ({
          ...current,
          wordResults: [],
          groupResults: [],
          groupPageCursors: [null],
          groupHasMore: false,
          selectedHeadwordGroupId: null,
          wordTotal: 0,
          detailSelection: null,
          mobileDetailOpen: false,
        }));
        return;
      }

      pendingRef.current = readKey;
      setLoading(freshRef.current?.key !== readKey);
      setError(null);
      try {
        const trimmedQuery = query.trim() || undefined;
        if (!listMode) {
          let result: GroupPage;
          try {
            result = await fetchPlatformV2LibraryGroupPage({
              query: trimmedQuery ?? "",
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
              signal: requestControllerRef.current?.signal,
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
              return;
            }
            throw cause;
          }
          if (!isCurrentSearch(requestId)) return;

          const groups = buildLibraryHeadwordGroupResults(
            result.groups,
            result.librarySearch?.matchingEntryIds,
          ).filter(
            (group) =>
              scoped ||
              !dictionaryId ||
              group.group.dictionary.dictionaryId === dictionaryId,
          );
          setState((current) => {
            const previousScope = !scoped || current.groupScopeKey === groupScopeKey;
            const currentPage = previousScope ? current.page : 1;
            const nextCursors = previousScope
              ? current.groupPageCursors.slice(0, currentPage)
              : [null];
            nextCursors[currentPage] = result.nextGroupCursor;
            return {
              ...current,
              groupResults: groups,
              page: currentPage,
              groupScopeKey,
              groupPageCursors: nextCursors,
              groupHasMore: Boolean(result.nextGroupCursor),
              wordResults: [],
              wordTotal: result.librarySearch?.totalGroups ?? groups.length,
              groupTotal: result.librarySearch?.totalGroups ?? null,
              ...projectGroupSelection(current, groups),
            };
          });
          freshRef.current = { key: readKey, at: Date.now() };
          return;
        }

        const result = await fetchWordsForList(collectionId!, collectionType ?? "curated", {
          query: trimmedQuery,
          page: listPage,
          pageSize: LIBRARY_PAGE_SIZE,
        });
        if (!isCurrentSearch(requestId)) return;
        freshRef.current = { key: readKey, at: Date.now() };
        clearGroupSearch();
        setState((current) => ({
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
                    result.items[0].language_code ?? contentLanguageCode,
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
          setError(
            cause instanceof Error && cause.message === "platform_request_timeout"
              ? copy.searchTimeout
              : copy.searchError,
          );
        }
      } finally {
        if (isCurrentSearch(requestId)) {
          pendingRef.current = null;
          setLoading(false);
        }
      }
    },
    [
      active,
      ready,
      listMode,
      readKey,
      beginSearch,
      setState,
      query,
      materialEnabled,
      scoped,
      dictionaryId,
      filters,
      contentLanguageCode,
      translationLanguageCode,
      groupCursor,
      isCurrentSearch,
      projectGroupSelection,
      groupScopeKey,
      collectionId,
      collectionType,
      listPage,
      clearGroupSearch,
      copy.searchTimeout,
      copy.searchError,
    ],
  );

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

  const refresh = useCallback(() => {
    setRefreshRevision((revision) => revision + 1);
  }, []);
  const invalidateFreshness = useCallback(() => {
    freshRef.current = null;
  }, []);
  const hasCurrentResults = freshRef.current?.key === readKey;

  useEffect(
    () => () => {
      requestControllerRef.current?.abort();
      requestControllerRef.current = null;
      requestSequenceRef.current += 1;
      pendingRef.current = null;
    },
    [],
  );

  return {
    loading,
    error,
    hasCurrentResults,
    runSearch,
    refresh,
    invalidateFreshness,
  };
}
