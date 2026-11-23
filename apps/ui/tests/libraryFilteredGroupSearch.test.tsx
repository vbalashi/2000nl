import React, { useCallback, useState } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { useLibrarySearchLifecycle } from "@/components/training/wordlist/useLibrarySearchLifecycle";
import {
  createDictionarySearchTabState,
  type DictionarySearchTabState,
} from "@/components/training/wordlist/dictionarySearchTabState";
import type { LibraryHeadwordGroupResult } from "@/components/training/wordlist/libraryHeadwordGroupResults";
import { multiSenseBankGroup, financeEntry, furnitureEntry } from "./platformV2LibraryFixture";

const { fetchPage } = vi.hoisted(() => ({ fetchPage: vi.fn() }));
vi.mock("@/lib/platform/platformV2LibraryClient", () => ({ fetchPlatformV2LibraryGroupPage: fetchPage }));
vi.mock("@/components/practice/material/AccountMaterialProvider", () => ({ useAccountMaterial: () => ({ userId: "owner", snapshot: { revision: 1 } }) }));
beforeEach(() => fetchPage.mockReset());

function setup(initial: Partial<DictionarySearchTabState> = {}) {
  return renderHook(({userId}: {userId:string}) => {
    const [state, setState] = useState<DictionarySearchTabState>(() => ({
      ...createDictionarySearchTabState(),
      query: "bank",
      entryFilters: { parts: ["noun"], article: null },
      ...initial,
    }));
    const projectGroupSelection = useCallback(
      (current: DictionarySearchTabState, groups: LibraryHeadwordGroupResult[]) => {
        const selectedStillVisible = groups.find(
          (group) => group.headwordGroupId === current.selectedHeadwordGroupId,
        );
        const selected = selectedStillVisible ?? groups[0] ?? null;
        return {
          selectedHeadwordGroupId:
            current.detailSelection && !selectedStillVisible
              ? current.selectedHeadwordGroupId
              : selected?.headwordGroupId ?? null,
          detailSelection:
            current.detailSelection ??
            (selected
              ? {
                  entryId: selected.selectedEntryId,
                  headword: selected.headword,
                  contentLanguageCode: selected.group.dictionary.sourceLanguageCode,
                }
              : null),
        };
      },
      [],
    );
    const search = useLibrarySearchLifecycle({
      state,
      setState,
      open: true,
      readiness: { active: true, ready: true, materialEnabled: true },
      scope: {
        userId,
        contentLanguageCode: "nl",
        translationLanguageCode: null,
        dictionaryId: null,
        query: state.query,
        page: state.page,
        collectionId: state.applyListFilter ? state.collectionId ?? null : null,
        collectionType: state.applyListFilter ? "user" : null,
        materialRevision: 1,
      },
      copy: { searchError: "search failed", searchTimeout: "search timed out" },
      projectGroupSelection,
    });
    return { state, setState, search };
  }, {initialProps:{userId:'owner'}});
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

test("collection and label scopes use grouped reads and retain an article after its last membership is removed", async () => {
  fetchPage.mockResolvedValue({groups:[multiSenseBankGroup],nextGroupCursor:null,selectedTierComplete:true,
    librarySearch:{totalGroups:1,matchingEntryIds:[financeEntry.entryId]}});
  const {result}=setup({applyListFilter:true,collectionId:"lesson"});
  await waitFor(()=>expect(result.current.state.groupTotal).toBe(1));
  expect(fetchPage).toHaveBeenLastCalledWith(expect.objectContaining({libraryScope:{dictionaryIds:null,
    material:{kind:"collection",id:"lesson",collectionType:"user"},filters:{parts:["noun"],article:null}}}));
  expect(result.current.state.detailSelection?.entryId).toBe(financeEntry.entryId);
  fetchPage.mockResolvedValue({groups:[],nextGroupCursor:null,selectedTierComplete:true,librarySearch:{totalGroups:0,matchingEntryIds:[]}});
  await act(async()=>{await result.current.search.runSearch(true);});
  expect(result.current.state.groupResults).toEqual([]);
  expect(result.current.state.detailSelection?.entryId).toBe(financeEntry.entryId);
  act(()=>result.current.setState(current=>({...current,applyListFilter:false,collectionId:null,labelId:"youtube",labelName:"YouTube"})));
  await waitFor(()=>expect(fetchPage).toHaveBeenLastCalledWith(expect.objectContaining({libraryScope:expect.objectContaining({material:{kind:"label",id:"youtube"}})})));
});

test('empty browse shows the admitted first portion while keeping pagination fenced',async()=>{
 let finish!:(value:unknown)=>void;
 fetchPage.mockImplementationOnce(input=>{
  input.onPartial({groups:[multiSenseBankGroup],nextGroupCursor:'middle',selectedTierComplete:false,
   librarySearch:{totalGroups:51,totalMeanings:70,matchingEntryIds:[financeEntry.entryId]}});
  return new Promise(resolve=>{finish=resolve;});
 });
 const {result}=setup({query:''});
 await waitFor(()=>expect(result.current.state.groupResults).toHaveLength(1));
 expect(result.current.search.loading).toBe(false);
 expect(result.current.state.groupTotal).toBe(51);
 expect(result.current.state.meaningTotal).toBe(70);
 expect(result.current.state.groupHasMore).toBe(false);
 expect(result.current.state.groupPageCursors[1]).toBeNull();
 await act(async()=>finish({groups:[multiSenseBankGroup],nextGroupCursor:'next-page',selectedTierComplete:true,
  librarySearch:{totalGroups:51,totalMeanings:70,matchingEntryIds:[financeEntry.entryId]}}));
 await waitFor(()=>expect(result.current.state.groupPageCursors[1]).toBe('next-page'));
 expect(result.current.state.groupHasMore).toBe(true);
});

test('a transient continuation failure clears the first portion and retry starts at the same initial cursor',async()=>{
 const partial={groups:[multiSenseBankGroup],nextGroupCursor:'middle',selectedTierComplete:false,
  librarySearch:{totalGroups:51,unavailableEntryCount:3,matchingEntryIds:[financeEntry.entryId]}};
 fetchPage.mockImplementationOnce(async input=>{input.onPartial(partial);throw new TypeError('offline');})
  .mockResolvedValueOnce({...partial,nextGroupCursor:'next-page'});
 const {result}=setup({query:''});
 await waitFor(()=>expect(result.current.search.error).toBe('search failed'));
 expect(result.current.state.groupResults).toEqual([]);
 expect(result.current.state.detailSelection).toBeNull();
 expect(result.current.search.hasCurrentResults).toBe(false);
 expect(result.current.state.unavailableEntryCount).toBe(0);
 expect(result.current.state.groupHasMore).toBe(false);
 await act(async()=>{await result.current.search.runSearch(true);});
 expect(fetchPage.mock.calls[1][0].cursor).toBeNull();
 expect(fetchPage.mock.calls[1][0].resume).toBeUndefined();
 expect(result.current.state.groupPageCursors[1]).toBe('next-page');
});

test('page 2 continuation failure keeps the page-start cursor and rejects a late partial',async()=>{
 const partial={groups:[multiSenseBankGroup],nextGroupCursor:'middle',selectedTierComplete:false,
  librarySearch:{totalGroups:101,matchingEntryIds:[financeEntry.entryId]}};
 let oldPartial!:(page:typeof partial)=>void;
 fetchPage.mockImplementationOnce(async input=>{oldPartial=input.onPartial;input.onPartial(partial);throw new TypeError('offline');})
  .mockResolvedValueOnce({...partial,nextGroupCursor:'page-three'});
 const filters={parts:['noun'],article:null};
 const {result}=setup({query:'',page:2,groupPageCursors:[null,'page-two'],groupScopeKey:JSON.stringify(['owner',1,'nl',null,'',null,filters])});
 await waitFor(()=>expect(result.current.search.error).toBe('search failed'));
 expect(result.current.state.page).toBe(2);
 expect(result.current.state.groupPageCursors).toEqual([null,'page-two']);
 expect(result.current.state.groupResults).toEqual([]);
 expect(result.current.state.groupTotal).toBeNull();
 expect(result.current.state.detailSelection).toBeNull();
 expect(result.current.state.groupHasMore).toBe(false);
 await act(async()=>{await result.current.search.runSearch(true);});
 expect(fetchPage.mock.calls[1][0].cursor).toBe('page-two');
 expect(result.current.state.groupPageCursors).toEqual([null,'page-two','page-three']);
 act(()=>oldPartial(partial));
 expect(result.current.state.groupPageCursors).toEqual([null,'page-two','page-three']);
});

test('going back from a partial page 3 keeps the page 2 cursor and ignores page 3 completion', async () => {
  const partial = {groups: [multiSenseBankGroup], nextGroupCursor: 'middle', selectedTierComplete: false};
  let finishOld!: (page: unknown) => void;
  let finishPrevious!: (page: unknown) => void;
  fetchPage.mockImplementationOnce(input => {
    input.onPartial(partial);
    return new Promise(resolve => { finishOld = resolve; });
  }).mockImplementationOnce(() => new Promise(resolve => { finishPrevious = resolve; }));
  const {result} = setup({
    query: '',
    page: 3,
    groupPageCursors: [null, 'page-two', 'page-three'],
    groupScopeKey: JSON.stringify(['owner', 1, 'nl', null, '', null, {parts: ['noun'], article: null}]),
  });
  await waitFor(() => expect(result.current.state.groupResults).toHaveLength(1));
  const firstRead = fetchPage.mock.calls[0][0];
  expect(firstRead.cursor).toBe('page-three');

  act(() => result.current.setState(current => ({...current, page: current.page - 1})));
  expect(firstRead.signal.aborted).toBe(true);
  expect(result.current.state.page).toBe(2);
  expect(result.current.state.groupResults).toEqual([]);
  expect(result.current.state.detailSelection).toBeNull();
  expect(fetchPage).toHaveBeenLastCalledWith(expect.objectContaining({cursor: 'page-two'}));

  await act(async () => finishOld({...partial, nextGroupCursor: 'page-four'}));
  expect(result.current.state.groupResults).toEqual([]);
  await act(async () => finishPrevious({...partial, nextGroupCursor: 'page-three', selectedTierComplete: true}));
  expect(result.current.state.page).toBe(2);
  expect(result.current.state.groupPageCursors).toEqual([null, 'page-two', 'page-three']);
  expect(result.current.state.groupHasMore).toBe(true);
});

test.each([401,403,404,429,503])('final HTTP %s during continuation removes partial rows and selection',async status=>{
 const partial={groups:[multiSenseBankGroup],nextGroupCursor:'middle',selectedTierComplete:false,
  librarySearch:{totalGroups:51,matchingEntryIds:[financeEntry.entryId]}};
 fetchPage.mockImplementationOnce(async input=>{
  input.onPartial(partial);
  const error=Object.assign(new Error('denied'),{kind:'http-error',status});throw error;
 });
 const {result}=setup({query:''});
 await waitFor(()=>expect(result.current.search.error).toBe('search failed'));
 expect(result.current.state.groupResults).toEqual([]);
 expect(result.current.state.detailSelection).toBeNull();
 expect(result.current.search.hasCurrentResults).toBe(false);
});

test('an account change detected by transport removes the partial page',async()=>{
 fetchPage.mockImplementationOnce(async input=>{
  input.onPartial({groups:[multiSenseBankGroup],nextGroupCursor:'middle',selectedTierComplete:false});
  throw new Error('auth_account_changed');
 });
 const {result}=setup({query:''});
 await waitFor(()=>expect(result.current.search.error).toBe('search failed'));
 expect(result.current.state.groupResults).toEqual([]);
 expect(result.current.state.detailSelection).toBeNull();
});

test('late first portion from the previous material cannot reappear after scope changes',async()=>{
 let oldPartial!:(page:unknown)=>void;
 fetchPage.mockImplementationOnce(input=>{oldPartial=input.onPartial;return new Promise(()=>{});})
  .mockResolvedValueOnce({groups:[],nextGroupCursor:null,selectedTierComplete:true,librarySearch:{totalGroups:0,matchingEntryIds:[]}});
 const {result}=setup({query:'',applyListFilter:true,collectionId:'old'});
 await waitFor(()=>expect(fetchPage).toHaveBeenCalledOnce());
 act(()=>result.current.setState(current=>({...current,collectionId:'new'})));
 await waitFor(()=>expect(fetchPage).toHaveBeenCalledTimes(2));
 act(()=>oldPartial({groups:[multiSenseBankGroup],nextGroupCursor:'stale',selectedTierComplete:false}));
 expect(result.current.state.groupResults).toEqual([]);
});

test('changing a received material clears an already visible partial page before the new read completes',async()=>{
 let finishOld!:(page:unknown)=>void;
 fetchPage.mockImplementationOnce(input=>{
  input.onPartial({groups:[multiSenseBankGroup],nextGroupCursor:'middle',selectedTierComplete:false,librarySearch:{totalGroups:1,unavailableEntryCount:3,matchingEntryIds:[financeEntry.entryId]}});
  return new Promise(resolve=>{finishOld=resolve;});
 }).mockImplementationOnce(()=>new Promise(()=>{}));
 const {result}=setup({query:'',applyListFilter:true,collectionId:'received-old'});
 await waitFor(()=>expect(result.current.state.groupResults).toHaveLength(1));
 expect(result.current.state.unavailableEntryCount).toBe(3);
 act(()=>result.current.setState(current=>({...current,collectionId:'received-new'})));
 await waitFor(()=>expect(fetchPage).toHaveBeenCalledTimes(2));
 expect(result.current.state.groupResults).toEqual([]);
 expect(result.current.state.unavailableEntryCount).toBe(0);
 expect(result.current.state.detailSelection).toBeNull();
 await act(async()=>finishOld({groups:[multiSenseBankGroup],nextGroupCursor:null,selectedTierComplete:true}));
 expect(result.current.state.groupResults).toEqual([]);
});

test('changing material during a partial page 2 restarts at page 1',async()=>{
 fetchPage.mockImplementationOnce(input=>{
  input.onPartial({groups:[multiSenseBankGroup],nextGroupCursor:'middle',selectedTierComplete:false});
  return new Promise(()=>{});
 }).mockImplementationOnce(()=>new Promise(()=>{}));
 const filters={parts:['noun'],article:null};
 const material={kind:'collection',id:'old',collectionType:'user'};
 const {result}=setup({query:'',page:2,groupPageCursors:[null,'old-page-two'],applyListFilter:true,collectionId:'old',
  groupScopeKey:JSON.stringify(['owner',1,'nl',null,'',material,filters])});
 await waitFor(()=>expect(result.current.state.groupResults).toHaveLength(1));
 act(()=>result.current.setState(current=>({...current,collectionId:'new'})));
 await waitFor(()=>expect(result.current.state.page).toBe(1));
 expect(result.current.state.groupResults).toEqual([]);
 expect(result.current.state.groupPageCursors).toEqual([null]);
});

test('switching accounts clears an already visible partial page and rejects the old response',async()=>{
 let finishOld!:(page:unknown)=>void;
 fetchPage.mockImplementationOnce(input=>{
  input.onPartial({groups:[multiSenseBankGroup],nextGroupCursor:'middle',selectedTierComplete:false});
  return new Promise(resolve=>{finishOld=resolve;});
 }).mockImplementationOnce(()=>new Promise(()=>{}));
 const {result,rerender}=setup({query:''});
 await waitFor(()=>expect(result.current.state.groupResults).toHaveLength(1));
 rerender({userId:'other'});
 await waitFor(()=>expect(fetchPage).toHaveBeenCalledTimes(2));
 expect(result.current.state.groupResults).toEqual([]);
 expect(result.current.state.detailSelection).toBeNull();
 await act(async()=>finishOld({groups:[multiSenseBankGroup],nextGroupCursor:null,selectedTierComplete:true}));
 expect(result.current.state.groupResults).toEqual([]);
});

test('membership invalidation clears and fences an in-flight partial page',async()=>{
 let finish!:(page:unknown)=>void;
 fetchPage.mockImplementationOnce(input=>{
  input.onPartial({groups:[multiSenseBankGroup],nextGroupCursor:'middle',selectedTierComplete:false,librarySearch:{totalGroups:1,unavailableEntryCount:3,matchingEntryIds:[financeEntry.entryId]}});
  return new Promise(resolve=>{finish=resolve;});
 }).mockResolvedValue({groups:[],nextGroupCursor:null,selectedTierComplete:true,librarySearch:{totalGroups:0,matchingEntryIds:[]}});
 const {result,unmount}=setup({query:'',applyListFilter:true,collectionId:'received'});
 await waitFor(()=>expect(result.current.state.groupResults).toHaveLength(1));
 expect(result.current.state.unavailableEntryCount).toBe(3);
 const signal=fetchPage.mock.calls[0][0].signal as AbortSignal;
 act(()=>result.current.search.invalidateFreshness());
 expect(signal.aborted).toBe(true);
 expect(result.current.state.groupResults).toEqual([]);
 expect(result.current.state.unavailableEntryCount).toBe(0);
 expect(result.current.state.detailSelection).toBeNull();
 await act(async()=>finish({groups:[multiSenseBankGroup],nextGroupCursor:null,selectedTierComplete:true}));
 expect(result.current.state.groupResults).toEqual([]);
 unmount();
});
