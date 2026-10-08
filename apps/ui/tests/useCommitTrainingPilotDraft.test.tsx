import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { useCommitTrainingPilotDraft, useTrainingPilotController } from "@/components/training/pilot/useTrainingPilotController";
import type { TrainingSetupDraft } from "@/components/training/pilot/TrainingTodaySetup";
import { beginTrainingUserTransition, claimTrainingEntryPresentation, recordTrainingEntryRendered } from "@/lib/training/trainingTransitionTiming";

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

afterEach(() => { vi.restoreAllMocks(); });

function transitionEvents(dispatch: { mock: { calls: [Event][] } }) {
  return dispatch.mock.calls.flatMap(([event]) =>
    event instanceof CustomEvent && event.type === "2000nl:training-transition-timing"
      ? [event.detail as { transitionId: string; stage: string; outcome: string }]
      : [],
  );
}

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

test("ordinary Start keeps one diagnostic identity across scope, session, selection and card readiness", async () => {
  updateActiveTrainingScope.mockReset().mockResolvedValue({ error: null });
  startTrainingSession.mockReset().mockResolvedValue({
    sessionId: "server-session", runStatus: "active", plannedTotal: 1,
  });
  const dispatch = vi.spyOn(window, "dispatchEvent");
  const loadWord = vi.fn().mockResolvedValue("loaded");
  const { result } = renderHook(() => useCommitTrainingPilotDraft({
    userId: "user-1", languageCode: "nl", resolveList: () => null,
    applyListLocally: vi.fn(), applyPreferences: vi.fn(), applyFocusFilter: vi.fn(),
    resetQueue: vi.fn(), loadStats: vi.fn(), loadWord, reportError: vi.fn(),
  }));
  beginTrainingUserTransition("start-diagnostic", "start");

  await act(async () => {
    expect(await result.current({ ...draft, materialMode: "all-dictionaries" }, undefined, undefined, "start-diagnostic")).toBe(true);
  });

  expect(transitionEvents(dispatch).map(({ stage }) => stage)).toEqual([
    "transition.start", "training.scope-commit", "training.session-start",
  ]);
  expect(loadWord).toHaveBeenCalledWith(expect.objectContaining({
    trainingSessionId: "server-session", transitionId: "start-diagnostic",
  }));
  const requestId = startTrainingSession.mock.calls[0]?.[3];
  expect(requestId).toEqual(expect.any(String));
  expect(requestId).not.toBe("start-diagnostic");
  expect(startTrainingSession.mock.calls[0]?.[2]).not.toHaveProperty("transitionId");
  expect(updateActiveTrainingScope.mock.calls[0]?.[0]).not.toHaveProperty("transitionId");
  expect(transitionEvents(dispatch)).not.toContainEqual(expect.objectContaining({ stage: "transition.total" }));

  claimTrainingEntryPresentation("word-1", "start-diagnostic");
  recordTrainingEntryRendered("word-1");
  recordTrainingEntryRendered("word-1");
  expect(transitionEvents(dispatch)).toContainEqual(expect.objectContaining({
    transitionId: "start-diagnostic", stage: "transition.total", outcome: "start-ready",
  }));
  expect(transitionEvents(dispatch).filter(({ stage }) => stage === "transition.total")).toHaveLength(1);
});

test("an empty ordinary plan closes Start timing without a ready card", async () => {
  updateActiveTrainingScope.mockReset().mockResolvedValue({ error: null });
  startTrainingSession.mockReset().mockResolvedValue({ sessionId: "empty", runStatus: "active", plannedTotal: 0 });
  const dispatch = vi.spyOn(window, "dispatchEvent");
  const loadWord = vi.fn();
  const { result } = renderHook(() => useCommitTrainingPilotDraft({
    userId: "user-1", languageCode: "nl", resolveList: () => null,
    applyListLocally: vi.fn(), applyPreferences: vi.fn(), applyFocusFilter: vi.fn(),
    resetQueue: vi.fn(), loadStats: vi.fn(), loadWord, reportError: vi.fn(),
  }));
  beginTrainingUserTransition("start-empty", "start");
  await act(async () => {
    expect(await result.current({ ...draft, materialMode: "all-dictionaries" }, undefined, undefined, "start-empty")).toBe(false);
  });
  expect(loadWord).not.toHaveBeenCalled();
  expect(transitionEvents(dispatch)).toContainEqual(expect.objectContaining({
    transitionId: "start-empty", stage: "transition.total", outcome: "start-empty-plan",
  }));
  expect(transitionEvents(dispatch)).not.toContainEqual(expect.objectContaining({ stage: "card.render" }));
});

test("a rejected scope closes Start timing before any session RPC", async () => {
  updateActiveTrainingScope.mockReset().mockResolvedValue({ error: "unavailable" });
  startTrainingSession.mockReset();
  const dispatch = vi.spyOn(window, "dispatchEvent");
  const { result } = renderHook(() => useCommitTrainingPilotDraft({
    userId: "user-1", languageCode: "nl", resolveList: () => null,
    applyListLocally: vi.fn(), applyPreferences: vi.fn(), applyFocusFilter: vi.fn(),
    resetQueue: vi.fn(), loadStats: vi.fn(), loadWord: vi.fn(), reportError: vi.fn(),
  }));
  beginTrainingUserTransition("start-scope-rejected", "start");
  await act(async () => {
    expect(await result.current({ ...draft, materialMode: "all-dictionaries" }, undefined, undefined, "start-scope-rejected")).toBe(false);
  });
  expect(startTrainingSession).not.toHaveBeenCalled();
  expect(transitionEvents(dispatch)).toContainEqual(expect.objectContaining({
    transitionId: "start-scope-rejected", stage: "transition.total", outcome: "start-scope-error",
  }));
});

test("a failed session RPC closes Start timing without changing its request UUID", async () => {
  updateActiveTrainingScope.mockReset().mockResolvedValue({ error: null });
  startTrainingSession.mockReset().mockRejectedValue(new Error("training_material_unavailable"));
  const dispatch = vi.spyOn(window, "dispatchEvent");
  const reportError = vi.fn();
  const { result } = renderHook(() => useCommitTrainingPilotDraft({
    userId: "user-1", languageCode: "nl", resolveList: () => null,
    applyListLocally: vi.fn(), applyPreferences: vi.fn(), applyFocusFilter: vi.fn(),
    resetQueue: vi.fn(), loadStats: vi.fn(), loadWord: vi.fn(), reportError,
  }));
  beginTrainingUserTransition("start-session-failed", "start");
  await act(async () => {
    expect(await result.current({ ...draft, materialMode: "all-dictionaries" }, undefined, undefined, "start-session-failed")).toBe(false);
  });
  expect(reportError).toHaveBeenCalledWith("training_material_unavailable");
  expect(startTrainingSession.mock.calls[0]?.[3]).toEqual(expect.any(String));
  expect(startTrainingSession.mock.calls[0]?.[3]).not.toBe("start-session-failed");
  expect(transitionEvents(dispatch)).toContainEqual(expect.objectContaining({
    transitionId: "start-session-failed", stage: "training.session-start", outcome: "failed",
  }));
  expect(transitionEvents(dispatch)).toContainEqual(expect.objectContaining({
    transitionId: "start-session-failed", stage: "transition.total", outcome: "start-session-error",
  }));
});

test("accepted Start blocks a duplicate and unmount closes its diagnostic once", async () => {
  const dispatch = vi.spyOn(window, "dispatchEvent");
  let resolveCommit!: (committed: boolean) => void;
  const onCommitDraft = vi.fn().mockImplementation(() => new Promise<boolean>((resolve) => {
    resolveCommit = resolve;
  }));
  const loadTrainingScenarios = vi.fn().mockResolvedValue([{
    id: "understanding", enabled: true, nameEn: "Meaning", cardModes: ["word-to-definition"],
    graduationThreshold: 0, sortOrder: 0,
  }]);
  const { result, unmount } = renderHook(() => useTrainingPilotController({
    enabled: true, interfaceLanguage: "en", setupPrerequisites: "ready",
    activeScenario: "understanding", enabledModes: ["word-to-definition"],
    cardFilter: "both", activeListValue: "curated:nt2", newReviewRatio: 2,
    sessionSize: 10, focusFilter: { dateWindow: "all" },
    listOptions: [{ value: "curated:nt2", label: "NT2 2000" }],
    dictionaryOptions: [], sourceOptions: [], onCommitDraft, onRetry: vi.fn(),
    loadTrainingScenarios,
  }));
  await waitFor(() => expect(result.current.scenarioLoading).toBe(false));
  let start!: Promise<boolean>;
  act(() => { start = result.current.startSession({ ...draft, listValue: "curated:nt2" }); });
  expect(onCommitDraft).toHaveBeenCalledOnce();
  const transitionId = onCommitDraft.mock.calls[0]?.[3];
  expect(transitionId).toMatch(/^training-/);
  expect(transitionEvents(dispatch)).toContainEqual(expect.objectContaining({
    transitionId, stage: "transition.start", outcome: "start",
  }));
  expect(await result.current.startSession({ ...draft, listValue: "curated:nt2" })).toBe(false);
  expect(onCommitDraft).toHaveBeenCalledOnce();

  unmount();
  expect(transitionEvents(dispatch)).toContainEqual(expect.objectContaining({
    transitionId, stage: "transition.total", outcome: "start-cancelled",
  }));
  resolveCommit(true);
  expect(await start).toBe(true);
  expect(transitionEvents(dispatch).filter(({ stage }) => stage === "transition.total")).toHaveLength(1);
});

test("a later accepted Start closes an unfinished earlier diagnostic before claiming its card", async () => {
  const dispatch = vi.spyOn(window, "dispatchEvent");
  const onCommitDraft = vi.fn().mockResolvedValue(true);
  const loadTrainingScenarios = vi.fn().mockResolvedValue([{
    id: "understanding", enabled: true, nameEn: "Meaning", cardModes: ["word-to-definition"],
    graduationThreshold: 0, sortOrder: 0,
  }]);
  const { result, unmount } = renderHook(() => useTrainingPilotController({
    enabled: true, interfaceLanguage: "en", setupPrerequisites: "ready",
    activeScenario: "understanding", enabledModes: ["word-to-definition"],
    cardFilter: "both", activeListValue: "curated:nt2", newReviewRatio: 2,
    sessionSize: 10, focusFilter: { dateWindow: "all" },
    listOptions: [{ value: "curated:nt2", label: "NT2 2000" }],
    dictionaryOptions: [], sourceOptions: [], onCommitDraft, onRetry: vi.fn(),
    loadTrainingScenarios,
  }));
  await waitFor(() => expect(result.current.scenarioLoading).toBe(false));
  const selected = { ...draft, listValue: "curated:nt2" };
  await act(async () => { expect(await result.current.startSession(selected)).toBe(true); });
  const firstId = onCommitDraft.mock.calls[0]?.[3];
  expect(firstId).toMatch(/^training-/);
  await act(async () => { expect(await result.current.startSession(selected)).toBe(true); });
  const secondId = onCommitDraft.mock.calls[1]?.[3];
  expect(secondId).toMatch(/^training-/);
  expect(secondId).not.toBe(firstId);
  expect(transitionEvents(dispatch)).toContainEqual(expect.objectContaining({
    transitionId: firstId, stage: "transition.total", outcome: "start-cancelled",
  }));
  claimTrainingEntryPresentation("word-1", secondId);
  recordTrainingEntryRendered("word-1");
  unmount();
  expect(transitionEvents(dispatch).filter(({ stage }) => stage === "transition.total")).toEqual([
    expect.objectContaining({ transitionId: firstId, outcome: "start-cancelled" }),
    expect.objectContaining({ transitionId: secondId, outcome: "start-ready" }),
  ]);
});

test("leaving Training cancels Start timing before a hidden card can report ready", async () => {
  const dispatch = vi.spyOn(window, "dispatchEvent");
  const onCommitDraft = vi.fn().mockResolvedValue(true);
  const loadTrainingScenarios = vi.fn().mockResolvedValue([{
    id: "understanding", enabled: true, nameEn: "Meaning", cardModes: ["word-to-definition"],
    graduationThreshold: 0, sortOrder: 0,
  }]);
  const { result, rerender } = renderHook(
    ({ presentationActive }: { presentationActive: boolean }) => useTrainingPilotController({
      enabled: true, presentationActive, interfaceLanguage: "en", setupPrerequisites: "ready",
      activeScenario: "understanding", enabledModes: ["word-to-definition"],
      cardFilter: "both", activeListValue: "curated:nt2", newReviewRatio: 2,
      sessionSize: 10, focusFilter: { dateWindow: "all" },
      listOptions: [{ value: "curated:nt2", label: "NT2 2000" }],
      dictionaryOptions: [], sourceOptions: [], onCommitDraft, onRetry: vi.fn(),
      loadTrainingScenarios,
    }),
    { initialProps: { presentationActive: true } },
  );
  await waitFor(() => expect(result.current.scenarioLoading).toBe(false));
  await act(async () => {
    expect(await result.current.startSession({ ...draft, listValue: "curated:nt2" })).toBe(true);
  });
  const transitionId = onCommitDraft.mock.calls[0]?.[3];
  expect(transitionId).toMatch(/^training-/);

  rerender({ presentationActive: false });
  claimTrainingEntryPresentation("word-hidden", transitionId);
  recordTrainingEntryRendered("word-hidden");
  expect(transitionEvents(dispatch).filter(({ stage }) => stage === "transition.total")).toEqual([
    expect.objectContaining({ transitionId, outcome: "start-cancelled" }),
  ]);
});

test.each([
  ["loaded", true, null],
  ["selection-error", false, "training_load_failed"],
] as const)("defers Start statistics until the first card settles (%s)", async (outcome, expected, expectedError) => {
  updateActiveTrainingScope.mockReset().mockResolvedValue({ error: null });
  startTrainingSession.mockReset().mockResolvedValue({
    sessionId: "first-card-session", runStatus: "active", plannedTotal: 1,
  });
  let resolveWord!: (result: "loaded" | "selection-error") => void;
  const loadWord = vi.fn().mockImplementation(() => new Promise<"loaded" | "selection-error">((resolve) => {
    resolveWord = resolve;
  }));
  const loadStats = vi.fn().mockImplementation(() => new Promise<void>(() => undefined));
  const reportError = vi.fn();
  const { result } = renderHook(() => useCommitTrainingPilotDraft({
    userId: "user-1", languageCode: "nl", resolveList: () => null,
    applyListLocally: vi.fn(), applyPreferences: vi.fn(), applyFocusFilter: vi.fn(),
    resetQueue: vi.fn(), loadStats, loadWord, reportError,
  }));

  let start!: Promise<boolean>;
  await act(async () => { start = result.current({ ...draft, materialMode: "all-dictionaries" }); });
  await waitFor(() => expect(loadWord).toHaveBeenCalledOnce());
  expect(loadStats).not.toHaveBeenCalled();

  await act(async () => {
    resolveWord(outcome);
    expect(await start).toBe(expected);
  });
  expect(loadStats).toHaveBeenCalledOnce();
  expect(loadStats).toHaveBeenCalledWith({ listId: null, listType: null });
  if (expectedError) expect(reportError).toHaveBeenLastCalledWith(expectedError);
});

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
    }, "Focused vocabulary")).toBe(true);
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
      sessionName: "Focused vocabulary",
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

test.each(["direct", "reverse", "mixed"] as const)("idiom %s starts forward the exact family filters and plan", async (direction) => {
  startIdiomSession.mockReset();
  updateActiveTrainingScope.mockReset();
  updateActiveTrainingScope.mockResolvedValue({ error: null });
  startIdiomSession.mockResolvedValue({
    contractVersion: "platform-idiom-exercise-session-v2",
    sessionId: "idiom-session-1",
    exerciseFamily: "idiom",
    direction,
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
      modes: direction === "mixed" ? ["word-to-definition", "definition-to-word"] : [direction === "direct" ? "word-to-definition" : "definition-to-word"],
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
    direction,
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

test("paused sentence start rejects before changing scope or creating a session", async () => {
  startTranslationSession.mockReset();
  updateActiveTrainingScope.mockReset();
  const reportError=vi.fn();
  const {result}=renderHook(()=>useCommitTrainingPilotDraft({
    userId:"user-1", languageCode:"nl", resolveList:()=>null,
    applyListLocally:vi.fn(), applyPreferences:vi.fn(), applyFocusFilter:vi.fn(),
    resetQueue:vi.fn(),loadStats:vi.fn(),loadWord:vi.fn(),startTranslationSession,reportError,
  }));
  await act(async()=>expect(await result.current({...draft,family:"sentence",scenarioId:"sentences"})).toBe(false));
  expect(reportError).toHaveBeenCalledWith("training_sentences_unavailable");
  expect(startTranslationSession).not.toHaveBeenCalled();
  expect(updateActiveTrainingScope).not.toHaveBeenCalled();
});

test('zero-card plan reports empty availability without accepting a session or loading a card',async()=>{
 updateActiveTrainingScope.mockResolvedValue({error:null});
 startTrainingSession.mockResolvedValue({sessionId:'empty',runStatus:'active',plannedTotal:0});
 const onEmptyPlan=vi.fn(),onSessionReady=vi.fn(),onPlanReady=vi.fn(),loadWord=vi.fn();
 const {result}=renderHook(()=>useCommitTrainingPilotDraft({userId:'u',languageCode:'nl',resolveList:()=>null,applyListLocally:vi.fn(),applyPreferences:vi.fn(),applyFocusFilter:vi.fn(),resetQueue:vi.fn(),loadStats:vi.fn(),loadWord,reportError:vi.fn(),onEmptyPlan,onSessionReady,onPlanReady}));
 const selected={...draft,materialMode:'all-dictionaries' as const,cardFilter:'review' as const};
 await act(async()=>{expect(await result.current(selected,'Translation',{trainingId:'saved'})).toBe(false);});
 expect(onEmptyPlan).toHaveBeenCalledWith(selected,{trainingId:'saved'});expect(onSessionReady).not.toHaveBeenCalled();expect(onPlanReady).not.toHaveBeenCalled();expect(loadWord).not.toHaveBeenCalled();
});
test('early review passes explicit timing through the planner without changing saved settings',async()=>{
 updateActiveTrainingScope.mockResolvedValue({error:null});startTrainingSession.mockResolvedValue({sessionId:'early',runStatus:'active',plannedTotal:1});
 const {result}=renderHook(()=>useCommitTrainingPilotDraft({userId:'u',languageCode:'nl',resolveList:()=>null,applyListLocally:vi.fn(),applyPreferences:vi.fn(),applyFocusFilter:vi.fn(),resetQueue:vi.fn(),loadStats:vi.fn(),loadWord:vi.fn().mockResolvedValue('loaded'),reportError:vi.fn()}));
 const selected={...draft,materialMode:'all-dictionaries' as const,cardFilter:'review' as const};
 await act(async()=>{await result.current(selected,'Words',{reviewTiming:'early'});});
 expect(startTrainingSession).toHaveBeenLastCalledWith('u',selected.modes,expect.objectContaining({cardFilter:'review',trainingFilter:expect.objectContaining({reviewTiming:'early'})}),expect.any(String));
 expect(selected).not.toHaveProperty('reviewTiming');
});
