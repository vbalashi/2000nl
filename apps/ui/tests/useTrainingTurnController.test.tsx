import { act, renderHook, waitFor } from "@testing-library/react";
import {
  beforeEach,
  describe,
  expect,
  test,
  vi,
  type MockedFunction,
} from "vitest";
import { useTrainingTurnController } from "@/components/training/useTrainingTurnController";
import type { LegacyTrainingReviewRequest } from "@/components/training/useLegacyTrainingReviewPort";
import type { TrainingTurnSelectionRequest } from "@/components/training/useTrainingTurnSelectionPort";
import type { TrainingWord } from "@/lib/types";

const prepared = vi.hoisted(() => ({
  candidate: null as any,
  consume: vi.fn(),
  reset: vi.fn(),
  warm: vi.fn(),
}));
const recordWordView = vi.hoisted(() => vi.fn());

vi.mock("@/components/training/v2/usePreparedNextTrainingTurn", () => ({
  usePreparedNextTrainingTurn: () => ({
    warmWord: prepared.warm,
    consumeForCard: prepared.consume,
    reset: prepared.reset,
    nextTransitionId: "transition-1",
  }),
}));

vi.mock("@/lib/trainingService", () => ({
  recordWordView: (...args: unknown[]) => recordWordView(...args),
}));

vi.mock("@/lib/platform/platformV2TrainingClient", () => ({
  clearPlatformV2TrainingClientCaches: vi.fn(),
}));

vi.mock("@/lib/training/trainingTransitionTiming", () => ({
  markTrainingEntryPresentationStarted: vi.fn(),
  measureTrainingTransitionStage: async (
    _transitionId: string,
    _stage: string,
    operation: () => Promise<unknown>,
  ) => operation(),
}));

const word1: TrainingWord = {
  id: "word-1",
  headword: "huis",
  raw: {},
  mode: "word-to-definition",
  isFirstEncounter: false,
};
const word2: TrainingWord = {
  ...word1,
  id: "word-2",
  headword: "boom",
};

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (cause: unknown) => void;
};

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

function renderController(overrides: {
  currentWord?: TrainingWord | null;
  selectNext?: (request: TrainingTurnSelectionRequest) => Promise<TrainingWord | null>;
  reviewLegacy?: (request: LegacyTrainingReviewRequest) => Promise<unknown>;
  setCurrentWord?: (word: TrainingWord | null) => void;
} = {}) {
  const selectNext = (overrides.selectNext ??
    vi.fn().mockResolvedValue(word2)) as MockedFunction<
    (request: TrainingTurnSelectionRequest) => Promise<TrainingWord | null>
  >;
  const reviewLegacy = (overrides.reviewLegacy ??
    vi.fn().mockResolvedValue(null)) as MockedFunction<
    (request: LegacyTrainingReviewRequest) => Promise<unknown>
  >;
  const setCurrentWord = (overrides.setCurrentWord ?? vi.fn()) as MockedFunction<
    (word: TrainingWord | null) => void
  >;
  const refreshAfterAccepted = vi.fn().mockResolvedValue(undefined);
  const lookupOverride = vi.fn().mockResolvedValue(null);
  const resetCardPresentation = vi.fn();
  const hook = renderHook(() =>
    useTrainingTurnController({
      userId: "user-1",
      currentWord: overrides.currentWord ?? word1,
      setCurrentWord,
      enabledModes: ["word-to-definition"],
      contentLanguageCode: "nl",
      translationTargetLanguageCode: "en",
      cardFilter: "both",
      newReviewRatio: 2,
      trainingShellV2Enabled: false,
      recoverLoadErrors: true,
      focusFilter: { dateWindow: "all" },
      sessionScopeKey: "default",
      selection: { selectNext, lookupOverride },
      audioEnabled: false,
      preloadAudio: vi.fn(),
      resetCardPresentation,
      reviewLegacy,
      refreshAfterAccepted,
    }),
  );
  return {
    ...hook,
    selectNext,
    reviewLegacy,
    setCurrentWord,
    refreshAfterAccepted,
    resetCardPresentation,
  };
}

describe("useTrainingTurnController transition matrix", () => {
  beforeEach(() => {
    prepared.candidate = null;
    prepared.consume.mockReset();
    prepared.consume.mockImplementation(() => prepared.candidate);
    prepared.reset.mockReset();
    prepared.warm.mockReset();
    prepared.warm.mockResolvedValue(true);
    recordWordView.mockReset();
  });

  test("fast prepared legacy candidate presents immediately while one mutation remains in flight", async () => {
    const mutation = deferred<null>();
    const reviewLegacy = vi.fn(() => mutation.promise);
    prepared.candidate = {
      forWordId: word1.id,
      forCardKey: "word-1:word-to-definition",
      queueTurn: "review",
      word: word2,
      v2Ready: null,
      transitionId: "transition-1",
    };
    const controller = renderController({ reviewLegacy });

    let submission!: Promise<void>;
    act(() => {
      submission = controller.result.current.submitLegacyReview("success");
    });

    expect(controller.setCurrentWord).toHaveBeenCalledWith(word2);
    expect(reviewLegacy).toHaveBeenCalledTimes(1);
    expect(controller.selectNext).not.toHaveBeenCalled();

    await act(async () => mutation.resolve(null));
    await submission;
    expect(controller.refreshAfterAccepted).toHaveBeenCalledTimes(1);
  });

  test("prepared V2 candidate stays owned until its DTO is ready", async () => {
    const readiness = deferred<boolean>();
    prepared.candidate = {
      forWordId: word1.id,
      forCardKey: "word-1:word-to-definition",
      queueTurn: "review",
      word: word2,
      v2Ready: readiness.promise,
      transitionId: "transition-1",
    };
    const controller = renderController();

    let accepted!: Promise<void>;
    act(() => {
      accepted = controller.result.current.acceptPlatformProgressAction({} as any);
    });
    expect(controller.setCurrentWord).not.toHaveBeenCalledWith(word2);
    expect(controller.selectNext).not.toHaveBeenCalled();

    await act(async () => readiness.resolve(true));
    await accepted;
    expect(controller.setCurrentWord).toHaveBeenCalledWith(word2);
    expect(controller.selectNext).not.toHaveBeenCalled();
  });

  test("missing or still-selecting preparation yields one on-demand owner after acceptance", async () => {
    prepared.consume.mockReturnValue(null);
    const controller = renderController();

    await act(async () => {
      await controller.result.current.submitLegacyReview("success");
    });

    expect(controller.selectNext).toHaveBeenCalledTimes(1);
    expect(controller.selectNext).toHaveBeenCalledWith(
      expect.objectContaining({
        queueTurn: "review",
        excludeCardKeys: expect.arrayContaining([
          "word-1:word-to-definition",
        ]),
      }),
    );
    expect(controller.setCurrentWord).toHaveBeenCalledWith(word2);
  });

  test("Platform ambiguity does not advance until reconciliation invokes the accepted port", async () => {
    prepared.consume.mockReturnValue(null);
    const controller = renderController();

    expect(controller.selectNext).not.toHaveBeenCalled();
    expect(controller.setCurrentWord).not.toHaveBeenCalled();

    await act(async () => {
      await controller.result.current.acceptPlatformProgressAction({} as any);
    });

    expect(controller.selectNext).toHaveBeenCalledTimes(1);
    expect(controller.setCurrentWord).toHaveBeenCalledWith(word2);
    expect(controller.reviewLegacy).not.toHaveBeenCalled();
  });

  test("reset invalidates a slow on-demand completion and releases selection ownership", async () => {
    prepared.consume.mockReturnValue(null);
    const slowSelection = deferred<TrainingWord | null>();
    const selectNext = vi.fn(() => slowSelection.promise);
    const controller = renderController({ selectNext });

    let submission!: Promise<void>;
    act(() => {
      submission = controller.result.current.submitLegacyReview("success");
    });
    await waitFor(() => expect(selectNext).toHaveBeenCalledTimes(1));

    act(() => controller.result.current.resetFocusQueue());
    expect(prepared.reset).toHaveBeenCalled();
    await act(async () => slowSelection.resolve(word2));
    await submission;

    expect(controller.setCurrentWord).not.toHaveBeenCalledWith(word2);
    expect(controller.result.current.loadingWord).toBe(false);
  });

  test("scope replacement cancels the old selection and presents exactly one new-scope result", async () => {
    const oldSelection = deferred<TrainingWord | null>();
    const newSelection = deferred<TrainingWord | null>();
    const oldWord = { ...word2, id: "word-old", headword: "oud" };
    const selectNext = vi.fn((request: TrainingTurnSelectionRequest) =>
      request.scenario === "new-scope"
        ? newSelection.promise
        : oldSelection.promise,
    );
    const controller = renderController({ selectNext });

    let oldLoad!: Promise<string>;
    let newLoad!: Promise<string>;
    act(() => {
      oldLoad = controller.result.current.loadNextWord({
        scenario: "old-scope",
      });
    });
    await waitFor(() => expect(selectNext).toHaveBeenCalledTimes(1));

    act(() => {
      newLoad = controller.result.current.replaceSessionScopeAndLoad({
        scenario: "new-scope",
      });
    });
    await waitFor(() => expect(selectNext).toHaveBeenCalledTimes(2));

    await act(async () => newSelection.resolve(word2));
    await expect(newLoad).resolves.toBe("loaded");
    await act(async () => oldSelection.resolve(oldWord));
    await expect(oldLoad).resolves.toBe("skipped");

    expect(selectNext).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ scenario: "new-scope" }),
    );
    expect(controller.setCurrentWord).toHaveBeenCalledWith(word2);
    expect(controller.setCurrentWord).not.toHaveBeenCalledWith(oldWord);
  });
});
