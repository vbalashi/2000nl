"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  isTrainingSessionUnavailableError,
  type TrainingSessionUnavailableReason,
} from "@/lib/training/selectionService";
import {
  usePreparedNextTrainingTurn,
  type PreparedNextTrainingTurn,
  type TrainingWarmResult,
} from "./v2/usePreparedNextTrainingTurn";
import type { TrainingCardSwipeCommitOutcome } from "./v2/useTrainingCardSwipeSurface";
import type {
  TrainingTurnSelectionPort,
  TrainingTurnSelectionRequest,
} from "./useTrainingTurnSelectionPort";
import {
  TrainingSelectionFailure,
  normalizeTrainingSelectionFailure,
} from "@/lib/training/trainingSelectionFailure";
import {
  isTrainingLoadFailure,
  trainingSelectionFailureOutcome,
  type LoadNextTrainingTurnResult,
  type TrainingEmptySelectionOutcome,
  type TrainingSelectionLoadFailure,
} from "@/lib/training/trainingSelectionOutcome";

export type LoadNextTrainingTurnRequest = Omit<
  TrainingTurnSelectionRequest,
  "queueTurn"
> & {
  queueTurn?: QueueTurn;
  transitionId?: string;
  fallbackQueueTurnOnEmpty?: QueueTurn;
  emptyOutcome?: TrainingEmptySelectionOutcome;
};

type AcceptedCardTransition = {
  word: TrainingWord;
  wordMode: TrainingMode;
  trainingSessionId: string | null;
  currentCardKey: string;
  loadGeneration: number;
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
  recoverLoadErrors: boolean;
  focusFilter: TrainingFocusFilter;
  sessionPlannedTotal?: number | null;
  sessionConsumedCardKeys?: string[];
  trainingSessionId?: string | null;
  sessionScopeKey: string;
  selection: TrainingTurnSelectionPort;
  refreshAfterAccepted: (input: { statsLabel: string }) => Promise<void>;
};

const EMPTY_SESSION_CARD_KEYS: string[] = [];

const unavailableReasonForFailure = (
  failure: string,
): TrainingSessionUnavailableReason | null => {
  switch (failure) {
    case "entry-not-found":
    case "projection-missing":
    case "model-invalid":
    case "reverse-definition-missing":
      return failure;
    default:
      return null;
  }
};

const isTrainingWarmReady = (result: TrainingWarmResult): boolean =>
  result === true;

const trainingWarmFailure = (result: TrainingWarmResult): string =>
  typeof result === "object" ? result.unavailableReason : "platform-v2-lookup-failed";

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
    recoverLoadErrors,
    focusFilter,
    sessionPlannedTotal = null,
    sessionConsumedCardKeys = EMPTY_SESSION_CARD_KEYS,
    trainingSessionId = null,
    sessionScopeKey,
    selection,
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
    emptyOutcome: "session-complete";
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
  const cardFailureRef = useRef<{
    cardKey: string;
    word: TrainingWord;
    failure: string;
    reason: TrainingSessionUnavailableReason | null;
    trainingSessionId: string | null;
  } | null>(null);
  const unavailableMarkPromiseRef = useRef<Promise<boolean> | null>(null);
  const nextCardOverrideWordIdRef = useRef<string | null>(null);
  const nextCardOverrideActiveKeyRef = useRef<string | null>(null);

  useEffect(() => {
    reviewedCardKeysRef.current = new Set(sessionConsumedCardKeys);
  }, [sessionConsumedCardKeys, sessionScopeKey]);

  const clearAcceptedTransitionRecovery = useCallback(() => {
    acceptedTransitionRetryRef.current = null;
    setAcceptedTransitionLoadStalled(false);
  }, []);

  const currentMode =
    currentWord?.mode ?? enabledModes[0] ?? "word-to-definition";

  const presentWord = useCallback(
    (word: TrainingWord | null) => {
      clearAcceptedTransitionRecovery();
      if (word) markTrainingEntryPresentationStarted(word.id);
      const presentationId = word ? generateReviewTurnId() : null;
      currentTurnIdRef.current = presentationId;
      setCurrentPresentationId(presentationId);
      setCurrentWord(word);
    },
    [clearAcceptedTransitionRecovery, setCurrentWord],
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
  });

  const clearReviewedSession = useCallback(() => {
    reviewedCardKeysRef.current.clear();
    rejectedCardKeysRef.current.clear();
    cardFailureRef.current = null;
    unavailableMarkPromiseRef.current = null;
    setUsableCandidatesExhausted(false);
    clearAcceptedTransitionRecovery();
  }, [clearAcceptedTransitionRecovery]);

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
      cardFailureRef.current = null;
      unavailableMarkPromiseRef.current = null;
    };
  }, []);

  useEffect(
    () => () => clearPlatformV2TrainingClientCaches(userId),
    [userId],
  );

  const presentPreparedCandidate = useCallback(
    (word: TrainingWord) => {
      setLoadingWord(false);
      presentWord(word);
    },
    [presentWord],
  );

  const rememberRejectedCard = useCallback(
    (
      word: TrainingWord,
      failure: string,
      sessionId: string | null = trainingSessionId,
    ) => {
      // Lookup readiness does not guarantee that the selected card is
      // renderable (for example, a reverse card can lack a definition).
      const mode = word.mode ?? enabledModes[0] ?? "word-to-definition";
      const cardKey = getTrainingCardKey(word, mode);
      rejectedCardKeysRef.current.add(cardKey);
      cardFailureRef.current = {
        cardKey,
        word,
        failure,
        reason: unavailableReasonForFailure(failure),
        trainingSessionId: sessionId,
      };
      recordTrainingEntryTerminalFailure(word.id, failure);
    },
    [enabledModes, trainingSessionId],
  );

  const reportCardLoadFailure = useCallback(
    async (
      word: TrainingWord,
      failure: string,
      sessionIdOverride?: string | null,
    ): Promise<boolean> => {
      const mode = word.mode ?? enabledModes[0] ?? "word-to-definition";
      const cardKey = getTrainingCardKey(word, mode);
      const reason = unavailableReasonForFailure(failure);
      const effectiveSessionId =
        sessionIdOverride === undefined ? trainingSessionId : sessionIdOverride;
      if (
        cardFailureRef.current?.cardKey === cardKey &&
        cardFailureRef.current.failure === failure &&
        (cardFailureRef.current.reason === null ||
          unavailableMarkPromiseRef.current !== null)
      ) {
        return unavailableMarkPromiseRef.current
          ? unavailableMarkPromiseRef.current
          : false;
      }
      cardFailureRef.current = {
        cardKey,
        word,
        failure,
        reason,
        trainingSessionId: effectiveSessionId,
      };
      if (!reason || !effectiveSessionId || !selection.markUnavailable) {
        if (reason) rememberRejectedCard(word, failure, effectiveSessionId);
        return false;
      }

      const markPromise = selection
        .markUnavailable({
          sessionId: effectiveSessionId,
          entryId: word.id,
          cardTypeId: mode,
          reason,
        })
        .catch(() => false);
      unavailableMarkPromiseRef.current = markPromise;
      const marked = await markPromise;
      if (marked) rememberRejectedCard(word, failure, effectiveSessionId);
      else unavailableMarkPromiseRef.current = null;
      return marked;
    },
    [enabledModes, rememberRejectedCard, selection, trainingSessionId],
  );

  const loadNextWord = useCallback(
    async ({
      excludeWordIds = [],
      queueTurn: requestedQueueTurn,
      transitionId = createTrainingTransitionId(),
      fallbackQueueTurnOnEmpty,
      emptyOutcome = "no-match",
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
      setLoadError(null);
      const effectiveTrainingSessionId =
        request.trainingSessionId === undefined
          ? trainingSessionId
          : request.trainingSessionId;
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
              mode,
              debugStats: { source: "next-card-override", mode },
            };
            nextCardOverrideActiveKeyRef.current = getTrainingCardKey(
              preparedOverrideWord,
              mode,
            );
            const overrideWarmResult = await warmWord(
              preparedOverrideWord,
              undefined,
              transitionId,
            );
            if (generation !== loadGenerationRef.current) {
              finishTrainingUserTransition(transitionId, "cancelled");
              return "skipped";
            }
            if (!isTrainingWarmReady(overrideWarmResult)) {
              await reportCardLoadFailure(
                preparedOverrideWord,
                trainingWarmFailure(overrideWarmResult),
                effectiveTrainingSessionId,
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

        const selectForQueueTurn = async (selectionQueueTurn: QueueTurn) => {
          const selectionRequest = {
            ...request,
            excludeWordIds,
            excludeCardKeys: [
              ...new Set([
                ...rejectedCardKeysRef.current,
                ...(request.excludeCardKeys ?? []),
              ]),
            ],
            queueTurn: selectionQueueTurn,
          };

          // The session selector is read-only. If it reports a permanent
          // access/projection failure, retire that member through the explicit
          // mutation boundary and ask the selector for the next member.
          for (let attempt = 0; attempt < 64; attempt += 1) {
            try {
              return await measureTrainingTransitionStage(
                transitionId,
                "next-card.selection",
                () => selection.selectNext(selectionRequest),
                (selected) => (selected ? "ready" : "empty"),
              );
            } catch (cause) {
              if (!isTrainingSessionUnavailableError(cause)) {
                throw normalizeTrainingSelectionFailure(cause);
              }
              const diagnostic = cause.diagnostic;
              if (
                !effectiveTrainingSessionId ||
                !selection.markUnavailable ||
                diagnostic.trainingSessionId !== effectiveTrainingSessionId
              ) {
                throw cause;
              }
              const marked = await selection.markUnavailable({
                sessionId: effectiveTrainingSessionId,
                entryId: diagnostic.entryId,
                cardTypeId: diagnostic.cardTypeId,
                reason: diagnostic.reason,
              });
              if (!marked) throw cause;
            }
          }
          throw new Error("training_session_unavailable_reconciliation_limit");
        };
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
          setUsableCandidatesExhausted(emptyOutcome === "session-complete");
          finishTrainingUserTransition(transitionId, emptyOutcome);
          return emptyOutcome;
        }

        const warmResult = await warmWord(nextWord, undefined, transitionId);
        if (generation !== loadGenerationRef.current) {
          finishTrainingUserTransition(transitionId, "cancelled");
          return "skipped";
        }
        if (!isTrainingWarmReady(warmResult)) {
          await reportCardLoadFailure(
            nextWord,
            trainingWarmFailure(warmResult),
            effectiveTrainingSessionId,
          );
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
        const outcome: TrainingSelectionLoadFailure | "error" =
          cause instanceof TrainingSelectionFailure
            ? trainingSelectionFailureOutcome(cause.kind)
            : "error";
        finishTrainingUserTransition(transitionId, outcome);
        if (!recoverLoadErrors) throw cause;
        setLoadError(
          cause instanceof Error ? cause.message : "training_load_failed",
        );
        return outcome;
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
      presentWord,
      queueTurn,
      recoverLoadErrors,
      reportCardLoadFailure,
      selection,
      trainingSessionId,
      warmWord,
    ],
  );

  const retryCardLoadFailure = useCallback(async () => {
    const failure = cardFailureRef.current;
    if (!failure) return "skipped" as const;
    const effectiveTrainingSessionId =
      failure.trainingSessionId === null
        ? null
        : failure.trainingSessionId ?? trainingSessionId;
    let markedUnavailable = !failure.reason || !effectiveTrainingSessionId;
    if (
      failure.reason &&
      effectiveTrainingSessionId &&
      unavailableMarkPromiseRef.current
    ) {
      markedUnavailable = await unavailableMarkPromiseRef.current;
    }
    // Recovery returns ownership to the authoritative scheduler instead of
    // repeatedly fetching the same unusable presentation candidate.
    resetPreparedNextTurn();
    const transitionId = createTrainingTransitionId();
    beginTrainingUserTransition(transitionId, "retry");
    const result = await loadNextWord({
      transitionId,
      queueTurn,
      trainingSessionId: effectiveTrainingSessionId,
      fallbackQueueTurnOnEmpty: queueTurn === "auto" ? undefined : "auto",
      emptyOutcome: "session-complete",
      excludeCardKeys: [
        ...reviewedCardKeysRef.current,
        ...(markedUnavailable ? rejectedCardKeysRef.current : []),
      ],
    });
    if (result === "loaded") {
      cardFailureRef.current = null;
      unavailableMarkPromiseRef.current = null;
    }
    return result;
  }, [loadNextWord, queueTurn, resetPreparedNextTurn, trainingSessionId]);

  const replaceSessionScopeAndLoad = useCallback(
    (request: LoadNextTrainingTurnRequest) => {
      beginSessionScopeChange();
      // The replacement request must not inherit the previous render's
      // session id through the selection port's closure. A new server-latched
      // session is created by the next explicit session start; this load is
      // intentionally unscoped until then.
      return loadNextWord({ ...request, trainingSessionId: null });
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
      trainingSessionId,
      currentCardKey,
      loadGeneration: loadGenerationRef.current,
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
    trainingSessionId,
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
    ): Promise<
      Extract<
        TrainingCardSwipeCommitOutcome,
        | "accepted-next-presented"
        | "accepted-session-complete"
        | "accepted-next-unavailable"
      >
    > => {
      const backgroundRefresh = refreshAfterAccepted(options).catch((cause) => {
        trainingDebug.log("Training counters refresh failed", cause);
      });

      const reachedSessionLimit =
        sessionPlannedTotal !== null &&
        reviewedCardKeysRef.current.size >= sessionPlannedTotal;
      if (reachedSessionLimit) {
        presentWord(null);
        acceptedTransitionRetryRef.current = null;
        setAcceptedTransitionLoadStalled(false);
        setUsableCandidatesExhausted(true);
        void backgroundRefresh;
        return "accepted-session-complete";
      }

      if (transition.isNextCardOverride) {
        nextCardOverrideActiveKeyRef.current = null;
        setNextCardOverrideNotice(null);
      }

      let prefetched = transition.prefetched;
      if (prefetched?.v2Ready) {
        const warmResult = await prefetched.v2Ready.catch(() => false);
        if (transition.loadGeneration !== loadGenerationRef.current) {
          // Scope changes/reset invalidate a detached prefetch just as they
          // invalidate an on-demand selection. The accepted mutation remains
          // settled, but an old candidate must not replace the new session.
          void backgroundRefresh;
          return "accepted-next-unavailable";
        }
        if (isTrainingWarmReady(warmResult)) {
          acceptedTransitionRetryRef.current = null;
          setAcceptedTransitionLoadStalled(false);
          presentPreparedCandidate(prefetched.word);
          void backgroundRefresh;
          return "accepted-next-presented";
        } else {
          await reportCardLoadFailure(
            prefetched.word,
            trainingWarmFailure(warmResult),
            transition.trainingSessionId,
          );
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
          emptyOutcome: "session-complete" as const,
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
        const stalled = isTrainingLoadFailure(loadOutcome);
        acceptedTransitionRetryRef.current = stalled ? retry : null;
        setAcceptedTransitionLoadStalled(stalled);
        void backgroundRefresh;
        if (stalled) return "accepted-next-unavailable";
        if (loadOutcome === "session-complete") {
          return "accepted-session-complete";
        }
        return loadOutcome === "loaded"
          ? "accepted-next-presented"
          : "accepted-next-unavailable";
      }
      acceptedTransitionRetryRef.current = null;
      setAcceptedTransitionLoadStalled(false);
      void backgroundRefresh;
      return "accepted-next-presented";
    },
    [
      loadNextWord,
      presentPreparedCandidate,
      presentWord,
      reportCardLoadFailure,
      refreshAfterAccepted,
      sessionPlannedTotal,
    ],
  );

  const acceptPlatformProgressAction = useCallback(
    async (_capability: PlatformV2TrainingActionCapability) => {
      if (!currentWord || actionLoadingRef.current) {
        return "accepted-next-unavailable" as const;
      }
      actionLoadingRef.current = true;
      setActionLoading(true);
      try {
        const transition = beginAcceptedCardTransition();
        if (!transition) return "accepted-next-unavailable" as const;
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
      const stalled = isTrainingLoadFailure(outcome);
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
    preparePlatformProgressAction,
    acceptPlatformProgressAction,
  };
}
