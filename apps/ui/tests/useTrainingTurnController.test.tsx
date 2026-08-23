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
  refresh: vi.fn(),
  selectNext: null as null | ((queueTurn: "new" | "review", cardKey: string) => Promise<TrainingWord | null>),
}));
const recordWordView = vi.hoisted(() => vi.fn());
const transitionTiming = vi.hoisted(() => ({
  begin: vi.fn(),
  measure: vi.fn(),
  record: vi.fn(),
  finish: vi.fn(),
  failEntry: vi.fn(),
}));

vi.mock("@/components/training/v2/usePreparedNextTrainingTurn", () => ({
  usePreparedNextTrainingTurn: (input: {
    selectNext: (
      queueTurn: "new" | "review",
      cardKey: string,
    ) => Promise<TrainingWord | null>;
  }) => {
    prepared.selectNext = input.selectNext;
    return {
      warmWord: prepared.warm,
      refreshForCard: prepared.refresh,
      consumeForCard: prepared.consume,
      reset: prepared.reset,
      nextTransitionId: "transition-1",
    };
  },
}));

vi.mock("@/lib/trainingService", () => ({
  recordWordView: (...args: unknown[]) => recordWordView(...args),
}));

vi.mock("@/lib/platform/platformV2TrainingClient", () => ({
  clearPlatformV2TrainingClientCaches: vi.fn(),
}));

vi.mock("@/lib/training/trainingTransitionTiming", () => ({
  beginTrainingUserTransition: (...args: unknown[]) =>
    transitionTiming.begin(...args),
  markTrainingEntryPresentationStarted: vi.fn(),
  createTrainingTransitionId: vi.fn(() => "generated-transition"),
  finishTrainingUserTransition: (...args: unknown[]) =>
    transitionTiming.finish(...args),
  recordTrainingEntryTerminalFailure: (...args: unknown[]) =>
    transitionTiming.failEntry(...args),
  recordTrainingTransitionTiming: (...args: unknown[]) =>
    transitionTiming.record(...args),
  measureTrainingTransitionStage: async (
    transitionId: string,
    stage: string,
    operation: () => Promise<unknown>,
  ) => {
    transitionTiming.measure(transitionId, stage);
    return operation();
  },
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
  lookupOverride?: (wordId: string) => Promise<TrainingWord | null>;
  recoverLoadErrors?: boolean;
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
  const lookupOverride = vi.fn(overrides.lookupOverride ?? (() => Promise.resolve(null)));
  const resetCardPresentation = vi.fn();
  const initialCurrentWord = overrides.currentWord ?? word1;
  const hook = renderHook(
    ({
      sessionScopeKey,
      currentWord,
    }: {
      sessionScopeKey: string;
      currentWord: TrainingWord | null;
    }) =>
      useTrainingTurnController({
      userId: "user-1",
      currentWord,
      setCurrentWord,
      enabledModes: ["word-to-definition"],
      contentLanguageCode: "nl",
      translationTargetLanguageCode: "en",
      cardFilter: "both",
      newReviewRatio: 2,
      trainingShellV2Enabled: false,
      recoverLoadErrors: overrides.recoverLoadErrors ?? true,
      focusFilter: { dateWindow: "all" },
      sessionScopeKey,
      selection: { selectNext, lookupOverride },
      audioEnabled: false,
      preloadAudio: vi.fn(),
      resetCardPresentation,
      reviewLegacy,
      refreshAfterAccepted,
      }),
    {
      initialProps: {
        sessionScopeKey: "default",
        currentWord: initialCurrentWord,
      },
    },
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
    prepared.refresh.mockReset();
    prepared.selectNext = null;
    recordWordView.mockReset();
    transitionTiming.begin.mockReset();
    transitionTiming.measure.mockReset();
    transitionTiming.record.mockReset();
    transitionTiming.finish.mockReset();
    transitionTiming.failEntry.mockReset();
  });

  test("refreshes only the exact prepared card before a Platform progress action", () => {
    const controller = renderController();

    act(() => controller.result.current.preparePlatformProgressAction());

    expect(prepared.refresh).toHaveBeenCalledOnce();
    expect(prepared.refresh).toHaveBeenCalledWith(
      "word-1:word-to-definition",
    );
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
    expect(transitionTiming.begin).toHaveBeenCalledWith(
      "transition-1",
      "review",
    );
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

    let accepted!: Promise<"accepted" | "stalled">;
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
    expect(transitionTiming.record).toHaveBeenCalledWith(
      expect.objectContaining({
        transitionId: "transition-1",
        stage: "next-card.prefetch",
        outcome: "accepted-miss",
      }),
    );
    expect(prepared.warm).toHaveBeenCalledWith(
      word2,
      undefined,
      "transition-1",
    );
  });

  test("initial selection and preparation share one caller-provided transition", async () => {
    const controller = renderController({ currentWord: null });

    await act(async () => {
      await controller.result.current.loadNextWord({
        transitionId: "initial-entry-189",
      });
    });

    expect(transitionTiming.measure).toHaveBeenCalledWith(
      "initial-entry-189",
      "next-card.selection",
    );
    expect(prepared.warm).toHaveBeenCalledWith(
      word2,
      undefined,
      "initial-entry-189",
    );
  });

  test("issues a new presentation identity when the same card is presented again", async () => {
    const repeatedWord = { ...word1 };
    const controller = renderController({
      currentWord: null,
      selectNext: vi.fn().mockResolvedValue(repeatedWord),
    });

    await act(async () => {
      await controller.result.current.loadNextWord();
    });
    const firstPresentationId = controller.result.current.currentPresentationId;

    await act(async () => {
      await controller.result.current.loadNextWord();
    });
    const secondPresentationId = controller.result.current.currentPresentationId;

    expect(firstPresentationId).toEqual(expect.any(String));
    expect(secondPresentationId).toEqual(expect.any(String));
    expect(secondPresentationId).not.toBe(firstPresentationId);
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

  test("reports an accepted mutation as stalled when recovery retains the same presentation", async () => {
    prepared.consume.mockReturnValue(null);
    const selectNext = vi
      .fn()
      .mockRejectedValueOnce(new Error("next_card_offline"))
      .mockResolvedValueOnce(word2);
    const controller = renderController({ selectNext });

    let outcome: unknown;
    await act(async () => {
      outcome = await controller.result.current.acceptPlatformProgressAction(
        {} as any,
      );
    });

    expect(outcome).toBe("stalled");
    expect(controller.result.current.loadError).toBe("next_card_offline");
    expect(controller.result.current.acceptedTransitionLoadStalled).toBe(true);
    expect(controller.setCurrentWord).not.toHaveBeenCalled();
    expect(controller.reviewLegacy).not.toHaveBeenCalled();

    await act(async () => {
      await controller.result.current.retryAcceptedTransitionLoad();
    });
    expect(selectNext).toHaveBeenCalledTimes(2);
    expect(selectNext.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({
        queueTurn: "review",
        excludeCardKeys: expect.arrayContaining([
          "word-1:word-to-definition",
        ]),
      }),
    );
    expect(controller.setCurrentWord).toHaveBeenCalledWith(word2);
    expect(controller.reviewLegacy).not.toHaveBeenCalled();
    expect(controller.result.current.acceptedTransitionLoadStalled).toBe(false);
  });

  test("a separate authoritative load clears accepted-transition recovery", async () => {
    prepared.consume.mockReturnValue(null);
    const selectNext = vi
      .fn()
      .mockRejectedValueOnce(new Error("next_card_offline"))
      .mockResolvedValueOnce(word2);
    const controller = renderController({ selectNext });

    await act(async () => {
      await controller.result.current.acceptPlatformProgressAction({} as any);
    });
    expect(controller.result.current.acceptedTransitionLoadStalled).toBe(true);

    await act(async () => {
      await controller.result.current.loadNextWord();
    });

    expect(controller.setCurrentWord).toHaveBeenCalledWith(word2);
    expect(controller.result.current.acceptedTransitionLoadStalled).toBe(false);
    await expect(
      controller.result.current.retryAcceptedTransitionLoad(),
    ).resolves.toBe("skipped");
  });

  test("retrying a rejected prepared card performs a fresh authoritative selection", async () => {
    const recoveredWord = { ...word2, id: "word-due", headword: "leren" };
    const selectNext = vi.fn().mockResolvedValue(recoveredWord);
    const controller = renderController({
      currentWord: word2,
      selectNext,
    });

    act(() => {
      controller.result.current.reportCardLoadFailure(
        word2,
        "model-invalid",
      );
    });
    await act(async () => {
      await controller.result.current.retryCardLoadFailure();
    });

    expect(selectNext).toHaveBeenCalledWith(
      expect.objectContaining({
        excludeCardKeys: ["word-2:word-to-definition"],
      }),
    );
    expect(controller.setCurrentWord).toHaveBeenCalledWith(recoveredWord);
    expect(transitionTiming.begin).toHaveBeenCalledWith(
      expect.any(String),
      "retry",
    );
    expect(prepared.reset).toHaveBeenCalled();

    controller.rerender({
      sessionScopeKey: "default",
      currentWord: recoveredWord,
    });
    await act(async () => {
      await controller.result.current.acceptPlatformProgressAction({} as any);
    });
    expect(selectNext).toHaveBeenLastCalledWith(
      expect.objectContaining({
        excludeCardKeys: expect.arrayContaining([
          "word-2:word-to-definition",
          "word-due:word-to-definition",
        ]),
      }),
    );
  });

  test("background prefetch keeps rejected card keys excluded for the session", async () => {
    const selectNext = vi.fn().mockResolvedValue(word1);
    const controller = renderController({ currentWord: word2, selectNext });

    act(() => {
      controller.result.current.reportCardLoadFailure(
        word2,
        "model-invalid",
      );
    });
    await act(async () => {
      await prepared.selectNext?.(
        "review",
        "word-due:word-to-definition",
      );
    });

    expect(selectNext).toHaveBeenCalledWith(
      expect.objectContaining({
        queueTurn: "review",
        excludeCardKeys: expect.arrayContaining([
          "word-2:word-to-definition",
          "word-due:word-to-definition",
        ]),
      }),
    );
  });

  test.each([
    ["empty", null, "empty"],
    ["error", new Error("scheduler unavailable"), "error-selection-failed"],
  ] as const)(
    "retry reaches a classified %s terminal outcome",
    async (_label, selectionResult, outcome) => {
      const selectNext = vi.fn(() =>
        selectionResult instanceof Error
          ? Promise.reject(selectionResult)
          : Promise.resolve(selectionResult),
      );
      const controller = renderController({ currentWord: word2, selectNext });

      act(() => {
        controller.result.current.reportCardLoadFailure(
          word2,
          "model-invalid",
        );
      });
      await act(async () => {
        await controller.result.current.retryCardLoadFailure();
      });

      expect(transitionTiming.finish).toHaveBeenCalledWith(
        "generated-transition",
        outcome,
      );
    },
  );

  test("retrying after all usable candidates are exhausted exposes honest completion", async () => {
    const controller = renderController({
      currentWord: word2,
      selectNext: vi.fn().mockResolvedValue(null),
    });

    act(() => {
      controller.result.current.reportCardLoadFailure(
        word2,
        "model-invalid",
      );
    });
    await act(async () => {
      await controller.result.current.retryCardLoadFailure();
    });

    expect(controller.result.current.usableCandidatesExhausted).toBe(true);
    expect(controller.setCurrentWord).toHaveBeenCalledWith(null);
  });

  test("retry checks due reviews before declaring a new-card queue exhausted", async () => {
    const dueReview = { ...word1, id: "word-due", headword: "leren" };
    const selectNext = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(dueReview);
    const controller = renderController({ currentWord: word2, selectNext });

    act(() => {
      controller.result.current.reportCardLoadFailure(
        word2,
        "model-invalid",
      );
    });
    await act(async () => {
      await controller.result.current.retryCardLoadFailure();
    });

    expect(selectNext).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        queueTurn: "new",
        excludeCardKeys: ["word-2:word-to-definition"],
      }),
    );
    expect(selectNext).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        queueTurn: "auto",
        excludeCardKeys: ["word-2:word-to-definition"],
      }),
    );
    expect(controller.result.current.usableCandidatesExhausted).toBe(false);
    expect(controller.setCurrentWord).not.toHaveBeenCalledWith(null);
    expect(controller.setCurrentWord).toHaveBeenCalledWith(dueReview);
    expect(transitionTiming.finish).not.toHaveBeenCalledWith(
      "generated-transition",
      "empty",
    );
  });

  test("rejected-card exclusions are scoped to the current session", async () => {
    const selectNext = vi.fn().mockResolvedValue(word1);
    const controller = renderController({ currentWord: word2, selectNext });

    act(() => {
      controller.result.current.reportCardLoadFailure(
        word1,
        "model-invalid",
      );
      controller.result.current.clearReviewedSession();
      controller.result.current.reportCardLoadFailure(
        word2,
        "model-invalid",
      );
    });
    await act(async () => {
      await controller.result.current.retryCardLoadFailure();
    });

    expect(selectNext).toHaveBeenCalledWith(
      expect.objectContaining({
        excludeCardKeys: ["word-2:word-to-definition"],
      }),
    );
  });

  test("a failed selected-card warmup is also recoverable through a fresh selection", async () => {
    const recoveredWord = { ...word1, id: "word-due", headword: "leren" };
    const selectNext = vi
      .fn()
      .mockResolvedValueOnce(word2)
      .mockResolvedValueOnce(recoveredWord);
    prepared.warm.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const controller = renderController({ currentWord: word1, selectNext });

    await act(async () => {
      await controller.result.current.loadNextWord({
        transitionId: "failed-warmup",
      });
    });
    await act(async () => {
      await controller.result.current.retryCardLoadFailure();
    });

    expect(selectNext).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        excludeCardKeys: ["word-2:word-to-definition"],
      }),
    );
    expect(controller.setCurrentWord).toHaveBeenCalledWith(recoveredWord);
  });

  test("a non-pilot selection failure terminates the accepted transition before rethrowing", async () => {
    prepared.consume.mockReturnValue(null);
    const controller = renderController({
      recoverLoadErrors: false,
      selectNext: vi.fn().mockRejectedValue(new Error("scheduler unavailable")),
    });

    await act(async () => {
      await expect(
        controller.result.current.submitLegacyReview("success"),
      ).rejects.toThrow("scheduler unavailable");
    });

    expect(transitionTiming.begin).toHaveBeenCalledWith(
      "transition-1",
      "review",
    );
    expect(transitionTiming.finish).toHaveBeenCalledWith(
      "transition-1",
      "error-selection-failed",
    );
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

  test("scope cancellation cannot resurrect accepted-transition recovery", async () => {
    prepared.consume.mockReturnValue(null);
    const slowSelection = deferred<TrainingWord | null>();
    const selectNext = vi.fn(() => slowSelection.promise);
    const controller = renderController({ selectNext });

    let accepted!: Promise<"accepted" | "stalled">;
    act(() => {
      accepted = controller.result.current.acceptPlatformProgressAction({} as any);
    });
    await waitFor(() => expect(selectNext).toHaveBeenCalledTimes(1));

    act(() => controller.result.current.beginSessionScopeChange());
    await act(async () => slowSelection.resolve(word2));

    await expect(accepted).resolves.toBe("accepted");
    expect(controller.setCurrentWord).not.toHaveBeenCalledWith(word2);
    expect(controller.result.current.acceptedTransitionLoadStalled).toBe(false);
    await expect(
      controller.result.current.retryAcceptedTransitionLoad(),
    ).resolves.toBe("skipped");
  });

  test("scope-key replacement cancels the old selection and presents exactly one new-scope result", async () => {
    const oldSelection = deferred<TrainingWord | null>();
    const newSelection = deferred<TrainingWord | null>();
    const oldWord = { ...word2, id: "word-old", headword: "oud" };
    const selectNext = vi
      .fn<[TrainingTurnSelectionRequest], Promise<TrainingWord | null>>()
      .mockImplementationOnce(() => oldSelection.promise)
      .mockImplementationOnce(() => newSelection.promise);
    const controller = renderController({ selectNext });

    let oldLoad!: Promise<string>;
    act(() => {
      oldLoad = controller.result.current.loadNextWord({
        scenario: "old-scope",
      });
    });
    await waitFor(() => expect(selectNext).toHaveBeenCalledTimes(1));

    act(() => {
      controller.result.current.beginSessionScopeChange();
      controller.rerender({
        sessionScopeKey: "new-scope",
        currentWord: word1,
      });
    });
    act(() => {
      void controller.result.current.loadNextWord();
    });
    await waitFor(() => expect(selectNext).toHaveBeenCalledTimes(2));

    await act(async () => newSelection.resolve(word2));
    await act(async () => oldSelection.resolve(oldWord));
    await expect(oldLoad).resolves.toBe("skipped");

    expect(controller.setCurrentWord).toHaveBeenCalledWith(word2);
    expect(controller.setCurrentWord).not.toHaveBeenCalledWith(oldWord);
  });

  test("override identity uses the presented mode and clears its notice after review", async () => {
    prepared.consume.mockReturnValue(null);
    const overrideWord = {
      ...word2,
      mode: "listen-recognize" as const,
    };
    const controller = renderController({
      lookupOverride: vi.fn().mockResolvedValue(overrideWord),
    });

    act(() => controller.result.current.requestNextCardOverride(overrideWord.id));
    await act(async () => {
      await controller.result.current.loadNextWord();
    });
    expect(controller.setCurrentWord).toHaveBeenCalledWith(
      expect.objectContaining({
        id: overrideWord.id,
        mode: "word-to-definition",
      }),
    );

    controller.rerender({
      sessionScopeKey: "default",
      currentWord: { ...overrideWord, mode: "word-to-definition" },
    });
    await act(async () => {
      await controller.result.current.submitLegacyReview("success");
    });

    expect(controller.result.current.nextCardOverrideNotice).toBeNull();
  });
});
