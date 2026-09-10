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
import type { TrainingTurnSelectionRequest } from "@/components/training/useTrainingTurnSelectionPort";
import type { TrainingMode, TrainingWord } from "@/lib/types";
import type { TrainingSessionUnavailableReason } from "@/lib/training/selectionService";

const prepared = vi.hoisted(() => ({
  candidate: null as any,
  consume: vi.fn(),
  reset: vi.fn(),
  warm: vi.fn(),
  refresh: vi.fn(),
  selectNext: null as null | ((queueTurn: "new" | "review", cardKey: string) => Promise<TrainingWord | null>),
}));
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
  setCurrentWord?: (word: TrainingWord | null) => void;
  lookupOverride?: (wordId: string) => Promise<TrainingWord | null>;
  markUnavailable?: (input: {
    entryId: string;
    cardTypeId: TrainingMode;
    reason: TrainingSessionUnavailableReason;
  }) => Promise<boolean>;
  recoverLoadErrors?: boolean;
  sessionPlannedTotal?: number | null;
  sessionConsumedCardKeys?: string[];
  trainingSessionId?: string | null;
} = {}) {
  const selectNext = (overrides.selectNext ??
    vi.fn().mockResolvedValue(word2)) as MockedFunction<
    (request: TrainingTurnSelectionRequest) => Promise<TrainingWord | null>
  >;
  const setCurrentWord = (overrides.setCurrentWord ?? vi.fn()) as MockedFunction<
    (word: TrainingWord | null) => void
  >;
  const refreshAfterAccepted = vi.fn().mockResolvedValue(undefined);
  const lookupOverride = vi.fn(overrides.lookupOverride ?? (() => Promise.resolve(null)));
  const markUnavailable = vi.fn(
    overrides.markUnavailable ?? (() => Promise.resolve(true)),
  );
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
      recoverLoadErrors: overrides.recoverLoadErrors ?? true,
      focusFilter: { dateWindow: "all" },
      sessionScopeKey,
      sessionPlannedTotal: overrides.sessionPlannedTotal,
      sessionConsumedCardKeys: overrides.sessionConsumedCardKeys,
      trainingSessionId: overrides.trainingSessionId,
      selection: { selectNext, lookupOverride, markUnavailable },
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
    setCurrentWord,
    refreshAfterAccepted,
    markUnavailable,
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

  test("keeps consumed session members out of speculative selection after resume", async () => {
    const controller = renderController({
      sessionConsumedCardKeys: ["word-1:word-to-definition"],
    });

    await act(async () => {
      await prepared.selectNext?.("new", "word-2:word-to-definition");
    });

    expect(controller.selectNext).toHaveBeenCalledWith(
      expect.objectContaining({
        excludeCardKeys: expect.arrayContaining(["word-1:word-to-definition"]),
      }),
    );
  });

  test("ends a finite session after the planned number of accepted cards", async () => {
    const controller = renderController({ sessionPlannedTotal: 1 });

    await act(async () => {
      await controller.result.current.acceptPlatformProgressAction({} as any);
    });

    expect(controller.setCurrentWord).toHaveBeenCalledWith(null);
    expect(controller.selectNext).not.toHaveBeenCalled();
    expect(controller.result.current.usableCandidatesExhausted).toBe(true);
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

    let accepted!: Promise<
      | "accepted-next-presented"
      | "accepted-session-complete"
      | "accepted-next-unavailable"
    >;
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

    let outcome: unknown;
    await act(async () => {
      outcome = await controller.result.current.acceptPlatformProgressAction(
        {} as any,
      );
    });

    expect(outcome).toBe("accepted-next-presented");
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
  });

  test("reports an accepted mutation with next-card unavailable when recovery retains the same presentation", async () => {
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

    expect(outcome).toBe("accepted-next-unavailable");
    expect(controller.result.current.loadError).toBe("next_card_offline");
    expect(controller.result.current.acceptedTransitionLoadStalled).toBe(true);
    expect(controller.setCurrentWord).not.toHaveBeenCalled();

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

  test("retries the same card after a transient lookup failure", async () => {
    const selectNext = vi.fn().mockResolvedValue(word2);
    const controller = renderController({
      currentWord: word2,
      selectNext,
    });

    act(() => {
      controller.result.current.reportCardLoadFailure(
        word2,
        "lookup-http-error",
      );
    });
    await act(async () => {
      await controller.result.current.retryCardLoadFailure();
    });

    expect(selectNext).toHaveBeenCalledWith(
      expect.objectContaining({ excludeCardKeys: [] }),
    );
    expect(controller.setCurrentWord).toHaveBeenCalledWith(word2);
  });

  test("does not mark a session member unavailable for a transient lookup failure", async () => {
    const selectNext = vi.fn().mockResolvedValue(word2);
    const markUnavailable = vi.fn().mockResolvedValue(true);
    const controller = renderController({
      currentWord: word2,
      selectNext,
      markUnavailable,
      trainingSessionId: "session-1",
    });

    act(() => {
      controller.result.current.reportCardLoadFailure(
        word2,
        "lookup-http-error",
      );
    });
    await act(async () => {
      await controller.result.current.retryCardLoadFailure();
    });

    expect(markUnavailable).not.toHaveBeenCalled();
    expect(selectNext).toHaveBeenCalledWith(
      expect.objectContaining({ excludeCardKeys: [] }),
    );
    expect(controller.setCurrentWord).toHaveBeenCalledWith(word2);
  });

  test("marks a permanent session-card failure before selecting its replacement", async () => {
    const markUnavailable = vi.fn().mockResolvedValue(true);
    const replacement = { ...word2, id: "word-3" };
    const selectNext = vi.fn().mockResolvedValue(replacement);
    const controller = renderController({
      currentWord: word2,
      selectNext,
      markUnavailable,
      trainingSessionId: "session-1",
    });

    act(() => {
      controller.result.current.reportCardLoadFailure(
        word2,
        "reverse-definition-missing",
      );
    });
    await act(async () => {
      await controller.result.current.retryCardLoadFailure();
    });

    expect(markUnavailable).toHaveBeenCalledWith({
      entryId: "word-2",
      cardTypeId: "word-to-definition",
      reason: "reverse-definition-missing",
    });
    expect(selectNext).toHaveBeenCalledWith(
      expect.objectContaining({
        excludeCardKeys: ["word-2:word-to-definition"],
      }),
    );
    expect(controller.setCurrentWord).toHaveBeenCalledWith(replacement);
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
    ["session-complete", null, "session-complete"],
    ["database error", new Error("scheduler unavailable"), "selection-error"],
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

  test("a statement timeout retries selection without turning into empty", async () => {
    const timeout = Object.assign(
      new Error("canceling statement due to statement timeout"),
      { code: "57014" },
    );
    const selectNext = vi
      .fn()
      .mockRejectedValueOnce(timeout)
      .mockResolvedValueOnce(word2);
    const controller = renderController({ currentWord: null, selectNext });

    let firstOutcome: unknown;
    await act(async () => {
      firstOutcome = await controller.result.current.loadNextWord();
    });
    expect(firstOutcome).toBe("statement-timeout");
    expect(transitionTiming.finish).toHaveBeenCalledWith(
      "generated-transition",
      "statement-timeout",
    );
    expect(controller.result.current.usableCandidatesExhausted).toBe(false);
    expect(controller.setCurrentWord).not.toHaveBeenCalledWith(null);

    let retryOutcome: unknown;
    await act(async () => {
      retryOutcome = await controller.result.current.loadNextWord();
    });
    expect(retryOutcome).toBe("loaded");
    expect(controller.setCurrentWord).toHaveBeenCalledWith(word2);
  });

  test("a network failure remains distinct from a scheduler or terminal outcome", async () => {
    const selectNext = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
    const controller = renderController({ currentWord: null, selectNext });

    let outcome: unknown;
    await act(async () => {
      outcome = await controller.result.current.loadNextWord();
    });

    expect(outcome).toBe("network-error");
    expect(controller.result.current.usableCandidatesExhausted).toBe(false);
    expect(controller.setCurrentWord).not.toHaveBeenCalledWith(null);
    expect(transitionTiming.finish).toHaveBeenCalledWith(
      "generated-transition",
      "network-error",
    );
  });

  test("an aborted scheduler request has a distinct recoverable cancellation outcome", async () => {
    const selectNext = vi.fn().mockRejectedValue(
      new DOMException("The operation was aborted", "AbortError"),
    );
    const controller = renderController({ currentWord: null, selectNext });

    let outcome: unknown;
    await act(async () => {
      outcome = await controller.result.current.loadNextWord();
    });

    expect(outcome).toBe("request-cancelled");
    expect(controller.result.current.usableCandidatesExhausted).toBe(false);
    expect(controller.setCurrentWord).not.toHaveBeenCalledWith(null);
    expect(transitionTiming.finish).toHaveBeenCalledWith(
      "generated-transition",
      "request-cancelled",
    );
  });

  test("an initial successful empty result is an authoritative no-match", async () => {
    const controller = renderController({
      currentWord: null,
      selectNext: vi.fn().mockResolvedValue(null),
    });

    let outcome: unknown;
    await act(async () => {
      outcome = await controller.result.current.loadNextWord();
    });

    expect(outcome).toBe("no-match");
    expect(controller.result.current.usableCandidatesExhausted).toBe(false);
    expect(transitionTiming.finish).toHaveBeenCalledWith(
      "generated-transition",
      "no-match",
    );
  });

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
    let outcome: unknown;
    await act(async () => {
      outcome = await controller.result.current.retryCardLoadFailure();
    });

    expect(outcome).toBe("session-complete");
    expect(controller.result.current.usableCandidatesExhausted).toBe(true);
    expect(controller.setCurrentWord).toHaveBeenCalledWith(null);
  });

  test("an accepted card followed by a successful empty selection completes the session", async () => {
    prepared.consume.mockReturnValue(null);
    const controller = renderController({
      currentWord: word2,
      selectNext: vi.fn().mockResolvedValue(null),
    });

    let outcome: unknown;
    await act(async () => {
      outcome = await controller.result.current.acceptPlatformProgressAction({} as any);
    });

    expect(outcome).toBe("accepted-session-complete");
    expect(controller.result.current.usableCandidatesExhausted).toBe(true);
    expect(controller.result.current.acceptedTransitionLoadStalled).toBe(false);
    expect(transitionTiming.finish).toHaveBeenCalledWith(
      "transition-1",
      "session-complete",
    );
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
      "session-complete",
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
        excludeCardKeys: [],
      }),
    );
    expect(controller.setCurrentWord).toHaveBeenCalledWith(recoveredWord);
  });

  test("an accepted transition reports next-card unavailable when the next selection fails", async () => {
    prepared.consume.mockReturnValue(null);
    const controller = renderController({
      recoverLoadErrors: false,
      selectNext: vi.fn().mockRejectedValue(new Error("scheduler unavailable")),
    });

    let outcome: unknown;
    await act(async () => {
      outcome = await controller.result.current.acceptPlatformProgressAction({} as any);
    });

    expect(outcome).toBe("accepted-next-unavailable");
    expect(controller.result.current.loadError).toBe("scheduler unavailable");
    expect(controller.result.current.acceptedTransitionLoadStalled).toBe(true);
  });

  test("reset invalidates a slow on-demand completion and releases selection ownership", async () => {
    prepared.consume.mockReturnValue(null);
    const slowSelection = deferred<TrainingWord | null>();
    const selectNext = vi.fn(() => slowSelection.promise);
    const controller = renderController({ selectNext });

    let submission!: Promise<
      | "accepted-next-presented"
      | "accepted-session-complete"
      | "accepted-next-unavailable"
    >;
    act(() => {
      submission = controller.result.current.acceptPlatformProgressAction({} as any);
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

    let accepted!: Promise<
      | "accepted-next-presented"
      | "accepted-session-complete"
      | "accepted-next-unavailable"
    >;
    act(() => {
      accepted = controller.result.current.acceptPlatformProgressAction({} as any);
    });
    await waitFor(() => expect(selectNext).toHaveBeenCalledTimes(1));

    act(() => controller.result.current.beginSessionScopeChange());
    await act(async () => slowSelection.resolve(word2));

    await expect(accepted).resolves.toBe("accepted-next-unavailable");
    expect(controller.setCurrentWord).not.toHaveBeenCalledWith(word2);
    expect(controller.result.current.acceptedTransitionLoadStalled).toBe(false);
    await expect(
      controller.result.current.retryAcceptedTransitionLoad(),
    ).resolves.toBe("skipped");
  });

  test("scope reset ignores a detached prefetched candidate that settles late", async () => {
    const readiness = deferred<boolean>();
    prepared.consume.mockReturnValue({
      forWordId: word1.id,
      forCardKey: "word-1:word-to-definition",
      queueTurn: "review",
      word: word2,
      v2Ready: readiness.promise,
      transitionId: "prefetch-transition",
    });
    const controller = renderController({ currentWord: word1 });

    try {
      let accepted!: Promise<
        | "accepted-next-presented"
        | "accepted-session-complete"
        | "accepted-next-unavailable"
      >;
      act(() => {
        accepted = controller.result.current.acceptPlatformProgressAction({} as any);
      });

      act(() => controller.result.current.beginSessionScopeChange());
      await act(async () => readiness.resolve(true));

      await expect(accepted).resolves.toBe("accepted-next-unavailable");
      expect(controller.setCurrentWord).not.toHaveBeenCalledWith(word2);
    } finally {
      readiness.resolve(true);
    }
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
    expect(transitionTiming.finish).toHaveBeenCalledWith(
      expect.any(String),
      "cancelled",
    );

    expect(controller.setCurrentWord).toHaveBeenCalledWith(word2);
    expect(controller.setCurrentWord).not.toHaveBeenCalledWith(oldWord);
  });

  test("scope replacement explicitly clears the previous session id", async () => {
    const selectNext = vi.fn().mockResolvedValue(word2);
    const controller = renderController({ selectNext });

    await act(async () => {
      await controller.result.current.replaceSessionScopeAndLoad({
        scenario: "new-scope",
      });
    });

    expect(selectNext).toHaveBeenCalledWith(
      expect.objectContaining({
        scenario: "new-scope",
        trainingSessionId: null,
      }),
    );
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
      await controller.result.current.acceptPlatformProgressAction({} as any);
    });

    expect(controller.result.current.nextCardOverrideNotice).toBeNull();
  });
});
