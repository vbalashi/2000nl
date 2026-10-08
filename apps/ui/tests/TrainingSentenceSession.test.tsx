import { getUiMessages } from "@/lib/uiMessages";
const recordedStudy = vi.hoisted(() => vi.fn());
vi.mock("@/components/training/useRecordedStudyTime", () => ({ useRecordedStudyTime: recordedStudy }));
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { TrainingSentenceSession } from "@/components/training/pilot/TrainingSentenceSession";
import { fetchNextPlatformV2TranslationTrainingSessionExercise, markPlatformV2TranslationTrainingSessionMemberUnavailable, performPlatformV2TranslationExerciseAction } from "@/lib/platform/platformV2TranslationExerciseClient";
import { loadSentenceExerciseContent, prepareSentenceExerciseTranslation } from "@/lib/training/sentenceExerciseLoader";
import { readTranslationTrainingStats } from "@/lib/training/translationStatsClient";
import { performTrainingExclusion } from "@/lib/platform/trainingExclusionClient";
import { resolvePlatformV2Audio } from "@/lib/platform/platformV2TrainingMediaClient";
import { goedGroup } from "./platformV2IdiomHierarchyFixture";

vi.mock("@/lib/platform/platformV2TranslationExerciseClient", () => ({
  fetchNextPlatformV2TranslationTrainingSessionExercise: vi.fn(),
  markPlatformV2TranslationTrainingSessionMemberUnavailable: vi.fn(),
  performPlatformV2TranslationExerciseAction: vi.fn(),
}));
vi.mock("@/lib/training/sentenceExerciseLoader", () => ({
  loadSentenceExerciseContent: vi.fn(),
  prepareSentenceExerciseTranslation: vi.fn(),
}));
vi.mock("@/lib/training/translationStatsClient", () => ({ readTranslationTrainingStats: vi.fn() }));
vi.mock("@/lib/platform/trainingExclusionClient", () => ({ performTrainingExclusion: vi.fn() }));
vi.mock("@/lib/platform/platformV2TrainingMediaClient", () => ({ resolvePlatformV2Audio: vi.fn() }));

const session = { contractVersion: "platform-translation-exercise-session-v1" as const, sessionId: "sentence-session", exerciseFamily: "translation" as const, direction: "recall" as const, sessionSize: "1", requestedTotal: 1, plannedNew: 1, plannedReview: 0, plannedPractice: 0 as const, plannedTotal: 1, plannedAt: "2026-09-24T12:00:00Z", runStatus: "active" as const, runGeneration: 1, completedActions: 0, completionReason: null, members: [] };
const candidate = { status: "ready" as const, sessionId: session.sessionId, ordinal: 1, targetId: "target-sentence", targetKey: "translation:target-sentence", family: "translation" as const, direction: "recall" as const, entryId: "entry-goed", contentNodeId: "idiom-example-goed", sourcePath: "raw.meanings[0].examples[0]", sourceRevision: "rev-1", sourceTextFingerprint: "fingerprint-idiom-example-goed", queueSource: "new" as const, state: null };
const content = (() => {
  const group = structuredClone(goedGroup);
  const entry = group.entries.find((item) => item.kind === "sense-card")!;
  const sentence = entry.contentNodes.find((node) => node.contentNodeId === candidate.contentNodeId)!;
  sentence.translations = [{ translationId: "translation-1", targetLanguageCode: "ru", status: "ready", text: "Переведённый пример.", sourceTextFingerprint: sentence.sourceTextFingerprint, translationPolicyVersion: "v1" }];
  return { group, entry, sentence };
})();

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(readTranslationTrainingStats).mockResolvedValue({ contractVersion: "training-translation-stats-v1", newCardsToday: 1, reviewCardsDone: 0, reviewCardsDue: 0, totalCardsStarted: 1, totalCardsInScope: 1 });
  vi.mocked(performTrainingExclusion).mockResolvedValue({} as never);
  vi.mocked(prepareSentenceExerciseTranslation).mockResolvedValue({ state: "ready" });
});

test("prepares only the next latched sentence without advancing or grading", async () => {
  const second = {
    ordinal: 2, targetId: "target-next", queueSource: "new" as const,
    consumedAt: null, unavailableAt: null, unavailableReason: null,
    entryId: "entry-next", contentNodeId: "example-next",
    family: "translation" as const, direction: "recall" as const,
  };
  const third = { ...second, ordinal: 3, targetId: "target-third", entryId: "entry-third", contentNodeId: "example-third" };
  const sessionWithLookahead = {
    ...session, requestedTotal: 3, plannedTotal: 3,
    members: [
      { ordinal: 1, targetId: candidate.targetId, queueSource: "new" as const, consumedAt: null, unavailableAt: null, unavailableReason: null, entryId: candidate.entryId, contentNodeId: candidate.contentNodeId, family: "translation" as const, direction: "recall" as const },
      second,
      third,
    ],
  };
  vi.mocked(fetchNextPlatformV2TranslationTrainingSessionExercise).mockResolvedValue(candidate);
  vi.mocked(loadSentenceExerciseContent).mockResolvedValue({ state: "ready", content } as never);
  render(<TrainingSentenceSession userId="user-1" session={sessionWithLookahead} contentLanguageCode="nl" translationTargetLanguageCode="ru" interfaceLanguage="en" onExit={vi.fn()} />);

  expect(await screen.findByText("Переведённый пример.")).toBeVisible();
  await waitFor(() => expect(prepareSentenceExerciseTranslation).toHaveBeenCalledTimes(1));
  expect(prepareSentenceExerciseTranslation).toHaveBeenCalledWith(expect.objectContaining({
    entryId: second.entryId,
    contentNodeId: second.contentNodeId,
    contentLanguageCode: "nl",
    translationTargetLanguageCode: "ru",
  }));
  expect(prepareSentenceExerciseTranslation).not.toHaveBeenCalledWith(expect.objectContaining({ entryId: third.entryId }));
  expect(performPlatformV2TranslationExerciseAction).not.toHaveBeenCalled();
  expect(markPlatformV2TranslationTrainingSessionMemberUnavailable).not.toHaveBeenCalled();
});

test("sentence session reveals the selected translation, grades the same identity and continues", async () => {
  vi.mocked(fetchNextPlatformV2TranslationTrainingSessionExercise).mockResolvedValueOnce(candidate).mockResolvedValueOnce({ status: "completed", sessionId: session.sessionId, completedActions: 1, requestedTotal: 1 });
  vi.mocked(loadSentenceExerciseContent).mockResolvedValue({ state: "ready", content } as never);
  vi.mocked(performPlatformV2TranslationExerciseAction).mockResolvedValue({} as never);
  render(<TrainingSentenceSession userId="user-1" session={session} contentLanguageCode="nl" translationTargetLanguageCode="ru" interfaceLanguage="en" onExit={vi.fn()} />);
  expect(await screen.findByText("Переведённый пример.")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Show answer" }));
  expect(screen.getByText(content.sentence.text)).toBeVisible();
  expect(screen.getByText("Переведённый пример.")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Good" }));
  await waitFor(() => expect(performPlatformV2TranslationExerciseAction).toHaveBeenCalledWith(expect.objectContaining({ trainingSessionId: session.sessionId, candidate: expect.objectContaining({ targetId: candidate.targetId, family: "translation", direction: "recall" }), reviewResult: "success" })));
  expect(await screen.findByText("Session complete")).toBeVisible();
});

test("a pending translation stays on the same session member and can be retried", async () => {
  vi.mocked(fetchNextPlatformV2TranslationTrainingSessionExercise).mockResolvedValue(candidate);
  vi.mocked(loadSentenceExerciseContent).mockResolvedValueOnce({ state: "translation-pending" }).mockResolvedValueOnce({ state: "ready", content } as never);
  render(<TrainingSentenceSession userId="user-1" session={session} contentLanguageCode="nl" translationTargetLanguageCode="ru" interfaceLanguage="en" onExit={vi.fn()} />);
  fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
  expect(await screen.findByText("Переведённый пример.")).toBeVisible();
  expect(markPlatformV2TranslationTrainingSessionMemberUnavailable).not.toHaveBeenCalled();
  expect(performPlatformV2TranslationExerciseAction).not.toHaveBeenCalled();
});


test("active time waits for prepared sentence content and pauses with the enclosing surface", async () => {
  vi.mocked(fetchNextPlatformV2TranslationTrainingSessionExercise).mockResolvedValue(candidate);
  vi.mocked(loadSentenceExerciseContent).mockResolvedValue({state:"ready",content} as never);
  const view = (enabled: boolean) => <TrainingSentenceSession studyTimeEnabled={enabled} userId="user-1" session={session} contentLanguageCode="nl" translationTargetLanguageCode="ru" interfaceLanguage="en" onExit={vi.fn()} />;
  const {rerender}=render(view(true));
  expect(recordedStudy.mock.lastCall?.[0].enabled).toBe(false);
  await waitFor(()=>expect(recordedStudy.mock.lastCall?.[0]).toMatchObject({family:"sentence",ownerId:"user-1",sessionId:session.sessionId,entryId:candidate.entryId,targetId:candidate.targetId,enabled:true}));
  fireEvent.click(screen.getByRole("button",{name:"Show answer"}));
  expect(recordedStudy.mock.lastCall?.[0].enabled).toBe(true);
  rerender(view(false)); expect(recordedStudy.mock.lastCall?.[0].enabled).toBe(false);
});

afterEach(() => { vi.unstubAllEnvs(); });

test("sentence session uses the approved shared shell", async () => {
  vi.mocked(fetchNextPlatformV2TranslationTrainingSessionExercise).mockResolvedValue(candidate);
  vi.mocked(loadSentenceExerciseContent).mockResolvedValue({ state: "ready", content } as never);
  render(<TrainingSentenceSession userId="user-1" session={session} contentLanguageCode="nl" translationTargetLanguageCode="ru" interfaceLanguage="en" onExit={vi.fn()} />);
  await screen.findByRole("button", { name: "Show answer" });
  expect(screen.getByTestId("training-session-chrome")).toHaveAttribute("data-visual-spec", "training-approved-v1");
  expect(screen.queryByTestId("training-session-footer-progress")).not.toBeInTheDocument();
});

for (const language of ["en", "nl", "ru"] as const) {
  test(`approved sentence preparation failure has separate retry and exit owners in ${language}`, async () => {
    vi.mocked(fetchNextPlatformV2TranslationTrainingSessionExercise).mockResolvedValue(candidate);
    vi.mocked(loadSentenceExerciseContent).mockRejectedValue(new Error("lookup_unavailable"));
    const onExit = vi.fn();
    const labels = getUiMessages(language);
    render(<TrainingSentenceSession userId="user-1" session={session} contentLanguageCode="nl"
      translationTargetLanguageCode="ru" interfaceLanguage={language} onExit={onExit} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(labels.trainingExercises.sentence.failed);
    fireEvent.click(screen.getByRole("button", {name:labels.trainingExercises.sentence.retry}));
    await waitFor(()=>expect(loadSentenceExerciseContent).toHaveBeenCalledTimes(2));
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", {name:labels.trainingSession.back}));
    expect(onExit).toHaveBeenCalledOnce();
    expect(performPlatformV2TranslationExerciseAction).not.toHaveBeenCalled();
    expect(markPlatformV2TranslationTrainingSessionMemberUnavailable).not.toHaveBeenCalled();
  });
}

test("parent callback replacement keeps the revealed sentence and does not reload its member",async()=>{
 vi.mocked(fetchNextPlatformV2TranslationTrainingSessionExercise).mockResolvedValue(candidate);
 vi.mocked(loadSentenceExerciseContent).mockResolvedValue({state:"ready",content} as never);
 const view=(onSessionSuperseded:()=>void)=><TrainingSentenceSession userId="user-1" session={session} contentLanguageCode="nl" translationTargetLanguageCode="ru" interfaceLanguage="en" onExit={vi.fn()} onSessionSuperseded={onSessionSuperseded}/>;
 const rendered=render(view(vi.fn()));await screen.findByRole("button",{name:"Show answer"});
 fireEvent.click(screen.getByRole("button",{name:"Show answer"}));expect(screen.getByText(content.sentence.text)).toBeVisible();
 rendered.rerender(view(vi.fn()));
 await waitFor(()=>expect(screen.getByRole("button",{name:"Good"})).toBeVisible());
 expect(screen.queryByRole("button",{name:"Show answer"})).not.toBeInTheDocument();
 expect(fetchNextPlatformV2TranslationTrainingSessionExercise).toHaveBeenCalledTimes(1);
 expect(performPlatformV2TranslationExerciseAction).not.toHaveBeenCalled();
});

test("the next authoritative supersession uses the latest callback without reloading on callback replacement",async()=>{
 const previous=vi.fn(),latest=vi.fn();
 vi.mocked(fetchNextPlatformV2TranslationTrainingSessionExercise).mockResolvedValueOnce(candidate).mockResolvedValueOnce({status:"superseded"} as never);
 vi.mocked(loadSentenceExerciseContent).mockResolvedValue({state:"ready",content} as never);
 vi.mocked(performPlatformV2TranslationExerciseAction).mockResolvedValue({} as never);
 const view=(callback:()=>void)=><TrainingSentenceSession userId="user-1" session={session} contentLanguageCode="nl" translationTargetLanguageCode="ru" interfaceLanguage="en" onExit={vi.fn()} onSessionSuperseded={callback}/>;
 const rendered=render(view(previous));await screen.findByRole("button",{name:"Show answer"});
 fireEvent.click(screen.getByRole("button",{name:"Show answer"}));rendered.rerender(view(latest));
 fireEvent.click(screen.getByRole("button",{name:"Good"}));await waitFor(()=>expect(latest).toHaveBeenCalledTimes(1));
 expect(previous).not.toHaveBeenCalled();expect(fetchNextPlatformV2TranslationTrainingSessionExercise).toHaveBeenCalledTimes(2);
});
