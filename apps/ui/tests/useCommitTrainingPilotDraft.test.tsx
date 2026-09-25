import { act, renderHook } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { useCommitTrainingPilotDraft } from "@/components/training/pilot/useTrainingPilotController";
import type { TrainingSetupDraft } from "@/components/training/pilot/TrainingTodaySetup";

const { startTrainingSession, startIdiomSession, startTranslationSession, updateActiveTrainingScope } = vi.hoisted(() => ({
  startTrainingSession: vi.fn(),
  startIdiomSession: vi.fn(),
  startTranslationSession: vi.fn(),
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

test("word in context starts only the ordinary reverse queue with a presentation marker", async () => {
  startTrainingSession.mockReset().mockResolvedValue({
    sessionId: "context-session", runStatus: "active",
    plannedNew: 0, plannedReview: 1, plannedTotal: 1,
  });
  updateActiveTrainingScope.mockReset().mockResolvedValue({ error: null });
  const applyFocusFilter = vi.fn();
  const loadWord = vi.fn().mockResolvedValue("loaded");
  const { result } = renderHook(() => useCommitTrainingPilotDraft({
    userId: "user-1", languageCode: "nl", resolveList: () => null,
    applyListLocally: vi.fn(), applyPreferences: vi.fn(), applyFocusFilter,
    resetQueue: vi.fn(), loadStats: vi.fn(), loadWord,
    reportError: vi.fn(),
  }));
  await act(async () => {
    expect(await result.current({ ...draft, family: "word-in-context",
      modes: ["definition-to-word"], materialMode: "all-dictionaries",
      partOfSpeech: ["ww"], cardFilter: "review" })).toBe(true);
  });
  expect(startTrainingSession).toHaveBeenCalledWith("user-1", ["definition-to-word"],
    expect.objectContaining({ trainingFilter: expect.objectContaining({
      presentationMode: "word-in-context", partOfSpeech: ["ww"],
    }) }), expect.any(String));
  expect(applyFocusFilter).toHaveBeenCalledWith(expect.not.objectContaining({
    presentationMode: "word-in-context",
  }));
  expect(loadWord).toHaveBeenCalledWith(expect.objectContaining({
    trainingSessionId: "context-session", scenario: "understanding",
  }));
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

test("idiom starts forward the exact family filters and plan", async () => {
  startIdiomSession.mockReset();
  updateActiveTrainingScope.mockReset();
  updateActiveTrainingScope.mockResolvedValue({ error: null });
  startIdiomSession.mockResolvedValue({
    contractVersion: "platform-idiom-exercise-session-v2",
    sessionId: "idiom-session-1",
    exerciseFamily: "idiom",
    direction: "reverse",
    sessionSize: "10",
    requestedTotal: 10,
    plannedNew: 8,
    plannedReview: 2,
    plannedPractice: 0,
    plannedTotal: 10,
    plannedAt: "2026-09-24T00:00:00Z",
    runStatus: "active",
    runGeneration: 1,
    completedActions: 0,
    completionReason: null,
    members: [],
  });
  const onSessionReady = vi.fn();
  const applyFocusFilter = vi.fn();
  const { result } = renderHook(() => useCommitTrainingPilotDraft({
    userId: "user-1",
    languageCode: "nl",
    resolveList: () => ({ id: "list-1", type: "curated", name: "List 1" }),
    applyListLocally: vi.fn(),
    applyPreferences: vi.fn(),
    applyFocusFilter,
    resetQueue: vi.fn(),
    loadStats: vi.fn(),
    loadWord: vi.fn(),
    startIdiomSession,
    reportError: vi.fn(),
    onSessionReady,
  }));

  await act(async () => {
    expect(await result.current({
      ...draft,
      family: "idiom",
      scenarioId: "idiom",
      modes: ["definition-to-word"],
      listValue: "curated:list-1",
      cardFilter: "review",
      newReviewRatio: 4,
      partOfSpeech: ["bn"],
      nounArticles: ["de"],
      sourceValue: "kind:youtube",
      sessionSize: 10,
    })).toBe(true);
  });

  expect(startIdiomSession).toHaveBeenCalledWith(expect.objectContaining({
    direction: "reverse",
    listId: "list-1",
    listType: "curated",
    cardFilter: "review",
    newReviewRatio: 4,
    trainingFilter: expect.objectContaining({
      sourceKind: "youtube",
      partOfSpeech: ["bn"],
      nounArticles: ["de"],
    }),
  }));
  expect(onSessionReady).toHaveBeenCalledWith(
    expect.objectContaining({ sessionId: "idiom-session-1" }),
    expect.objectContaining({ draft: expect.objectContaining({ family: "idiom" }) }),
  );
  expect(applyFocusFilter).toHaveBeenCalledWith(expect.objectContaining({ sourceKind: "youtube" }));
});

test("sentence start forwards exact scope, mix and lexical/activity filters to translation session", async () => {
  startTranslationSession.mockReset().mockResolvedValue({
    contractVersion: "platform-translation-exercise-session-v1",
    sessionId: "sentence-session-1", exerciseFamily: "translation", direction: "recall",
    sessionSize: "12", requestedTotal: 12, plannedNew: 10, plannedReview: 2,
    plannedPractice: 0, plannedTotal: 12, plannedAt: "2026-09-24T00:00:00Z",
    runStatus: "active", runGeneration: 1, completedActions: 0,
    completionReason: null, members: [],
  });
  updateActiveTrainingScope.mockReset().mockResolvedValue({ error: null });
  const onSessionReady = vi.fn();
  const { result } = renderHook(() => useCommitTrainingPilotDraft({
    userId: "user-1", languageCode: "nl", resolveList: () => null,
    applyListLocally: vi.fn(), applyPreferences: vi.fn(), applyFocusFilter: vi.fn(),
    resetQueue: vi.fn(), loadStats: vi.fn(), loadWord: vi.fn(),
    startTranslationSession, reportError: vi.fn(), onSessionReady,
  }));
  await act(async () => {
    expect(await result.current({ ...draft, family: "sentence", scenarioId: "sentences",
      materialMode: "selected-dictionaries", dictionaryIds: ["dict-1", "dict-2"],
      cardFilter: "review", newReviewRatio: 4, partOfSpeech: ["bn"],
      nounArticles: ["de"], sourceValue: "kind:youtube", sessionSize: 12,
    })).toBe(true);
  });
  expect(startTranslationSession).toHaveBeenCalledWith(expect.objectContaining({
    sessionSize: 12, listId: null, listType: "curated", cardFilter: "review", newReviewRatio: 4,
    trainingFilter: expect.objectContaining({ dictionaryScope: { mode: "selected", languageCode: "nl", dictionaryIds: ["dict-1", "dict-2"] }, partOfSpeech: ["bn"], nounArticles: ["de"], sourceKind: "youtube" }),
  }));
  expect(onSessionReady).toHaveBeenCalledWith(expect.objectContaining({ sessionId: "sentence-session-1" }), expect.objectContaining({ draft: expect.objectContaining({ family: "sentence" }) }));
});
