import React, { useState } from "react";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { useLibraryHeadwordGroupSearch } from "@/components/training/wordlist/useLibraryHeadwordGroupSearch";
import { createDictionarySearchTabState, type DictionarySearchTabState } from "@/components/training/wordlist/dictionarySearchTabState";
import { multiSenseBankGroup, financeEntry, furnitureEntry } from "./platformV2LibraryFixture";
const { fetchPage } = vi.hoisted(() => ({ fetchPage: vi.fn() }));
vi.mock("@/lib/platform/platformV2LibraryClient", () => ({ fetchPlatformV2LibraryGroupPage: fetchPage }));
vi.mock("@/components/practice/material/AccountMaterialProvider", () => ({ useAccountMaterial: () => ({ userId: "owner", snapshot: { revision: 1 } }) }));
beforeEach(() => fetchPage.mockReset());
function setup() {
  return renderHook(() => {
    const [state, setState] = useState<DictionarySearchTabState>({ ...createDictionarySearchTabState(), query: "bank", entryFilters: { parts: ["noun" as const], article: null } });
    const search = useLibraryHeadwordGroupSearch({ state, setState, contentLanguageCode: "nl", translationLanguageCode: null, dictionaryId: null });
    return { state, setState, search };
  });
}
test("matching entry selection/count preserves complete groups; filter changes restart pagination", async () => {
  fetchPage.mockResolvedValue({ groups: [multiSenseBankGroup], nextGroupCursor: "next", selectedTierComplete: false, librarySearch: { totalGroups: 7, matchingEntryIds: [furnitureEntry.entryId] } });
  const { result } = setup();
  await act(async () => { await result.current.search.runGroupSearch("bank", result.current.search.beginSearch()); });
  expect(result.current.state.groupTotal).toBe(7);
  expect(result.current.state.wordTotal).toBe(7);
  expect(result.current.state.groupResults[0].selectedEntryId).toBe(furnitureEntry.entryId);
  expect(result.current.state.groupResults[0].group).toBe(multiSenseBankGroup);
  act(() => result.current.setState(current => ({ ...current, page: 2 })));
  await act(async () => { await result.current.search.runGroupSearch("bank", result.current.search.beginSearch()); });
  expect(fetchPage).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: "next" }));
  act(() => result.current.setState(current => ({ ...current, entryFilters: { parts: ["verb"], article: null } })));
  await act(async () => { await result.current.search.runGroupSearch("bank", result.current.search.beginSearch()); });
  expect(fetchPage).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: null, libraryScope: { dictionaryIds: null, filters: { parts: ["verb"], article: null } } }));
  expect(result.current.state.page).toBe(1);
});
test("a late response from a previous filter cannot replace the current results", async () => {
  let release!: (value: unknown) => void;
  fetchPage.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
  const { result } = setup();
  let pending!: Promise<boolean>;
  act(() => { pending = result.current.search.runGroupSearch("bank", result.current.search.beginSearch()); });
  act(() => result.current.setState(current => ({ ...current, entryFilters: { parts: ["verb"], article: null } })));
  fetchPage.mockResolvedValue({ groups: [multiSenseBankGroup], nextGroupCursor: null, selectedTierComplete: true, librarySearch: { totalGroups: 1, matchingEntryIds: [financeEntry.entryId] } });
  await act(async () => { await result.current.search.runGroupSearch("bank", result.current.search.beginSearch()); });
  await act(async () => { release({ groups: [], nextGroupCursor: null, selectedTierComplete: true, librarySearch: { totalGroups: 0, matchingEntryIds: [] } }); await pending; });
  expect(result.current.state.groupResults[0].selectedEntryId).toBe(financeEntry.entryId);
  expect(result.current.state.groupTotal).toBe(1);
});
