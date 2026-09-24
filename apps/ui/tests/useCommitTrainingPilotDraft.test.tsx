import { act, renderHook } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { useCommitTrainingPilotDraft } from "@/components/training/pilot/useTrainingPilotController";
import type { TrainingSetupDraft } from "@/components/training/pilot/TrainingTodaySetup";

const { startTrainingSession, updateActiveTrainingScope } = vi.hoisted(() => ({
  startTrainingSession: vi.fn(),
  updateActiveTrainingScope: vi.fn(),
}));

vi.mock("@/lib/trainingService", () => ({
  startTrainingSession,
  updateActiveTrainingScope,
}));

const draft: TrainingSetupDraft = {
  scenarioId: "understanding",
  modes: ["word-to-definition"],
  cardFilter: "both",
  listValue: "user:missing",
  newReviewRatio: 2,
  dateWindow: "all",
  sourceValue: "all",
  sessionSize: 10,
};

test("missing saved material cannot fall back to the current training scope", async () => {
  startTrainingSession.mockReset();
  updateActiveTrainingScope.mockReset();
  const reportError = vi.fn();
  const resetQueue = vi.fn();
  const applyListLocally = vi.fn();
  const { result } = renderHook(() => useCommitTrainingPilotDraft({
    userId: "user-1",
    languageCode: "nl",
    resolveList: () => null,
    applyListLocally,
    applyPreferences: vi.fn(),
    applyFocusFilter: vi.fn(),
    resetQueue,
    loadStats: vi.fn(),
    loadWord: vi.fn(),
    reportError,
  }));

  let committed: boolean | undefined;
  await act(async () => {
    committed = await result.current(draft);
  });

  expect(committed).toBe(false);
  expect(reportError).toHaveBeenCalledWith("training_material_unavailable");
  expect(updateActiveTrainingScope).not.toHaveBeenCalled();
  expect(startTrainingSession).not.toHaveBeenCalled();
  expect(applyListLocally).not.toHaveBeenCalled();
  expect(resetQueue).not.toHaveBeenCalled();
});
