"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { recordWordView, type ReviewResult } from "@/lib/trainingService";
import { trainingDebug } from "@/lib/trainingDebug";
import { clearPlatformV2TrainingClientCaches } from "@/lib/platform/platformV2TrainingClient";
import type { PlatformV2TrainingActionCapability } from "@/lib/platform/platformV2TrainingActionClient";
import {
  markTrainingEntryPresentationStarted,
  measureTrainingTransitionStage,
} from "@/lib/training/trainingTransitionTiming";
import {
  generateReviewTurnId,
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
> & { queueTurn?: QueueTurn };

export type LoadNextTrainingTurnResult = "loaded" | "empty" | "error" | "skipped";

type AcceptedCardTransition = {
  word: TrainingWord;
  wordMode: TrainingMode;
  currentCardKey: string;
  turnIdForReview: string | null;
  isNextCardOverride: boolean;
  nextQueueTurn: QueueTurn;
  prefetched: PreparedNextTrainingTurn | null;
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
  refreshAfterAccepted: (input: {
    statsLabel: string;
    refreshHistory: boolean;
  }) => Promise<void>;
};

const trainingCardKey = (word: TrainingWord, mode: TrainingMode) =>
  `${word.id}:${mode}`;

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
  const [nextCardOverrideNotice, setNextCardOverrideNotice] = useState<
    string | null
  >(null);
  const [queueTurn, setQueueTurn] = useState<QueueTurn>("new");
  const [reviewCounter, setReviewCounter] = useState(0);
  const actionLoadingRef = useRef(false);
  const loadingInProgressRef = useRef(false);
  const loadGenerationRef = useRef(0);
  const sessionScopeKeyRef = useRef(sessionScopeKey);
  const currentTurnIdRef = useRef<string | null>(null);
  const reviewedCardKeysRef = useRef<Set<string>>(new Set());
  const nextCardOverrideWordIdRef = useRef<string | null>(null);
  const nextCardOverrideActiveKeyRef = useRef<string | null>(null);

  const currentMode =
    currentWord?.mode ?? enabledModes[0] ?? "word-to-definition";

  const presentWord = useCallback(
    (word: TrainingWord | null) => {
      if (word) markTrainingEntryPresentationStarted(word.id);
      setCurrentWord(word);
      currentTurnIdRef.current = word ? generateReviewTurnId() : null;
    },
    [setCurrentWord],
  );

  const selectPreparedCandidate = useCallback(
    (predictedQueueTurn: QueueTurn, currentCardKey: string) =>
      selection.selectNext({
        queueTurn: predictedQueueTurn,
        excludeCardKeys: [...reviewedCardKeysRef.current, currentCardKey],
      }),
    [selection],
  );

  const {
    warmWord,
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

  const resetQueueForFilter = useCallback((nextFilter: CardFilter) => {
    if (nextFilter !== "both") return;
    setQueueTurn("new");
    setReviewCounter(0);
  }, []);

  useEffect(() => {
    if (sessionScopeKeyRef.current === sessionScopeKey) return;
    sessionScopeKeyRef.current = sessionScopeKey;
    clearReviewedSession();
  }, [clearReviewedSession, sessionScopeKey]);

  useEffect(() => {
    const reviewed = reviewedCardKeysRef.current;
    return () => reviewed.clear();
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

  const loadNextWord = useCallback(
    async ({
      excludeWordIds = [],
      queueTurn: requestedQueueTurn,
      ...request
    }: LoadNextTrainingTurnRequest = {}): Promise<LoadNextTrainingTurnResult> => {
      if (loadingInProgressRef.current) {
        trainingDebug.log(
          "%c loadNextWord skipped (already loading)",
          "color: #f59e0b",
        );
        return "skipped";
      }

      loadingInProgressRef.current = true;
      const generation = (loadGenerationRef.current += 1);
      setLoadingWord(true);
      resetCardPresentation();
      setLoadError(null);
      try {
        const overrideWordId = nextCardOverrideWordIdRef.current;
        if (overrideWordId) {
          nextCardOverrideWordIdRef.current = null;
          const overrideWord = await selection.lookupOverride(overrideWordId);
          if (generation !== loadGenerationRef.current) return "skipped";
          if (overrideWord) {
            const mode = currentWord?.mode ?? enabledModes[0] ?? "word-to-definition";
            const overrideCardKey = trainingCardKey(overrideWord, mode);
            nextCardOverrideActiveKeyRef.current = overrideCardKey;
            const preparedOverrideWord: TrainingWord = {
              ...overrideWord,
              ...(typeof firstEncounter === "boolean"
                ? { isFirstEncounter: firstEncounter }
                : {}),
              mode,
              debugStats: { source: "next-card-override", mode },
            };
            recordPresentation(preparedOverrideWord, mode);
            const overrideReady = await warmWord(preparedOverrideWord);
            if (generation !== loadGenerationRef.current) return "skipped";
            if (!overrideReady) {
              nextCardOverrideActiveKeyRef.current = null;
              setNextCardOverrideNotice(
                "Kon dit woord niet laden; probeer het opnieuw.",
              );
              setLoadError("platform_v2_lookup_failed");
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

        const nextWord = await selection.selectNext({
          ...request,
          excludeWordIds,
          queueTurn: requestedQueueTurn ?? queueTurn,
        });
        if (generation !== loadGenerationRef.current) return "skipped";
        if (!nextWord) {
          presentWord(null);
          return "empty";
        }

        const mode = nextWord.mode ?? enabledModes[0] ?? "word-to-definition";
        recordPresentation(nextWord, mode);
        const ready = await warmWord(nextWord);
        if (generation !== loadGenerationRef.current) return "skipped";
        if (!ready) {
          setLoadError("platform_v2_lookup_failed");
          return "error";
        }
        presentWord(nextWord);
        return "loaded";
      } catch (cause) {
        if (generation !== loadGenerationRef.current) return "skipped";
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
      resetCardPresentation,
      selection,
      warmWord,
    ],
  );

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
    const currentCardKey = trainingCardKey(currentWord, wordMode);
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
    } satisfies AcceptedCardTransition;
  }, [
    cardFilter,
    consumePreparedNextTurn,
    currentWord,
    enabledModes,
    newReviewRatio,
    presentPreparedCandidate,
    queueTurn,
    reviewCounter,
  ]);

  const finishAcceptedCardTransition = useCallback(
    async (
      transition: AcceptedCardTransition,
      options: { statsLabel: string; refreshHistory: boolean },
    ) => {
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
        if (ready) presentPreparedCandidate(prefetched.word);
        else prefetched = null;
      }

      if (!prefetched) {
        await loadNextWord({
          queueTurn: transition.nextQueueTurn,
          excludeCardKeys: [
            ...reviewedCardKeysRef.current,
            transition.currentCardKey,
          ],
        });
      }
      void backgroundRefresh;
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
        const request: LegacyTrainingReviewRequest = {
          word: transition.word,
          mode: transition.wordMode,
          result,
          turnId: transition.turnIdForReview,
        };
        const mutation = () => reviewLegacy(request);
        if (nextTransitionId) {
          await measureTrainingTransitionStage(
            nextTransitionId,
            "review.mutation",
            mutation,
            () => "accepted",
          );
        } else {
          await mutation();
        }
        await finishAcceptedCardTransition(transition, {
          statsLabel: `AFTER ${transition.word.headword} (${result})`,
          refreshHistory: false,
        });
      } finally {
        actionLoadingRef.current = false;
        setActionLoading(false);
      }
    }, [
      beginAcceptedCardTransition,
      currentWord,
      finishAcceptedCardTransition,
      nextTransitionId,
      reviewLegacy,
    ],
  );

  const acceptPlatformProgressAction = useCallback(
    async (_capability: PlatformV2TrainingActionCapability) => {
      if (!currentWord || actionLoadingRef.current) return;
      actionLoadingRef.current = true;
      setActionLoading(true);
      try {
        const transition = beginAcceptedCardTransition();
        if (!transition) return;
        await finishAcceptedCardTransition(transition, {
          statsLabel: `AFTER ${transition.word.headword} (platform-v2)`,
          refreshHistory: true,
        });
      } finally {
        actionLoadingRef.current = false;
        setActionLoading(false);
      }
    }, [beginAcceptedCardTransition, currentWord, finishAcceptedCardTransition],
  );

  return {
    currentMode,
    loadingWord,
    actionLoading,
    loadError,
    reportLoadError: setLoadError,
    nextTransitionId,
    nextCardOverrideNotice,
    loadNextWord,
    requestNextCardOverride,
    resetFocusQueue,
    resetQueueForFilter,
    clearReviewedSession,
    submitLegacyReview,
    acceptPlatformProgressAction,
  };
}
