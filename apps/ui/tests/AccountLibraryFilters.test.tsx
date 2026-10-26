import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { AccountLibraryFilters } from "@/components/practice/library/AccountLibraryFilters";
import type { LibraryFilterDraft } from "@/components/practice/library/LibraryFilters";

import {CollectionSelectionContext} from '@/components/library/sharing/CollectionSelectionContext';
vi.mock('@/components/library/sharing/BrowseCollectionSources',()=>({BrowseCollectionSources:({onSelect,select}:{onSelect:(row:any)=>void;select:(id:string)=>void})=><button onClick={()=>{const row={id:'75600000-0000-4000-8000-000000000001',name:'Fresh remote lesson',ownership:'received',isShared:true,itemCount:2,labelIds:[],createdAt:'2026-01-01T00:00:00Z'};onSelect(row);select('collection:'+row.id);}}>Choose remote lesson</button>}));
const mocked = vi.hoisted(() => ({
  fetchPage: vi.fn(), fetchList:vi.fn(),
  labels: {snapshot:null as null | {revision:number;labels:{id:string;parent_id:null;name:string;description:null;created_at:string;updated_at:string}[];assignments:[]},loading:false,error:null as string|null,refresh:vi.fn()},
  material: {
    status: "ready", currentLanguageAllowed: true,
    languages: [{ code: "nl", label: "Dutch" }],
    dictionaries: [{ id: "source", name: "Example Dictionary" }],
    reload: vi.fn(),
  },
}));
vi.mock("@/components/library/organization/usePersonalLabels",()=>({usePersonalLabels:()=>mocked.labels}));
vi.mock("@/components/practice/material/AccountMaterialProvider", () => ({
  useAccountMaterial: () => ({ userId: "user", snapshot: { revision: 1 } }),
}));
vi.mock("@/components/practice/material/useLibraryMaterialSelection", () => ({
  useLibraryMaterialSelection: () => mocked.material,
}));
vi.mock("@/lib/platform/platformV2LibraryClient", () => ({
  fetchPlatformV2LibraryGroupPage: mocked.fetchPage,
}));
vi.mock("@/lib/trainingService",()=>({fetchWordsForList:mocked.fetchList}));
const value: LibraryFilterDraft = { languageCode: "nl", dictionaryId: null, parts: [], article: null };
const props = { value, query: "goed", locale: "en" as const, onClose: vi.fn(), onApply: vi.fn() };

afterEach(()=>{vi.unstubAllEnvs();});

beforeEach(() => {
  mocked.fetchPage.mockReset();
  mocked.labels.snapshot=null;mocked.labels.error=null;mocked.labels.loading=false;
  vi.stubEnv("NEXT_PUBLIC_COLLECTION_ORGANIZATION_ENABLED","false");
  mocked.material.status = "ready";
  mocked.material.currentLanguageAllowed = true;
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true, value: function(this: HTMLDialogElement) { this.setAttribute("open", ""); },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true, value: function(this: HTMLDialogElement) { this.removeAttribute("open"); },
  });
});

test("preview uses real group totals and aborted drafts cannot replace the current count", async () => {
  let resolveOld!: (page: unknown) => void;
  mocked.fetchPage.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }));
  mocked.fetchPage.mockResolvedValueOnce({ librarySearch: { totalGroups: 1 } });
  render(<AccountLibraryFilters {...props} />);
  await waitFor(() => expect(mocked.fetchPage).toHaveBeenCalledTimes(1));
  const oldSignal = mocked.fetchPage.mock.calls[0][0].signal;
  fireEvent.click(screen.getByRole("button", { name: "Nouns" }));
  await screen.findByText("1 matching article");
  expect(oldSignal.aborted).toBe(true);
  expect(mocked.fetchPage.mock.calls[1][0]).toMatchObject({
    query: "goed", translationTargetLanguageCode: null,
    libraryScope: { dictionaryIds: null, filters: { parts: ["noun"], article: null } },
  });
  await act(async () => { resolveOld({ librarySearch: { totalGroups: 99 } }); });
  expect(screen.getByText("1 matching article")).toBeInTheDocument();
  expect(screen.queryByText("99 matching articles")).not.toBeInTheDocument();
});

test("count errors remain explicit and retry performs a read without applying the draft", async () => {
  mocked.fetchPage.mockRejectedValueOnce(new Error("offline"));
  mocked.fetchPage.mockResolvedValueOnce({ librarySearch: { totalGroups: 3 } });
  const apply = vi.fn();
  render(<AccountLibraryFilters {...props} onApply={apply} />);
  fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
  await screen.findByText("3 matching articles");
  expect(mocked.fetchPage).toHaveBeenCalledTimes(2);
  expect(apply).not.toHaveBeenCalled();
});

test("paused or unavailable material cannot trigger a preview or apply", async () => {
  mocked.material.currentLanguageAllowed = false;
  const { rerender } = render(<AccountLibraryFilters {...props} />);
  expect(screen.getByRole("button", { name: "Show results" })).toBeDisabled();
  expect(mocked.fetchPage).not.toHaveBeenCalled();
  mocked.material.currentLanguageAllowed = true;
  mocked.fetchPage.mockResolvedValue({ librarySearch: { totalGroups: 0 } });
  rerender(<AccountLibraryFilters {...props} />);
  await screen.findByText("0 matching articles");
  expect(screen.getByRole("button", { name: "Show results" })).toBeEnabled();
});

test("empty query previews the current filter and exposes loading, failure and retry", async () => {
  let reject!: (cause: Error) => void;
  mocked.fetchPage.mockImplementationOnce(()=>new Promise((_resolve,fail)=>{reject=fail;}));
  mocked.fetchPage.mockResolvedValueOnce({librarySearch:{totalGroups:14449}});
  render(<AccountLibraryFilters {...props} query="" />);
  expect(screen.queryByText("Enter a word to search")).not.toBeInTheDocument();
  await waitFor(()=>expect(mocked.fetchPage).toHaveBeenCalledTimes(1));
  expect(mocked.fetchPage).toHaveBeenLastCalledWith(expect.objectContaining({query:"",libraryScope:{dictionaryIds:null,filters:{parts:[],article:null}}}));
  expect(screen.queryByText(/matching articles/)).not.toBeInTheDocument();
  await act(async()=>{reject(new Error("offline"));});
  fireEvent.click(await screen.findByRole("button",{name:"Try again"}));
  await screen.findByText("14,449 matching articles");
});

test("collection preview preserves the combined draft and does not turn failures into zero",async()=>{
 mocked.fetchPage.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({librarySearch:{totalGroups:2}});
 const draft={...value,applyListFilter:true,collectionId:"own",parts:["noun","verb"] as ("noun"|"verb")[],article:"de" as const};
 render(<AccountLibraryFilters {...props} value={draft} collections={[{id:"own",name:"Lesson",type:"user"}]} />);
 fireEvent.click(await screen.findByRole("button",{name:"Try again"}));
 await screen.findByText("2 matching articles");
 expect(mocked.fetchPage).toHaveBeenLastCalledWith(expect.objectContaining({query:"goed",contentLanguageCode:"nl",libraryScope:{dictionaryIds:null,material:{kind:"collection",id:"own",collectionType:"user"},filters:{parts:["noun","verb"],article:"de"}}}));
 expect(mocked.fetchList).not.toHaveBeenCalled();
});


test("label previews wait for the owner catalog and use a typed aggregate scope",async()=>{
 vi.stubEnv("NEXT_PUBLIC_COLLECTION_ORGANIZATION_ENABLED","true");
 mocked.labels.loading=true;
 mocked.fetchPage.mockResolvedValue({librarySearch:{totalGroups:7}});
 const draft={...value,labelId:"label",labelName:"YouTube",parts:["verb"] as "verb"[]};
 const {rerender}=render(<AccountLibraryFilters {...props} value={draft}/>);
 expect(screen.getByRole("button",{name:"Show results"})).toBeDisabled();
 expect(mocked.fetchPage).not.toHaveBeenCalled();
 mocked.labels.loading=false;
 mocked.labels.snapshot={revision:4,labels:[{id:"label",parent_id:null,name:"YouTube",description:null,created_at:"2026-10-25",updated_at:"2026-10-25"}],assignments:[]};
 rerender(<AccountLibraryFilters {...props} value={draft}/>);
 await screen.findByText("7 matching articles");
 expect(mocked.fetchPage).toHaveBeenLastCalledWith(expect.objectContaining({libraryScope:{dictionaryIds:null,material:{kind:"label",id:"label"},filters:{parts:["verb"],article:null}}}));
 expect(screen.getByRole("button",{name:"Show results"})).toBeEnabled();
 mocked.labels.error="unavailable";
 rerender(<AccountLibraryFilters {...props} value={draft}/>);
 expect(screen.getByRole("button",{name:"Show results"})).toBeDisabled();
 fireEvent.click(screen.getByRole("button",{name:/^Source/}));
 expect(screen.getByRole("alert")).toHaveTextContent("Could not load labels");
});

test('a remote choice appears in the Source summary and is reported only on Apply',async()=>{
 vi.stubEnv('NEXT_PUBLIC_COLLECTION_SHARING_ENABLED','true');mocked.fetchPage.mockResolvedValue({librarySearch:{totalGroups:2}});const selected=vi.fn();
 render(<CollectionSelectionContext.Provider value={{userId:'user',languageCode:'nl',onBrowseSelected:selected}}><AccountLibraryFilters {...props}/></CollectionSelectionContext.Provider>);
 fireEvent.click(screen.getByRole('button',{name:/^Source/}));fireEvent.click(await screen.findByRole('button',{name:'Choose remote lesson'}));
 await waitFor(()=>expect(screen.getByRole('button',{name:/^Source/})).toHaveTextContent('Fresh remote lesson'));expect(screen.getByRole('button',{name:/^Source/})).not.toHaveTextContent('No sources');expect(selected).not.toHaveBeenCalled();
 await waitFor(()=>expect(screen.getByRole('button',{name:'Show results'})).toBeEnabled());fireEvent.click(screen.getByRole('button',{name:'Show results'}));expect(selected).toHaveBeenCalledWith(expect.objectContaining({name:'Fresh remote lesson',ownership:'received'}));
});
