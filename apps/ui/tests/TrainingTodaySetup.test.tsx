import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterAll, beforeAll, beforeEach, expect, test, vi } from "vitest";
import {
  TrainingTodaySetup,
  type TrainingSetupDraft,
} from "@/components/training/pilot/TrainingTodaySetup";
import type { TrainingSetupsDocument, TrainingSetupsSnapshot } from "@/lib/training/setups/model";
vi.mock("@/lib/training/availability/useTrainingAvailability",()=>({useTrainingAvailability:()=>({status:"ready",value:{dueToday:8,totalReviews:120,newCards:20,studyDay:"2026-10-03",timezone:"Europe/Amsterdam",asOf:"2026-10-03T10:00:00Z"},refreshing:false,refreshFailed:false,reload:vi.fn()})}));
const { accounts } = vi.hoisted(() => ({ accounts: new Map<string, TrainingSetupsSnapshot>() }));
vi.mock("@/lib/training/setups/client", () => ({
  fetchAccountTrainingSetups: async (userId: string) => accounts.get(userId) ?? { revision: 0, document: { schemaVersion: 1, trainings: [], mainTrainingId: null } },
  saveAccountTrainingSetups: async (userId: string, revision: number, document: TrainingSetupsDocument) => {
    const current = accounts.get(userId);
    if (current && current.revision !== revision) return { kind: "conflict", snapshot: current };
    const snapshot = { revision: revision + 1, document };
    accounts.set(userId, snapshot);
    return { kind: "saved", snapshot };
  },
}));
const dialogPrototype=HTMLDialogElement.prototype;
const showModalDescriptor=Object.getOwnPropertyDescriptor(dialogPrototype,"showModal"),closeDescriptor=Object.getOwnPropertyDescriptor(dialogPrototype,"close");
beforeAll(()=>{Object.defineProperties(dialogPrototype,{showModal:{configurable:true,value(){this.setAttribute("open","");}},close:{configurable:true,value(){this.removeAttribute("open");}}});});
afterAll(()=>{if(showModalDescriptor)Object.defineProperty(dialogPrototype,"showModal",showModalDescriptor);else Reflect.deleteProperty(dialogPrototype,"showModal");if(closeDescriptor)Object.defineProperty(dialogPrototype,"close",closeDescriptor);else Reflect.deleteProperty(dialogPrototype,"close");});
beforeEach(() => {accounts.clear();vi.stubGlobal("matchMedia",vi.fn(()=>({matches:true,addEventListener:vi.fn(),removeEventListener:vi.fn()})));});
const seedAccount = (userId: string, trainings: unknown[]) => accounts.set(userId, { revision: 0, document: { schemaVersion: 1, trainings: trainings.map((item: any) => ({ ...item, languageCode: "nl" })), mainTrainingId: null } });

const initialDraft: TrainingSetupDraft = {
  scenarioId: "understanding",
  modes: ["word-to-definition"],
  cardFilter: "both",
  listValue: "curated:nt2",
  newReviewRatio: 2,
  dateWindow: "all",
  sourceValue: "all",
};
const dictionaryA = "00000000-0000-4000-8000-0000000000a1";
const dictionaryB = "00000000-0000-4000-8000-0000000000b2";
const dictionaryLost = "00000000-0000-4000-8000-0000000000c3";

const baseProps = {
  interfaceLanguage: "en" as const,
  status: "ready" as const,
  initialDraft,
  stats: {
    newWordsToday: 4,
    newCardsToday: 5,
    learningStartedToday: 4,
    graduatedNewWordsToday: 0,
    dailyNewLimit: 10,
    reviewWordsDone: 6,
    reviewCardsDone: 7,
    reviewWordsDue: 8,
    reviewCardsDue: 9,
    totalWordsLearned: 120,
    totalWordsInList: 2000,
  },
  scenarios: [
    {
      value: "understanding",
      label: "Meaning",
      modes: ["word-to-definition" as const, "definition-to-word" as const],
    },
    {
      value: "listening",
      label: "Listening",
      modes: ["listen-recognize" as const],
    },
  ],
  lists: [{ value: "curated:nt2", label: "NT2 2000" }],
  sources: [{ value: "source:video-1", label: "Dutch lesson 1" }],
  onContinue: vi.fn(),
  onStart: vi.fn(),
  onRetry: vi.fn(),
};

test("the approved builder filters Dutch word families and passes them to Start", async () => {
  const onStart = vi.fn();
  render(<TrainingTodaySetup {...baseProps} userId="filters" trainingLanguageCode="nl" onStart={onStart} />);
  fireEvent.click(await screen.findByRole("button", { name: "Create training" }));
  fireEvent.click(screen.getByRole("button", { name: /^Filters / }));
  expect(screen.getByRole("button", { name: "Verbs" })).toBeEnabled();
  expect(screen.getByRole("button", { name: "Noun subfilters" })).toBeEnabled();
  fireEvent.click(screen.getByRole("button", { name: "Verbs" }));
  fireEvent.click(screen.getByRole("button", { name: "Noun subfilters" }));
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "de" }));
  fireEvent.click(screen.getByRole("button", { name: "Close noun subfilters" }));
  fireEvent.click(screen.getByRole("button", { name: "Start training" }));
  expect(onStart).toHaveBeenCalledWith(expect.objectContaining({ partOfSpeech: ["ww", "zn"], nounArticles: ["de"] }));
});

test("the approved builder sends the selected mode and a custom finite session size", async () => {
  const onStart = vi.fn();
  render(<TrainingTodaySetup {...baseProps} userId="finite-mode" trainingLanguageCode="nl" onStart={onStart} />);
  fireEvent.click(await screen.findByRole("button", { name: "Create training" }));
  fireEvent.click(screen.getByRole("button", { name: /^Exercises / }));
  fireEvent.click(screen.getByRole("button", { name: /^Reverse / }));
  fireEvent.click(screen.getByRole("button", { name: /^Session / }));
  fireEvent.change(screen.getByRole("slider", { name: "Session size" }), { target: { value: "0" } });
  fireEvent.click(screen.getByRole("button", { name: "Start training" }));
  expect(onStart).toHaveBeenCalledWith(expect.objectContaining({ modes: ["word-to-definition", "definition-to-word"], sessionSize: 5 }));
});

test("the mix slider preserves its endpoints and middle ratios", async () => {
  const onStart = vi.fn();
  render(<TrainingTodaySetup {...baseProps} userId="mix-stops" trainingLanguageCode="nl" onStart={onStart} />);
  fireEvent.click(await screen.findByRole("button", { name: "Create training" }));
  fireEvent.click(screen.getByRole("button", { name: /^Session / }));
  const mix = screen.getByRole("slider", { name: "New / review balance" });
  fireEvent.change(mix, { target: { value: "6" } });
  fireEvent.click(screen.getByRole("button", { name: "Start training" }));
  expect(onStart).toHaveBeenLastCalledWith(expect.objectContaining({ cardFilter: "new", newReviewRatio: 2 }));
  fireEvent.change(mix, { target: { value: "1" } });
  fireEvent.click(screen.getByRole("button", { name: "Start training" }));
  expect(onStart).toHaveBeenLastCalledWith(expect.objectContaining({ cardFilter: "both", newReviewRatio: 5 }));
});

test("an existing one-to-four mix remains representable and is sent to Start", async () => {
  const onStart = vi.fn();
  render(<TrainingTodaySetup {...baseProps} initialDraft={{ ...initialDraft, newReviewRatio: 4 }} userId="mix-four" trainingLanguageCode="nl" onStart={onStart} />);
  fireEvent.click(await screen.findByRole("button", { name: "Create training" }));
  fireEvent.click(screen.getByRole("button", { name: /^Session / }));
  expect(screen.getByRole("slider", { name: "New / review balance" })).toHaveValue("2");
  fireEvent.click(screen.getByRole("button", { name: "Start training" }));
  expect(onStart).toHaveBeenCalledWith(expect.objectContaining({ newReviewRatio: 4 }));
});

test("all due is reviews only, and changing the mix returns to a finite session", async () => {
  const onStart = vi.fn();
  render(<TrainingTodaySetup {...baseProps} userId="all-due" trainingLanguageCode="nl" onStart={onStart} />);
  fireEvent.click(await screen.findByRole("button", { name: "Create training" }));
  fireEvent.click(screen.getByRole("button", { name: /^Session / }));
  fireEvent.change(screen.getByRole("slider", { name: "Session size" }), { target: { value: "6" } });
  fireEvent.click(screen.getByRole("button", { name: "Start training" }));
  expect(onStart).toHaveBeenLastCalledWith(expect.objectContaining({ cardFilter: "review", sessionSize: "all-due-today" }));
  fireEvent.change(screen.getByRole("slider", { name: "New / review balance" }), { target: { value: "4" } });
  fireEvent.click(screen.getByRole("button", { name: "Start training" }));
  expect(onStart).toHaveBeenLastCalledWith(expect.objectContaining({ cardFilter: "both", sessionSize: 10 }));
});

test("a blocked start leaves the builder usable and never launches", async () => {
  const onStart = vi.fn();
  render(<TrainingTodaySetup {...baseProps} userId="blocked" trainingLanguageCode="nl" startBlocked onStart={onStart} />);
  fireEvent.click(await screen.findByRole("button", { name: "Create training" }));
  fireEvent.click(screen.getByRole("button", { name: /^Filters / }));
  expect(screen.getByRole("button", { name: "Verbs" })).toBeEnabled();
  expect(screen.getByRole("button", { name: "Start training" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Start training" }));
  expect(onStart).not.toHaveBeenCalled();
});

test("a pending Start stays disabled until its first request completes", async () => {
  const userId = "pending-start";
  seedAccount(userId, []);
  const onStart = vi.fn();
  render(<TrainingTodaySetup {...baseProps} userId={userId} trainingLanguageCode="nl" initialView="setup" startPending onStart={onStart} />);
  const start = await screen.findByRole("button", { name: "Starting…" });
  expect(start).toBeDisabled();
  fireEvent.click(start);
  expect(onStart).not.toHaveBeenCalled();
});

test("Back discards builder edits before another training is created", async () => {
  render(<TrainingTodaySetup {...baseProps} userId="back-discards" trainingLanguageCode="nl" hasOwnedSession={false} />);
  fireEvent.click(await screen.findByRole("button", { name: "Create training" }));
  fireEvent.click(screen.getByRole("button", { name: /^Filters / }));
  fireEvent.click(screen.getByRole("button", { name: "Verbs" }));
  fireEvent.click(screen.getByRole("button", { name: "Back to Training" }));
  fireEvent.click(await screen.findByRole("button", { name: "Create training" }));
  fireEvent.click(screen.getByRole("button", { name: /^Filters / }));
  expect(screen.getByRole("button", { name: "Verbs" })).toHaveAttribute("aria-pressed", "false");
});

test("a failed start returns to the overview with a retry for card preparation", async () => {
  const onRetryCard = vi.fn();
  const onStart = vi.fn().mockResolvedValue(false);
  render(<TrainingTodaySetup {...baseProps} userId="failed-start" trainingLanguageCode="nl" hasOwnedSession={false}
    cardPreparationStatus="error" onRetryCard={onRetryCard} onStart={onStart} />);
  fireEvent.click(await screen.findByRole("button", { name: "Create training" }));
  fireEvent.click(screen.getByRole("button", { name: "Start training" }));
  expect(await screen.findByRole("button", { name: "Create training" })).toBeInTheDocument();
  expect(screen.getByRole("alert")).toHaveTextContent("The next card could not be prepared.");
  fireEvent.click(screen.getByRole("button", { name: "Retry card preparation" }));
  expect(onRetryCard).toHaveBeenCalledOnce();
});

test("a missing collection stays selected and blocked until replaced", async () => {
  const userId = "missing-collection";
  seedAccount(userId, [{ id: "missing", name: "Missing collection", draft: { ...initialDraft, listValue: "user:missing" } }]);
  const onStart = vi.fn();
  render(<TrainingTodaySetup {...baseProps} userId={userId} trainingLanguageCode="nl" hasOwnedSession={false} onStart={onStart} />);
  expect(await screen.findByRole("heading", { name: "Missing collection", level: 2 })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Start training" })).toBeDisabled();
  fireEvent.click((await screen.findAllByRole("button", { name: "Edit Missing collection" }))[0]);
  expect(screen.getAllByText("Selected material is unavailable. Choose another before starting.").length).toBeGreaterThan(0);
  expect(screen.getByRole("button", { name: "Selected material is unavailable. Choose another before starting." })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
  expect(accounts.get(userId)?.document.trainings[0].draft.listValue).toBe("user:missing");
  fireEvent.click(screen.getByRole("button", { name: /^Source / }));
  fireEvent.click(screen.getByRole("button", { name: "NT2 2000" }));
  fireEvent.click(screen.getByRole("button", { name: "Start training" }));
  expect(onStart).toHaveBeenCalledWith(expect.objectContaining({ listValue: "curated:nt2" }), "Missing collection", { trainingId: "missing" });
});

test("an idiom recipe starts with its own family and finite size", async () => {
  const onStart = vi.fn();
  render(<TrainingTodaySetup {...baseProps} userId="idiom-family" trainingLanguageCode="nl" hasOwnedSession={false} onStart={onStart}
    scenarios={[...baseProps.scenarios, { value: "idiom", label: "Idioms", modes: ["word-to-definition", "definition-to-word"] }]} />);
  fireEvent.click(await screen.findByRole("button", { name: "Create training" }));
  fireEvent.click(screen.getByRole("button", { name: /^Exercises / }));
  fireEvent.click(screen.getByRole("button", { name: "Idioms" }));
  fireEvent.click(screen.getByRole("button", { name: "Start training" }));
  expect(onStart).toHaveBeenCalledWith(expect.objectContaining({ family: "idiom", scenarioId: "idiom", sessionSize: 10 }));
});

test("an idiom recipe keeps its family and selected modes after saving and reopening", async () => {
  const userId = "idiom-recipe-round-trip";
  const onStart = vi.fn();
  render(<TrainingTodaySetup {...baseProps} userId={userId} trainingLanguageCode="nl" hasOwnedSession={false} onStart={onStart}
    scenarios={[...baseProps.scenarios, { value: "idiom", label: "Idioms", modes: ["word-to-definition", "definition-to-word"] }]} />);
  fireEvent.click(await screen.findByRole("button", { name: "Create training" }));
  fireEvent.click(screen.getByRole("button", { name: /^Exercises / }));
  fireEvent.click(screen.getByRole("button", { name: "Idioms" }));
  fireEvent.click(screen.getByRole("button", { name: /^Reverse / }));
  fireEvent.click(screen.getByRole("button", { name: "Save training" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Training name" }), { target: { value: "Reverse idioms" } });
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Save training" }));
  await waitFor(() => expect(accounts.get(userId)?.document.trainings).toHaveLength(1));
  const saved = accounts.get(userId)!.document.trainings[0];
  expect(saved.draft).toMatchObject({ family: "idiom", scenarioId: "idiom", modes: ["word-to-definition", "definition-to-word"] });
  fireEvent.click(screen.getByRole("button", { name: "Back to Training" }));
  fireEvent.click((await screen.findAllByRole("button", { name: `Edit ${saved.name}` }))[0]);
  fireEvent.click(screen.getByRole("button", { name: /^Exercises / }));
  expect(screen.getByRole("button", { name: "Idioms" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: /^Reverse / })).toHaveAttribute("aria-pressed", "true");
  fireEvent.click(screen.getByRole("button", { name: "Start training" }));
  await waitFor(() => expect(onStart).toHaveBeenCalledWith(saved.draft, saved.name, { trainingId: saved.id }));
});

test("a selected dictionary recipe is saved to the account and launched from the overview", async () => {
  const userId = "saved-dictionary-recipe";
  const onStart = vi.fn();
  render(<TrainingTodaySetup {...baseProps} userId={userId} trainingLanguageCode="nl" hasOwnedSession={false}
    dictionaries={[{ value: dictionaryA, label: "Core Dutch" }]} onStart={onStart} />);
  fireEvent.click(await screen.findByRole("button", { name: "Create training" }));
  fireEvent.click(screen.getByRole("button", { name: /^Source / }));
  fireEvent.click(screen.getByRole("button", { name: "Core Dutch" }));
  fireEvent.click(screen.getByRole("button", { name: "Save training" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Training name" }), { target: { value: "Core Dutch practice" } });
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Save training" }));
  await waitFor(() => expect(accounts.get(userId)?.document.trainings).toHaveLength(1));
  const saved = accounts.get(userId)!.document.trainings[0];
  expect(saved.draft).toMatchObject({ materialMode: "selected-dictionaries", dictionaryIds: [dictionaryA] });
  fireEvent.click(screen.getByRole("button", { name: "Back to Training" }));
  fireEvent.click(await screen.findByRole("button", { name: "Start training" }));
  await waitFor(() => expect(onStart).toHaveBeenCalledWith(saved.draft, saved.name, { trainingId: saved.id }));
});

test("approved overview launches the account main training rather than the current default", async () => {
 const savedDraft={...initialDraft,sessionSize:5,newReviewRatio:4};
 accounts.set("overview-main",{revision:1,document:{schemaVersion:1,mainTrainingId:"main",trainings:[{id:"main",name:"My five words",languageCode:"nl",draft:savedDraft}]}});
 const onStart=vi.fn();
 render(<TrainingTodaySetup {...baseProps} userId="overview-main" trainingLanguageCode="nl" hasOwnedSession={false} onStart={onStart}/>);
 await screen.findByRole("heading",{name:"My five words",level:2});
 fireEvent.click(screen.getByRole("button",{name:"Start training"}));
 await waitFor(()=>expect(onStart).toHaveBeenCalledWith(savedDraft, "My five words",{trainingId:"main"}));
});

test("approved overview waits for the saved language catalog before launching", async()=>{
 const savedDraft={...initialDraft,listValue:"english-list",sessionSize:5};
 accounts.set("multilingual",{revision:1,document:{schemaVersion:1,mainTrainingId:"english",trainings:[{id:"english",name:"English words",languageCode:"en",draft:savedDraft}]}});
 const onStart=vi.fn(),onTrainingLanguageChange=vi.fn();
 const props={...baseProps,userId:"multilingual",trainingLanguageCode:"nl",hasOwnedSession:false,onStart,onTrainingLanguageChange,trainingLanguageOptions:[{value:"nl",label:"Dutch"},{value:"en",label:"English"}]};
 const view=render(<TrainingTodaySetup {...props}/>);
 await screen.findByRole("heading",{name:"English words",level:2});
 fireEvent.click(screen.getByRole("button",{name:"Start training"}));
 expect(onTrainingLanguageChange).toHaveBeenCalledWith("en");expect(onStart).not.toHaveBeenCalled();
 view.rerender(<TrainingTodaySetup {...props} trainingLanguageCode="en" trainingLanguageLoading lists={[]}/>);
 expect(onStart).not.toHaveBeenCalled();
 view.rerender(<TrainingTodaySetup {...props} trainingLanguageCode="en" lists={[{value:"english-list",label:"English source"}]}/>);
 await waitFor(()=>expect(onStart).toHaveBeenCalledWith(savedDraft, "English words",{trainingId:"english"}));
});

test("changing builder language waits for its catalog and launches only English material", async () => {
  const onStart = vi.fn(), onTrainingLanguageChange = vi.fn();
  const props = { ...baseProps, userId: "builder-language", trainingLanguageCode: "nl", hasOwnedSession: false,
    onStart, onTrainingLanguageChange, trainingLanguageOptions: [{ value: "nl", label: "Dutch" }, { value: "en", label: "English" }] };
  const view = render(<TrainingTodaySetup {...props} />);
  fireEvent.click(await screen.findByRole("button", { name: "Create training" }));
  fireEvent.click(screen.getByRole("button", { name: "English" }));
  expect(onTrainingLanguageChange).toHaveBeenCalledWith("en");
  view.rerender(<TrainingTodaySetup {...props} trainingLanguageCode="en" trainingLanguageLoading lists={[]} initialDraft={{ ...initialDraft, listValue: "user:english" }} />);
  expect(screen.getByRole("button", { name: "Selected material is unavailable. Choose another before starting." })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Save training" })).toBeDisabled();
  expect(onStart).not.toHaveBeenCalled();
  view.rerender(<TrainingTodaySetup {...props} trainingLanguageCode="en" lists={[{ value: "user:english", label: "English collection" }]} initialDraft={{ ...initialDraft, listValue: "user:english" }} />);
  fireEvent.click(screen.getByRole("button", { name: /^Source / }));
  expect(screen.getByRole("button", { name: "English collection" })).toBeEnabled();
  fireEvent.click(screen.getByRole("button", { name: "Start training" }));
  expect(onStart).toHaveBeenCalledWith(expect.objectContaining({ listValue: "user:english" }));
});

test("approved overview resumes an owned session independently of edited presets",async()=>{
 const onContinue=vi.fn(),onStart=vi.fn();
 render(<TrainingTodaySetup {...baseProps} userId="owned-overview" trainingLanguageCode="nl" hasOwnedSession ownedSession={{id:"actual-session",completed:3,total:10}} activeSessionLabel="Actual run" onContinue={onContinue} onStart={onStart}/>);
 await screen.findByRole("heading",{name:"Actual run"});
 expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow","3");
 expect(screen.getByText("done").nextElementSibling).toHaveTextContent("3");
 expect(screen.queryByText("done today")).toBeNull();
 fireEvent.click(screen.getByRole("button",{name:"Continue training"}));
 expect(onContinue).toHaveBeenCalledOnce();expect(onStart).not.toHaveBeenCalled();
});

test("approved builder stores a chosen name without repeating the configuration", async()=>{
 render(<TrainingTodaySetup {...baseProps} userId="named-overview" trainingLanguageCode="nl" hasOwnedSession={false}/>);
 await screen.findByRole("button",{name:"Create training"});
 fireEvent.click(screen.getByRole("button",{name:"Create training"}));
 fireEvent.click(screen.getByRole("button",{name:"Save training"}));
 fireEvent.change(screen.getByRole("textbox",{name:"Training name"}),{target:{value:"Five useful words"}});
 fireEvent.click(within(screen.getByRole("dialog")).getByRole("button",{name:"Save training"}));
 await waitFor(()=>expect(screen.queryByRole("dialog")).toBeNull());
 await waitFor(()=>expect(accounts.get("named-overview")?.document.trainings[0].name).toBe("Five useful words"));
 expect(screen.queryByText("Saved to your account")).toBeNull();
 expect(accounts.get("named-overview")?.document.trainings[0].name).toBe("Five useful words");
 fireEvent.click(screen.getByRole("button",{name:"Back to Training"}));
 await screen.findByRole("heading",{name:"Five useful words",level:2});
 fireEvent.click(screen.getAllByRole("button",{name:"Edit Five useful words"})[0]);
 await screen.findByRole("button",{name:"Save changes"});
 fireEvent.click(screen.getByRole("button",{name:"Save changes"}));
 expect(screen.getByRole("heading",{name:"Five useful words",level:2})).toBeInTheDocument();
});

test("approved overview discloses unavailable dictionaries without losing saved references", async()=>{
 const savedDraft={...initialDraft,sessionSize:10,materialMode:"selected-dictionaries" as const,dictionaryIds:[dictionaryA,dictionaryLost]};
 accounts.set("partial-overview",{revision:1,document:{schemaVersion:1,mainTrainingId:"partial",trainings:[{id:"partial",name:"Partial source",languageCode:"nl",draft:savedDraft}]}});
 render(<TrainingTodaySetup {...baseProps} userId="partial-overview" trainingLanguageCode="nl" hasOwnedSession={false} dictionaries={[{value:dictionaryA,label:"Available source"}]}/>);
 await screen.findByRole("heading",{name:"Partial source",level:2});
 expect(screen.getByRole("status")).toHaveTextContent("Some selected dictionaries are unavailable");
 expect(screen.getByRole("button",{name:"Start training"})).toBeEnabled();
 expect(accounts.get("partial-overview")?.document.trainings[0].draft.dictionaryIds).toEqual([dictionaryA,dictionaryLost]);
});

test("a queued language switch cannot launch a previous account's training",async()=>{
 const savedDraft={...initialDraft,listValue:"english-list",sessionSize:5};
 accounts.set("old-owner",{revision:1,document:{schemaVersion:1,mainTrainingId:"english",trainings:[{id:"english",name:"Old owner's training",languageCode:"en",draft:savedDraft}]}});
 const onStart=vi.fn(),onTrainingLanguageChange=vi.fn();
 const props={...baseProps,userId:"old-owner",trainingLanguageCode:"nl",hasOwnedSession:false,onStart,onTrainingLanguageChange,trainingLanguageOptions:[{value:"nl",label:"Dutch"},{value:"en",label:"English"}]};
 const view=render(<TrainingTodaySetup {...props}/>);
 await screen.findByRole("heading",{name:"Old owner's training",level:2});
 fireEvent.click(screen.getByRole("button",{name:"Start training"}));
 view.rerender(<TrainingTodaySetup {...props} userId="new-owner" trainingLanguageCode="en" lists={[{value:"english-list",label:"English source"}]}/>);
 await screen.findByRole("button",{name:"Create training"});
 expect(onStart).not.toHaveBeenCalled();
 expect(screen.queryByRole("heading",{name:"Old owner's training"})).toBeNull();
});


test("approved builder opens every section collapsed and resets when creating again",async()=>{
 render(<TrainingTodaySetup {...baseProps} userId="builder-sections" trainingLanguageCode="nl" hasOwnedSession={false}/>);
 await screen.findByRole("button",{name:"Create training"});fireEvent.click(screen.getByRole("button",{name:"Create training"}));
 for(const name of ["Source","Exercises","Filters","Session"])expect(screen.getByRole("button",{name:new RegExp(`^${name} `)})).toHaveAttribute("aria-expanded","false");
 expect(screen.queryByRole("button",{name:"Nouns"})).toBeNull();
 fireEvent.click(screen.getByRole("button",{name:/^Filters /}));
 expect(screen.getByRole("button",{name:"Nouns"})).toBeInTheDocument();
 fireEvent.click(screen.getByRole("button",{name:"Back to Training"}));fireEvent.click(screen.getByRole("button",{name:"Create training"}));
 expect(screen.getByRole("button",{name:/^Filters /})).toHaveAttribute("aria-expanded","false");
});

test("approved lexical chips and noun subfilters preserve the canonical launch payload",async()=>{
 const onStart=vi.fn();
 render(<TrainingTodaySetup {...baseProps} userId="builder-lexical" trainingLanguageCode="nl" hasOwnedSession={false} onStart={onStart}/>);
 await screen.findByRole("button",{name:"Create training"});fireEvent.click(screen.getByRole("button",{name:"Create training"}));fireEvent.click(screen.getByRole("button",{name:/^Filters /}));
 fireEvent.click(screen.getByRole("button",{name:"Verbs"}));fireEvent.click(screen.getByRole("button",{name:"Noun subfilters"}));
 fireEvent.click(within(screen.getByRole("dialog")).getByRole("button",{name:"de"}));fireEvent.click(screen.getByRole("button",{name:"Close noun subfilters"}));
 fireEvent.click(screen.getByRole("button",{name:"Start training"}));
 expect(onStart).toHaveBeenCalledWith(expect.objectContaining({partOfSpeech:["ww","zn"],nounArticles:["de"]}));
});

test("approved source picker selects dictionaries on the same screen",async()=>{
 const onStart=vi.fn();
 render(<TrainingTodaySetup {...baseProps} userId="builder-source" trainingLanguageCode="nl" hasOwnedSession={false} dictionaries={[{value:dictionaryA,label:"Dictionary A"}]} onStart={onStart}/>);
 await screen.findByRole("button",{name:"Create training"});fireEvent.click(screen.getByRole("button",{name:"Create training"}));fireEvent.click(screen.getByRole("button",{name:/^Source /}));
 fireEvent.click(screen.getByRole("button",{name:"Dictionary A"}));fireEvent.click(screen.getByRole("button",{name:"Start training"}));
 expect(onStart).toHaveBeenCalledWith(expect.objectContaining({materialMode:"selected-dictionaries",dictionaryIds:[dictionaryA]}));
});


test("a Statistics material opens the builder in its language without starting a run",async()=>{
 const onStart=vi.fn(),onTrainingLanguageChange=vi.fn(),onMaterialIntentConsumed=vi.fn();
 const intent={key:1,userId:"stats-intent",languageCode:"en",material:{materialMode:"selected-dictionaries" as const,dictionaryIds:[dictionaryA]}};
 const props={...baseProps,userId:"stats-intent",trainingLanguageCode:"nl",hasOwnedSession:false,onStart,onTrainingLanguageChange,onMaterialIntentConsumed,
  trainingLanguageOptions:[{value:"nl",label:"Dutch"},{value:"en",label:"English"}],dictionaries:[{value:dictionaryA,label:"Dictionary A"}]};
 const view=render(<TrainingTodaySetup {...props} materialIntent={intent}/>);
 await waitFor(()=>expect(onTrainingLanguageChange).toHaveBeenCalledWith("en"));
 expect(onMaterialIntentConsumed).not.toHaveBeenCalled();
 view.rerender(<TrainingTodaySetup {...props} trainingLanguageCode="en" materialIntent={intent}/>);
 await waitFor(()=>expect(onMaterialIntentConsumed).toHaveBeenCalledOnce());
 await screen.findByRole("button",{name:"Start training"});
 expect(onStart).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole("button",{name:"Start training"}));
 expect(onStart).toHaveBeenCalledWith(expect.objectContaining({materialMode:"selected-dictionaries",dictionaryIds:[dictionaryA]}));
});

test("a Statistics material for another account is ignored",async()=>{
 const onStart=vi.fn(),onMaterialIntentConsumed=vi.fn(),onTrainingLanguageChange=vi.fn();
 render(<TrainingTodaySetup {...baseProps} userId="stats-owner" trainingLanguageCode="nl" hasOwnedSession={false} onStart={onStart} onTrainingLanguageChange={onTrainingLanguageChange}
  onMaterialIntentConsumed={onMaterialIntentConsumed} materialIntent={{key:2,userId:"someone-else",languageCode:"nl",material:{materialMode:"all-dictionaries"}}}/>);
 await waitFor(()=>expect(onMaterialIntentConsumed).toHaveBeenCalledOnce());
 await screen.findByRole("button",{name:"Create training"});
 expect(onStart).not.toHaveBeenCalled();expect(onTrainingLanguageChange).not.toHaveBeenCalled();
});

test("switching accounts discards an open builder draft", async () => {
   const onStart = vi.fn();
  const props = { ...baseProps, trainingLanguageCode: "nl", hasOwnedSession: false, onStart };
  const view = render(<TrainingTodaySetup {...props} userId="previous-builder-owner" />);
  await screen.findByRole("button", { name: "Create training" });
  fireEvent.click(screen.getByRole("button", { name: "Create training" }));
  fireEvent.click(screen.getByRole("button", { name: /^Filters / }));
  fireEvent.click(screen.getByRole("button", { name: "Verbs" }));
  view.rerender(<TrainingTodaySetup {...props} userId="next-builder-owner" />);
  await screen.findByRole("button", { name: "Create training" });
  expect(screen.queryByRole("heading", { name: "Build training" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Create training" }));
  fireEvent.click(screen.getByRole("button", { name: "Start training" }));
  expect(onStart).toHaveBeenCalledOnce();
  expect(onStart.mock.calls[0][0].partOfSpeech).toEqual(baseProps.initialDraft.partOfSpeech);
  expect(accounts.get("next-builder-owner")).toBeUndefined();
});

test("paused material blocks fresh runs while an owned session still resumes", async () => {
   const { AccountMaterialProvider } = await import("@/components/practice/material/AccountMaterialProvider");
  const onContinue = vi.fn(), onStart = vi.fn(), onTrainingLanguageChange = vi.fn();
  const repository = {
    load: async () => ({ revision: 1, document: { schemaVersion: 1 as const, learningLanguages: [{code:"nl",paused:true},{code:"en",paused:false}], disabledDictionaryIds: [dictionaryA] } }),
    save: vi.fn(),
    languages: async () => ["nl", "en"].map(code => ({code,label:code,dictionaryCount:1,curatedListCount:1,userListCount:0,hasTrainingEligibleLists:true})),
  };
  render(<AccountMaterialProvider userId="paused-run" repository={repository}>
    <TrainingTodaySetup {...baseProps} userId="paused-run" trainingLanguageCode="nl" trainingLanguageOptions={[{value:"nl",label:"Dutch"},{value:"en",label:"English"}]} dictionaries={[{value:dictionaryA,label:"Dictionary A"}]} hasOwnedSession ownedSession={{id:"old-run",completed:3,total:10}} activeSessionLabel="Old run" onContinue={onContinue} onStart={onStart} onTrainingLanguageChange={onTrainingLanguageChange}/>
  </AccountMaterialProvider>);
  const continueButton = await screen.findByRole("button",{name:"Continue training"});
  expect(continueButton).toBeEnabled();
  fireEvent.click(continueButton);
  expect(onContinue).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("button",{name:"Create training"}));
  expect(screen.queryByRole("button",{name:"Dutch"})).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button",{name:"English"}));
  expect(onTrainingLanguageChange).toHaveBeenCalledWith("en");
  expect(onStart).not.toHaveBeenCalled();
});

test("a disabled dictionary is omitted from source choices without modifying the saved setup", async () => {
   const { AccountMaterialProvider } = await import("@/components/practice/material/AccountMaterialProvider");
  const saved = { id:"saved-disabled",name:"Saved disabled source",languageCode:"nl",draft:{...initialDraft,materialMode:"selected-dictionaries" as const,dictionaryIds:[dictionaryA]} };
  accounts.set("disabled-source", {revision:0,document:{schemaVersion:1,mainTrainingId:saved.id,trainings:[saved]}});
  const onStart = vi.fn();
  const repository = {
    load: async () => ({revision:1,document:{schemaVersion:1 as const,learningLanguages:[],disabledDictionaryIds:[dictionaryA]}}),
    save: vi.fn(),
    languages: async () => [{code:"nl",label:"Dutch",dictionaryCount:2,curatedListCount:1,userListCount:0,hasTrainingEligibleLists:true}],
  };
  render(<AccountMaterialProvider userId="disabled-source" repository={repository}>
    <TrainingTodaySetup {...baseProps} userId="disabled-source" trainingLanguageCode="nl" hasOwnedSession={false} dictionaries={[{value:dictionaryA,label:"Dictionary A"},{value:dictionaryB,label:"Dictionary B"}]} onStart={onStart}/>
  </AccountMaterialProvider>);
  await screen.findByRole("heading",{name:"Saved disabled source",level:2});
  expect(screen.getByRole("button",{name:"Start training"})).toBeDisabled();
  fireEvent.click(screen.getByRole("button",{name:"Create training"}));
  fireEvent.click(screen.getByRole("button",{name:/^Source /}));
  expect(screen.queryByRole("button",{name:"Dictionary A"})).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button",{name:"Dictionary B"}));
  fireEvent.click(screen.getByRole("button",{name:"Start training"}));
  expect(onStart).toHaveBeenCalledWith(expect.objectContaining({dictionaryIds:[dictionaryB]}));
  expect(accounts.get("disabled-source")?.document.trainings[0]).toEqual(saved);
});

test("material preference load failure blocks fresh launches but leaves resume available", async () => {
   const { AccountMaterialProvider } = await import("@/components/practice/material/AccountMaterialProvider");
  const onContinue = vi.fn(), onStart = vi.fn();
  const repository = {load:vi.fn().mockRejectedValue(new Error("offline")),save:vi.fn(),languages:async()=>[]};
  render(<AccountMaterialProvider userId="material-offline" repository={repository}>
    <TrainingTodaySetup {...baseProps} userId="material-offline" trainingLanguageCode="nl" hasOwnedSession ownedSession={{id:"owned-offline",completed:3,total:10}} onContinue={onContinue} onStart={onStart}/>
  </AccountMaterialProvider>);
  await screen.findByText("Material preferences could not be loaded.");
  fireEvent.click(screen.getByRole("button",{name:"Continue training"}));
  expect(onContinue).toHaveBeenCalledOnce();
  expect(onStart).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button",{name:"Retry"}));
  await waitFor(()=>expect(repository.load).toHaveBeenCalledTimes(2));
});

test("approved reverse idiom preview names its expression answer", async () => {
   render(<TrainingTodaySetup {...baseProps} userId="builder-idiom-direction" trainingLanguageCode="nl" hasOwnedSession={false}
    scenarios={[...baseProps.scenarios, { value: "idiom", label: "Idioms", modes: ["word-to-definition", "definition-to-word"] }]} />);
  fireEvent.click(await screen.findByRole("button", { name: "Create training" }));
  fireEvent.click(screen.getByRole("button", { name: /^Exercises / }));
  fireEvent.click(screen.getByRole("button", { name: /^Idioms$/ }));
  expect(screen.getByRole("button", { name: /^Reverse Meteen zeggen waar het om gaat\. Met de deur in huis vallen$/ })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /^Reverse Meaning Words$/ })).not.toBeInTheDocument();
});

 test("approved source search appears above five choices and hidden queries cannot hide short lists",async()=>{
 const dictionaries=Array.from({length:12},(_,index)=>({value:`dictionary-${index}`,label:`Dictionary ${index}`}));
 const props={...baseProps,userId:"source-search-boundary",trainingLanguageCode:"nl",hasOwnedSession:false};
 const view=render(<TrainingTodaySetup {...props} dictionaries={dictionaries}/>);
 await screen.findByRole("button",{name:"Create training"});fireEvent.click(screen.getByRole("button",{name:"Create training"}));fireEvent.click(screen.getByRole("button",{name:/^Source /}));
 fireEvent.click(screen.getByRole("button",{name:"Search sources"}));
 fireEvent.change(screen.getByRole("textbox",{name:"Search sources"}),{target:{value:"Dictionary 5"}});
 expect(screen.queryByRole("button",{name:"Dictionary 0"})).not.toBeInTheDocument();
 view.rerender(<TrainingTodaySetup {...props} dictionaries={dictionaries.slice(0,5)}/>);
 expect(screen.queryByRole("textbox",{name:"Search sources"})).not.toBeInTheDocument();
 expect(screen.getByRole("button",{name:"Dictionary 0"})).toBeInTheDocument();
 });

test.each(["preparing", "loading"] as const)("startup readiness waits through %s before exposing the overview", async status => {
   const ready = vi.fn();
  const {rerender} = render(<TrainingTodaySetup {...baseProps} userId="startup-a" status={status} onStartupReady={ready} />);
  expect(ready).not.toHaveBeenCalled();
  rerender(<TrainingTodaySetup {...baseProps} userId="startup-a" onStartupReady={ready} />);
  await waitFor(() => expect(ready).toHaveBeenCalledOnce());
});
test("an actionable startup error releases the startup presentation", () => {
  const ready = vi.fn();
  render(<TrainingTodaySetup {...baseProps} status="error" onStartupReady={ready} />);
  expect(ready).toHaveBeenCalledOnce();
  expect(screen.getByRole("button", {name: "Try again"})).toBeVisible();
});

test("empty-state recovery opens the builder with the selected word filter intact", async () => {
  render(<TrainingTodaySetup {...baseProps} status="empty" initialDraft={{ ...initialDraft, partOfSpeech: ["ww"] }} />);
  fireEvent.click(screen.getByRole("button", { name: "Adjust filters" }));
  fireEvent.click(screen.getByRole("button", { name: /^Filters / }));
  expect(screen.getByRole("button", { name: "Verbs" })).toHaveAttribute("aria-pressed", "true");
});


test("approved Translation is a single contextual reverse choice with a keyword answer", async () => {
 const onStart = vi.fn();
 render(<TrainingTodaySetup {...baseProps} onStart={onStart} userId="translation-choice" trainingLanguageCode="nl" translationTargetLanguageCode="ru" hasOwnedSession={false}
 scenarios={[...baseProps.scenarios,{value:"sentences",label:"Example sentences",modes:["word-to-definition"]}]} />);
 fireEvent.click(await screen.findByRole("button", {name:"Create training"}));
 fireEvent.click(screen.getByRole("button", {name:/^Exercises /}));
 expect(screen.getAllByRole("button", {name:"Translation"})).toHaveLength(1);
 expect(screen.queryByText("Word in context")).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole("button", {name:"Translation"}));
 expect(screen.getByText("Example translation → word")).toBeInTheDocument();
 expect(screen.getByText("Я езжу на работу на велосипеде.")).toBeInTheDocument();
 expect(screen.getByText("de fiets")).toBeInTheDocument();
 expect(screen.queryByRole("button", {name:/^Example translation → word/})).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole("button", {name:"Start training"}));
 await waitFor(()=>expect(onStart).toHaveBeenCalledWith(expect.objectContaining({family:"word-in-context",modes:["definition-to-word"]})));
});

test("paused sentence recipe stays editable and never silently becomes a context session", async () => {
 const saved={...initialDraft,family:"sentence" as const,scenarioId:"sentences",sessionSize:10};
 seedAccount("paused-sentence",[{id:"old-sentence",name:"Old sentence practice",draft:saved}]);
 const onStart=vi.fn();
 render(<TrainingTodaySetup {...baseProps} onStart={onStart} userId="paused-sentence" trainingLanguageCode="nl" hasOwnedSession={false}
 scenarios={[...baseProps.scenarios,{value:"sentences",label:"Example sentences",modes:["word-to-definition"]}]} />);
 expect(await screen.findByRole("button",{name:"Load Old sentence practice"})).toBeEnabled();
 expect(screen.getByRole("button",{name:"Start training"})).toBeDisabled();
 fireEvent.click(screen.getAllByRole("button",{name:"Edit Old sentence practice"})[0]);
 expect(screen.getByRole("button",{name:"Choose a training goal"})).toBeDisabled();
 fireEvent.click(screen.getByRole("button",{name:/^Exercises /}));
 expect(screen.getByText(/Sentence translation is paused/)).toBeInTheDocument();
 expect(accounts.get("paused-sentence")?.document.trainings[0].draft).toEqual(saved);
 expect(onStart).not.toHaveBeenCalled();
});

test("contextual Translation saves and restores its exact reverse recipe after remount", async()=>{
 const onStart=vi.fn();
 const props={...baseProps,onStart,userId:"context-save-restore",trainingLanguageCode:"nl",translationTargetLanguageCode:"ru",hasOwnedSession:false};
 const view=render(<TrainingTodaySetup {...props}/>);
 fireEvent.click(await screen.findByRole("button",{name:"Create training"}));
 fireEvent.click(screen.getByRole("button",{name:/^Exercises /}));
 fireEvent.click(screen.getByRole("button",{name:"Translation"}));
 fireEvent.click(screen.getByRole("button",{name:"Save training"}));
 fireEvent.change(screen.getByRole("textbox",{name:"Training name"}),{target:{value:"Context practice"}});
 fireEvent.click(within(screen.getByRole("dialog")).getByRole("button",{name:"Save training"}));
 await waitFor(()=>expect(accounts.get(props.userId)?.document.trainings).toHaveLength(1));
 const saved=structuredClone(accounts.get(props.userId)!.document.trainings[0]);
 expect(saved.draft).toMatchObject({family:"word-in-context",scenarioId:"understanding",modes:["definition-to-word"]});
 view.unmount();render(<TrainingTodaySetup {...props}/>);
 fireEvent.click((await screen.findAllByRole("button",{name:`Edit ${saved.name}`}))[0]);
 fireEvent.click(screen.getByRole("button",{name:/^Exercises /}));
 expect(screen.getByRole("button",{name:"Translation"})).toHaveAttribute("aria-pressed","true");
 expect(screen.getByText("Example translation → word")).toBeInTheDocument();
 expect(accounts.get(props.userId)!.document.trainings[0]).toEqual(saved);
 fireEvent.click(screen.getByRole("button",{name:"Start training"}));
 await waitFor(()=>expect(onStart).toHaveBeenCalledWith(saved.draft, "Context practice", {trainingId:saved.id}));
});


test("saved recipe Load selects without launching, then hero Start launches the chosen recipe", async()=>{
 const a={id:"load-a",name:"First",draft:{...initialDraft,sessionSize:5 as const}},b={id:"load-b",name:"Second",draft:{...initialDraft,sessionSize:10 as const}};
 seedAccount("load-owner",[a,b]);
 const onStart=vi.fn(),onLoadTraining=vi.fn();
 render(<TrainingTodaySetup {...baseProps} userId="load-owner" trainingLanguageCode="nl" hasOwnedSession={false} onStart={onStart} onLoadTraining={onLoadTraining}/>);
 fireEvent.click(await screen.findByRole("button",{name:"Load Second"}));
 await waitFor(()=>expect(onLoadTraining).toHaveBeenCalledWith(expect.objectContaining({id:b.id})));
 expect(onStart).not.toHaveBeenCalled();
 expect(screen.getByRole("heading",{name:"Second",level:2})).toBeInTheDocument();
 expect(screen.getByRole("heading",{name:"First",level:3})).toBeInTheDocument();
 expect(screen.getByRole("heading",{name:"Second",level:3})).toBeInTheDocument();
 fireEvent.click(screen.getByRole("button",{name:"Start training"}));
 await waitFor(()=>expect(onStart).toHaveBeenCalledWith(b.draft,b.name,{trainingId:b.id}));
});

test("Update renames the same saved identity while Save as creates a separate recipe", async()=>{
 seedAccount("rename-owner",[{id:"original-id",name:"Original",draft:initialDraft}]);
 render(<TrainingTodaySetup {...baseProps} userId="rename-owner" trainingLanguageCode="nl" hasOwnedSession={false}/>);
 fireEvent.click((await screen.findAllByRole("button",{name:"Edit Original"}))[0]);
 fireEvent.click(screen.getByRole("button",{name:"Training name"}));
 fireEvent.change(screen.getByRole("textbox",{name:"Training name"}),{target:{value:"Renamed"}});
 fireEvent.click(screen.getByRole("button",{name:"Save changes"}));
 await waitFor(()=>expect(accounts.get("rename-owner")?.document.trainings).toMatchObject([{id:"original-id",name:"Renamed"}]));
 expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
 fireEvent.click(screen.getByLabelText("Save as…"));
 fireEvent.click(screen.getByRole("button",{name:"Save as…"}));
 const dialog=screen.getByRole("dialog");
 fireEvent.change(within(dialog).getByLabelText("Training name"),{target:{value:"Copy"}});
 fireEvent.click(within(dialog).getByRole("button",{name:"Save as…"}));
 await waitFor(()=>expect(accounts.get("rename-owner")?.document.trainings).toHaveLength(2));
 const recipes=accounts.get("rename-owner")!.document.trainings;
 expect(recipes.find(item=>item.id==="original-id")?.name).toBe("Renamed");
 expect(recipes.find(item=>item.name==="Copy")?.id).not.toBe("original-id");
});
