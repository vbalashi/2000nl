import { act, renderHook } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { useCommitTrainingPilotDraft } from "@/components/training/pilot/useTrainingPilotController";
import type { TrainingSetupDraft } from "@/components/training/pilot/TrainingTodaySetup";

const { startTrainingSession, startIdiomSession, updateActiveTrainingScope } = vi.hoisted(() => ({
  startTrainingSession: vi.fn(),
  startIdiomSession: vi.fn(),
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

test("dictionary subset starts with no list and sends its exact IDs to the session planner", async () => {
  startTrainingSession.mockReset();
  updateActiveTrainingScope.mockReset();
  updateActiveTrainingScope.mockResolvedValue({ error: null });
  startTrainingSession.mockResolvedValue({
    sessionId: "session-1",
    runStatus: "active",
    plannedNew: 1,
    plannedReview: 0,
    plannedTotal: 1,
  });
  const onSessionReady = vi.fn();
  const { result } = renderHook(() => useCommitTrainingPilotDraft({
    userId: "user-1",
    languageCode: "nl",
    resolveList: () => null,
    applyListLocally: vi.fn(),
    applyPreferences: vi.fn(),
    applyFocusFilter: vi.fn(),
    resetQueue: vi.fn(),
    loadStats: vi.fn(),
    loadWord: vi.fn().mockResolvedValue("loaded"),
    reportError: vi.fn(),
    onSessionReady,
  }));

  await act(async () => {
    expect(await result.current({
      ...draft,
      materialMode: "selected-dictionaries",
      dictionaryIds: ["dict-a", "dict-b"],
    })).toBe(true);
  });

  expect(updateActiveTrainingScope).toHaveBeenCalledWith(expect.objectContaining({
    listId: null,
    listType: null,
  }));
  expect(startTrainingSession).toHaveBeenCalledWith(
    "user-1",
    ["word-to-definition"],
    expect.objectContaining({
      listId: null,
      trainingFilter: expect.objectContaining({
        dictionaryScope: {
          mode: "selected",
          languageCode: "nl",
          dictionaryIds: ["dict-a", "dict-b"],
        },
      }),
    }),
    expect.any(String),
  );
  expect(onSessionReady).toHaveBeenCalledWith(
    expect.objectContaining({ sessionId: "session-1" }),
    expect.objectContaining({
      scope: { listId: null, listType: null },
      focusFilter: expect.objectContaining({ dictionaryScope: expect.objectContaining({ mode: "selected" }) }),
    }),
  );
});

test("server-side material loss leaves the session uncommitted", async () => {
  startTrainingSession.mockReset();
  updateActiveTrainingScope.mockReset();
  updateActiveTrainingScope.mockResolvedValue({ error: null });
  startTrainingSession.mockRejectedValue(new Error("training_material_unavailable"));
  const reportError = vi.fn();
  const resetQueue = vi.fn();
  const { result } = renderHook(() => useCommitTrainingPilotDraft({
    userId: "user-1",
    languageCode: "nl",
    resolveList: () => null,
    applyListLocally: vi.fn(),
    applyPreferences: vi.fn(),
    applyFocusFilter: vi.fn(),
    resetQueue,
    loadStats: vi.fn(),
    loadWord: vi.fn(),
    reportError,
  }));
  await act(async () => {
    expect(await result.current({ ...draft, materialMode: "all-dictionaries" })).toBe(false);
  });
  expect(reportError).toHaveBeenCalledWith("training_material_unavailable");
  expect(resetQueue).not.toHaveBeenCalled();
});

test("idiom start failures stay on setup and expose a recoverable error", async () => {
  startIdiomSession.mockReset();
  updateActiveTrainingScope.mockReset();
  updateActiveTrainingScope.mockResolvedValue({ error: null });
  startIdiomSession.mockRejectedValue(new Error("network_failure"));
  const reportError = vi.fn();
  const { result } = renderHook(() => useCommitTrainingPilotDraft({
    userId: "user-1",
    languageCode: "nl",
    resolveList: () => null,
    applyListLocally: vi.fn(),
    applyPreferences: vi.fn(),
    applyFocusFilter: vi.fn(),
    resetQueue: vi.fn(),
    loadStats: vi.fn(),
    loadWord: vi.fn(),
    startIdiomSession,
    reportError,
  }));

  await act(async () => {
    expect(await result.current({
      ...draft,
      family: "idiom",
      scenarioId: "idiom",
      materialMode: "all-dictionaries",
    })).toBe(false);
  });

  expect(reportError).toHaveBeenCalledWith("training_idiom_start_failed");
  expect(startIdiomSession).toHaveBeenCalledOnce();
});
