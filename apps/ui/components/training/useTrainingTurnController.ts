"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { recordWordView, type ReviewResult } from "@/lib/trainingService";
import { trainingDebug } from "@/lib/trainingDebug";
import { clearPlatformV2TrainingClientCaches } from "@/lib/platform/platformV2TrainingClient";
import type { PlatformV2TrainingActionCapability } from "@/lib/platform/platformV2TrainingActionClient";
import {
  beginTrainingUserTransition,
  createTrainingTransitionId,
  finishTrainingUserTransition,
  markTrainingEntryPresentationStarted,
  measureTrainingTransitionStage,
  recordTrainingEntryTerminalFailure,
  recordTrainingTransitionTiming,
} from "@/lib/training/trainingTransitionTiming";
import {
  generateReviewTurnId,
  getTrainingCardKey,
  getNextQueueTransition,
} from "@/lib/training/trainingQueue";
import type {
  CardFilter,
  QueueTurn,
  TrainingFocusFilter,
  TrainingMode,
  TrainingWord,
  WordListType,
} from "@/lib/types";
import {
  usePreparedNextTrainingTurn,
  type PreparedNextTrainingTurn,
} from "./v2/usePreparedNextTrainingTurn";
import type { LegacyTrainingReviewRequest } from "./useLegacyTrainingReviewPort";
import type {
  TrainingTurnSelectionPort,
  TrainingTurnSelectionRequest,
} from "./useTrainingTurnSelectionPort";

export type LoadNextTrainingTurnRequest = Omit<
  TrainingTurnSelectionRequest,
  "queueTurn"
> & {
  queueTurn?: QueueTurn;
  transitionId?: string;
  fallbackQueueTurnOnEmpty?: QueueTurn;
};

export type LoadNextTrainingTurnResult = "loaded" | "empty" | "error" | "skipped";

type AcceptedCardTransition = {
  word: TrainingWord;
  wordMode: TrainingMode;
  currentCardKey: string;
  turnIdForReview: string | null;
  isNextCardOverride: boolean;
  nextQueueTurn: QueueTurn;
  prefetched: PreparedNextTrainingTurn | null;
  transitionId: string;
};

type Inputs = {
  userId: string;
  currentWord: TrainingWord | null;
  setCurrentWord: (word: TrainingWord | null) => void;
  enabledModes: TrainingMode[];
  contentLanguageCode: string;
  translationTargetLanguageCode: string | null;
  cardFilter: CardFilter;
  newReviewRatio: number;
  firstEncounter?: boolean;
  trainingShellV2Enabled: boolean;
  recoverLoadErrors: boolean;
  focusFilter: TrainingFocusFilter;
  sessionScopeKey: string;
  selection: TrainingTurnSelectionPort;
  audioEnabled: boolean;
  preloadAudio: (word: TrainingWord) => void;
  resetCardPresentation: () => void;
  reviewLegacy: (request: LegacyTrainingReviewRequest) => Promise<unknown>;
  refreshAfterAccepted: (input: { statsLabel: string }) => Promise<void>;
};

const isPlatformV2TrainingMode = (
  mode: TrainingMode,
): mode is "word-to-definition" | "definition-to-word" =>
  mode === "word-to-definition" || mode === "definition-to-word";

export function useTrainingTurnController(input: Inputs) {
  const {
    userId,
    currentWord,
    setCurrentWord,
    enabledModes,
    contentLanguageCode,
    translationTargetLanguageCode,
    cardFilter,
    newReviewRatio,
    firstEncounter,
    trainingShellV2Enabled,
    recoverLoadErrors,
    focusFilter,
    sessionScopeKey,
    selection,
    audioEnabled,
    preloadAudio,
    resetCardPresentation,
    reviewLegacy,
    refreshAfterAccepted,
  } = input;
  const [loadingWord, setLoadingWord] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [acceptedTransitionLoadStalled, setAcceptedTransitionLoadStalled] =
    useState(false);
  const acceptedTransitionRetryRef = useRef<{
    queueTurn: QueueTurn;
    excludeCardKeys: string[];
  } | null>(null);
  const [usableCandidatesExhausted, setUsableCandidatesExhausted] =
    useState(false);
  const [nextCardOverrideNotice, setNextCardOverrideNotice] = useState<
    string | null
  >(null);
  const [queueTurn, setQueueTurn] = useState<QueueTurn>("new");
  const [reviewCounter, setReviewCounter] = useState(0);
  const [currentPresentationId, setCurrentPresentationId] = useState<
    string | null
  >(null);
  const actionLoadingRef = useRef(false);
  const loadingInProgressRef = useRef(false);
  const loadGenerationRef = useRef(0);
  const sessionScopeKeyRef = useRef(sessionScopeKey);
  const currentTurnIdRef = useRef<string | null>(null);
  const reviewedCardKeysRef = useRef<Set<string>>(new Set());
  const rejectedCardKeysRef = useRef<Set<string>>(new Set());
  const failedCardKeyRef = useRef<string | null>(null);
  const nextCardOverrideWordIdRef = useRef<string | null>(null);
  const nextCardOverrideActiveKeyRef = useRef<string | null>(null);

  const currentMode =
    currentWord?.mode ?? enabledModes[0] ?? "word-to-definition";

  const presentWord = useCallback(
    (word: TrainingWord | null) => {
      if (word) markTrainingEntryPresentationStarted(word.id);
      const presentationId = word ? generateReviewTurnId() : null;
      currentTurnIdRef.current = presentationId;
      setCurrentPresentationId(presentationId);
      setCurrentWord(word);
    },
    [setCurrentWord],
  );

  const selectPreparedCandidate = useCallback(
    (predictedQueueTurn: QueueTurn, currentCardKey: string) =>
      selection.selectNext({
        queueTurn: predictedQueueTurn,
        excludeCardKeys: [
          ...new Set([
            ...reviewedCardKeysRef.current,
            ...rejectedCardKeysRef.current,
            currentCardKey,
          ]),
        ],
      }),
    [selection],
  );

  const {
    warmWord,
    refreshForCard: refreshPreparedNextTurn,
    consumeForCard: consumePreparedNextTurn,
    reset: resetPreparedNextTurn,
    nextTransitionId,
  } = usePreparedNextTrainingTurn({
    cacheOwnerId: userId,
    currentWord,
    currentMode,
    enabledModes,
    contentLanguageCode,
    translationTargetLanguageCode,
    queueTurn,
    cardFilter,
    reviewCounter,
    newReviewRatio,
    selectNext: selectPreparedCandidate,
    audioEnabled,
    preloadAudio,
  });

  const clearReviewedSession = useCallback(() => {
    reviewedCardKeysRef.current.clear();
    rejectedCardKeysRef.current.clear();
    failedCardKeyRef.current = null;
    setUsableCandidatesExhausted(false);
    acceptedTransitionRetryRef.current = null;
    setAcceptedTransitionLoadStalled(false);
  }, []);

  const cancelActiveSelection = useCallback(() => {
    loadGenerationRef.current += 1;
    loadingInProgressRef.current = false;
    setLoadingWord(false);
  }, []);

  const resetFocusQueue = useCallback(() => {
    clearReviewedSession();
    cancelActiveSelection();
    resetPreparedNextTurn();
    setQueueTurn("new");
    setReviewCounter(0);
  }, [cancelActiveSelection, clearReviewedSession, resetPreparedNextTurn]);

  const beginSessionScopeChange = useCallback(() => {
    clearReviewedSession();
    cancelActiveSelection();
    resetPreparedNextTurn();
  }, [cancelActiveSelection, clearReviewedSession, resetPreparedNextTurn]);

  const resetQueueForFilter = useCallback((nextFilter: CardFilter) => {
    if (nextFilter !== "both") return;
    setQueueTurn("new");
    setReviewCounter(0);
  }, []);

  useEffect(() => {
    const reviewed = reviewedCardKeysRef.current;
    const rejected = rejectedCardKeysRef.current;
    return () => {
      reviewed.clear();
      rejected.clear();
      failedCardKeyRef.current = null;
    };
  }, []);

  useEffect(
    () => () => clearPlatformV2TrainingClientCaches(userId),
    [userId],
  );

  const recordPresentation = useCallback(
    (word: TrainingWord, mode: TrainingMode) => {
      if (!trainingShellV2Enabled || !isPlatformV2TrainingMode(mode)) {
        void recordWordView({ userId, wordId: word.id, mode });
      }
    },
    [trainingShellV2Enabled, userId],
  );

  const presentPreparedCandidate = useCallback(
    (word: TrainingWord) => {
      setLoadingWord(false);
      resetCardPresentation();
      presentWord(word);
      const mode = word.mode ?? enabledModes[0] ?? "word-to-definition";
      recordPresentation(word, mode);
      if (audioEnabled) preloadAudio(word);
    },
    [
      audioEnabled,
      enabledModes,
      preloadAudio,
      presentWord,
      recordPresentation,
      resetCardPresentation,
    ],
  );

  const rememberRejectedCard = useCallback(
    (word: TrainingWord, failure: string) => {
      // Lookup readiness does not guarantee that the selected card is
      // renderable (for example, a reverse card can lack a definition).
      const mode = word.mode ?? enabledModes[0] ?? "word-to-definition";
      const cardKey = getTrainingCardKey(word, mode);
      rejectedCardKeysRef.current.add(cardKey);
      failedCardKeyRef.current = cardKey;
      recordTrainingEntryTerminalFailure(word.id, failure);
    },
    [enabledModes],
  );

  const loadNextWord = useCallback(
    async ({
      excludeWordIds = [],
      queueTurn: requestedQueueTurn,
      transitionId = createTrainingTransitionId(),
      fallbackQueueTurnOnEmpty,
      ...request
    }: LoadNextTrainingTurnRequest = {}): Promise<LoadNextTrainingTurnResult> => {
      if (loadingInProgressRef.current) {
        trainingDebug.log(
          "%c loadNextWord skipped (already loading)",
          "color: #f59e0b",
        );
        finishTrainingUserTransition(transitionId, "skipped");
        return "skipped";
      }

      loadingInProgressRef.current = true;
      const generation = (loadGenerationRef.current += 1);
      setLoadingWord(true);
      setUsableCandidatesExhausted(false);
      resetCardPresentation();
      setLoadError(null);
      try {
        const overrideWordId = nextCardOverrideWordIdRef.current;
        if (overrideWordId) {
          nextCardOverrideWordIdRef.current = null;
          const overrideWord = await selection.lookupOverride(overrideWordId);
          if (generation !== loadGenerationRef.current) {
            finishTrainingUserTransition(transitionId, "cancelled");
            return "skipped";
          }
          if (overrideWord) {
            const mode = currentWord?.mode ?? enabledModes[0] ?? "word-to-definition";
            const preparedOverrideWord: TrainingWord = {
              ...overrideWord,
              ...(typeof firstEncounter === "boolean"
                ? { isFirstEncounter: firstEncounter }
                : {}),
              mode,
              debugStats: { source: "next-card-override", mode },
            };
            nextCardOverrideActiveKeyRef.current = getTrainingCardKey(
              preparedOverrideWord,
              mode,
            );
            recordPresentation(preparedOverrideWord, mode);
            const overrideReady = await warmWord(
              preparedOverrideWord,
              undefined,
              transitionId,
            );
            if (generation !== loadGenerationRef.current) {
              finishTrainingUserTransition(transitionId, "cancelled");
              return "skipped";
            }
            if (!overrideReady) {
              rememberRejectedCard(
                preparedOverrideWord,
                "platform-v2-lookup-failed",
              );
              nextCardOverrideActiveKeyRef.current = null;
              setNextCardOverrideNotice(
                "Kon dit woord niet laden; probeer het opnieuw.",
              );
              setLoadError("platform_v2_lookup_failed");
              finishTrainingUserTransition(
                transitionId,
                "error-platform-v2-lookup-failed",
              );
              return "error";
            }
            presentWord(preparedOverrideWord);
            setNextCardOverrideNotice(
              `${overrideWord.headword} is nu de volgende kaart. Daarna gaat normale training verder.`,
            );
            return "loaded";
          }
          setNextCardOverrideNotice(
            "Kon dit woord niet laden; normale training gaat verder.",
          );
        }

        const selectForQueueTurn = (selectionQueueTurn: QueueTurn) =>
          measureTrainingTransitionStage(
            transitionId,
            "next-card.selection",
            () =>
              selection.selectNext({
                ...request,
                excludeWordIds,
                excludeCardKeys: [
                  ...new Set([
                    ...rejectedCardKeysRef.current,
                    ...(request.excludeCardKeys ?? []),
                  ]),
                ],
                queueTurn: selectionQueueTurn,
              }),
            (selected) => (selected ? "ready" : "empty"),
          );
        const primaryQueueTurn = requestedQueueTurn ?? queueTurn;
        let nextWord = await selectForQueueTurn(primaryQueueTurn);
        if (generation !== loadGenerationRef.current) {
          finishTrainingUserTransition(transitionId, "cancelled");
          return "skipped";
        }
        if (
          !nextWord &&
          fallbackQueueTurnOnEmpty &&
          fallbackQueueTurnOnEmpty !== primaryQueueTurn
        ) {
          nextWord = await selectForQueueTurn(fallbackQueueTurnOnEmpty);
        }
        if (generation !== loadGenerationRef.current) {
          finishTrainingUserTransition(transitionId, "cancelled");
          return "skipped";
        }
        if (!nextWord) {
          presentWord(null);
          finishTrainingUserTransition(transitionId, "empty");
          return "empty";
        }

        const mode = nextWord.mode ?? enabledModes[0] ?? "word-to-definition";
        recordPresentation(nextWord, mode);
        const ready = await warmWord(nextWord, undefined, transitionId);
        if (generation !== loadGenerationRef.current) {
          finishTrainingUserTransition(transitionId, "cancelled");
          return "skipped";
        }
        if (!ready) {
          rememberRejectedCard(nextWord, "platform-v2-lookup-failed");
          setLoadError("platform_v2_lookup_failed");
          finishTrainingUserTransition(
            transitionId,
            "error-platform-v2-lookup-failed",
          );
          return "error";
        }
        presentWord(nextWord);
        return "loaded";
      } catch (cause) {
        if (generation !== loadGenerationRef.current) {
          finishTrainingUserTransition(transitionId, "cancelled");
          return "skipped";
        }
        finishTrainingUserTransition(transitionId, "error-selection-failed");
        if (!recoverLoadErrors) throw cause;
        setLoadError(
          cause instanceof Error ? cause.message : "training_load_failed",
        );
        return "error";
      } finally {
        if (generation === loadGenerationRef.current) {
          loadingInProgressRef.current = false;
          setLoadingWord(false);
        }
      }
    },
    [
      currentWord?.mode,
      enabledModes,
      firstEncounter,
      presentWord,
      queueTurn,
      recordPresentation,
      recoverLoadErrors,
      rememberRejectedCard,
      resetCardPresentation,
      selection,
      warmWord,
    ],
  );

  const reportCardLoadFailure = useCallback(
    (word: TrainingWord, failure: string) => {
      rememberRejectedCard(word, failure);
    },
    [rememberRejectedCard],
  );

  const retryCardLoadFailure = useCallback(async () => {
    if (!failedCardKeyRef.current) return "skipped" as const;
    // Recovery returns ownership to the authoritative scheduler instead of
    // repeatedly fetching the same unusable presentation candidate.
    resetPreparedNextTurn();
    const transitionId = createTrainingTransitionId();
    beginTrainingUserTransition(transitionId, "retry");
    const result = await loadNextWord({
      transitionId,
      queueTurn,
      fallbackQueueTurnOnEmpty: queueTurn === "auto" ? undefined : "auto",
      excludeCardKeys: [
        ...reviewedCardKeysRef.current,
        ...rejectedCardKeysRef.current,
      ],
    });
    setUsableCandidatesExhausted(result === "empty");
    if (result === "loaded") failedCardKeyRef.current = null;
    return result;
  }, [loadNextWord, queueTurn, resetPreparedNextTurn]);

  const replaceSessionScopeAndLoad = useCallback(
    (request: LoadNextTrainingTurnRequest) => {
      beginSessionScopeChange();
      return loadNextWord(request);
    },
    [beginSessionScopeChange, loadNextWord],
  );

  useEffect(() => {
    if (sessionScopeKeyRef.current === sessionScopeKey) return;
    sessionScopeKeyRef.current = sessionScopeKey;
    clearReviewedSession();
  }, [clearReviewedSession, sessionScopeKey]);

  const requestNextCardOverride = useCallback(
    (wordId: string, announce = true) => {
      nextCardOverrideWordIdRef.current = wordId;
      if (announce) {
        setNextCardOverrideNotice("Dit woord wordt als volgende kaart geladen.");
      }
    },
    [],
  );

  const beginAcceptedCardTransition = useCallback(() => {
    if (!currentWord) return null;
    const wordMode = currentWord.mode ?? enabledModes[0] ?? "word-to-definition";
    const currentCardKey = getTrainingCardKey(currentWord, wordMode);
    const turnIdForReview = currentTurnIdRef.current;
    const queue = getNextQueueTransition({
      cardFilter,
      queueTurn,
      reviewCounter,
      newReviewRatio,
    });
    setQueueTurn(queue.queueTurn);
    setReviewCounter(queue.reviewCounter);
    reviewedCardKeysRef.current.add(currentCardKey);
    const prefetched = consumePreparedNextTurn(currentCardKey);
    const transitionId =
      prefetched?.transitionId ?? nextTransitionId ?? createTrainingTransitionId();
    recordTrainingTransitionTiming({
      transitionId,
      stage: "next-card.prefetch",
      durationMs: 0,
      outcome: prefetched ? "accepted-hit" : "accepted-miss",
    });
    if (prefetched && !prefetched.v2Ready) {
      presentPreparedCandidate(prefetched.word);
    }
    return {
      word: currentWord,
      wordMode,
      currentCardKey,
      turnIdForReview,
      isNextCardOverride:
        nextCardOverrideActiveKeyRef.current === currentCardKey,
      nextQueueTurn: queue.queueTurn,
      prefetched,
      transitionId,
    } satisfies AcceptedCardTransition;
  }, [
    cardFilter,
    consumePreparedNextTurn,
    currentWord,
    enabledModes,
    newReviewRatio,
    nextTransitionId,
    presentPreparedCandidate,
    queueTurn,
    reviewCounter,
  ]);

  const preparePlatformProgressAction = useCallback(() => {
    if (!currentWord) return;
    const wordMode = currentWord.mode ?? enabledModes[0] ?? "word-to-definition";
    refreshPreparedNextTurn(getTrainingCardKey(currentWord, wordMode));
  }, [currentWord, enabledModes, refreshPreparedNextTurn]);

  const finishAcceptedCardTransition = useCallback(
    async (
      transition: AcceptedCardTransition,
      options: { statsLabel: string; recoverLoadFailure: boolean },
    ): Promise<"accepted" | "stalled"> => {
      const backgroundRefresh = refreshAfterAccepted(options).catch((cause) => {
        trainingDebug.log("Training counters refresh failed", cause);
      });

      if (transition.isNextCardOverride) {
        nextCardOverrideActiveKeyRef.current = null;
        setNextCardOverrideNotice(null);
      }

      let prefetched = transition.prefetched;
      if (prefetched?.v2Ready) {
        const ready = await prefetched.v2Ready.catch(() => false);
        if (ready) {
          acceptedTransitionRetryRef.current = null;
          setAcceptedTransitionLoadStalled(false);
          presentPreparedCandidate(prefetched.word);
          void backgroundRefresh;
          return "accepted";
        } else {
          recordTrainingTransitionTiming({
            transitionId: transition.transitionId,
            stage: "next-card.prefetch",
            durationMs: 0,
            outcome: "fallback",
          });
          prefetched = null;
        }
      }

      if (!prefetched) {
        const retry = {
          queueTurn: transition.nextQueueTurn,
          excludeCardKeys: [
            ...new Set([
              ...reviewedCardKeysRef.current,
              transition.currentCardKey,
            ]),
          ],
        };
        const loadOutcome = await loadNextWord({
          transitionId: transition.transitionId,
          ...retry,
        }).catch((cause) => {
          if (!options.recoverLoadFailure) throw cause;
          setLoadError(
            cause instanceof Error ? cause.message : "training_load_failed",
          );
          return "error" as const;
        });
        const stalled = loadOutcome === "error" || loadOutcome === "skipped";
        acceptedTransitionRetryRef.current = stalled ? retry : null;
        setAcceptedTransitionLoadStalled(stalled);
        void backgroundRefresh;
        return stalled ? "stalled" : "accepted";
      }
      acceptedTransitionRetryRef.current = null;
      setAcceptedTransitionLoadStalled(false);
      void backgroundRefresh;
      return "accepted";
    },
    [loadNextWord, presentPreparedCandidate, refreshAfterAccepted],
  );

  const submitLegacyReview = useCallback(
    async (result: ReviewResult) => {
      if (!currentWord || actionLoadingRef.current) return;
      actionLoadingRef.current = true;
      setActionLoading(true);
      try {
        const transition = beginAcceptedCardTransition();
        if (!transition) return;
        beginTrainingUserTransition(transition.transitionId, "review");
        const request: LegacyTrainingReviewRequest = {
          word: transition.word,
          mode: transition.wordMode,
          result,
          turnId: transition.turnIdForReview,
        };
        const mutation = () => reviewLegacy(request);
        await measureTrainingTransitionStage(
          transition.transitionId,
          "review.mutation",
          mutation,
          () => "accepted",
        );
        await finishAcceptedCardTransition(transition, {
          statsLabel: `AFTER ${transition.word.headword} (${result})`,
          recoverLoadFailure: false,
        });
      } finally {
        actionLoadingRef.current = false;
        setActionLoading(false);
      }
    }, [
      beginAcceptedCardTransition,
      currentWord,
      finishAcceptedCardTransition,
      reviewLegacy,
    ],
  );

  const acceptPlatformProgressAction = useCallback(
    async (_capability: PlatformV2TrainingActionCapability) => {
      if (!currentWord || actionLoadingRef.current) return "stalled" as const;
      actionLoadingRef.current = true;
      setActionLoading(true);
      try {
        const transition = beginAcceptedCardTransition();
        if (!transition) return "stalled" as const;
        return await finishAcceptedCardTransition(transition, {
          statsLabel: `AFTER ${transition.word.headword} (platform-v2)`,
          recoverLoadFailure: true,
        });
      } finally {
        actionLoadingRef.current = false;
        setActionLoading(false);
      }
    }, [beginAcceptedCardTransition, currentWord, finishAcceptedCardTransition],
  );

  const retryAcceptedTransitionLoad = useCallback(async () => {
    const retry = acceptedTransitionRetryRef.current;
    if (!retry || actionLoadingRef.current) return "skipped" as const;
    actionLoadingRef.current = true;
    setActionLoading(true);
    try {
      const transitionId = createTrainingTransitionId();
      beginTrainingUserTransition(transitionId, "retry");
      const outcome = await loadNextWord({ transitionId, ...retry }).catch(
        (cause) => {
          setLoadError(
            cause instanceof Error ? cause.message : "training_load_failed",
          );
          return "error" as const;
        },
      );
      const stalled = outcome === "error" || outcome === "skipped";
      if (!stalled) acceptedTransitionRetryRef.current = null;
      setAcceptedTransitionLoadStalled(stalled);
      return outcome;
    } finally {
      actionLoadingRef.current = false;
      setActionLoading(false);
    }
  }, [loadNextWord]);

  return {
    currentMode,
    loadingWord,
    actionLoading,
    loadError,
    acceptedTransitionLoadStalled,
    usableCandidatesExhausted,
    reportLoadError: setLoadError,
    reportCardLoadFailure,
    retryCardLoadFailure,
    retryAcceptedTransitionLoad,
    nextTransitionId,
    currentPresentationId,
    nextCardOverrideNotice,
    loadNextWord,
    beginSessionScopeChange,
    replaceSessionScopeAndLoad,
    requestNextCardOverride,
    resetFocusQueue,
    resetQueueForFilter,
    clearReviewedSession,
    submitLegacyReview,
    preparePlatformProgressAction,
    acceptPlatformProgressAction,
  };
}
