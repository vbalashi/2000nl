import * as reportClient from "@/lib/feedback/diagnosticReportClient";
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { TrainingIdiomSession } from "@/components/training/pilot/TrainingIdiomSession";
import {
  fetchNextPlatformV2IdiomTrainingSessionExercise,
  performPlatformV2IdiomExerciseAction,
} from "@/lib/platform/platformV2IdiomExerciseClient";
import {
  singleSenseEntry,
  singleSenseGroup,
} from "./platformV2TrainingFixture";
import { platformV2Message } from "@/lib/platform/platformV2ClientI18n";
import {
  requestPlatformV2Translation,
  resolvePlatformV2Audio,
} from "@/lib/platform/platformV2TrainingMediaClient";
import { loadIdiomExerciseContent } from "@/lib/training/idiomExerciseLoader";

vi.mock("@/lib/platform/platformV2IdiomExerciseClient", () => ({
  fetchNextPlatformV2IdiomTrainingSessionExercise: vi.fn(),
  markPlatformV2IdiomTrainingSessionMemberUnavailable: vi.fn(),
  performPlatformV2IdiomExerciseAction: vi.fn(),
}));
vi.mock("@/lib/training/idiomExerciseLoader", () => ({
  loadIdiomExerciseContent: vi.fn(),
}));

vi.mock("@/lib/platform/platformV2TrainingMediaClient", () => ({
  requestPlatformV2Translation: vi.fn(),
  resolvePlatformV2Audio: vi.fn(),
}));

const t = (key: string) => platformV2Message("en", key);
const session = {
  contractVersion: "platform-idiom-exercise-session-v2" as const,
  sessionId: "session-1",
  exerciseFamily: "idiom" as const,
  direction: "direct" as const,
  sessionSize: "1",
  requestedTotal: 1,
  plannedNew: 1,
  plannedReview: 0,
  plannedPractice: 0 as const,
  plannedTotal: 1,
  plannedAt: "2026-09-24T12:00:00Z",
  runStatus: "active" as const,
  runGeneration: 1,
  completedActions: 0,
  completionReason: null,
  members: [],
};
const candidate = {
  status: "ready" as const,
  sessionId: "session-1",
  ordinal: 1,
  targetId: "target-1",
  targetKey: "idiom:target-1:direct",
  family: "idiom" as const,
  direction: "direct" as const,
  entryId: "entry-1",
  contentNodeId: "node-1",
  expressionSourcePath: "meanings[0].idioms[0].expression",
  explanationSourcePath: "meanings[0].idioms[0].explanation",
  exampleSourcePaths: [],
  sourceRevision: "revision-1",
  sourceTextFingerprint: "fingerprint-1",
  queueSource: "new" as const,
  state: null,
};
const content = {
  headword: "klaar",
  group: {
    ...singleSenseGroup,
    header: { ...singleSenseGroup.header, text: "klaar" },
  },
  entry: {
    ...singleSenseEntry,
    entryId: "entry-1",
    contentNodes: [],
    reportContentRevision: "a".repeat(64),
    capabilities: [
      {
        actionId: "request-translation" as const,
        elementId: "translate",
        messageKey: "senseCard.translation.request",
        target: { kind: "entry" as const, entryId: "entry-1" },
        targetLanguageCode: "ru",
      },
      {
        actionId: "report-content" as const,
        elementId: "report",
        messageKey: "senseCard.report",
        target: { kind: "entry" as const, entryId: "entry-1" },
      },
    ],
  },
  expression: {
    contentNodeId: "node-1",
    parentContentNodeId: null,
    kind: "idiom" as const,
    order: 1,
    text: "ergens helemaal klaar mee zijn",
    sourceTextFingerprint: "fingerprint-1",
    translations: [],
  },
  explanation: {
    contentNodeId: "node-2",
    parentContentNodeId: "node-1",
    kind: "idiom-explanation" as const,
    order: 2,
    text: "iets niet meer willen",
    sourceTextFingerprint: "explanation-1",
    translations: [],
  },
  examples: [],
};

beforeEach(() => {
  vi.clearAllMocks();
});

test("direct idiom reveals complete content and records the self-assessment", async () => {
  const dispatch = vi.spyOn(window, "dispatchEvent");
  vi.mocked(fetchNextPlatformV2IdiomTrainingSessionExercise)
    .mockResolvedValueOnce(candidate)
    .mockResolvedValueOnce({
      status: "completed",
      sessionId: "session-1",
      completedActions: 1,
      requestedTotal: 1,
    });
  vi.mocked(loadIdiomExerciseContent).mockResolvedValue({
    state: "ready",
    content,
  } as never);
  vi.mocked(performPlatformV2IdiomExerciseAction).mockResolvedValue(
    {} as never,
  );

  render(
    <TrainingIdiomSession
      userId="user-1"
      session={session}
      contentLanguageCode="nl"
      translationTargetLanguageCode={null}
      interfaceLanguage="en"
      onExit={vi.fn()}
    />,
  );
  expect(
    await screen.findByText("ergens helemaal klaar mee zijn"),
  ).toBeInTheDocument();
  const timingDetails = dispatch.mock.calls
    .map(([event]) => event)
    .filter(
      (event): event is CustomEvent =>
        event instanceof CustomEvent &&
        event.type === "2000nl:training-transition-timing",
    )
    .map((event) => event.detail);
  expect(timingDetails).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        stage: "idiom.session-next",
        outcome: "ready",
      }),
      expect.objectContaining({
        stage: "idiom.content-lookup",
        outcome: "ready",
      }),
      expect.objectContaining({
        stage: "transition.total",
        outcome: "continue-ready",
      }),
    ]),
  );
  expect(
    screen.getByRole("button", { name: "Show answer" }),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Show answer" }));
  expect(screen.getByText("iets niet meer willen")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Good" }));
  await waitFor(() =>
    expect(performPlatformV2IdiomExerciseAction).toHaveBeenCalledWith(
      expect.objectContaining({
        trainingSessionId: "session-1",
        reviewResult: "success",
      }),
    ),
  );
});

test("the idiom answer exposes the same header and secondary actions as word cards", async () => {
  vi.mocked(fetchNextPlatformV2IdiomTrainingSessionExercise).mockResolvedValue(
    candidate,
  );
  vi.mocked(loadIdiomExerciseContent).mockResolvedValue({
    state: "ready",
    content,
  } as never);
  render(
    <TrainingIdiomSession
      userId="user-1"
      session={session}
      contentLanguageCode="nl"
      translationTargetLanguageCode="ru"
      interfaceLanguage="en"
      onExit={vi.fn()}
      onPlayResolvedAudio={vi.fn()}
      onOpenDetails={vi.fn()}
    />,
  );
  fireEvent.click(await screen.findByRole("button", { name: "Show answer" }));
  expect(
    screen.getByRole("button", { name: t("senseCard.audio.play") }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: t("senseCard.translation.request") }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: t("senseCard.wordDetails.open") }),
  ).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Report" })).toBeInTheDocument();
});

test.todo(
  "excluding an idiom excludes both directions and supports undo without changing FSRS or ordinary word progress",
);

test("header actions use the selected content and do not consume a review", async () => {
  vi.mocked(fetchNextPlatformV2IdiomTrainingSessionExercise).mockResolvedValue(
    candidate,
  );
  vi.mocked(loadIdiomExerciseContent).mockResolvedValue({
    state: "ready",
    content,
  } as never);
  vi.mocked(resolvePlatformV2Audio).mockResolvedValue("/audio/klaar.mp3");
  vi.mocked(requestPlatformV2Translation).mockResolvedValue();
  const play = vi.fn(),
    details = vi.fn();
  render(
    <TrainingIdiomSession
      userId="user-1"
      session={session}
      contentLanguageCode="nl"
      translationTargetLanguageCode="ru"
      interfaceLanguage="en"
      onExit={vi.fn()}
      onPlayResolvedAudio={play}
      onOpenDetails={details}
    />,
  );
  fireEvent.click(await screen.findByRole("button", { name: "Show answer" }));
  fireEvent.click(
    screen.getByRole("button", { name: t("senseCard.audio.play") }),
  );
  await waitFor(() =>
    expect(play).toHaveBeenCalledWith("/audio/klaar.mp3", "klaar"),
  );
  expect(resolvePlatformV2Audio).toHaveBeenCalledWith(
    expect.objectContaining({ text: "klaar", cacheOwnerId: "user-1" }),
  );
  fireEvent.click(
    screen.getByRole("button", { name: t("senseCard.wordDetails.open") }),
  );
  expect(details).toHaveBeenCalledWith({
    group: content.group,
    entry: content.entry,
  });
  fireEvent.click(
    screen.getByRole("button", { name: t("senseCard.translation.request") }),
  );
  await waitFor(() =>
    expect(loadIdiomExerciseContent).toHaveBeenCalledTimes(2),
  );
  expect(requestPlatformV2Translation).toHaveBeenCalledWith(
    content.entry.capabilities[0],
  );
  expect(performPlatformV2IdiomExerciseAction).not.toHaveBeenCalled();
  expect(fetchNextPlatformV2IdiomTrainingSessionExercise).toHaveBeenCalledTimes(
    1,
  );
  expect(screen.getByText("0 / 1")).toBeInTheDocument();
});

test("an audio response after leaving the card does not start playback", async () => {
  vi.mocked(fetchNextPlatformV2IdiomTrainingSessionExercise).mockResolvedValue(
    candidate,
  );
  vi.mocked(loadIdiomExerciseContent).mockResolvedValue({
    state: "ready",
    content,
  } as never);
  let finish!: (url: string) => void;
  vi.mocked(resolvePlatformV2Audio).mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const play = vi.fn();
  const view = render(
    <TrainingIdiomSession
      userId="user-1"
      session={session}
      contentLanguageCode="nl"
      translationTargetLanguageCode={null}
      interfaceLanguage="en"
      onExit={vi.fn()}
      onPlayResolvedAudio={play}
    />,
  );
  fireEvent.click(await screen.findByRole("button", { name: "Show answer" }));
  fireEvent.click(
    screen.getByRole("button", { name: t("senseCard.audio.play") }),
  );
  view.unmount();
  finish("/audio/old.mp3");
  await Promise.resolve();
  await Promise.resolve();
  expect(play).not.toHaveBeenCalled();
});

test("report captures only the selected idiom and opens the common report sheet", async () => {
  const snapshot = vi.spyOn(reportClient, "freezeSenseCardDiagnosticSnapshot");
  vi.mocked(fetchNextPlatformV2IdiomTrainingSessionExercise).mockResolvedValue(
    candidate,
  );
  vi.mocked(loadIdiomExerciseContent).mockResolvedValue({
    state: "ready",
    content,
  } as never);
  render(
    <TrainingIdiomSession
      userId="user-1"
      session={session}
      contentLanguageCode="nl"
      translationTargetLanguageCode={null}
      interfaceLanguage="en"
      onExit={vi.fn()}
    />,
  );
  fireEvent.click(await screen.findByRole("button", { name: "Show answer" }));
  fireEvent.click(screen.getByRole("button", { name: "Report" }));
  expect(screen.getByRole("dialog")).toBeVisible();
  expect(snapshot).toHaveBeenCalledWith(
    expect.objectContaining({
      entry: expect.objectContaining({
        card: null,
        translation: null,
        contentNodes: [content.expression, content.explanation],
      }),
    }),
  );
  expect(performPlatformV2IdiomExerciseAction).not.toHaveBeenCalled();
});


test.each(["en", "nl", "ru"] as const)(
  "uses the shared session frame, progress and utilities in %s",
  async (interfaceLanguage) => {
    vi.mocked(fetchNextPlatformV2IdiomTrainingSessionExercise).mockResolvedValue(candidate);
    vi.mocked(loadIdiomExerciseContent).mockResolvedValue({ state: "ready", content } as never);
    const onHistory = vi.fn();
    const onExit = vi.fn();
    const { container } = render(
      <TrainingIdiomSession
        userId="user-1"
        session={{ ...session, requestedTotal: 5, completedActions: 2 }}
        contentLanguageCode="nl"
        translationTargetLanguageCode={null}
        interfaceLanguage={interfaceLanguage}
        onHistory={onHistory}
        onExit={onExit}
      />,
    );
    await screen.findByText("ergens helemaal klaar mee zijn");
    expect(container.querySelector("[data-training-session-main]")).toBeInTheDocument();
    expect(screen.getByTestId("training-session-position")).toHaveTextContent("2 / 5");
    expect(screen.getByTestId("training-session-progress-track").firstElementChild).toHaveStyle({ width: "40%" });
    const chrome = screen.getByTestId("training-session-chrome");
    const utilities = chrome.querySelectorAll("button");
    expect(utilities).toHaveLength(2);
    fireEvent.click(utilities[0]!);
    fireEvent.click(utilities[1]!);
    expect(onHistory).toHaveBeenCalledOnce();
    expect(onExit).toHaveBeenCalledOnce();
  },
);

test("failed grading uses the shared notice outside the clipped card frame", async () => {
  vi.mocked(fetchNextPlatformV2IdiomTrainingSessionExercise).mockResolvedValue(candidate);
  vi.mocked(loadIdiomExerciseContent).mockResolvedValue({ state: "ready", content } as never);
  vi.mocked(performPlatformV2IdiomExerciseAction).mockRejectedValueOnce(new Error("offline"));
  render(<TrainingIdiomSession userId="user-1" session={session}
    contentLanguageCode="nl" translationTargetLanguageCode={null}
    interfaceLanguage="en" onExit={vi.fn()} />);
  fireEvent.click(await screen.findByRole("button", { name: "Show answer" }));
  fireEvent.click(screen.getByRole("button", { name: "Good" }));
  const alert = await screen.findByRole("alert");
  expect(alert.closest('[data-testid="training-card-frame"]')).toBeNull();
  expect(screen.getByRole("button", { name: "Try again" })).toBeEnabled();
  expect(screen.getByRole("button", { name: "Good" })).toBeEnabled();
});

test.each(["audio", "translation"] as const)("failed %s stays inside the shared flex card layout", async (action) => {
  vi.mocked(fetchNextPlatformV2IdiomTrainingSessionExercise).mockResolvedValue(candidate);
  vi.mocked(loadIdiomExerciseContent).mockResolvedValue({ state: "ready", content } as never);
  if (action === "audio") {
    vi.mocked(resolvePlatformV2Audio).mockRejectedValueOnce(new Error("offline"));
  } else {
    vi.mocked(requestPlatformV2Translation).mockRejectedValueOnce(new Error("offline"));
  }
  render(<TrainingIdiomSession userId="user-1" session={session}
    contentLanguageCode="nl" translationTargetLanguageCode="ru"
    interfaceLanguage="en" onExit={vi.fn()} onPlayResolvedAudio={vi.fn()} />);
  fireEvent.click(await screen.findByRole("button", { name: "Show answer" }));
  fireEvent.click(screen.getByRole("button", { name: t(action === "audio" ? "senseCard.audio.play" : "senseCard.translation.request") }));
  const alert = await screen.findByRole("alert");
  expect(alert.parentElement).toBe(screen.getByTestId("training-exercise-card"));
  expect(alert).toHaveClass("shrink-0");
  expect(screen.getByRole("button", { name: "Good" })).toBeEnabled();
});
