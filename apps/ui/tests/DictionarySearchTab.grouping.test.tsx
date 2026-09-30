import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  createDictionarySearchTabState,
  DictionarySearchTab,
  type DictionarySearchTabState,
} from "@/components/training/wordlist/DictionarySearchTab";
import type { PlatformHeadwordGroupV2 } from "../../../packages/shared/types/platformV2";

const fetchGroupPage = vi.fn();
const readableSources = vi.fn();
vi.mock("@/lib/training/listService",()=>({fetchAvailableDictionarySourcesStrict:(...args:unknown[])=>readableSources(...args),fetchAvailableLearningLanguages:vi.fn()}));
afterEach(()=>{vi.unstubAllEnvs();});

vi.mock("@/lib/platform/platformV2LibraryClient", () => ({
  fetchPlatformV2LibraryGroupPage: (...args: unknown[]) =>
    fetchGroupPage(...args),
}));

vi.mock("@/components/training/library-v2/LibraryWordDetail", () => ({
  LibraryWordDetail: ({
    initialGroup,
    viewport,
  }: {
    initialGroup?: PlatformHeadwordGroupV2;
    viewport?: string;
  }) =>
    initialGroup ? (
      <div
        data-testid={`library-detail-${viewport ?? "all"}`}
        data-group-id={initialGroup.headwordGroupId}
        data-entry-count={initialGroup.entries.length}
      />
    ) : null,
}));

vi.mock("@/lib/trainingService", () => ({
  createUserDictionaryEntry: vi.fn(),
  fetchAvailableDictionarySources: vi.fn().mockResolvedValue([
    {
      id: "dictionary-vandale",
      languageCode: "nl",
      name: "Van Dale",
      slug: "vandale",
      kind: "curated",
      isEditable: false,
      entryCount: 10,
    },
  ]),
  fetchAvailableLearningLanguages: vi.fn().mockResolvedValue([
    {
      code: "nl",
      label: "Nederlands",
      dictionaryCount: 1,
      curatedListCount: 0,
      userListCount: 0,
      hasTrainingEligibleLists: true,
    },
  ]),
  fetchDictionaryEntryById: vi.fn().mockResolvedValue(null),
  fetchWordsForList: vi.fn().mockResolvedValue({ items: [], total: 0 }),
  searchDictionaryGroups: vi.fn().mockResolvedValue({ items: [], total: 0 }),
  searchWordEntries: vi.fn().mockResolvedValue({ items: [], total: 0 }),
}));

const sense = (entryId: string, partOfSpeech: string) => ({
  kind: "sense-card" as const,
  entryId,
  meaningOrdinal: 1,
  partOfSpeech: {
    termId: `pos:${partOfSpeech}`,
    messageKey: `pos.${partOfSpeech}`,
    sourceValue: partOfSpeech,
  },
  card: null,
  contentRevision: `revision-${entryId}`,
  reportContentRevision: null,
  summaryContentNodeId: `definition-${entryId}`,
  contentNodes: [
    {
      contentNodeId: `definition-${entryId}`,
      parentContentNodeId: null,
      kind: "definition" as const,
      order: 0,
      text: `definition ${entryId}`,
      sourceTextFingerprint: `fingerprint-${entryId}`,
      translations: [],
    },
  ],
  translation: null,
  capabilities: [],
});

const goedGroup = (
  headwordGroupId: string,
  dictionaryId: string,
  displayName: string,
  entries: ReturnType<typeof sense>[],
  homographNumber?: number,
): PlatformHeadwordGroupV2 => ({
  headwordGroupId,
  dictionary: {
    dictionaryId,
    sourceLanguageCode: "nl",
    displayName,
    messageKey: `dictionary.${dictionaryId}`,
  },
  header: { text: "goed", ...(homographNumber ? { homographNumber } : {}) },
  senseCount: entries.length,
  entryCount: entries.length,
  indicators: [],
  entries,
});

const firstGroup = goedGroup(
  "group-goed-main",
  "dictionary-vandale",
  "Van Dale",
  [sense("entry-goed-bn", "bn"), sense("entry-goed-bw", "bw")],
);
const homographGroup = goedGroup(
  "group-goed-homograph",
  "dictionary-vandale",
  "Van Dale",
  [sense("entry-goed-zn", "zn")],
  2,
);
const dictionaryGroup = goedGroup(
  "group-goed-user-dictionary",
  "dictionary-user",
  "Mijn woordenboek",
  [sense("entry-goed-user", "bn")],
);
const nextPageGroup = goedGroup(
  "group-goed-next-page",
  "dictionary-other",
  "Ander woordenboek",
  [sense("entry-goed-next", "bn")],
);

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
};

function Harness({initial = {},locale="nl"}: {initial?: Partial<DictionarySearchTabState>;locale?: "en"|"nl"|"ru"} = {}) {
  const [state, setState] = React.useState<DictionarySearchTabState>(() => ({
    ...createDictionarySearchTabState(),
    query: "goed",
    languageCode: "nl",
    ...initial,
  }));
  return (
    <DictionarySearchTab
      open
      userId="user-1"
      language="nl"
      translationLang="en"
      interfaceLanguage={locale}
      userLists={[]}
      viewedListId={null}
      viewedList={null}
      viewedListName="Van Dale"
      reloadLists={async () => {}}
      notifyListsUpdated={() => {}}
      searchState={state}
      onSearchStateChange={setState}
    />
  );
}

describe("DictionarySearchTab Headword Group results", () => {
  beforeEach(() => {

    fetchGroupPage.mockReset();
    fetchGroupPage
      .mockResolvedValueOnce({
        groups: [firstGroup, { ...firstGroup }, homographGroup, dictionaryGroup],
        selectedTierComplete: true,
        nextGroupCursor: "cursor-page-2",
      })
      .mockResolvedValueOnce({
        groups: [nextPageGroup],
        selectedTierComplete: true,
        nextGroupCursor: null,
      });
  });

  test("desktop shows one goed row per headwordGroupId and paginates by opaque group cursor", async () => {
    render(<Harness />);

    expect(await screen.findAllByTestId("library-headword-group-row")).toHaveLength(3);
    expect(screen.getByTestId("library-headword-group-group-goed-main")).toHaveTextContent(
      "bn · bw · Van Dale · 2 betekenissen",
    );
    expect(screen.getByTestId("library-headword-group-group-goed-homograph")).toHaveTextContent(
      "zn · Van Dale · homoniem 2 · 1 betekenis",
    );
    expect(screen.getByTestId("library-headword-group-group-goed-user-dictionary")).toHaveTextContent(
      "Mijn woordenboek",
    );

    const pagination = screen.getByTestId("library-group-pagination");
    fireEvent.click(within(pagination).getByRole("button", { name: "Volgende" }));

    expect(await screen.findByTestId("library-headword-group-group-goed-next-page")).toBeInTheDocument();
    expect(fetchGroupPage).toHaveBeenLastCalledWith(
      expect.objectContaining({ cursor: "cursor-page-2", query: "goed" }),
    );
  });

  test("mobile selection opens the complete server group instead of one meaning", async () => {
    render(<Harness />);

    const row = await screen.findByTestId("library-headword-group-group-goed-main");
    fireEvent.click(row);

    const mobileDetail = await screen.findByTestId("library-detail-mobile");
    await waitFor(() => expect(mobileDetail).toHaveAttribute("data-group-id", "group-goed-main"));
    expect(mobileDetail).toHaveAttribute("data-entry-count", "2");
  });

  test.each([
    ["HTTP 403", new Error("lookup_http_403"), "tijdelijk niet beschikbaar"],
    ["HTTP 503", new Error("lookup_http_503"), "tijdelijk niet beschikbaar"],
    ["contract mismatch", new Error("contract-mismatch"), "tijdelijk niet beschikbaar"],
    ["timeout", new Error("platform_request_timeout"), "duurde te lang"],
  ])("shows a retryable Library error for %s", async (_label, error, message) => {
    fetchGroupPage.mockReset();
    fetchGroupPage
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce({
        groups: [firstGroup],
        selectedTierComplete: true,
        nextGroupCursor: null,
      });

    render(<Harness />);

    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    fireEvent.click(screen.getByRole("button", { name: "Opnieuw proberen" }));
    expect(await screen.findByTestId("library-headword-group-group-goed-main")).toBeInTheDocument();
  });

  test("ignores a caller abort without presenting a failure", async () => {
    fetchGroupPage.mockReset();
    fetchGroupPage.mockRejectedValueOnce(new DOMException("Aborted", "AbortError"));

    render(<Harness />);

    await waitFor(() => expect(fetchGroupPage).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  test("does not let a stale rejection replace newer successful results", async () => {
    fetchGroupPage.mockReset();
    const oldSearch = deferred<never>();
    fetchGroupPage
      .mockReturnValueOnce(oldSearch.promise)
      .mockResolvedValueOnce({
        groups: [nextPageGroup],
        selectedTierComplete: true,
        nextGroupCursor: null,
      });

    render(<Harness />);
    fireEvent.change(screen.getByRole("textbox",{name:"Woorden zoeken"}), {
      target: { value: "gracht" },
    });

    expect(await screen.findByTestId("library-headword-group-group-goed-next-page")).toBeInTheDocument();
    oldSearch.reject(new Error("lookup_http_503"));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  });
});

const scopeA="8746de41-779a-444d-be38-287efc416d8f",scopeB="8746de41-779a-444d-be38-287efc416d8a";
const materialRepository=(paused=false)=>({
 load:async()=>({revision:1,document:{schemaVersion:1 as const,learningLanguages:[{code:"nl",paused},{code:"en",paused:false}],disabledDictionaryIds:[scopeA]}}),
 save:vi.fn(),languages:async()=>["nl","en"].map(code=>({code,label:code,dictionaryCount:2,curatedListCount:0,userListCount:0,hasTrainingEligibleLists:true})),
});
const source=(id:string,name:string)=>({id,name,languageCode:"nl",slug:name,kind:"curated",isEditable:false,entryCount:10});

test("approved search choices exclude disabled material and changed source starts at the first scoped page",async()=>{
 vi.stubEnv("NEXT_PUBLIC_TRAINING_PRESENTATION_V1","true");
 const {AccountMaterialProvider}=await import("@/components/practice/material/AccountMaterialProvider");
 readableSources.mockReset().mockResolvedValue([source(scopeA,"Disabled A"),source(scopeB,"Enabled B")]);
 const group=goedGroup("enabled-b",scopeB,"Enabled B",[sense("entry-b","zn")]);
 fetchGroupPage.mockReset().mockResolvedValue({groups:[group],selectedTierComplete:true,nextGroupCursor:"next-scoped"});
 render(<AccountMaterialProvider userId="user-1" repository={materialRepository()}><Harness/></AccountMaterialProvider>);
 await screen.findByTestId("library-headword-group-enabled-b");
 expect(screen.queryByRole("option",{name:"Disabled A"})).not.toBeInTheDocument();
 expect(fetchGroupPage).toHaveBeenLastCalledWith(expect.objectContaining({libraryScope:{dictionaryIds:null},cursor:null}));
 fireEvent.click(within(screen.getByTestId("library-group-pagination")).getByRole("button",{name:"Volgende"}));
 await waitFor(()=>expect(fetchGroupPage).toHaveBeenLastCalledWith(expect.objectContaining({cursor:"next-scoped"})));
 fireEvent.change(screen.getByLabelText("Woordenboekbron"),{target:{value:scopeB}});
 await waitFor(()=>expect(fetchGroupPage).toHaveBeenLastCalledWith(expect.objectContaining({libraryScope:{dictionaryIds:[scopeB]},cursor:null})));
 expect(screen.getByTestId("library-headword-group-enabled-b")).toBeInTheDocument();
});

test("a server cursor invalidated by another device restarts scoped search once",async()=>{
 vi.stubEnv("NEXT_PUBLIC_TRAINING_PRESENTATION_V1","true");
 const {AccountMaterialProvider}=await import("@/components/practice/material/AccountMaterialProvider");
 readableSources.mockReset().mockResolvedValue([source(scopeB,"Enabled B")]);
 fetchGroupPage.mockReset().mockRejectedValueOnce(Object.assign(new Error("invalid-cursor"),{name:"PlatformV2LibraryLookupError",kind:"invalid-cursor"})).mockResolvedValue({groups:[firstGroup],selectedTierComplete:true,nextGroupCursor:null});
 render(<AccountMaterialProvider userId="user-1" repository={materialRepository()}><Harness initial={{page:2,groupPageCursors:[null,"stale"],groupScopeKey:JSON.stringify(["user-1",1,"nl",null,"goed"])}}/></AccountMaterialProvider>);
 await screen.findByTestId("library-headword-group-group-goed-main");
 expect(fetchGroupPage.mock.calls[0][0].cursor).toBe("stale");
 expect(fetchGroupPage).toHaveBeenLastCalledWith(expect.objectContaining({cursor:null}));
 expect(fetchGroupPage).toHaveBeenCalledTimes(2);
 expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

test("Library picks an active local search language without changing the training scope",async()=>{
 vi.stubEnv("NEXT_PUBLIC_TRAINING_PRESENTATION_V1","true");
 const {AccountMaterialProvider}=await import("@/components/practice/material/AccountMaterialProvider");
 readableSources.mockReset().mockResolvedValue([]);
 fetchGroupPage.mockReset().mockResolvedValue({groups:[],selectedTierComplete:true,nextGroupCursor:null});
 render(<AccountMaterialProvider userId="user-1" repository={materialRepository(true)}><Harness/></AccountMaterialProvider>);
 await waitFor(()=>expect(fetchGroupPage).toHaveBeenCalled());
 expect(screen.getByLabelText("Leertaal")).toHaveValue("en");
 expect(screen.queryByRole("option",{name:"Nederlands"})).not.toBeInTheDocument();
 expect(fetchGroupPage.mock.calls.every(call=>call[0].contentLanguageCode==="en")).toBe(true);
});


test("approved Library copy and grouped rows follow interface locale without changing entry selection",async()=>{
 vi.stubEnv("NEXT_PUBLIC_SHARED_ARTICLE_PRESENTATION_V1","true");
 fetchGroupPage.mockResolvedValue({groups:[homographGroup],nextGroupCursor:null});
 const view=render(<Harness locale="en"/>);
 const row=await screen.findByTestId("library-headword-group-group-goed-homograph");
 expect(row).toHaveTextContent("noun");expect(row).toHaveTextContent("1 meaning");
 expect(screen.getByRole("textbox",{name:"Search words"})).toHaveValue("goed");
 view.rerender(<Harness locale="ru"/>);
 expect(screen.getByRole("textbox",{name:"Поиск слов"})).toHaveValue("goed");
 expect(await screen.findByTestId("library-headword-group-group-goed-homograph")).toHaveTextContent("существительное");
 expect(row).toHaveTextContent("1 значение");expect(row).toHaveAttribute("aria-pressed","true");
 expect(screen.getByRole("button",{name:"Добавить запись"})).toBeInTheDocument();
 expect(screen.getByRole("button",{name:"Далее"})).toBeDisabled();
});

test("approved chips panel excludes disabled sources, cancels drafts and applies filters on the first page",async()=>{
 vi.stubEnv("NEXT_PUBLIC_TRAINING_PRESENTATION_V1","true");vi.stubEnv("NEXT_PUBLIC_SHARED_ARTICLE_PRESENTATION_V1","true");
 const {AccountMaterialProvider}=await import("@/components/practice/material/AccountMaterialProvider");
 const {getUiMessages}=await import("@/lib/uiMessages");const copy=getUiMessages("nl");
 readableSources.mockReset().mockResolvedValue([source(scopeA,"Disabled A"),source(scopeB,"Enabled B")]);
 const group=goedGroup("enabled-b",scopeB,"Enabled B",[sense("entry-b","zn")]);
 fetchGroupPage.mockReset().mockResolvedValue({groups:[group],selectedTierComplete:true,nextGroupCursor:null,librarySearch:{totalGroups:1,matchingEntryIds:["entry-b"]}});
 const repository=materialRepository();render(<AccountMaterialProvider userId="user-1" repository={repository}><Harness/></AccountMaterialProvider>);
 await screen.findByTestId("library-headword-group-enabled-b");
 expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole("button",{name:copy.library.filters}));
 fireEvent.click(screen.getByRole("button",{name:new RegExp(`^${copy.builder.source}`)}));
 await screen.findByRole("button",{name:"Enabled B"});expect(screen.queryByRole("button",{name:"Disabled A"})).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole("button",{name:"Enabled B"}));fireEvent.click(screen.getByRole("button",{name:copy.library.ok}));
 fireEvent.click(screen.getByRole("button",{name:copy.builder.cancel}));
 expect(fetchGroupPage.mock.calls.filter(call=>!call[0].signal).at(-1)?.[0].libraryScope.dictionaryIds).toBeNull();
 fireEvent.click(screen.getByRole("button",{name:copy.library.filters}));fireEvent.click(screen.getByRole("button",{name:copy.builder.parts.Nouns}));
 await waitFor(()=>expect(screen.getByRole("button",{name:copy.library.showResults})).toBeEnabled());
 fireEvent.click(screen.getByRole("button",{name:copy.library.showResults}));
 await waitFor(()=>expect(fetchGroupPage.mock.calls.filter(call=>!call[0].signal).at(-1)?.[0]).toMatchObject({cursor:null,libraryScope:{dictionaryIds:null,filters:{parts:["noun"],article:null}}}));
 expect(repository.save).not.toHaveBeenCalled();
});

beforeEach(()=>{
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {configurable:true,value:function(this:HTMLDialogElement){this.setAttribute("open","");}});
  Object.defineProperty(HTMLDialogElement.prototype, "close", {configurable:true,value:function(this:HTMLDialogElement){this.removeAttribute("open");}});
});
