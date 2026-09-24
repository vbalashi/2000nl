import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { TrainingIdiomSession } from "@/components/training/pilot/TrainingIdiomSession";
import {
  fetchNextPlatformV2IdiomTrainingSessionExercise,
  performPlatformV2IdiomExerciseAction,
} from "@/lib/platform/platformV2IdiomExerciseClient";
import { loadIdiomExerciseContent } from "@/lib/training/idiomExerciseLoader";

vi.mock("@/lib/platform/platformV2IdiomExerciseClient", () => ({
  fetchNextPlatformV2IdiomTrainingSessionExercise: vi.fn(),
  markPlatformV2IdiomTrainingSessionMemberUnavailable: vi.fn(),
  performPlatformV2IdiomExerciseAction: vi.fn(),
}));
vi.mock("@/lib/training/idiomExerciseLoader", () => ({
  loadIdiomExerciseContent: vi.fn(),
}));

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
  entry: { kind: "sense-card", entryId: "entry-1", contentNodes: [] },
  expression: { contentNodeId: "node-1", parentContentNodeId: null, kind: "idiom" as const, order: 1, text: "ergens helemaal klaar mee zijn", sourceTextFingerprint: "fingerprint-1", translations: [] },
  explanation: { contentNodeId: "node-2", parentContentNodeId: "node-1", kind: "idiom-explanation" as const, order: 2, text: "iets niet meer willen", sourceTextFingerprint: "explanation-1", translations: [] },
  examples: [],
};

beforeEach(() => {
  vi.clearAllMocks();
});

test("direct idiom reveals complete content and records the self-assessment", async () => {
  const dispatch = vi.spyOn(window, "dispatchEvent");
  vi.mocked(fetchNextPlatformV2IdiomTrainingSessionExercise)
    .mockResolvedValueOnce(candidate)
    .mockResolvedValueOnce({ status: "completed", sessionId: "session-1", completedActions: 1, requestedTotal: 1 });
  vi.mocked(loadIdiomExerciseContent).mockResolvedValue({ state: "ready", content } as never);
  vi.mocked(performPlatformV2IdiomExerciseAction).mockResolvedValue({} as never);

  render(<TrainingIdiomSession userId="user-1" session={session} contentLanguageCode="nl" translationTargetLanguageCode={null} interfaceLanguage="en" onExit={vi.fn()} />);
  expect(await screen.findByText("ergens helemaal klaar mee zijn")).toBeInTheDocument();
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
      expect.objectContaining({ stage: "idiom.session-next", outcome: "ready" }),
      expect.objectContaining({ stage: "idiom.content-lookup", outcome: "ready" }),
      expect.objectContaining({ stage: "transition.total", outcome: "continue-ready" }),
    ]),
  );
  expect(screen.getByRole("button", { name: "Show answer" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Show answer" }));
  expect(screen.getByText("iets niet meer willen")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Good" }));
  await waitFor(() => expect(performPlatformV2IdiomExerciseAction).toHaveBeenCalledWith(expect.objectContaining({ trainingSessionId: "session-1", reviewResult: "success" })));
});
