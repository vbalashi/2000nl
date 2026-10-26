const selectedRead=vi.hoisted(()=>vi.fn());
vi.mock('@/lib/collections/sharing/selectedMembership',()=>({readSelectedMembership:selectedRead}));
const noteHintRead=vi.hoisted(()=>({refresh:undefined as undefined|(()=>void|Promise<unknown>),blocked:undefined as undefined|(()=>boolean)}));
vi.mock("@/lib/events/userEventHints",async importOriginal=>{
 const actual=await importOriginal<typeof import("@/lib/events/userEventHints")>();
 return {...actual,useUserEventHints:(...args:Parameters<typeof actual.useUserEventHints>)=>{
  noteHintRead.refresh=args[2];noteHintRead.blocked=args[3];return actual.useUserEventHints(...args);
 }};
});
import React from "react";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  LibrarySenseCardV2Session,
  TrainingMoreSenseCardV2Session,
} from "@/components/training/library-v2/LibrarySenseCardV2Session";
import {
  financeEntry,
  furnitureEntry,
  multiSenseBankGroup,
} from "./platformV2LibraryFixture";
import { goedEntry, goedGroup } from "./platformV2IdiomHierarchyFixture";
import type {
  PlatformHeadwordGroupV2,
  PlatformSenseCardCapabilityV2,
} from "../../../packages/shared/types/platformV2";
import type { EntryLearningListMembership } from "@/lib/types";

import { publishDictionaryTranslationReady } from "@/lib/translation/dictionaryTranslationEvents";

const firstJoin = vi.hoisted(() => ({ enabled: false, subscriptions: 0 }));
vi.mock("@/lib/translation/dictionaryTranslationEvents", async importOriginal => {
  const actual = await importOriginal<typeof import("@/lib/translation/dictionaryTranslationEvents")>();
  return {...actual, onDictionaryTranslationReady: (listener: Parameters<typeof actual.onDictionaryTranslationReady>[0], scope?: Parameters<typeof actual.onDictionaryTranslationReady>[1]) => {
    const stop = actual.onDictionaryTranslationReady(listener, scope);
    if (firstJoin.enabled && scope) { firstJoin.subscriptions++; listener(scope); }
    return stop;
  }};
});

const resolveLibraryAudio=vi.hoisted(()=>vi.fn());
vi.mock("@/lib/platform/platformV2TrainingClient",()=>({resolvePlatformV2Audio:resolveLibraryAudio}));
const currentRead = vi.hoisted(() => vi.fn());
vi.mock("@/lib/platform/trainingCurrentCardClient", () => ({readCurrentTrainingCard: currentRead}));
const fetchGroup = vi.fn();
const fetchCrossReferenceTarget = vi.fn();
const requestTranslation = vi.fn();
const performAction = vi.fn();
const queueDiagnosticReport = vi.fn();
const freezeSnapshot = vi.fn((input: unknown) => input);
const fetchMemberships = vi.fn();
const removeFromList = vi.fn();

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((next, fail) => {
    resolve = next;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function membership(listId: string): EntryLearningListMembership {
  return {
    listId,
    listType: "user",
    name: listId,
    editable: true,
    isActiveTrainingList: false,
  };
}

function curatedMembership(listId: string): EntryLearningListMembership {
  return {
    listId,
    listType: "curated",
    name: listId,
    editable: false,
    readOnlyReason: "curated",
    isActiveTrainingList: false,
  };
}

function remapCapabilityEntryId(
  capability: PlatformSenseCardCapabilityV2,
  entryId: string,
): PlatformSenseCardCapabilityV2 {
  switch (capability.actionId) {
    case "start-learning":
    case "mark-known":
    case "review-card":
      return {
        ...capability,
        target: {
          ...capability.target,
          entryId,
          stateRevision: `state-${entryId}`,
        },
      };
    case "undo-known":
      return {
        ...capability,
        target: {
          ...capability.target,
          entryId,
          stateRevision: `state-${entryId}`,
        },
      };
    case "report-content":
      if (capability.target.kind !== "entry") return capability;
      return {
        ...capability,
        target: {
          ...capability.target,
          entryId,
          contentRevision: `content-${entryId}`,
        },
      };
    default:
      return capability;
  }
}

function singleSenseGroup(
  headwordGroupId: string,
  entryId: string,
  headword: string,
  definition: string,
): PlatformHeadwordGroupV2 {
  return {
    ...multiSenseBankGroup,
    headwordGroupId,
    header: {
      ...multiSenseBankGroup.header,
      text: headword,
      displayPronunciation: headword,
    },
    senseCount: 1,
    entryCount: 1,
    entries: [
      {
        ...financeEntry,
        entryId,
        contentRevision: `content-${entryId}`,
        contentNodes: financeEntry.contentNodes.map((node, index) => ({
          ...node,
          contentNodeId: `${node.kind}-${entryId}`,
          text: index === 0 ? definition : node.text,
        })),
        capabilities: financeEntry.capabilities.map((capability) =>
          remapCapabilityEntryId(capability, entryId),
        ),
      },
    ],
  };
}

vi.mock("@/lib/platform/platformV2LibraryClient", () => ({
  fetchPlatformV2LibraryGroup: (...args: unknown[]) => fetchGroup(...args),
  fetchPlatformV2CrossReferenceTarget: (...args: unknown[]) =>
    fetchCrossReferenceTarget(...args),
  requestPlatformV2LibraryTranslation: (...args: unknown[]) =>
    requestTranslation(...args),
}));

vi.mock("@/lib/platform/platformV2TrainingActionClient", () => ({
  performPlatformV2LibraryAction: (...args: unknown[]) =>
    performAction(...args),
}));

vi.mock("@/lib/feedback/diagnosticReportClient", () => ({
  freezeSenseCardDiagnosticSnapshot: (input: unknown) => freezeSnapshot(input),
  buildSenseCardDiagnosticReport: (input: unknown) => Promise.resolve(input),
  queuePreparedSenseCardDiagnosticReport: (...args: unknown[]) =>
    queueDiagnosticReport(...args),
}));

vi.mock("@/lib/trainingService", () => ({
  addWordsToUserList: vi.fn(),
  createUserList: vi.fn(),
  fetchEntryListMemberships: (...args: unknown[]) => fetchMemberships(...args),
  removeWordsFromUserList: (...args: unknown[]) => removeFromList(...args),
}));

describe("LibrarySenseCardV2Session", () => {
  test("translation completion preserves authoritative exclusion and never performs a learning action", async () => {
    const group = structuredClone(multiSenseBankGroup);
    const entry = group.entries.find(item => item.kind === "sense-card" && item.entryId === financeEntry.entryId)!;
    if (entry.kind !== "sense-card" || !entry.card) throw new Error("fixture");
    entry.card.meaningProgress = {
      entryId: entry.entryId, headword: "bank", exclusionId: "excluded", revision: "a".repeat(64),
      directions: ["word-to-definition", "definition-to-word"].map(cardTypeId => ({
        cardTypeId: cardTypeId as "word-to-definition" | "definition-to-word", stateRevision: "untracked",
        knownMarkId: null, knownMarkRevision: null, knownMarkedAt: null, phase: "learning" as const,
        presentations: 5, gradedAttempts: 8, lastGrade: null, lastReviewedAt: null,
        nextReviewAt: null, stability: null, difficulty: null,
      })),
    };
    fetchGroup.mockResolvedValue(group);
    render(<LibrarySenseCardV2Session entryId={financeEntry.entryId} initialGroup={group} headword="bank"
      contentLanguageCode="nl" translationTargetLanguageCode="en" interfaceLanguage="en" />);
    await waitFor(() => expect(fetchGroup).toHaveBeenCalledOnce());
    expect(within(screen.getByTestId(`library-sense-card-${financeEntry.entryId}`)).getByText("Not studied")).toBeInTheDocument();
    act(() => publishDictionaryTranslationReady({entryId: financeEntry.entryId, targetLanguageCode: "en"}));
    await waitFor(() => expect(fetchGroup).toHaveBeenCalledTimes(2));
    expect(within(screen.getByTestId(`library-sense-card-${financeEntry.entryId}`)).getByText("Not studied")).toBeInTheDocument();
    expect(performAction).not.toHaveBeenCalled();
  });

  test("revalidates an initial group and prepares an incomplete visible meaning even with a ready headword", async () => {
    const incomplete = structuredClone(multiSenseBankGroup);
    const entry = incomplete.entries.find(item => item.kind === "sense-card" && item.entryId === financeEntry.entryId)!;
    if (entry.kind !== "sense-card") throw new Error("fixture");
    entry.capabilities.push({actionId:"request-translation",elementId:"translate",messageKey:"senseCard.translation.request",target:{kind:"entry",entryId:entry.entryId,contentRevision:entry.contentRevision},targetLanguageCode:"en"});
    fetchGroup.mockResolvedValueOnce(incomplete).mockResolvedValue(multiSenseBankGroup);
    requestTranslation.mockResolvedValue("ready");
    render(<LibrarySenseCardV2Session entryId={financeEntry.entryId} initialGroup={multiSenseBankGroup} headword="bank" contentLanguageCode="nl" translationTargetLanguageCode="en" interfaceLanguage="en" />);
    await waitFor(() => expect(requestTranslation).toHaveBeenCalledOnce());
    await waitFor(() => expect(fetchGroup).toHaveBeenCalledTimes(2));
    expect(requestTranslation).toHaveBeenCalledWith(expect.objectContaining({entryId:financeEntry.entryId,targetLanguageCode:"en",force:false,signal:expect.any(AbortSignal)}));
    expect(performAction).not.toHaveBeenCalled();
  });
  test("completion refresh failure exposes retry instead of permanent loading", async () => {
    fetchGroup.mockResolvedValueOnce(multiSenseBankGroup).mockRejectedValueOnce(new Error("offline")).mockResolvedValue(multiSenseBankGroup);
    render(<LibrarySenseCardV2Session entryId={financeEntry.entryId} headword="bank" contentLanguageCode="nl" translationTargetLanguageCode="en" interfaceLanguage="en" />);
    await screen.findByTestId("library-sense-card-group");
    act(() => publishDictionaryTranslationReady({entryId:financeEntry.entryId,targetLanguageCode:"en"}));
    fireEvent.click(await screen.findByRole("button", {name:"Retry"}));
    await waitFor(() => expect(fetchGroup).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(screen.queryByRole("button", {name:"Retry"})).not.toBeInTheDocument());
  });

  test("focus resumes a failed preparation even with the same source and existing repair capability",async()=>{
    const incomplete=structuredClone(multiSenseBankGroup);
    const entry=incomplete.entries.find(item=>item.kind==="sense-card"&&item.entryId===financeEntry.entryId)!;
    if(entry.kind!=="sense-card")throw Error("fixture");
    entry.capabilities.push({actionId:"request-translation",elementId:"translate",messageKey:"senseCard.translation.request",target:{kind:"entry",entryId:entry.entryId,contentRevision:entry.contentRevision},targetLanguageCode:"en"});
    fetchGroup.mockResolvedValueOnce(incomplete).mockResolvedValueOnce(incomplete).mockResolvedValue(multiSenseBankGroup);
    requestTranslation.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce("ready");
    render(<LibrarySenseCardV2Session entryId={financeEntry.entryId} headword="bank" contentLanguageCode="nl" translationTargetLanguageCode="en" interfaceLanguage="en"/>);
    await waitFor(()=>expect(requestTranslation).toHaveBeenCalledOnce());await act(async()=>{});
    await act(async()=>window.dispatchEvent(new Event("focus")));
    await waitFor(()=>expect(requestTranslation).toHaveBeenCalledTimes(2));
    expect(requestTranslation.mock.calls.every(([input])=>input.force===false)).toBe(true);
    expect(performAction).not.toHaveBeenCalled();
  });

  test("focus refreshes a collapsed meaning without starting hidden translation preparation",async()=>{
    const incomplete=structuredClone(multiSenseBankGroup),entry=incomplete.entries.find(item=>item.kind==="sense-card"&&item.entryId===financeEntry.entryId)!;
    if(entry.kind!=="sense-card")throw Error("fixture");
    entry.capabilities.push({actionId:"request-translation",elementId:"translate",messageKey:"senseCard.translation.request",target:{kind:"entry",entryId:entry.entryId,contentRevision:entry.contentRevision},targetLanguageCode:"en"});
    fetchGroup.mockResolvedValue(incomplete);
    render(<LibrarySenseCardV2Session entryId={financeEntry.entryId} revealActiveMeaning={false} headword="bank" contentLanguageCode="nl" translationTargetLanguageCode="en" interfaceLanguage="en"/>);
    await screen.findByTestId("library-sense-card-group");await act(async()=>window.dispatchEvent(new Event("focus")));
    await waitFor(()=>expect(fetchGroup).toHaveBeenCalledTimes(2));expect(requestTranslation).not.toHaveBeenCalled();
  });

  const groupWithFinanceReportRevision = () => ({
    ...multiSenseBankGroup,
    entries: multiSenseBankGroup.entries.map((entry) =>
      entry.kind === "sense-card" && entry.entryId === financeEntry.entryId
        ? { ...entry, reportContentRevision: "a".repeat(64) }
        : entry,
    ),
  });

  test.each(["updated","revoked","failed"])("note hint %s clears old overlay before the authoritative read without progress mutations",async outcome=>{
    const notes=(text:string)=>[{noteId:"teacher-note",ownerUserId:"teacher",text,revision:"1",isOwn:false}];
    const withNotes=(text?:string):PlatformHeadwordGroupV2=>({...multiSenseBankGroup,entries:multiSenseBankGroup.entries.map(e=>e.kind==="sense-card"&&e.entryId===furnitureEntry.entryId?{...e,noteMaterial:text?notes(text):[]}:e)});
    const initial=withNotes("Seeded note"),first=deferred<PlatformHeadwordGroupV2>();fetchGroup.mockReturnValueOnce(first.promise);
    render(<LibrarySenseCardV2Session userId="note-reader" entryId={furnitureEntry.entryId} initialGroup={initial} headword="bank" contentLanguageCode="nl" translationTargetLanguageCode={null} interfaceLanguage="en"/>);
    expect(screen.queryByText("Seeded note")).not.toBeInTheDocument();
    await act(async()=>first.resolve(withNotes("Current note")));await screen.findByText("Current note");
    const next=deferred<PlatformHeadwordGroupV2>();fetchGroup.mockReturnValueOnce(next.promise);let pending:Promise<unknown>;
    act(()=>{pending=Promise.resolve(noteHintRead.refresh!());});
    expect(screen.queryByText("Current note")).not.toBeInTheDocument();
    await act(async()=>{if(outcome==="failed")next.reject(new Error("offline"));else next.resolve(withNotes(outcome==="updated"?"Updated note":undefined));await pending;});
    if(outcome==="updated")expect(screen.getByText("Updated note")).toBeInTheDocument();else expect(screen.queryByText("Current note")).not.toBeInTheDocument();
    expect(performAction).not.toHaveBeenCalled();
  });
  test("account switch hides the old note and discards a late previous-account response",async()=>{
    const withNotes=(text:string):PlatformHeadwordGroupV2=>({...multiSenseBankGroup,entries:multiSenseBankGroup.entries.map(e=>e.kind==="sense-card"&&e.entryId===furnitureEntry.entryId?{...e,noteMaterial:[{noteId:"teacher-note",ownerUserId:"teacher",text,revision:"1",isOwn:false}]}:e)});
    fetchGroup.mockResolvedValueOnce(withNotes("First account note"));
    const props={entryId:furnitureEntry.entryId,headword:"bank",contentLanguageCode:"nl",translationTargetLanguageCode:null,interfaceLanguage:"en" as const};
    const view=render(<LibrarySenseCardV2Session {...props} userId="first-reader"/>);
    await screen.findByText("First account note");
    const late=deferred<PlatformHeadwordGroupV2>();fetchGroup.mockReturnValueOnce(late.promise);
    let pending:Promise<unknown>;act(()=>{pending=Promise.resolve(noteHintRead.refresh!());});
    const fresh=deferred<PlatformHeadwordGroupV2>();fetchGroup.mockReturnValueOnce(fresh.promise);
    view.rerender(<LibrarySenseCardV2Session {...props} userId="second-reader"/>);
    expect(screen.queryByText("First account note")).not.toBeInTheDocument();
    await act(async()=>{late.resolve(withNotes("Late private note"));await pending;});
    expect(screen.queryByText("Late private note")).not.toBeInTheDocument();
    await act(async()=>fresh.resolve(withNotes("Second account note")));
    await screen.findByText("Second account note");
    expect(performAction).not.toHaveBeenCalled();
  });
  beforeEach(() => {
    Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value() { this.setAttribute("open", ""); } });
    Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value() { this.removeAttribute("open"); } });
    fetchGroup.mockReset();
    fetchCrossReferenceTarget.mockReset();
    performAction.mockReset();
    requestTranslation.mockReset();
    queueDiagnosticReport.mockReset();
    freezeSnapshot.mockClear();
    fetchMemberships.mockReset();
    removeFromList.mockReset();
    removeFromList.mockResolvedValue({error:null});
    fetchGroup.mockResolvedValue(multiSenseBankGroup);
    performAction.mockResolvedValue({
      contractVersion: "platform-action-v2",
      actionId: "start-learning",
      clientEventId: "event-1",
      accepted: true,
      card: financeEntry.card,
    });
    queueDiagnosticReport.mockResolvedValue({ state: "sent" });
    fetchMemberships.mockResolvedValue(new Map());
  });

  test("Learn exposes direct grades inline; a pending double click sends one canonical action", async()=>{
    const learnedGroup=structuredClone(multiSenseBankGroup);
    const learned=learnedGroup.entries.find(item=>item.kind==="sense-card"&&item.entryId===financeEntry.entryId)!;
    if(learned.kind!=="sense-card"||!learned.card)throw new Error("fixture");
    learned.card.scheduler={phase:"learning",repeatCount:0};
    learned.capabilities=furnitureEntry.capabilities.filter(cap=>cap.actionId==="review-card").map(cap=>remapCapabilityEntryId(cap,financeEntry.entryId));
    fetchGroup.mockResolvedValueOnce(multiSenseBankGroup).mockResolvedValue(learnedGroup);
    render(<LibrarySenseCardV2Session entryId={financeEntry.entryId} headword="bank" cardTypeId="definition-to-word"
      contentLanguageCode="nl" translationTargetLanguageCode={null} interfaceLanguage="en"/>);
    const card=await screen.findByTestId(`library-sense-card-${financeEntry.entryId}`);
    expect(performAction).not.toHaveBeenCalled();
    fireEvent.click(within(card).getByRole("button",{name:"Learn"}));
    await within(card).findByRole("button",{name:"Good"});
    expect(within(card).getByText("Learning")).toBeInTheDocument();
    expect(performAction).toHaveBeenCalledWith(expect.objectContaining({actionId:"start-learning",target:expect.objectContaining({entryId:financeEntry.entryId,cardTypeId:"word-to-definition"})}));
    expect(fetchGroup).toHaveBeenCalledWith(expect.objectContaining({cardTypeId:"word-to-definition"}));
    performAction.mockClear();
    const pending=deferred<unknown>();performAction.mockReturnValue(pending.promise);
    const good=within(card).getByRole("button",{name:"Good"});
    fireEvent.click(good);fireEvent.click(good);
    expect(performAction).toHaveBeenCalledOnce();
    expect(performAction).toHaveBeenCalledWith(expect.objectContaining({actionId:"review-card",reviewResult:"success",target:expect.objectContaining({entryId:financeEntry.entryId,cardTypeId:"word-to-definition"})}));
    for(const name of ["Again","Hard","Good","Easy"])expect(within(card).getByRole("button",{name})).toBeDisabled();
    expect(screen.queryByText("Review saved: Good")).not.toBeInTheDocument();
    await act(async()=>pending.resolve({accepted:true}));
    await waitFor(()=>expect(within(card).getByRole("button",{name:"Good"})).toBeEnabled());
    expect(screen.getByText("Review saved: Good")).toHaveAttribute("role", "status");
    expect(within(card).queryByRole("button",{name:"Train next"})).not.toBeInTheDocument();
  });

  test("saved review feedback clears when a different meaning is opened",async()=>{
    const view=render(<LibrarySenseCardV2Session entryId={furnitureEntry.entryId} headword="bank" contentLanguageCode="nl" translationTargetLanguageCode={null} interfaceLanguage="en"/>);
    const card=await screen.findByTestId(`library-sense-card-${furnitureEntry.entryId}`);
    fireEvent.click(within(card).getByRole("button",{name:"Good"}));
    await screen.findByText("Review saved: Good");
    view.rerender(<LibrarySenseCardV2Session entryId={financeEntry.entryId} headword="bank" contentLanguageCode="nl" translationTargetLanguageCode={null} interfaceLanguage="en"/>);
    await waitFor(()=>expect(screen.queryByText("Review saved: Good")).not.toBeInTheDocument());
    expect(performAction).toHaveBeenCalledTimes(1);
  });

  test("accepted grade with failed refresh blocks stale actions and Retry only reads",async()=>{
    fetchGroup.mockResolvedValueOnce(multiSenseBankGroup).mockRejectedValueOnce(new Error("offline")).mockResolvedValue(multiSenseBankGroup);
    render(<LibrarySenseCardV2Session entryId={furnitureEntry.entryId} headword="bank" contentLanguageCode="nl" translationTargetLanguageCode={null} interfaceLanguage="en"/>);
    const card=await screen.findByTestId(`library-sense-card-${furnitureEntry.entryId}`);
    fireEvent.click(within(card).getByRole("button",{name:"Good"}));
    expect(await screen.findByRole("alert")).toHaveTextContent("Saved. Could not reload");
    expect(screen.queryByText("Review saved: Good")).not.toBeInTheDocument();
    expect(within(card).getByRole("button",{name:"Good"})).toBeDisabled();
    expect(performAction).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button",{name:"Retry"}));
    await waitFor(()=>expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    expect(within(card).getByRole("button",{name:"Good"})).toBeEnabled();
    expect(performAction).toHaveBeenCalledOnce();
  });

  test("pending mutation disables all meanings in the same article",async()=>{
    const pending=deferred<unknown>();performAction.mockReturnValue(pending.promise);
    render(<LibrarySenseCardV2Session entryId={furnitureEntry.entryId} headword="bank" contentLanguageCode="nl" translationTargetLanguageCode={null} interfaceLanguage="en"/>);
    const first=await screen.findByTestId(`library-sense-card-${furnitureEntry.entryId}`);
    const second=screen.getByTestId(`library-sense-card-${financeEntry.entryId}`);
    fireEvent.click(within(second).getByRole("button",{name:"Expand meaning"}));
    fireEvent.click(within(first).getByRole("button",{name:"Good"}));
    expect(within(second).getByRole("button",{name:"Learn"})).toBeDisabled();
    fireEvent.click(within(second).getByRole("button",{name:"Learn"}));
    expect(performAction).toHaveBeenCalledOnce();
    await act(async()=>pending.resolve({accepted:true}));
  });

  test("Training More keeps enrolled meanings read-only while new meanings retain Learn",async()=>{
    render(<TrainingMoreSenseCardV2Session entryId={furnitureEntry.entryId} headword="bank" contentLanguageCode="nl" translationTargetLanguageCode={null} interfaceLanguage="en"/>);
    const enrolled=await screen.findByTestId(`library-sense-card-${furnitureEntry.entryId}`);
    expect(within(enrolled).queryByRole("button",{name:"Learn"})).not.toBeInTheDocument();
    expect(within(enrolled).getByRole("note")).toHaveTextContent("Currently practising");
    expect(within(enrolled).getByRole("note")).toHaveTextContent("Rate on the training screen");
    for(const name of ["Again","Hard","Good","Easy"])expect(screen.queryByRole("button",{name})).not.toBeInTheDocument();
    const fresh=screen.getByTestId(`library-sense-card-${financeEntry.entryId}`);
    fireEvent.click(within(fresh).getByRole("button",{name:"Expand meaning"}));
    expect(within(fresh).getByRole("button",{name:"Learn"})).toBeEnabled();
    expect(performAction).not.toHaveBeenCalled();
  });

  test("Training More allows authoritative sibling grades without unlocking the active entry",async()=>{
    render(<TrainingMoreSenseCardV2Session entryId={financeEntry.entryId} initialGroup={multiSenseBankGroup} headword="bank" contentLanguageCode="nl" translationTargetLanguageCode={null} interfaceLanguage="en"/>);
    const active=await screen.findByTestId(`library-sense-card-${financeEntry.entryId}`);
    expect(within(active).queryByRole("button",{name:"Learn"})).not.toBeInTheDocument();
    const sibling=screen.getByTestId(`library-sense-card-${furnitureEntry.entryId}`);
    fireEvent.click(within(sibling).getByRole("button",{name:"Expand meaning"}));
    fireEvent.click(within(sibling).getByRole("button",{name:"Good"}));
    await waitFor(()=>expect(performAction).toHaveBeenCalledOnce());
    expect(performAction.mock.calls[0][0]).toMatchObject({actionId:"review-card",target:{entryId:furnitureEntry.entryId}});
    expect(within(active).getByRole("note")).toHaveTextContent("Currently practising");
  });

  test("an accepted collection removal followed by failed read is not reported as saved; retry only reads", async () => {
    const listId = "qa-list";
    fetchMemberships.mockResolvedValueOnce(new Map([[financeEntry.entryId,[membership(listId)]]]))
      .mockRejectedValueOnce(new Error("membership_offline"))
      .mockResolvedValue(new Map([[financeEntry.entryId,[]]]));
    render(<LibrarySenseCardV2Session entryId={financeEntry.entryId} headword="bank"
      contentLanguageCode="nl" translationTargetLanguageCode={null} interfaceLanguage="en"
      userId="qa-user" userLists={[{id:listId,name:listId,type:"user",item_count:1}]} />);
    await screen.findByTestId("library-sense-card-group");
    await waitFor(()=>expect(fetchMemberships).toHaveBeenCalledOnce());
    const card=screen.getByTestId(`library-sense-card-${financeEntry.entryId}`);
    fireEvent.click(within(card).getByRole("button",{name:/^Collections/}));
    const checkbox=screen.getByRole("checkbox",{name:new RegExp(listId)});
    await waitFor(()=>expect(checkbox).toBeChecked());
    fireEvent.click(checkbox);
    await screen.findByRole("alert");
    expect(screen.getByRole("alert")).toHaveTextContent("Collection membership could not be loaded");
    expect(checkbox).toBeChecked(); expect(checkbox).toBeDisabled();
    expect(screen.queryByText("Collection membership updated")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button",{name:"Reload membership"}));
    await waitFor(()=>expect(checkbox).not.toBeChecked());
    expect(checkbox).toBeEnabled(); expect(removeFromList).toHaveBeenCalledOnce();
    expect(performAction).not.toHaveBeenCalled();
  });

  test("approved Report is selected in the meaning menu and restores that menu opener", async () => {
    const originalShow = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype,"showModal");
    const originalClose = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype,"close");
    Object.defineProperty(HTMLDialogElement.prototype,"showModal",{configurable:true,value:function(){this.setAttribute("open","");}});
    Object.defineProperty(HTMLDialogElement.prototype,"close",{configurable:true,value:function(){this.removeAttribute("open");}});
    let view: ReturnType<typeof render> | undefined;
    try {
      fetchGroup.mockResolvedValue(groupWithFinanceReportRevision());
      view = render(<LibrarySenseCardV2Session entryId={financeEntry.entryId} headword="bank"
        contentLanguageCode="nl" translationTargetLanguageCode={null} interfaceLanguage="en" />);
      await screen.findByTestId("library-sense-card-group");
      expect(screen.queryByRole("button",{name:"Report"})).toBeNull();
      const card=screen.getByTestId(`library-sense-card-${financeEntry.entryId}`);
      const more=within(card).getByRole("button",{name:"More card actions"});fireEvent.click(more);
      fireEvent.click(screen.getByRole("menuitem",{name:"Report"}));
      const dialog=await screen.findByRole("dialog",{name:"What is wrong?"});
      expect(freezeSnapshot).toHaveBeenLastCalledWith(expect.objectContaining({
        route: "library", entry: expect.objectContaining({entryId: financeEntry.entryId}),
      }));
      fireEvent.click(within(dialog).getByRole("button",{name:"Back"}));
      await waitFor(()=>expect(more).toHaveFocus());
      expect(performAction).not.toHaveBeenCalled();expect(queueDiagnosticReport).not.toHaveBeenCalled();
    } finally {
      view?.unmount();
      for(const [key,descriptor] of [["showModal",originalShow],["close",originalClose]] as const) {
        if(descriptor) Object.defineProperty(HTMLDialogElement.prototype,key,descriptor);
        else Reflect.deleteProperty(HTMLDialogElement.prototype,key);
      }
      vi.unstubAllEnvs();
    }
  });

  test("uses one global report action and no per-node flags", async () => {
    fetchGroup.mockResolvedValue(groupWithFinanceReportRevision());
    render(
      <LibrarySenseCardV2Session
        entryId={financeEntry.entryId}
        headword="bank"
        contentLanguageCode="nl"
        translationTargetLanguageCode="en"
        interfaceLanguage="en"
      />,
    );

    await screen.findByTestId("library-sense-card-group");
    expect(screen.queryByRole("button", { name: /Report:/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "More card actions" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Report" }));
    expect(await screen.findByRole("dialog", { name: "What is wrong?" })).toBeInTheDocument();
    expect(screen.getAllByRole("radio")).toHaveLength(6);
    expect(performAction).not.toHaveBeenCalled();
  });

  test("keeps Training More details free of global footer actions", async () => {
    const trainingGroup = groupWithFinanceReportRevision();
    fetchGroup.mockResolvedValue(trainingGroup);
    const trainNext = vi.fn();

    render(
      <TrainingMoreSenseCardV2Session
        entryId={financeEntry.entryId}
        initialGroup={trainingGroup}
        headword="bank"
        contentLanguageCode="nl"
        translationTargetLanguageCode="en"
        interfaceLanguage="en"
        userId="training-user"
        onTrainWord={trainNext}
      />,
    );

    await screen.findByTestId("library-sense-card-group");
    expect(screen.queryByTestId("library-details-actions")).not.toBeInTheDocument();
    const trainingMore = screen.getByRole("button", { name: "More card actions" });
    fireEvent.click(trainingMore);
    expect(screen.getByRole("menuitem", { name: "Report" })).toBeEnabled();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(
      screen.queryByRole("button", { name: "Practice later (F)" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Hide from training (X)" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Copy to my dictionary" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Collections" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Collections" }));
    expect(
      screen.getByRole("dialog", { name: "Collections" }),
    ).toBeInTheDocument();
    const collectionsDialog = screen.getByRole("dialog", { name: "Collections" });
    fireEvent(collectionsDialog, new Event("cancel", { bubbles: false, cancelable: true }));
    expect(screen.queryByRole("dialog", { name: "Collections" })).not.toBeInTheDocument();
    expect(screen.getByTestId("library-sense-card-group")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Collections" }));
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByRole("button", { name: "Train next" })).not.toBeInTheDocument();
    expect(trainNext).not.toHaveBeenCalled();
  });

  test("quick collection actions target the clicked meaning and refresh membership without opening the picker", async () => {
    const { addWordsToUserList } = await import("@/lib/trainingService");
    vi.mocked(addWordsToUserList).mockClear();
    vi.mocked(addWordsToUserList).mockResolvedValue({error:null});
    const list={id:"lesson",name:"Anna’s lesson",type:"user" as const};
    fetchMemberships.mockResolvedValueOnce(new Map([[financeEntry.entryId,[membership(list.id)]]])).mockResolvedValue(new Map());
    const updated=vi.fn();
    render(<LibrarySenseCardV2Session entryId={financeEntry.entryId} initialGroup={multiSenseBankGroup}
      headword="bank" contentLanguageCode="nl" translationTargetLanguageCode={null} interfaceLanguage="en"
      userId="owner" userLists={[list]} currentCollection={list} onListsUpdated={updated}/>);
    const finance=await screen.findByTestId(`library-sense-card-${financeEntry.entryId}`);
    await waitFor(()=>expect(finance).toHaveAttribute('data-current-collection','included'));
    fireEvent.click(within(finance).getByRole('button',{name:'Collections · 1'}));
    fireEvent.click(screen.getByRole('menuitem',{name:'Remove from “Anna’s lesson”'}));
    await waitFor(()=>expect(removeFromList).toHaveBeenCalledWith(list.id,[financeEntry.entryId]));
    await waitFor(()=>expect(finance).toHaveAttribute('data-current-collection','excluded'));
    expect(screen.queryByRole('dialog',{name:'Collections'})).not.toBeInTheDocument();
    const furniture=screen.getByTestId(`library-sense-card-${furnitureEntry.entryId}`);
    fireEvent.click(within(furniture).getByRole('button',{name:'Expand meaning'}));
    fireEvent.click(within(furniture).getByRole('button',{name:'Collections'}));
    fireEvent.click(screen.getByRole('menuitem',{name:'Add to “Anna’s lesson”'}));
    await waitFor(()=>expect(addWordsToUserList).toHaveBeenCalledWith(list.id,[furnitureEntry.entryId]));
    await waitFor(()=>expect(updated).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole('dialog',{name:'Collections'})).not.toBeInTheDocument();
  });

  test("uncertain quick writes reconcile by reading and keep unknown membership distinct", async () => {
    const list={id:"lesson",name:"Anna’s lesson",type:"user" as const};
    fetchMemberships.mockResolvedValueOnce(new Map([[financeEntry.entryId,[membership(list.id)]]])).mockRejectedValue(new Error('offline'));
    removeFromList.mockRejectedValueOnce(new Error('connection lost'));
    render(<LibrarySenseCardV2Session entryId={financeEntry.entryId} initialGroup={multiSenseBankGroup}
      headword="bank" contentLanguageCode="nl" translationTargetLanguageCode={null} interfaceLanguage="en"
      userId="owner" userLists={[list]} currentCollection={list}/>);
    const card=await screen.findByTestId(`library-sense-card-${financeEntry.entryId}`);
    await waitFor(()=>expect(card).toHaveAttribute('data-current-collection','included'));
    fireEvent.click(within(card).getByRole('button',{name:'Collections · 1'}));
    fireEvent.click(screen.getByRole('menuitem',{name:'Remove from “Anna’s lesson”'}));
    await waitFor(()=>expect(card).toHaveAttribute('data-current-collection','unknown'));
    expect(within(card).getByText('Membership unavailable')).toBeInTheDocument();
    expect(await screen.findByRole('alert')).toHaveTextContent('Collections could not be updated');
    expect(removeFromList).toHaveBeenCalledOnce();expect(fetchMemberships).toHaveBeenCalledTimes(2);
  });

  test("quick removal explicitly rereads exact membership without an event",async()=>{
    const previous=process.env.NEXT_PUBLIC_COLLECTION_SHARING_ENABLED;
    process.env.NEXT_PUBLIC_COLLECTION_SHARING_ENABLED='true';
    try{
      const list={id:'75600000-0000-4000-8000-000000000001',name:'Anna’s lesson',type:'user' as const};
      selectedRead.mockReset().mockResolvedValueOnce([financeEntry.entryId]).mockResolvedValue([]);
      fetchMemberships.mockRejectedValue(new Error('personal chooser unavailable'));
      removeFromList.mockResolvedValue({error:null});
      render(<LibrarySenseCardV2Session entryId={financeEntry.entryId} initialGroup={multiSenseBankGroup}
        headword="bank" contentLanguageCode="nl" translationTargetLanguageCode={null} interfaceLanguage="en"
        userId="owner" userLists={[list]} currentCollection={list}/>);
      const card=await screen.findByTestId(`library-sense-card-${financeEntry.entryId}`);
      await waitFor(()=>expect(card).toHaveAttribute('data-current-collection','included'));
      fireEvent.click(within(card).getByRole('button',{name:/^Collections/}));
      fireEvent.click(screen.getByRole('menuitem',{name:'Remove from “Anna’s lesson”'}));
      await waitFor(()=>expect(removeFromList).toHaveBeenCalledOnce());
      await waitFor(()=>expect(card).toHaveAttribute('data-current-collection','excluded'));
      expect(selectedRead).toHaveBeenCalledTimes(2);
    }finally{if(previous===undefined)delete process.env.NEXT_PUBLIC_COLLECTION_SHARING_ENABLED;else process.env.NEXT_PUBLIC_COLLECTION_SHARING_ENABLED=previous;}
  });

  test("training details ignore collection browsing context", async () => {
    const list={id:"lesson",name:"Anna’s lesson",type:"user" as const};
    render(<TrainingMoreSenseCardV2Session entryId={financeEntry.entryId} initialGroup={multiSenseBankGroup}
      headword="bank" contentLanguageCode="nl" translationTargetLanguageCode={null} interfaceLanguage="en"
      userId="owner" userLists={[list]} currentCollection={list}/>);
    await screen.findByTestId(`library-sense-card-${financeEntry.entryId}`);
    expect(document.querySelector('[data-current-collection]')).toBeNull();
    expect(screen.queryByText('Not added')).not.toBeInTheDocument();
  });

  test("releases a collection toggle once the membership is saved, without waiting for list reloads", async () => {
    const { addWordsToUserList } = await import("@/lib/trainingService");
    vi.mocked(addWordsToUserList).mockResolvedValue({ error: null });
    const onListsUpdated = vi.fn(() => new Promise<void>(() => undefined));

    render(
      <LibrarySenseCardV2Session
        entryId={financeEntry.entryId}
        headword="bank"
        contentLanguageCode="nl"
        translationTargetLanguageCode="en"
        interfaceLanguage="en"
        userId="user-1"
        userLists={[
          { id: "list-a", name: "Mijn lijst", type: "user", language_code: "nl" },
        ]}
        onListsUpdated={onListsUpdated}
      />,
    );

    await screen.findByTestId("library-sense-card-group");
    fireEvent.click(screen.getAllByRole("button", { name: /^Collections/ })[0]);
    fireEvent.click(await screen.findByLabelText(/Mijn lijst/));

    await waitFor(() => expect(onListsUpdated).toHaveBeenCalledOnce());
    await waitFor(() =>
      expect(screen.getByLabelText(/Mijn lijst/)).not.toBeDisabled(),
    );
    expect(addWordsToUserList).toHaveBeenCalledWith("list-a", [expect.any(String)]);
  });

  test("keeps idiom reporting on the sole global Library action", async () => {
    fetchGroup.mockResolvedValue({
      ...goedGroup,
      entries: goedGroup.entries.map((entry) =>
        entry.kind === "sense-card" && entry.entryId === goedEntry.entryId
          ? { ...entry, reportContentRevision: "a".repeat(64) }
          : entry,
      ),
    });

    render(
      <LibrarySenseCardV2Session
        entryId={goedEntry.entryId}
        headword="goed"
        contentLanguageCode="nl"
        translationTargetLanguageCode="en"
        interfaceLanguage="en"
      />,
    );

    await screen.findByTestId("library-sense-card-group");
    expect(screen.queryByRole("button", { name: /Report:/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "More card actions" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Report" }));
    expect(await screen.findByRole("dialog", { name: "What is wrong?" })).toBeInTheDocument();
    expect(performAction).not.toHaveBeenCalled();
  });

  test("keeps translation failure local and offers a retry", async () => {
    fetchGroup.mockResolvedValue({
      ...multiSenseBankGroup,
      entries: multiSenseBankGroup.entries.map((entry) =>
        entry.kind === "sense-card" && entry.entryId === financeEntry.entryId
          ? { ...entry, translation: null, capabilities: [...entry.capabilities, {
              actionId: "request-translation" as const, elementId: "translate", messageKey: "senseCard.translation.request",
              target: { kind: "entry" as const, entryId: entry.entryId, contentRevision: entry.contentRevision }, targetLanguageCode: "en",
            }] }
          : entry,
      ),
    });
    requestTranslation.mockRejectedValueOnce(new Error("provider_failed"));
    requestTranslation.mockResolvedValueOnce("pending");

    render(
      <LibrarySenseCardV2Session revealActiveMeaning={false}
        entryId={financeEntry.entryId}
        headword="bank"
        contentLanguageCode="nl"
        translationTargetLanguageCode="en"
        interfaceLanguage="en"
      />,
    );

    await screen.findByTestId("library-sense-card-group");
    fireEvent.click(
      screen.getByTestId("library-sense-card-entry-bank-finance"),
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "Translate",
      }),
    );
    expect(
      (await screen.findAllByText("Translation could not be loaded."))[0],
    ).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "Retry" })[0]);
    await waitFor(() => expect(document.querySelector('[data-translation-loading]')).not.toBeNull());
    expect(screen.queryByText("Translation is being prepared…")).toBeNull();
    expect(requestTranslation).toHaveBeenCalledTimes(2);
    expect(requestTranslation).toHaveBeenLastCalledWith(
      expect.objectContaining({ force: true }),
    );
  });

  test("shows an explicit loading state until a compatible group loads", async () => {
    render(
      <LibrarySenseCardV2Session
        entryId={financeEntry.entryId}
        headword="bank"
        contentLanguageCode="nl"
        translationTargetLanguageCode="en"
        interfaceLanguage="en"
      />,
    );

    expect(screen.getByTestId("library-sense-card-loading")).toBeInTheDocument();
    expect(
      await screen.findByTestId("library-sense-card-group"),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("library-sense-card-loading")).not.toBeInTheDocument();
  });

  test.each([
    ["lookup_http_403", "You do not have access"],
    ["lookup_http_503", "temporarily unavailable"],
    ["contract-mismatch", "unsupported format"],
    ["platform_request_timeout", "too long to load"],
  ])("surfaces detail lookup failure %s", async (failure, expected) => {
    fetchGroup.mockRejectedValueOnce(new Error(failure));

    render(
      <LibrarySenseCardV2Session
        entryId={financeEntry.entryId}
        headword="bank"
        contentLanguageCode="nl"
        translationTargetLanguageCode="en"
        interfaceLanguage="en"
      />,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(expected);
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  test("retries a failed detail lookup and presents the recovered group", async () => {
    fetchGroup
      .mockRejectedValueOnce(new Error("lookup_http_503"))
      .mockResolvedValueOnce(multiSenseBankGroup);

    render(
      <LibrarySenseCardV2Session
        entryId={financeEntry.entryId}
        headword="bank"
        contentLanguageCode="nl"
        translationTargetLanguageCode="en"
        interfaceLanguage="en"
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Retry" }));
    expect(await screen.findByTestId("library-sense-card-group")).toBeInTheDocument();
    expect(fetchGroup).toHaveBeenCalledTimes(2);
  });

  test("ignores detail lookup cancellation", async () => {
    fetchGroup.mockRejectedValueOnce(new DOMException("Aborted", "AbortError"));

    render(
      <LibrarySenseCardV2Session
        entryId={financeEntry.entryId}
        headword="bank"
        contentLanguageCode="nl"
        translationTargetLanguageCode="en"
        interfaceLanguage="en"
      />,
    );

    await waitFor(() => expect(fetchGroup).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  test("never presents an older group during rapid selections with out-of-order responses", async () => {
    const bankRequest = deferred<PlatformHeadwordGroupV2>();
    const bridgeRequest = deferred<PlatformHeadwordGroupV2>();
    const canalRequest = deferred<PlatformHeadwordGroupV2>();
    const requests = {
      [financeEntry.entryId]: bankRequest,
      "entry-bridge": bridgeRequest,
      "entry-canal": canalRequest,
    };
    fetchGroup.mockImplementation(
      ({ entryId }: { entryId: keyof typeof requests }) =>
        requests[entryId].promise,
    );

    const committedFrames: Array<{ entryId: string; text: string }> = [];

    function SelectionHarness() {
      const [selection, setSelection] = React.useState({
        entryId: financeEntry.entryId,
        headword: "bank",
      });

      React.useLayoutEffect(() => {
        committedFrames.push({
          entryId: selection.entryId,
          text: document.body.textContent ?? "",
        });
      }, [selection]);

      return (
        <>
          <button
            type="button"
            onClick={() =>
              setSelection({ entryId: "entry-bridge", headword: "brug" })
            }
          >
            Select bridge
          </button>
          <button
            type="button"
            onClick={() =>
              setSelection({ entryId: "entry-canal", headword: "gracht" })
            }
          >
            Select canal
          </button>
          <LibrarySenseCardV2Session
            entryId={selection.entryId}
            headword={selection.headword}
            contentLanguageCode="nl"
            translationTargetLanguageCode="en"
            interfaceLanguage="en"
          />
        </>
      );
    }

    render(<SelectionHarness />);
    await act(async () => {
      bankRequest.resolve(multiSenseBankGroup);
    });
    expect(await screen.findByText("bank")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Select bridge" }));
    fireEvent.click(screen.getByRole("button", { name: "Select canal" }));

    expect(
      committedFrames.find(({ entryId }) => entryId === "entry-bridge")?.text,
    ).toContain("Loading details");
    expect(
      committedFrames.find(({ entryId }) => entryId === "entry-canal")?.text,
    ).toContain("Loading details");

    await act(async () => {
      canalRequest.resolve(
        singleSenseGroup(
          "group-canal",
          "entry-canal",
          "gracht",
          "a canal in a city",
        ),
      );
    });
    expect(
      await screen.findByRole("heading", { name: "gracht" }),
    ).toBeInTheDocument();

    await act(async () => {
      bridgeRequest.resolve(
        singleSenseGroup(
          "group-bridge",
          "entry-bridge",
          "brug",
          "a structure over water",
        ),
      );
    });
    expect(screen.getByRole("heading", { name: "gracht" })).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "brug" }),
    ).not.toBeInTheDocument();
  });

  test("keeps same-headword steen meanings on their exact entry identity", async () => {
    const stoneObject = singleSenseGroup(
      "group-steen-object",
      "entry-steen-object",
      "steen",
      "a building stone",
    );
    const stoneMaterial = singleSenseGroup(
      "group-steen-material",
      "entry-steen-material",
      "steen",
      "stone as a material",
    );
    fetchGroup.mockImplementation(
      ({ entryId }: { entryId: string }) =>
        Promise.resolve(
          entryId === "entry-steen-object" ? stoneObject : stoneMaterial,
        ),
    );

    function SelectionHarness() {
      const [entryId, setEntryId] = React.useState("entry-steen-object");
      return (
        <>
          <button type="button" onClick={() => setEntryId("entry-steen-material")}>
            Select material steen
          </button>
          <LibrarySenseCardV2Session
            entryId={entryId}
            headword="steen"
            contentLanguageCode="nl"
            translationTargetLanguageCode="en"
            interfaceLanguage="en"
          />
        </>
      );
    }

    render(<SelectionHarness />);
    expect(await screen.findByText("a building stone")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Select material steen" }));
    expect(await screen.findByText("stone as a material")).toBeInTheDocument();
    expect(screen.queryByText("a building stone")).not.toBeInTheDocument();
    expect(fetchGroup).toHaveBeenLastCalledWith(
      expect.objectContaining({ entryId: "entry-steen-material" }),
    );
  });

  test("opens the requested second meaning without exposing retired copy controls", async () => {
    const copyEntry = vi.fn().mockResolvedValue(undefined);
    fetchGroup.mockResolvedValue(multiSenseBankGroup);

    render(
      <LibrarySenseCardV2Session
        entryId={financeEntry.entryId}
        headword="bank"
        contentLanguageCode="nl"
        translationTargetLanguageCode="en"
        interfaceLanguage="en"
      />,
    );

    await screen.findByTestId("library-sense-card-group");
    expect(
      screen.getByTestId(`library-sense-card-${financeEntry.entryId}`),
    ).toHaveAttribute("data-expanded", "true");
    expect(
      screen.getByTestId(`library-sense-card-${furnitureEntry.entryId}`),
    ).toHaveAttribute("data-expanded", "false");
    expect(screen.queryByRole("button", { name: "Copy to my dictionary" })).not.toBeInTheDocument();
    expect(copyEntry).not.toHaveBeenCalled();
  });

  test("activating a collapsed meaning changes selection without showing retired copy controls", async () => {
    const copyEntry = vi.fn().mockResolvedValue(undefined);
    fetchGroup.mockResolvedValue(multiSenseBankGroup);

    render(
      <LibrarySenseCardV2Session
        entryId={furnitureEntry.entryId}
        headword="bank"
        contentLanguageCode="nl"
        translationTargetLanguageCode="en"
        interfaceLanguage="en"
      />,
    );

    await screen.findByTestId("library-sense-card-group");
    const financeCard = screen.getByTestId(
      `library-sense-card-${financeEntry.entryId}`,
    );
    fireEvent.click(
      within(financeCard).getByRole("button", { name: "Expand meaning" }),
    );
    expect(financeCard).toHaveAttribute("data-expanded", "true");
    expect(screen.queryByRole("button", { name: "Copy to my dictionary" })).not.toBeInTheDocument();
    expect(copyEntry).not.toHaveBeenCalled();
  });

  test("brings the initially selected meaning into the internal scroll viewport", async () => {
    const rect = (top: number, bottom: number) =>
      ({
        top,
        bottom,
        left: 0,
        right: 320,
        width: 320,
        height: bottom - top,
        x: 0,
        y: top,
        toJSON: () => ({}),
      }) as DOMRect;
    const rectSpy = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(function (this: HTMLElement) {
        if (this.dataset.testid === "library-sense-card-scroll-region") {
          return rect(0, 100);
        }
        if (this.dataset.entryId === financeEntry.entryId) {
          return rect(140, 190);
        }
        if (this.hasAttribute("data-meaning-lead") && this.closest("[data-entry-id]")?.getAttribute("data-entry-id") === financeEntry.entryId) {
          return rect(150, 180);
        }
        return rect(0, 0);
      });
    const heightSpy = vi.spyOn(HTMLElement.prototype, "clientHeight", "get")
      .mockImplementation(function (this: HTMLElement) {
        return this.dataset.testid === "library-sense-card-scroll-region" ? 100 : 0;
      });

    try {
      fetchGroup.mockResolvedValue(multiSenseBankGroup);
      render(
        <LibrarySenseCardV2Session
          entryId={financeEntry.entryId}
          headword="bank"
          contentLanguageCode="nl"
          translationTargetLanguageCode="en"
          interfaceLanguage="en"
        />,
      );

      const scrollRegion = await screen.findByTestId(
        "library-sense-card-scroll-region",
      );
      await waitFor(() => expect(scrollRegion.scrollTop).toBe(115));
      expect(document.documentElement.scrollTop).toBe(0);
    } finally {
      rectSpy.mockRestore();
      heightSpy.mockRestore();
    }
  });

  test("does not refresh the previous detail after an action races with navigation", async () => {
    const action = deferred<{
      contractVersion: "platform-action-v2";
      actionId: "start-learning";
      clientEventId: string;
      accepted: true;
      card: typeof financeEntry.card;
    }>();
    performAction.mockReturnValue(action.promise);
    fetchGroup.mockResolvedValue(multiSenseBankGroup);

    function SelectionHarness() {
      const [entryId, setEntryId] = React.useState(financeEntry.entryId);
      return (
        <>
          <button type="button" onClick={() => setEntryId(furnitureEntry.entryId)}>
            Select furniture meaning
          </button>
          <LibrarySenseCardV2Session
            entryId={entryId}
            headword="bank"
            contentLanguageCode="nl"
            translationTargetLanguageCode="en"
            interfaceLanguage="en"
          />
        </>
      );
    }

    render(<SelectionHarness />);
    await screen.findByText(financeEntry.contentNodes[0].text);
    fireEvent.click(screen.getByRole("button", { name: "Learn" }));
    fireEvent.click(screen.getByRole("button", { name: "Select furniture meaning" }));
    await screen.findByText(furnitureEntry.contentNodes[0].text);
    expect(fetchGroup).toHaveBeenCalledTimes(2);

    action.resolve({
      contractVersion: "platform-action-v2",
      actionId: "start-learning",
      clientEventId: "event-race",
      accepted: true,
      card: financeEntry.card,
    });
    await act(async () => {
      await action.promise;
    });
    expect(fetchGroup).toHaveBeenCalledTimes(2);
  });

  test("keeps the newest action busy state when overlapping actions finish out of order", async () => {
    const actionA = deferred<unknown>();
    const actionB = deferred<unknown>();
    const groupA = singleSenseGroup(
      "group-action-a",
      "entry-action-a",
      "bank",
      "first action meaning",
    );
    const groupB = singleSenseGroup(
      "group-action-b",
      "entry-action-b",
      "bank",
      "second action meaning",
    );
    fetchGroup.mockImplementation(({ entryId }: { entryId: string }) =>
      Promise.resolve(entryId === "entry-action-a" ? groupA : groupB),
    );
    performAction
      .mockImplementationOnce(() => actionA.promise)
      .mockImplementationOnce(() => actionB.promise);

    function SelectionHarness() {
      const [entryId, setEntryId] = React.useState("entry-action-a");
      return (
        <>
          <button type="button" onClick={() => setEntryId("entry-action-b")}>
            Select second action meaning
          </button>
          <LibrarySenseCardV2Session
            entryId={entryId}
            headword="bank"
            contentLanguageCode="nl"
            translationTargetLanguageCode="en"
            interfaceLanguage="en"
          />
        </>
      );
    }

    render(<SelectionHarness />);
    await screen.findByText("first action meaning");
    fireEvent.click(screen.getByRole("button", { name: "Learn" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Select second action meaning" }),
    );
    await screen.findByText("second action meaning");
    const learnButton = screen.getByRole("button", { name: "Learn" });
    fireEvent.click(learnButton);
    await waitFor(() => expect(learnButton).toBeDisabled());

    actionA.reject(new Error("stale action failed"));
    await act(async () => {
      await actionA.promise.catch(() => undefined);
    });
    expect(learnButton).toBeDisabled();
    expect(screen.queryByText("stale action failed")).not.toBeInTheDocument();

    actionB.resolve(undefined);
    await act(async () => {
      await actionB.promise;
    });
    await waitFor(() => expect(learnButton).not.toBeDisabled());
  });

  test("does not let an older membership response overwrite the current group", async () => {
    const membershipA = deferred<Map<string, EntryLearningListMembership[]>>();
    const membershipB = deferred<Map<string, EntryLearningListMembership[]>>();
    const groupA = singleSenseGroup(
      "group-membership-a",
      "entry-membership-a",
      "bank",
      "first membership meaning",
    );
    const groupB = singleSenseGroup(
      "group-membership-b",
      "entry-membership-b",
      "bank",
      "second membership meaning",
    );
    fetchGroup.mockImplementation(({ entryId }: { entryId: string }) =>
      Promise.resolve(entryId === "entry-membership-a" ? groupA : groupB),
    );
    fetchMemberships.mockImplementation((entryIds: string[]) =>
      entryIds.includes("entry-membership-b")
        ? membershipB.promise
        : membershipA.promise,
    );

    function SelectionHarness() {
      const [entryId, setEntryId] = React.useState("entry-membership-a");
      return (
        <>
          <button
            type="button"
            onClick={() => setEntryId("entry-membership-b")}
          >
            Select second membership meaning
          </button>
          <LibrarySenseCardV2Session
            entryId={entryId}
            headword="bank"
            contentLanguageCode="nl"
            translationTargetLanguageCode="en"
            interfaceLanguage="en"
            userId="user-membership"
          />
        </>
      );
    }

    render(<SelectionHarness />);
    await screen.findByText("first membership meaning");
    fireEvent.click(
      screen.getByRole("button", { name: "Select second membership meaning" }),
    );
    await screen.findByText("second membership meaning");
    await waitFor(() => expect(fetchMemberships).toHaveBeenCalledTimes(2));

    await act(async () => {
      membershipB.resolve(
        new Map([["entry-membership-b", [membership("list-b")]]]),
      );
      await membershipB.promise;
    });
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Collections · 1" }),
      ).toBeInTheDocument(),
    );

    membershipA.resolve(
      new Map([["entry-membership-a", [membership("list-a")]]]),
    );
    await act(async () => {
      await membershipA.promise;
    });
    expect(
      screen.getByRole("button", { name: "Collections · 1" }),
    ).toBeInTheDocument();
  });

  test("does not count curated memberships in the user collections picker count", async () => {
    fetchMemberships.mockResolvedValue(
      new Map([[financeEntry.entryId, [curatedMembership("ExampleDictionary 2k")]]]),
    );

    render(
      <LibrarySenseCardV2Session
        entryId={financeEntry.entryId}
        initialGroup={multiSenseBankGroup}
        headword="bank"
        contentLanguageCode="nl"
        translationTargetLanguageCode="en"
        interfaceLanguage="en"
        userId="user-membership"
      />,
    );

    await screen.findByTestId("library-sense-card-group");
    const card = screen.getByTestId(`library-sense-card-${financeEntry.entryId}`);
    await waitFor(() => expect(fetchMemberships).toHaveBeenCalledOnce());
    expect(within(card).getByRole("button", { name: "Collections" })).toBeInTheDocument();
    expect(within(card).queryByRole("button", { name: /^Collections ·/ })).not.toBeInTheDocument();
  });

  test("does not refresh an old lookup dimension after translation changes", async () => {
    const action = deferred<unknown>();
    const lookupCalls: Array<{ translationTargetLanguageCode: string | null }> =
      [];
    performAction.mockReturnValue(action.promise);
    fetchGroup.mockImplementation(
      (input: { translationTargetLanguageCode: string | null }) => {
        lookupCalls.push({
          translationTargetLanguageCode: input.translationTargetLanguageCode,
        });
        return Promise.resolve(multiSenseBankGroup);
      },
    );

    function TranslationHarness() {
      const [translation, setTranslation] = React.useState<string | null>("en");
      return (
        <>
          <button type="button" onClick={() => setTranslation("ru")}>
            Change translation language
          </button>
          <LibrarySenseCardV2Session
            entryId={financeEntry.entryId}
            headword="bank"
            contentLanguageCode="nl"
            translationTargetLanguageCode={translation}
            interfaceLanguage="en"
          />
        </>
      );
    }

    render(<TranslationHarness />);
    await screen.findByText(financeEntry.contentNodes[0].text);
    fireEvent.click(screen.getByRole("button", { name: "Learn" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Change translation language" }),
    );
    await waitFor(() =>
      expect(lookupCalls).toEqual([
        { translationTargetLanguageCode: "en" },
        { translationTargetLanguageCode: "ru" },
      ]),
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Learn" })).not.toBeDisabled(),
    );

    action.resolve(undefined);
    await act(async () => {
      await action.promise;
    });
    expect(lookupCalls).toEqual([
      { translationTargetLanguageCode: "en" },
      { translationTargetLanguageCode: "ru" },
    ]);
  });

  test("follows a pointer in a corpus-shaped mixed group to the real target content", async () => {
    const mixedDaarGroup: PlatformHeadwordGroupV2 = {
      ...multiSenseBankGroup,
      header: { ...multiSenseBankGroup.header, text: "daar" },
      senseCount: 1,
      entryCount: 2,
      entries: [
        {
          ...financeEntry,
          entryId: "entry-daar-1",
          meaningOrdinal: 1,
        },
        {
          kind: "cross-reference",
          crossReferenceId: "entry-daar-2",
          meaningOrdinal: 2,
          label: {
            termId: "cross-reference.see",
            messageKey: "crossReference.see",
          },
          text: "daar-",
          target: {
            query: "daar-",
            headwordGroupId: "group-daar-target",
            entryId: "entry-daar-target",
          },
          capabilities: [
            {
              actionId: "follow-cross-reference",
              elementId: "cross-reference.follow",
              messageKey: "crossReference.follow",
            },
          ],
        },
      ],
    };
    fetchGroup.mockResolvedValue(mixedDaarGroup);
    fetchCrossReferenceTarget.mockResolvedValue({
      ...multiSenseBankGroup,
      header: { ...multiSenseBankGroup.header, text: "daar-" },
      entries: [
        { ...financeEntry, entryId: "entry-daar-target" },
        furnitureEntry,
      ],
    });
    const copyEntry = vi.fn().mockResolvedValue(undefined);

    render(
      <LibrarySenseCardV2Session
        entryId="entry-daar-2"
        headword="daar"
        contentLanguageCode="nl"
        translationTargetLanguageCode="en"
        interfaceLanguage="en"
        initialGroup={mixedDaarGroup}
      />,
    );

    expect(await screen.findByText("daar-")).toBeInTheDocument();
    const pointer = screen.getByTestId("library-cross-reference-entry-daar-2");
    const meaning = screen.getByTestId("library-sense-card-entry-daar-1");
    expect(
      meaning.compareDocumentPosition(pointer) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(within(meaning).getByText("1")).toBeInTheDocument();
    expect(within(pointer).getByText("2")).toBeInTheDocument();
    expect(
      within(pointer).queryByRole("button", { name: "Learn" }),
    ).not.toBeInTheDocument();
    expect(
      within(pointer).queryByRole("button", { name: "Mark known" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Copy to my dictionary" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open reference" }));

    await waitFor(() =>
      expect(fetchCrossReferenceTarget).toHaveBeenCalledWith(
        expect.objectContaining({
          query: "daar-",
          sourceDictionaryId: "example",
          targetHeadwordGroupId: "group-daar-target",
          targetEntryId: "entry-daar-target",
        }),
      ),
    );
    expect(
      await screen.findByText(
        "een instelling voor sparen, betalen en lenen",
      ),
    ).toBeInTheDocument();
    const targetCard = screen.getByTestId("library-sense-card-entry-daar-target");
    const alternateCard = screen.getByTestId(
      `library-sense-card-${furnitureEntry.entryId}`,
    );
    expect(targetCard).toHaveAttribute("data-expanded", "true");
    fireEvent.click(alternateCard);
    expect(alternateCard).toHaveAttribute("data-expanded", "true");
    expect(screen.queryByRole("button", { name: "Copy to my dictionary" })).not.toBeInTheDocument();
    expect(copyEntry).not.toHaveBeenCalled();
  });

  test("normalizes the translation-off sentinel before lookup", async () => {
    render(
      <LibrarySenseCardV2Session
        entryId={financeEntry.entryId}
        headword="bank"
        contentLanguageCode="nl"
        translationTargetLanguageCode="off"
        interfaceLanguage="en"
      />,
    );

    await screen.findByTestId("library-sense-card-group");
    expect(fetchGroup).toHaveBeenCalledWith(
      expect.objectContaining({ translationTargetLanguageCode: null }),
    );
    expect(
      screen.queryByRole("button", {
        name: "Translate",
      }),
    ).not.toBeInTheDocument();
  });

  test("hydrates a failed translation state returned by lookup", async () => {
    fetchGroup.mockResolvedValue({
      ...multiSenseBankGroup,
      entries: multiSenseBankGroup.entries.map((entry) =>
        entry.kind === "sense-card" && entry.entryId === financeEntry.entryId
          ? {
              ...entry,
              translation: {
                ...financeEntry.translation!,
                status: "failed" as const,
                text: undefined,
              },
            }
          : entry,
      ),
    });
    render(
      <LibrarySenseCardV2Session
        entryId={financeEntry.entryId}
        headword="bank"
        contentLanguageCode="nl"
        translationTargetLanguageCode="en"
        interfaceLanguage="en"
      />,
    );

    await screen.findByTestId("library-sense-card-group");
    fireEvent.click(
      screen.getByTestId("library-sense-card-entry-bank-finance"),
    );
    fireEvent.click(screen.getByRole("button", { name: "Translate" }));
    expect(
      (await screen.findAllByText("Translation could not be loaded."))[0],
    ).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Retry" })[0]).toBeInTheDocument();
  });

  test("polls a pending translation until it becomes ready", async () => {
    fetchGroup.mockResolvedValue({
      ...multiSenseBankGroup,
      entries: multiSenseBankGroup.entries.map((entry) =>
        entry.kind === "sense-card" && entry.entryId === financeEntry.entryId
          ? { ...entry, translation: null, capabilities: [...entry.capabilities, {
              actionId: "request-translation" as const, elementId: "translate", messageKey: "senseCard.translation.request",
              target: { kind: "entry" as const, entryId: entry.entryId, contentRevision: entry.contentRevision }, targetLanguageCode: "en",
            }] }
          : entry,
      ),
    });
    requestTranslation
      .mockResolvedValueOnce("pending")
      .mockResolvedValueOnce("ready");
    render(
      <LibrarySenseCardV2Session revealActiveMeaning={false}
        entryId={financeEntry.entryId}
        headword="bank"
        contentLanguageCode="nl"
        translationTargetLanguageCode="en"
        interfaceLanguage="en"
      />,
    );
    await screen.findByTestId("library-sense-card-group");
    fireEvent.click(
      screen.getByTestId("library-sense-card-entry-bank-finance"),
    );

    let poll: (() => void) | null = null;
    const timeout = vi
      .spyOn(window, "setTimeout")
      .mockImplementation((handler, delay) => {
        if (delay === 3000 && typeof handler === "function") {
          poll = handler as () => void;
        }
        return 77 as never;
      });
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", {
          name: "Translate",
        }),
      );
    });
    expect(requestTranslation).toHaveBeenCalledTimes(1);
    expect(poll).not.toBeNull();

    await act(async () => poll?.());
    expect(requestTranslation).toHaveBeenCalledTimes(2);
    expect(fetchGroup).toHaveBeenCalledTimes(2);
    timeout.mockRestore();
  });

  test("cancels pending translation polling when the selected entry changes", async () => {
    fetchGroup.mockResolvedValue({
      ...multiSenseBankGroup,
      entries: multiSenseBankGroup.entries.map((entry) =>
        entry.kind === "sense-card" && entry.entryId === financeEntry.entryId
          ? { ...entry, translation: null, capabilities: [...entry.capabilities, {
              actionId: "request-translation" as const, elementId: "translate", messageKey: "senseCard.translation.request",
              target: { kind: "entry" as const, entryId: entry.entryId, contentRevision: entry.contentRevision }, targetLanguageCode: "en",
            }] }
          : entry,
      ),
    });
    requestTranslation.mockResolvedValue("pending");
    const { rerender } = render(
      <LibrarySenseCardV2Session revealActiveMeaning={false}
        entryId={financeEntry.entryId}
        headword="bank"
        contentLanguageCode="nl"
        translationTargetLanguageCode="en"
        interfaceLanguage="en"
      />,
    );
    await screen.findByTestId("library-sense-card-group");
    fireEvent.click(
      screen.getByTestId("library-sense-card-entry-bank-finance"),
    );

    vi.useFakeTimers();
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", {
          name: "Translate",
        }),
      );
    });
    expect(requestTranslation).toHaveBeenCalledTimes(1);

    await act(async () => {
      rerender(
        <LibrarySenseCardV2Session revealActiveMeaning={false}
          entryId="entry-next"
          headword="next"
          contentLanguageCode="nl"
          translationTargetLanguageCode="en"
          interfaceLanguage="en"
        />,
      );
    });
    await act(async () => {
      vi.advanceTimersByTime(3000);
    });

    expect(requestTranslation).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  test("ignores an in-flight translation result after navigation", async () => {
    fetchGroup.mockResolvedValue({
      ...multiSenseBankGroup,
      entries: multiSenseBankGroup.entries.map((entry) =>
        entry.kind === "sense-card" && entry.entryId === financeEntry.entryId
          ? { ...entry, translation: null, capabilities: [...entry.capabilities, {
              actionId: "request-translation" as const, elementId: "translate", messageKey: "senseCard.translation.request",
              target: { kind: "entry" as const, entryId: entry.entryId, contentRevision: entry.contentRevision }, targetLanguageCode: "en",
            }] }
          : entry,
      ),
    });
    let resolveTranslation: ((status: "ready") => void) | null = null;
    requestTranslation.mockReturnValue(
      new Promise<"ready">((resolve) => {
        resolveTranslation = resolve;
      }),
    );
    const { rerender } = render(
      <LibrarySenseCardV2Session revealActiveMeaning={false}
        entryId={financeEntry.entryId}
        headword="bank"
        contentLanguageCode="nl"
        translationTargetLanguageCode="en"
        interfaceLanguage="en"
      />,
    );
    await screen.findByTestId("library-sense-card-group");
    fireEvent.click(
      screen.getByTestId("library-sense-card-entry-bank-finance"),
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "Translate",
      }),
    );
    expect(requestTranslation).toHaveBeenCalledTimes(1);

    rerender(
      <LibrarySenseCardV2Session revealActiveMeaning={false}
        entryId="entry-next"
        headword="next"
        contentLanguageCode="nl"
        translationTargetLanguageCode="en"
        interfaceLanguage="en"
      />,
    );
    await waitFor(() => expect(fetchGroup).toHaveBeenCalledTimes(2));
    await act(async () => resolveTranslation?.("ready"));

    expect(fetchGroup).toHaveBeenCalledTimes(2);
  });

  test("submits the selected meaning capability and refreshes the group", async () => {
    render(
      <LibrarySenseCardV2Session
        entryId={financeEntry.entryId}
        headword="bank"
        contentLanguageCode="nl"
        translationTargetLanguageCode="en"
        interfaceLanguage="en"
      />,
    );

    await screen.findByTestId("library-sense-card-group");
    fireEvent.click(
      screen.getByTestId("library-sense-card-entry-bank-finance"),
    );
    fireEvent.click(screen.getByRole("button", { name: "Learn" }));

    await waitFor(() => expect(performAction).toHaveBeenCalledTimes(1));
    expect(performAction).toHaveBeenCalledWith(
      expect.objectContaining({
        actionId: "start-learning",
        target: expect.objectContaining({ entryId: financeEntry.entryId }),
      }),
    );
    await waitFor(() => expect(fetchGroup).toHaveBeenCalledTimes(2));
  });
});


test("first-join hints for all meanings share one read without resubscribing on fresh group objects", async () => {
  firstJoin.enabled = true; firstJoin.subscriptions = 0;
  fetchGroup.mockReset();
  fetchGroup.mockImplementation(async () => structuredClone(multiSenseBankGroup));
  const view = render(<LibrarySenseCardV2Session entryId={financeEntry.entryId} initialGroup={multiSenseBankGroup} headword="bank" contentLanguageCode="nl" translationTargetLanguageCode="en" interfaceLanguage="en" />);
  try {
    await waitFor(() => expect(fetchGroup).toHaveBeenCalledTimes(2));
    await act(async () => {});
    const entryCount = multiSenseBankGroup.entries.filter(entry => entry.kind === "sense-card").length;
    expect(firstJoin.subscriptions).toBe(entryCount);
    await act(async () => {
      publishDictionaryTranslationReady({entryId:financeEntry.entryId,targetLanguageCode:"en"});
      publishDictionaryTranslationReady({entryId:furnitureEntry.entryId,targetLanguageCode:"en"});
    });
    expect(fetchGroup).toHaveBeenCalledTimes(3);
    expect(firstJoin.subscriptions).toBe(entryCount);
  } finally { view.unmount(); firstJoin.enabled = false; }
});

test("a ready hint during a group read schedules one newer authoritative read", async () => {
  fetchGroup.mockReset().mockResolvedValue(structuredClone(multiSenseBankGroup));
  const view = render(<LibrarySenseCardV2Session entryId={financeEntry.entryId} initialGroup={multiSenseBankGroup} headword="bank" contentLanguageCode="nl" translationTargetLanguageCode="en" interfaceLanguage="en" />);
  try {
    await waitFor(() => expect(fetchGroup).toHaveBeenCalledOnce());
    const oldRead=deferred<PlatformHeadwordGroupV2>();
    fetchGroup.mockImplementationOnce(()=>oldRead.promise);
    await act(async()=>publishDictionaryTranslationReady({entryId:financeEntry.entryId,targetLanguageCode:"en"}));
    expect(fetchGroup).toHaveBeenCalledTimes(2);
    await act(async()=>{
      publishDictionaryTranslationReady({entryId:financeEntry.entryId,targetLanguageCode:"en"});
      publishDictionaryTranslationReady({entryId:furnitureEntry.entryId,targetLanguageCode:"en"});
    });
    expect(fetchGroup).toHaveBeenCalledTimes(2);
    await act(async()=>oldRead.resolve(structuredClone(multiSenseBankGroup)));
    expect(fetchGroup).toHaveBeenCalledTimes(3);
  } finally { view.unmount(); }
});

test.each([["library",true],["library",false],["training-more",true]] as const)("%s archive flag=%s uses the server capability",async (context,enabled)=>{
  vi.stubEnv("NEXT_PUBLIC_AUTHOR_ENTRY_ARCHIVE_ENABLED",String(enabled));
  const group=structuredClone(multiSenseBankGroup);
  for(const entry of group.entries) if(entry.kind==="sense-card") entry.authorActions={canArchive:true};
  fetchGroup.mockResolvedValue(group);
  const Component=context==="library" ? LibrarySenseCardV2Session : TrainingMoreSenseCardV2Session;
  const view=render(<Component entryId={financeEntry.entryId} initialGroup={group} headword="bank" contentLanguageCode="nl" translationTargetLanguageCode={null} interfaceLanguage="en" userId="user-1" onArchived={vi.fn()}/>);
  await waitFor(()=>expect(fetchGroup).toHaveBeenCalled());
  fireEvent.click(within(screen.getByTestId(`library-sense-card-${financeEntry.entryId}`)).getByRole("button",{name:"More card actions"}));
  if(context==="library" && enabled) expect(screen.getByRole("menuitem",{name:"Archive entry"})).toBeInTheDocument();
  else expect(screen.queryByRole("menuitem",{name:"Archive entry"})).not.toBeInTheDocument();
  view.unmount();vi.unstubAllEnvs();
});

 test("training MORE falls back to the exact permit read when Library cannot read the entry, while ordinary Library ignores it",async()=>{
   const group=singleSenseGroup("group-current",financeEntry.entryId,"bank","Een financiële instelling.");
   currentRead.mockReset().mockResolvedValue({groups:[group]});
   fetchGroup.mockReset().mockResolvedValue(null);
   const currentCard={sessionId:"session",permitId:"permit"};
   const props={entryId:financeEntry.entryId,headword:"bank",contentLanguageCode:"nl",translationTargetLanguageCode:null,interfaceLanguage:"en" as const,userId:"user-1",currentCard};
   const view=render(<TrainingMoreSenseCardV2Session {...props}/>);
   await waitFor(()=>expect(currentRead).toHaveBeenCalledWith("user-1",expect.objectContaining({...currentCard,entryId:financeEntry.entryId,cardTypeId:"word-to-definition"}),expect.any(AbortSignal)));
   view.unmount();currentRead.mockClear();fetchGroup.mockClear().mockResolvedValue(group);
   render(<LibrarySenseCardV2Session {...props}/>);
   await waitFor(()=>expect(fetchGroup).toHaveBeenCalledOnce());
   expect(currentRead).not.toHaveBeenCalled();
 });

test("training MORE preserves normally authorized active siblings without using the narrow current-card exception", async () => {
  fetchGroup.mockReset().mockResolvedValue(multiSenseBankGroup);
  currentRead.mockReset();
  render(<TrainingMoreSenseCardV2Session entryId={financeEntry.entryId} initialGroup={multiSenseBankGroup}
    headword="bank" contentLanguageCode="nl" translationTargetLanguageCode={null} interfaceLanguage="en"
    userId="user-1" currentCard={{sessionId:"session",permitId:"permit"}} />);
  await waitFor(() => expect(fetchGroup).toHaveBeenCalledOnce());
  expect(screen.getByTestId(`library-sense-card-${furnitureEntry.entryId}`)).toBeInTheDocument();
  expect(screen.getByTestId(`library-sense-card-${financeEntry.entryId}`)).toBeInTheDocument();
  expect(currentRead).not.toHaveBeenCalled();
});

test("archived MORE fallback replaces the initial article with only the permitted meaning", async () => {
  const exact = {...multiSenseBankGroup,entries:[financeEntry],senseCount:1,entryCount:1};
  fetchGroup.mockReset().mockRejectedValue(new Error("http_403"));
  currentRead.mockReset().mockResolvedValue({groups:[exact]});
  render(<TrainingMoreSenseCardV2Session entryId={financeEntry.entryId} initialGroup={multiSenseBankGroup}
    headword="bank" contentLanguageCode="nl" translationTargetLanguageCode={null} interfaceLanguage="en"
    userId="user-1" currentCard={{sessionId:"session",permitId:"permit"}} />);
  await waitFor(() => expect(currentRead).toHaveBeenCalledOnce());
  await waitFor(() => expect(screen.queryByTestId(`library-sense-card-${furnitureEntry.entryId}`)).not.toBeInTheDocument());
  expect(screen.getByTestId(`library-sense-card-${financeEntry.entryId}`)).toBeInTheDocument();
});

test("failed archived MORE permit cannot retain siblings from its initial display seed", async () => {
  fetchGroup.mockReset().mockResolvedValue(null);
  currentRead.mockReset().mockRejectedValue(new Error("current_training_permit_invalid"));
  render(<TrainingMoreSenseCardV2Session entryId={financeEntry.entryId} initialGroup={multiSenseBankGroup}
    headword="bank" contentLanguageCode="nl" translationTargetLanguageCode={null} interfaceLanguage="en"
    userId="user-1" currentCard={{sessionId:"session",permitId:"permit"}} />);
  await waitFor(() => expect(currentRead).toHaveBeenCalledOnce());
  await waitFor(() => expect(screen.queryByTestId(`library-sense-card-${furnitureEntry.entryId}`)).not.toBeInTheDocument());
  expect(screen.queryByTestId(`library-sense-card-${financeEntry.entryId}`)).not.toBeInTheDocument();
  expect(screen.getByRole("alert")).toBeInTheDocument();
});

vi.mock("@/components/training/library-v2/IndependentEntryCopyDialog",()=>({IndependentEntryCopyDialog:({onReviewSource}:{onReviewSource:()=>void})=><button onClick={onReviewSource}>Simulate source changed</button>}));
test("copy stays unavailable during failed article review and returns only after a successful authoritative retry",async()=>{
 vi.stubEnv("NEXT_PUBLIC_INDEPENDENT_ENTRY_COPY_ENABLED","true");
 fetchGroup.mockReset().mockResolvedValueOnce(multiSenseBankGroup);
 const view=render(<LibrarySenseCardV2Session entryId={financeEntry.entryId} initialGroup={multiSenseBankGroup} headword="bank" contentLanguageCode="nl" translationTargetLanguageCode={null} interfaceLanguage="en" userId="user-1" onOpenCopied={vi.fn()}/>);
 const openMenu=()=>fireEvent.click(within(screen.getByTestId(`library-sense-card-${financeEntry.entryId}`)).getByRole("button",{name:"More card actions"}));
 try{
  await waitFor(()=>expect(fetchGroup).toHaveBeenCalledOnce());
  await act(async()=>{});openMenu();fireEvent.click(screen.getByRole("menuitem",{name:"Copy to my dictionary"}));
  const refresh=deferred<PlatformHeadwordGroupV2>();fetchGroup.mockImplementationOnce(()=>refresh.promise);
  fireEvent.click(screen.getByRole("button",{name:"Simulate source changed"}));await waitFor(()=>expect(fetchGroup).toHaveBeenCalledTimes(2));
  openMenu();expect(screen.queryByRole("menuitem",{name:"Copy to my dictionary"})).not.toBeInTheDocument();fireEvent.keyDown(document,{key:"Escape"});
  await act(async()=>refresh.reject(new Error("offline")));
  openMenu();expect(screen.queryByRole("menuitem",{name:"Copy to my dictionary"})).not.toBeInTheDocument();fireEvent.keyDown(document,{key:"Escape"});
  fetchGroup.mockResolvedValueOnce(multiSenseBankGroup);fireEvent.click(screen.getByRole("button",{name:"Retry"}));
  await waitFor(()=>expect(fetchGroup).toHaveBeenCalledTimes(3));await act(async()=>{});
  openMenu();expect(screen.getByRole("menuitem",{name:"Copy to my dictionary"})).toBeInTheDocument();
 }finally{view.unmount();vi.unstubAllEnvs();}

});


describe("Library entry audio",()=>{
  beforeEach(()=>{fetchGroup.mockReset();fetchMemberships.mockResolvedValue(new Map());});
  test.each(["play","navigate","unmount"])("Library audio is entry-bound and handles %s",async transition=>{
    let finish!:(url:string)=>void;
    resolveLibraryAudio.mockReset();resolveLibraryAudio.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
    const group={...multiSenseBankGroup,header:{...multiSenseBankGroup.header,audio:{audioId:"bank-audio",actionId:"play-audio" as const,contentLanguageCode:"nl"}}};
    fetchGroup.mockResolvedValue(group);
    const play=vi.spyOn(HTMLMediaElement.prototype,"play").mockResolvedValue();
    try{
      const props={userId:"viewer",entryId:financeEntry.entryId,initialGroup:group,headword:"bank",contentLanguageCode:"nl",translationTargetLanguageCode:null,interfaceLanguage:"en" as const};
      const view=render(<LibrarySenseCardV2Session {...props}/>);
      fireEvent.click(await screen.findByRole("button",{name:/Play/}));
      await waitFor(()=>expect(resolveLibraryAudio).toHaveBeenCalledOnce());
      const input=resolveLibraryAudio.mock.calls[0][0];
      expect(input.entryId).toBe(financeEntry.entryId);expect(input.cacheOwnerId).toBe("viewer");
      if(transition==="navigate")view.rerender(<LibrarySenseCardV2Session {...props} entryId={furnitureEntry.entryId}/>);
      if(transition==="unmount")view.unmount();
      await act(async()=>finish("blob:bank"));
      if(transition==="play")expect(play).toHaveBeenCalledOnce();
      else{expect(input.signal.aborted).toBe(true);expect(play).not.toHaveBeenCalled();}
    }finally{play.mockRestore();}
  });

});
