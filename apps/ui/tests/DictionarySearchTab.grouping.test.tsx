import React from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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

function Harness({preload=false,open=true,initial = {},locale="nl",translationLang="en",collection=false}: {preload?:boolean;open?:boolean;collection?:boolean;initial?: Partial<DictionarySearchTabState>;locale?: "en"|"nl"|"ru";translationLang?:string|null} = {}) {
  const [state, setState] = React.useState<DictionarySearchTabState>(() => ({
    ...createDictionarySearchTabState(),
    query: "goed",
    languageCode: "nl",
    ...initial,
  }));
  return (
    <DictionarySearchTab
      open={open}
      preload={preload}
      userId="user-1"
      language="nl"
      translationLang={translationLang}
      interfaceLanguage={locale}
      userLists={[]}
      viewedListId={collection ? "owned-list" : null}
      viewedList={collection ? {id:"owned-list",name:"My collection",type:"user",language_code:"nl"} : null}
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

  test("debounces typing into one lookup and aborts the superseded one", async () => {
    fetchGroupPage.mockReset();
    fetchGroupPage.mockResolvedValue({
      groups: [nextPageGroup],
      selectedTierComplete: true,
      nextGroupCursor: null,
    });

    render(<Harness />);
    await waitFor(() => expect(fetchGroupPage).toHaveBeenCalledTimes(1));
    const initialSignal = fetchGroupPage.mock.calls[0][0].signal as AbortSignal;
    const input = screen.getByRole("textbox", { name: "Woorden zoeken" });
    for (const value of ["h", "hu", "hui", "huis"]) {
      fireEvent.change(input, { target: { value } });
    }

    await waitFor(() => expect(fetchGroupPage).toHaveBeenCalledTimes(2));
    expect(fetchGroupPage.mock.calls[1][0]).toMatchObject({ query: "huis" });
    expect(initialSignal.aborted).toBe(true);
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
 expect(screen.queryByRole("button",{name:"Добавить запись"})).not.toBeInTheDocument();
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
 expect(fetchGroupPage.mock.calls.filter(call=>"cursor" in call[0]).at(-1)?.[0].libraryScope.dictionaryIds).toBeNull();
 fireEvent.click(screen.getByRole("button",{name:copy.library.filters}));fireEvent.click(screen.getByRole("button",{name:copy.builder.parts.Nouns}));
 await waitFor(()=>expect(screen.getByRole("button",{name:copy.library.showResults})).toBeEnabled());
 fireEvent.click(screen.getByRole("button",{name:copy.library.showResults}));
 await waitFor(()=>expect(fetchGroupPage.mock.calls.filter(call=>"cursor" in call[0]).at(-1)?.[0]).toMatchObject({cursor:null,libraryScope:{dictionaryIds:null,filters:{parts:["noun"],article:null}}}));
 expect(repository.save).not.toHaveBeenCalled();
});

beforeEach(()=>{
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {configurable:true,value:function(this:HTMLDialogElement){this.setAttribute("open","");}});
  Object.defineProperty(HTMLDialogElement.prototype, "close", {configurable:true,value:function(this:HTMLDialogElement){this.removeAttribute("open");}});
});


test("personal entry translations use the account target language rather than English", async () => {
  const service = await import("@/lib/trainingService");
  vi.mocked(service.createUserDictionaryEntry).mockResolvedValue("created-entry");
  render(<Harness locale="en" translationLang="ru" />);
  fireEvent.click(screen.getByRole("button", {name:"Add entry"}));
  fireEvent.change(screen.getByLabelText(/Translation · Russian/), {target:{value:"хороший"}});
  fireEvent.click(screen.getByRole("button", {name:"Save to my dictionary"}));
  await waitFor(() => expect(service.createUserDictionaryEntry).toHaveBeenLastCalledWith({entry:{headword:"goed",languageCode:"nl",translation:{languageCode:"ru",text:"хороший"}}}));
});

test("turning translations off disables the field and omits an existing translation draft", async () => {
  const service = await import("@/lib/trainingService");
  vi.mocked(service.createUserDictionaryEntry).mockResolvedValue("created-entry");
  const view = render(<Harness locale="en" translationLang="ru" />);
  fireEvent.click(screen.getByRole("button", {name:"Add entry"}));
  fireEvent.change(screen.getByLabelText(/Translation · Russian/), {target:{value:"хороший"}});
  fireEvent.change(screen.getByLabelText("Definition"), {target:{value:"goed zijn"}});
  view.rerender(<Harness locale="en" translationLang={null} />);
  expect(screen.getByLabelText("Translation")).toBeDisabled();
  fireEvent.click(screen.getByRole("button", {name:"Save to my dictionary"}));
  await waitFor(() => expect(service.createUserDictionaryEntry).toHaveBeenLastCalledWith({entry:{headword:"goed",languageCode:"nl",definition:"goed zijn"}}));
});


test("owned collection entries use shared Library rows while retaining entry selection", async () => {
  vi.stubEnv("NEXT_PUBLIC_SHARED_ARTICLE_PRESENTATION_V1", "true");
  const service = await import("@/lib/trainingService");
  vi.mocked(service.fetchWordsForList).mockResolvedValueOnce({items:[{id:"owned-entry",headword:"huis",gender:"het",language_code:"nl",dictionary_name:"Personal",part_of_speech:"zn",raw:{meanings:[{definition:"een gebouw"}]}}],total:1});
  render(<Harness locale="en" collection initial={{applyListFilter:true}} />);
  const row = await screen.findByRole("button", {name:/het huis/});
  expect(row).toHaveTextContent("1 meaning");
  expect(row).toHaveTextContent("een gebouw");
  fireEvent.click(row);
  await waitFor(() => expect(service.fetchDictionaryEntryById).toHaveBeenCalledWith("owned-entry","user-1"));
  expect(service.fetchWordsForList).toHaveBeenCalledWith("owned-list","user",expect.objectContaining({query:"goed",page:1}));
});

test("changing translation target never retags an old draft with a different language", async () => {
  const service = await import("@/lib/trainingService");
  vi.mocked(service.createUserDictionaryEntry).mockResolvedValue("created-entry");
  const view = render(<Harness locale="en" translationLang="ru" />);
  fireEvent.click(screen.getByRole("button", {name:"Add entry"}));
  fireEvent.change(screen.getByLabelText(/Translation · Russian/), {target:{value:"хороший"}});
  fireEvent.change(screen.getByLabelText("Definition"), {target:{value:"goed zijn"}});
  view.rerender(<Harness locale="en" translationLang="de" />);
  expect(screen.getByLabelText(/Translation · German/)).toHaveValue("");
  fireEvent.click(screen.getByRole("button", {name:"Save to my dictionary"}));
  await waitFor(() => expect(service.createUserDictionaryEntry).toHaveBeenLastCalledWith({entry:{headword:"goed",languageCode:"nl",definition:"goed zijn"}}));
});

test("approved Library omits personal entry controls without calling the create API", async () => {
  vi.stubEnv("NEXT_PUBLIC_SHARED_ARTICLE_PRESENTATION_V1", "true");
  const service = await import("@/lib/trainingService");
  vi.mocked(service.createUserDictionaryEntry).mockClear();
  render(<Harness locale="en" />);
  await waitFor(() => expect(fetchGroupPage).toHaveBeenCalled());
  expect(screen.queryByText("My dictionary")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", {name:"Add entry"})).not.toBeInTheDocument();
  expect(service.createUserDictionaryEntry).not.toHaveBeenCalled();
});

test("legacy personal editor can close without creating an entry", async () => {
  const service = await import("@/lib/trainingService");
  vi.mocked(service.createUserDictionaryEntry).mockClear();
  await act(async () => { render(<Harness locale="en" />); });
  fireEvent.click(screen.getByRole("button", {name:"Add entry"}));
  expect(screen.getByLabelText("Headword")).toHaveValue("goed");
  fireEvent.click(screen.getByRole("button", {name:"Close"}));
  expect(screen.queryByLabelText("Headword")).not.toBeInTheDocument();
  expect(service.createUserDictionaryEntry).not.toHaveBeenCalled();
});

test("pending legacy entry creation prevents duplicate submission", async () => {
  const service = await import("@/lib/trainingService");
  const pending = deferred<string>();
  vi.mocked(service.createUserDictionaryEntry).mockClear().mockReturnValueOnce(pending.promise);
  await act(async () => { render(<Harness locale="en" />); });
  fireEvent.click(screen.getByRole("button", {name:"Add entry"}));
  fireEvent.change(screen.getByLabelText("Definition"), {target:{value:"goed zijn"}});
  const save = screen.getByRole("button", {name:"Save to my dictionary"});
  fireEvent.click(save);
  await waitFor(() => expect(save).toBeDisabled());
  fireEvent.click(save);
  pending.resolve("created-entry");
  await waitFor(() => expect(screen.queryByLabelText("Headword")).not.toBeInTheDocument());
  expect(service.createUserDictionaryEntry).toHaveBeenCalledOnce();
});

test.each(["en", "nl", "ru"] as const)("approved Library toolbar omits query instruction in %s", async (locale) => {
  vi.stubEnv("NEXT_PUBLIC_SHARED_ARTICLE_PRESENTATION_V1", "true");
  const {getUiMessages} = await import("@/lib/uiMessages");
  await act(async () => { render(<Harness locale={locale} initial={{query:""}} />); });
  expect(screen.queryByText(getUiMessages(locale).library.typeQuery)).not.toBeInTheDocument();
});

test("approved Library browses immediately with server totals and cursor paging", async () => {
  vi.stubEnv("NEXT_PUBLIC_SHARED_ARTICLE_PRESENTATION_V1", "true");
  vi.stubEnv("NEXT_PUBLIC_TRAINING_PRESENTATION_V1", "true");
  const {AccountMaterialProvider}=await import("@/components/practice/material/AccountMaterialProvider");
  readableSources.mockReset().mockResolvedValue([source(scopeB,"Enabled B")]);
  fetchGroupPage.mockReset().mockResolvedValue({groups:[homographGroup],selectedTierComplete:false,nextGroupCursor:"browse-next",librarySearch:{totalGroups:42,matchingEntryIds:["entry-goed-zn"]}});
  render(<AccountMaterialProvider userId="user-1" repository={materialRepository()}><Harness locale="en" initial={{query:""}}/></AccountMaterialProvider>);
  await screen.findByTestId("library-headword-group-group-goed-homograph");
  expect(fetchGroupPage).toHaveBeenLastCalledWith(expect.objectContaining({query:"",cursor:null,libraryScope:{dictionaryIds:null,filters:{parts:[],article:null}}}));
  expect(screen.getByText("42 matching articles")).toBeInTheDocument();
  expect(screen.getByText("1 / 1")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button",{name:"Next"}));
  await waitFor(()=>expect(fetchGroupPage).toHaveBeenLastCalledWith(expect.objectContaining({query:"",cursor:"browse-next"})));
});

test("initial browse loading does not show an empty result and failure can retry", async () => {
  vi.stubEnv("NEXT_PUBLIC_SHARED_ARTICLE_PRESENTATION_V1", "true");
  vi.stubEnv("NEXT_PUBLIC_TRAINING_PRESENTATION_V1", "true");
  const {AccountMaterialProvider}=await import("@/components/practice/material/AccountMaterialProvider");
  const pending=deferred<unknown>();
  readableSources.mockReset().mockResolvedValue([source(scopeB,"Enabled B")]);
  fetchGroupPage.mockReset().mockReturnValueOnce(pending.promise).mockResolvedValue({groups:[homographGroup],selectedTierComplete:true,nextGroupCursor:null,librarySearch:{totalGroups:1,matchingEntryIds:["entry-goed-zn"]}});
  render(<AccountMaterialProvider userId="user-1" repository={materialRepository()}><Harness locale="en" initial={{query:""}}/></AccountMaterialProvider>);
  await waitFor(()=>expect(fetchGroupPage).toHaveBeenCalled());
  expect(screen.queryByText("No words found")).not.toBeInTheDocument();
  expect(screen.queryByText("0 matching articles")).not.toBeInTheDocument();
  expect(screen.queryByTestId("library-group-pagination")).not.toBeInTheDocument();
  expect(screen.queryByTestId("library-headword-group-group-goed-homograph")).not.toBeInTheDocument();
  await act(async()=>{pending.reject(new Error("lookup_http_503"));});
  expect(await screen.findByRole("alert")).toBeInTheDocument();
  expect(screen.queryByText("0 matching articles")).not.toBeInTheDocument();
  expect(screen.queryByTestId("library-group-pagination")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button",{name:"Try again"}));
  await screen.findByTestId("library-headword-group-group-goed-homograph");
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

test("returning to Library within a second retains results without another list request",async () => {
 fetchGroupPage.mockReset();
 fetchGroupPage.mockResolvedValue({groups:[firstGroup],selectedTierComplete:true,nextGroupCursor:null});
 const view=render(<Harness open />);
 await screen.findByTestId("library-headword-group-group-goed-main");
 const firstReads=fetchGroupPage.mock.calls.length;
 view.rerender(<Harness open={false}/>);
 view.rerender(<Harness open/>);
 await act(async()=>{await new Promise(resolve=>setTimeout(resolve,20));});
 expect(screen.getByTestId("library-headword-group-group-goed-main")).toBeVisible();
 expect(fetchGroupPage).toHaveBeenCalledTimes(firstReads);
});


test("preloaded results are reused on first visible entry", async () => {
  fetchGroupPage.mockReset().mockResolvedValue({groups:[firstGroup],selectedTierComplete:true,nextGroupCursor:null});
  const view=render(<Harness open={false} preload />);
  await screen.findByTestId("library-headword-group-group-goed-main");
  const reads=fetchGroupPage.mock.calls.length;
  view.rerender(<Harness open preload />);
  await act(async()=>{await new Promise(resolve=>setTimeout(resolve,20));});
  expect(fetchGroupPage).toHaveBeenCalledTimes(reads);
});

test("returning after freshness expires refreshes retained results", async () => {
  fetchGroupPage.mockReset().mockResolvedValue({groups:[firstGroup],selectedTierComplete:true,nextGroupCursor:null});
  const view=render(<Harness open preload />);
  await screen.findByTestId("library-headword-group-group-goed-main");
  const reads=fetchGroupPage.mock.calls.length;
  view.rerender(<Harness open={false} preload />);
  const now=Date.now();
  const clock=vi.spyOn(Date,"now").mockReturnValue(now+31000);
  try {
    view.rerender(<Harness open preload />);
    await waitFor(()=>expect(fetchGroupPage).toHaveBeenCalledTimes(reads+1));
    expect(screen.getByTestId("library-headword-group-group-goed-main")).toBeVisible();
  } finally { clock.mockRestore(); }
});

test("background refresh failure retains the usable Library list", async () => {
  fetchGroupPage.mockReset().mockResolvedValue({groups:[firstGroup],selectedTierComplete:true,nextGroupCursor:null});
  const view=render(<Harness open preload />);
  await screen.findByTestId("library-headword-group-group-goed-main");
  view.rerender(<Harness open={false} preload />);
  fetchGroupPage.mockRejectedValueOnce(new Error("lookup_http_503"));
  const clock=vi.spyOn(Date,"now").mockReturnValue(Date.now()+31000);
  try {
    view.rerender(<Harness open preload />);
    await screen.findByRole("alert");
    expect(screen.getByTestId("library-headword-group-group-goed-main")).toBeVisible();
  } finally { clock.mockRestore(); }
});
