import React from "react";
import userEvent from "@testing-library/user-event";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const fetchRecentTrainingHistory = vi.fn();

vi.mock("@/lib/training/trainingHistoryService", () => ({
  fetchRecentTrainingHistory,
}));

const { TrainingHistoryDestination } = await import(
  "@/components/navigation/TrainingHistoryDestination"
);

beforeEach(() => {
  fetchRecentTrainingHistory.mockReset();
});

test("loads recent authoritative activity only when opened and returns to Training", async () => {
  const onReturnToTraining = vi.fn();
  fetchRecentTrainingHistory.mockResolvedValueOnce({
    items: [
      {
        activityId: "word-review:1",
        entryId: "entry-1",
        headword: "bank",
        partOfSpeech: "zn.",
        reviewResult: "review_success",
        cardTypeId: "word-to-definition",
        reviewedAt: "2026-08-21T11:59:00.000Z",
      },
    ],
    hasMore: true,
  });

  const { rerender } = render(
    <TrainingHistoryDestination
      open={false}
      userId="user-1"
      interfaceLanguage="nl"
      onReturnToTraining={onReturnToTraining}
    />,
  );
  expect(fetchRecentTrainingHistory).not.toHaveBeenCalled();

  rerender(
    <TrainingHistoryDestination
      open
      userId="user-1"
      interfaceLanguage="nl"
      onReturnToTraining={onReturnToTraining}
    />,
  );

  expect(await screen.findByRole("heading", { name: "Geschiedenis" })).toBeInTheDocument();
  expect(await screen.findByText("bank")).toBeInTheDocument();
  expect(screen.getByText("Goed")).toBeInTheDocument();
  expect(screen.getByText("Woord → betekenis")).toBeInTheDocument();
  expect(screen.getByText("De 50 meest recente trainingsactiviteiten worden getoond.")).toBeInTheDocument();
  expect(fetchRecentTrainingHistory).toHaveBeenCalledWith(expect.any(AbortSignal));

  await userEvent.click(screen.getByRole("button", { name: "Geschiedenis sluiten" }));
  await waitFor(() => expect(onReturnToTraining).toHaveBeenCalledOnce());
});

test("distinguishes an empty day from a load failure and retries", async () => {
  fetchRecentTrainingHistory
    .mockRejectedValueOnce(new Error("training_history_failed"))
    .mockResolvedValueOnce({ items: [], hasMore: false });

  render(
    <TrainingHistoryDestination
      open
      userId="user-1"
      interfaceLanguage="en"
      onReturnToTraining={vi.fn()}
    />,
  );

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "History could not be loaded",
  );
  await userEvent.click(screen.getByRole("button", { name: "Try again" }));
  await waitFor(() => expect(fetchRecentTrainingHistory).toHaveBeenCalledTimes(2));
  expect(
    await screen.findByText("No training activity yet."),
  ).toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

test("never renders principal A history while principal B is loading", async () => {
  let resolveUserB!: (value: { items: never[]; hasMore: false }) => void;
  fetchRecentTrainingHistory
    .mockResolvedValueOnce({
      items: [
        {
          activityId: "word-review:a",
          entryId: "entry-a",
          headword: "private-a",
          partOfSpeech: null,
          reviewResult: "review_success",
          cardTypeId: "word-to-definition",
          reviewedAt: "2026-08-21T11:59:00.000Z",
        },
      ],
      hasMore: false,
    })
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveUserB = resolve;
        }),
    );

  const props = {
    open: true,
    interfaceLanguage: "en" as const,
    onReturnToTraining: vi.fn(),
  };
  const { rerender } = render(
    <TrainingHistoryDestination {...props} userId="principal-a" />,
  );
  expect(await screen.findByText("private-a")).toBeInTheDocument();

  rerender(<TrainingHistoryDestination {...props} userId="principal-b" />);

  expect(screen.queryByText("private-a")).not.toBeInTheDocument();
  expect(screen.getByText("Loading history…")).toBeInTheDocument();
  resolveUserB({ items: [], hasMore: false });
  expect(
    await screen.findByText("No training activity yet."),
  ).toBeInTheDocument();
});


afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {configurable:true,value:function(this:HTMLDialogElement){this.setAttribute("open","");}});
  Object.defineProperty(HTMLDialogElement.prototype, "close", {configurable:true,value:function(this:HTMLDialogElement){this.removeAttribute("open");}});
});

test.each(["en","nl","ru"] as const)("approved history shares grouped activity presentation in %s", async locale => {
  vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({matches:true}));
  const copy = (await import("@/lib/uiMessages")).getUiMessages(locale).trainingHistory;
  const close = vi.fn();
  fetchRecentTrainingHistory.mockResolvedValue({items:[{entryId:"entry-1",headword:"bank",partOfSpeech:"zn",reviewResult:"review_success",cardTypeId:"word-to-definition",reviewedAt:"2026-08-21T11:59:00Z"}],hasMore:true});
  render(<TrainingHistoryDestination open userId="user-1" interfaceLanguage={locale} onReturnToTraining={close} />);
  expect(await screen.findByText("bank")).toBeInTheDocument();
  expect(screen.getByRole("dialog",{name:copy.title})).toBeInTheDocument();
  expect(screen.getByText(copy.events.review_success)).toHaveAttribute("data-rating","Good");
  expect(screen.getByText(copy.truncated)).toBeInTheDocument();
  expect(screen.getByRole("heading",{name:new Intl.DateTimeFormat(locale,{day:"numeric",month:"long",year:"numeric"}).format(new Date("2026-08-21T11:59:00Z"))})).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button",{name:copy.close}));
  expect(close).toHaveBeenCalledOnce();
});

test("approved history failures and principal changes never present stale actions", async () => {
  fetchRecentTrainingHistory.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({items:[{entryId:"entry-a",headword:"private-a",partOfSpeech:null,reviewResult:"learning_started",cardTypeId:"word-to-definition",reviewedAt:"2026-08-21T11:59:00Z"}],hasMore:false}).mockResolvedValueOnce({items:[],hasMore:false});
  const props={open:true,interfaceLanguage:"en" as const,onReturnToTraining:vi.fn()};
  const view=render(<TrainingHistoryDestination {...props} userId="a" />);
  expect(await screen.findByRole("alert")).toHaveTextContent("History could not be loaded");
  fireEvent.click(screen.getByRole("button",{name:"Try again"}));
  await screen.findByText("private-a");
  view.rerender(<TrainingHistoryDestination {...props} userId="b" />);
  expect(screen.queryByText("private-a")).not.toBeInTheDocument();
  expect(await screen.findByText("No training activity yet.")).toBeInTheDocument();
});

test.each([
  ["en", "Meaning → idiom", "Sentence translation"],
  ["nl", "Betekenis → uitdrukking", "Zinsvertaling"],
  ["ru", "Значение → выражение", "Перевод предложения"],
] as const)("renders exercise history in %s with an honest missing-text fallback", async (language, idiomLabel, sentenceLabel) => {
  fetchRecentTrainingHistory.mockResolvedValueOnce({ items: [
    { activityId:"idiom-event",entryId:"entry",headword:"gaan",partOfSpeech:null,reviewResult:"review_success",cardTypeId:null,
      exercise:{family:"idiom",direction:"reverse",targetId:"target",text:"ervoor gaan"},reviewedAt:"2026-08-21T11:59:00Z" },
    { activityId:"sentence-event",entryId:"entry",headword:"huis",partOfSpeech:null,reviewResult:"review_hard",cardTypeId:null,
      exercise:{family:"translation",direction:"recall",targetId:"other",text:null},reviewedAt:"2026-08-20T11:59:00Z" },
  ],hasMore:false });
  render(<TrainingHistoryDestination open userId="user" interfaceLanguage={language} onReturnToTraining={vi.fn()} />);
  expect(await screen.findByText("ervoor gaan")).toBeInTheDocument();
  expect(screen.getByText("huis")).toBeInTheDocument();
  expect(screen.getByText(idiomLabel)).toBeInTheDocument();
  expect(screen.getByText(sentenceLabel)).toBeInTheDocument();
});

test("keeps previous activity visible on return and failed refresh", async () => {
  fetchRecentTrainingHistory.mockResolvedValueOnce({items:[{activityId:"retained",entryId:"entry",headword:"retained-word",partOfSpeech:null,reviewResult:"review_success",cardTypeId:"word-to-definition",reviewedAt:"2026-08-21T11:59:00Z"}],hasMore:false});
  const props={userId:"a",interfaceLanguage:"en" as const,onReturnToTraining:vi.fn()};
  const view=render(<TrainingHistoryDestination {...props} open />);
  await screen.findByText("retained-word");
  view.rerender(<TrainingHistoryDestination {...props} open={false} />);
  let reject!: (reason: Error) => void;
  fetchRecentTrainingHistory.mockImplementationOnce(()=>new Promise((_,fail)=>{reject=fail;}));
  view.rerender(<TrainingHistoryDestination {...props} open />);
  expect(screen.getByText("retained-word")).toBeInTheDocument();
  expect(screen.queryByText("Loading history…")).not.toBeInTheDocument();
  reject(new Error("offline"));
  await screen.findByRole("alert");
  expect(screen.getByText("retained-word")).toBeInTheDocument();
});

test("aborts the history transport when leaving the destination", async () => {
  let transportSignal: AbortSignal | undefined;
  fetchRecentTrainingHistory.mockImplementation((signal: AbortSignal) => {
    transportSignal = signal;
    return new Promise((_, reject) => signal.addEventListener("abort", () => reject(new Error("aborted")), {once:true}));
  });
  const props={userId:"a",interfaceLanguage:"en" as const,onReturnToTraining:vi.fn()};
  const view=render(<TrainingHistoryDestination {...props} open />);
  expect(transportSignal?.aborted).toBe(false);
  view.rerender(<TrainingHistoryDestination {...props} open={false} />);
  expect(transportSignal?.aborted).toBe(true);
});

test('links the existing history row to its exact current meaning',async()=>{
 const item={activityId:'exact-meaning-history',entryId:'meaning-two',headword:'bank',partOfSpeech:'zn',reviewResult:'review_success',cardTypeId:'definition-to-word',reviewedAt:'2026-10-08T10:00:00Z'};
 fetchRecentTrainingHistory.mockResolvedValueOnce({items:[item],hasMore:false});const onOpenMeaning=vi.fn();
 render(<TrainingHistoryDestination open userId="history-navigation-owner" interfaceLanguage="en" onReturnToTraining={()=>{}} onOpenMeaning={onOpenMeaning}/>);
 await userEvent.click(await screen.findByRole('button',{name:'bank'}));expect(onOpenMeaning).toHaveBeenCalledWith(item);
 expect(screen.getByText('Good')).toBeInTheDocument();
});
