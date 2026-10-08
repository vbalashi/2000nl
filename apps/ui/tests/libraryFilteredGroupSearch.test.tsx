import React, { useCallback, useState } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { useLibrarySearchLifecycle } from "@/components/training/wordlist/useLibrarySearchLifecycle";
import {
  createDictionarySearchTabState,
  type DictionarySearchTabState,
} from "@/components/training/wordlist/dictionarySearchTabState";
import type { LibrarySearchGroupPage } from "@/components/training/wordlist/useLibrarySearchLifecycle";
import type { LibraryHeadwordGroupResult } from "@/components/training/wordlist/libraryHeadwordGroupResults";
import { multiSenseBankGroup, financeEntry, furnitureEntry } from "./platformV2LibraryFixture";

const { fetchPage } = vi.hoisted(() => ({ fetchPage: vi.fn() }));
vi.mock("@/lib/platform/platformV2LibraryClient", () => ({ fetchPlatformV2LibraryGroupPage: fetchPage }));
vi.mock("@/components/practice/material/AccountMaterialProvider", () => ({ useAccountMaterial: () => ({ userId: "owner", snapshot: { revision: 1 } }) }));
beforeEach(() => fetchPage.mockReset());

function setup() {
  return renderHook(() => {
    const [state, setState] = useState<DictionarySearchTabState>(() => ({
      ...createDictionarySearchTabState(),
      query: "bank",
      entryFilters: { parts: ["noun"], article: null },
    }));
    const onGroupPage = useCallback(
      (
        groups: LibraryHeadwordGroupResult[],
        result: LibrarySearchGroupPage,
        scopeKey: string,
        scoped: boolean,
      ) => {
        setState((current) => {
          const sameScope = !scoped || current.groupScopeKey === scopeKey;
          const page = sameScope ? current.page : 1;
          const cursors = sameScope ? current.groupPageCursors.slice(0, page) : [null];
          cursors[page] = result.nextGroupCursor;
          return {
            ...current,
            groupResults: groups,
            page,
            groupScopeKey: scopeKey,
            groupPageCursors: cursors,
            groupHasMore: Boolean(result.nextGroupCursor),
            groupTotal: result.librarySearch?.totalGroups ?? null,
            wordTotal: result.librarySearch?.totalGroups ?? groups.length,
          };
        });
      },
      [],
    );
    const search = useLibrarySearchLifecycle({
      state,
      setState,
      open: true,
      readiness: { active: true, ready: true, materialEnabled: true },
      scope: {
        userId: "owner",
        contentLanguageCode: "nl",
        translationLanguageCode: null,
        dictionaryId: null,
        query: state.query,
        page: state.page,
        collectionId: null,
        collectionType: null,
        materialRevision: 1,
      },
      copy: { searchError: "search failed", searchTimeout: "search timed out" },
      onGroupPage,
    });
    return { state, setState, search, onGroupPage };
  });
}

test("matching entry selection/count preserves complete groups; filter changes restart pagination", async () => {
  fetchPage
    .mockResolvedValueOnce({
      groups: [multiSenseBankGroup],
      nextGroupCursor: "next",
      selectedTierComplete: false,
      librarySearch: { totalGroups: 7, matchingEntryIds: [furnitureEntry.entryId] },
    })
    .mockResolvedValueOnce({ groups: [multiSenseBankGroup], nextGroupCursor: null, selectedTierComplete: true })
    .mockResolvedValueOnce({
      groups: [multiSenseBankGroup],
      nextGroupCursor: null,
      selectedTierComplete: true,
      librarySearch: { totalGroups: 1, matchingEntryIds: [financeEntry.entryId] },
    });

  const { result } = setup();
  await waitFor(() => expect(result.current.state.groupTotal).toBe(7));
  expect(result.current.state.groupResults[0].selectedEntryId).toBe(furnitureEntry.entryId);
  expect(result.current.state.groupResults[0].group).toBe(multiSenseBankGroup);

  act(() => result.current.setState((current) => ({ ...current, page: 2 })));
  await waitFor(() => expect(fetchPage).toHaveBeenCalledTimes(2));
  expect(fetchPage).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: "next" }));

  act(() => result.current.setState((current) => ({
    ...current,
    entryFilters: { parts: ["verb"], article: null },
  })));
  await waitFor(() => expect(fetchPage).toHaveBeenCalledTimes(3));
  expect(fetchPage).toHaveBeenLastCalledWith(expect.objectContaining({
    cursor: null,
    libraryScope: { dictionaryIds: null, filters: { parts: ["verb"], article: null } },
  }));
  expect(result.current.state.page).toBe(1);
});

test("a late response from a previous filter cannot replace current results", async () => {
  let release!: (value: unknown) => void;
  fetchPage.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
  const { result } = setup();
  await waitFor(() => expect(fetchPage).toHaveBeenCalledTimes(1));

  fetchPage.mockResolvedValueOnce({
    groups: [multiSenseBankGroup],
    nextGroupCursor: null,
    selectedTierComplete: true,
    librarySearch: { totalGroups: 1, matchingEntryIds: [financeEntry.entryId] },
  });
  act(() => result.current.setState((current) => ({
    ...current,
    entryFilters: { parts: ["verb"], article: null },
  })));
  await waitFor(() => expect(result.current.state.groupTotal).toBe(1));

  await act(async () => {
    release({
      groups: [multiSenseBankGroup],
      nextGroupCursor: null,
      selectedTierComplete: true,
      librarySearch: { totalGroups: 0, matchingEntryIds: [] },
    });
  });
  expect(result.current.state.groupResults[0].selectedEntryId).toBe(financeEntry.entryId);
  expect(result.current.state.groupTotal).toBe(1);
});
