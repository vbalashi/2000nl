"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { platformV2TrainingUiEnabled } from "@/lib/platform/platformV2Rollout";
import { prefetchPlatformV2TrainingEntry } from "@/lib/platform/platformV2TrainingClient";
import { preparePlatformV2TrainingEntry } from "@/lib/platform/platformV2TrainingPreparationClient";
import {
  createTrainingTransitionId,
  measureTrainingTransitionStage,
  recordTrainingTransitionTiming,
} from "@/lib/training/trainingTransitionTiming";
import { predictNextQueueTurn } from "@/lib/training/trainingQueue";
import type {
  CardFilter,
  QueueTurn,
  TrainingMode,
  TrainingWord,
} from "@/lib/types";

export type PreparedNextTrainingTurn = {
  forWordId: string;
  forCardKey: string;
  queueTurn: QueueTurn;
  word: TrainingWord;
  v2Ready: Promise<boolean> | null;
  transitionId: string;
};

type Inputs = {
  cacheOwnerId: string;
  currentWord: TrainingWord | null;
  currentMode: TrainingMode;
  enabledModes: TrainingMode[];
  contentLanguageCode: string;
  translationTargetLanguageCode: string | null;
  queueTurn: QueueTurn;
  cardFilter: CardFilter;
  reviewCounter: number;
  newReviewRatio: number;
  selectNext: (
    predictedQueueTurn: QueueTurn,
    currentCardKey: string,
  ) => Promise<TrainingWord | null>;
  audioEnabled: boolean;
  preloadAudio: (word: TrainingWord) => void;
};

export function usePreparedNextTrainingTurn(input: Inputs) {
  const {
    cacheOwnerId,
    currentWord,
    currentMode,
    enabledModes,
    contentLanguageCode,
    translationTargetLanguageCode,
    queueTurn,
    cardFilter,
    reviewCounter,
    newReviewRatio,
    selectNext,
    audioEnabled,
    preloadAudio,
  } = input;
  const tokenRef = useRef(0);
  const [nextTransitionId, setNextTransitionId] = useState<string | null>(null);
  const candidateRef = useRef<PreparedNextTrainingTurn | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const activeTransitionIdRef = useRef<string | null>(null);
  const ownedForCardKeyRef = useRef<string | null>(null);
  const trainingV2Enabled = platformV2TrainingUiEnabled();

  const warmWord = useCallback(
    async (
      word: TrainingWord,
      signal?: AbortSignal,
      transitionId = createTrainingTransitionId(),
    ) => {
      const mode = word.mode ?? enabledModes[0] ?? "word-to-definition";
      if (!trainingV2Enabled || !isPlatformV2TrainingMode(mode)) return true;
      try {
        const preparation = {
          cacheOwnerId,
          entryId: word.id,
          cardTypeId: mode,
          contentLanguageCode,
          translationTargetLanguageCode,
          transitionId,
          generateMissingTranslation: true,
          signal,
        };
        const lookupRequest = prefetchPlatformV2TrainingEntry(preparation);
        void preparePlatformV2TrainingEntry(preparation).catch(() => undefined);
        const lookup = await lookupRequest;
        return !signal?.aborted && lookup.state === "ready";
      } catch {
        return false;
      }
    }, [
      cacheOwnerId,
      contentLanguageCode,
      enabledModes,
      translationTargetLanguageCode,
      trainingV2Enabled,
    ],
  );

  const cancelCurrent = useCallback(() => {
    tokenRef.current += 1;
    if (controllerRef.current && activeTransitionIdRef.current) {
      recordTrainingTransitionTiming({
        transitionId: activeTransitionIdRef.current,
        stage: "next-card.preparation",
        durationMs: 0,
        outcome: "cancelled",
      });
    }
    controllerRef.current?.abort();
    controllerRef.current = null;
    activeTransitionIdRef.current = null;
    candidateRef.current = null;
    setNextTransitionId(null);
  }, []);

  const reset = useCallback(() => {
    ownedForCardKeyRef.current = null;
    cancelCurrent();
  }, [cancelCurrent]);

  const consumeForCard = useCallback((cardKey: string) => {
    const candidate = candidateRef.current;
    if (!candidate || candidate.forCardKey !== cardKey) {
      // Acceptance closes preparation for the card being left even when its
      // candidate has not materialized. The on-demand fallback is now the sole
      // owner of next-card selection, so abort and invalidate the old chain.
      cancelCurrent();
      ownedForCardKeyRef.current = cardKey;
      return null;
    }
    candidateRef.current = null;
    // The accepted transition now owns this in-flight preparation. Detach its
    // controller so the next queue-turn effect cannot abort work that the
    // current transition is explicitly waiting for.
    controllerRef.current = null;
    activeTransitionIdRef.current = null;
    ownedForCardKeyRef.current = cardKey;
    return candidate;
  }, [cancelCurrent]);

  useEffect(() => {
    if (!currentWord?.id) return;
    const forWordId = currentWord.id;
    const forCardKey = `${forWordId}:${currentWord.mode ?? currentMode}`;
    if (ownedForCardKeyRef.current === forCardKey) return;
    ownedForCardKeyRef.current = null;
    cancelCurrent();
    const predictedQueueTurn = predictNextQueueTurn({
      cardFilter,
      queueTurn,
      reviewCounter,
      newReviewRatio,
    });
    const transitionId = createTrainingTransitionId();
    setNextTransitionId(transitionId);
    const token = tokenRef.current;
    const controller = new AbortController();
    controllerRef.current = controller;
    activeTransitionIdRef.current = transitionId;

    void measureTrainingTransitionStage(
      transitionId,
      "next-card.selection",
      () => selectNext(predictedQueueTurn, forCardKey),
      (selected) => (selected ? "ready" : "empty"),
    ).then((word) => {
      if (!word || controller.signal.aborted || tokenRef.current !== token) return;
      const mode = word.mode ?? enabledModes[0] ?? "word-to-definition";
      const v2Ready =
        trainingV2Enabled && isPlatformV2TrainingMode(mode)
          ? warmWord(word, controller.signal, transitionId)
          : null;
      candidateRef.current = {
        forWordId,
        forCardKey,
        queueTurn: predictedQueueTurn,
        word,
        v2Ready,
        transitionId,
      };
      if (audioEnabled) preloadAudio(word);
    }).catch(() => undefined);

    return cancelCurrent;
  }, [
    audioEnabled,
    cardFilter,
    currentMode,
    currentWord,
    enabledModes,
    newReviewRatio,
    preloadAudio,
    queueTurn,
    reviewCounter,
    selectNext,
    cancelCurrent,
    trainingV2Enabled,
    warmWord,
  ]);

  return {
    warmWord,
    consumeForCard,
    reset,
    nextTransitionId,
  };
}

function isPlatformV2TrainingMode(
  mode: TrainingMode,
): mode is "word-to-definition" | "definition-to-word" {
  return mode === "word-to-definition" || mode === "definition-to-word";
}
