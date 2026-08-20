"use client";

import { useCallback } from "react";
import {
  fetchLastReviewDebug,
  recordReview,
  type ReviewResult,
} from "@/lib/trainingService";
import { trainingDebug } from "@/lib/trainingDebug";
import type {
  DetailedStats,
  TrainingMode,
  TrainingWord,
} from "@/lib/types";
import type { WordStatusAfterReview } from "@/lib/training/reviewService";

export type LegacyTrainingReviewRequest = {
  word: TrainingWord;
  mode: TrainingMode;
  result: ReviewResult;
  turnId: string | null;
};

type Inputs = {
  userId: string;
  stats: DetailedStats;
};

export function useLegacyTrainingReviewPort({
  userId,
  stats,
}: Inputs) {
  return useCallback(
    async ({
      word,
      mode,
      result,
      turnId,
    }: LegacyTrainingReviewRequest): Promise<WordStatusAfterReview | null> => {
      const beforeInterval = word.debugStats?.interval;
      const beforeStability = word.debugStats?.ef;
      const cardSource = word.debugStats?.source ?? "unknown";

      trainingDebug.log(
        `%c 📊 Stats [BEFORE ${word.headword}]:`,
        "color: #8b5cf6; font-weight: bold;",
        `NIEUW: ${stats.newCardsToday}/${stats.dailyNewLimit}`,
        `| HERHALING: ${stats.reviewCardsDone}/${
          stats.reviewCardsDone + stats.reviewCardsDue
        }`,
        `| TOTAAL: ${stats.totalWordsLearned}/${stats.totalWordsInList}`,
      );

      const updatedStatus = await recordReview({
        userId,
        wordId: word.id,
        mode,
        result,
        turnId,
      });

      if (
        updatedStatus &&
        ["fail", "hard", "success", "easy"].includes(result)
      ) {
        await logReviewTransition({
          userId,
          word,
          mode,
          result,
          updatedStatus,
          beforeInterval,
          beforeStability,
          cardSource,
        });
      }

      return updatedStatus;
    },
    [stats, userId],
  );
}

async function logReviewTransition({
  userId,
  word,
  mode,
  result,
  updatedStatus,
  beforeInterval,
  beforeStability,
  cardSource,
}: {
  userId: string;
  word: TrainingWord;
  mode: TrainingMode;
  result: ReviewResult;
  updatedStatus: WordStatusAfterReview;
  beforeInterval?: number;
  beforeStability?: number;
  cardSource: string;
}) {
  const formatDelta = (
    before: number | undefined,
    after: number | null | undefined,
    suffix = "",
  ) => {
    if (before == null && after == null) return null;
    if (before == null) return `→${after?.toFixed(2)}${suffix}`;
    if (after == null) return `${before.toFixed(2)}${suffix}→?`;
    return `${before.toFixed(2)}→${after.toFixed(2)}${suffix}`;
  };

  const intervalDelta = formatDelta(beforeInterval, updatedStatus.interval, "d");
  const stabilityDelta = formatDelta(beforeStability, updatedStatus.stability);
  const isGraduated = (updatedStatus.interval ?? 0) >= 1;
  const graduationNote =
    (cardSource === "new" || cardSource === "learning") && isGraduated
      ? " → GRADUATED to review queue"
      : "";

  trainingDebug.log(
    `%c ✓ Review: ${word.headword} (${cardSource} → ${result})`,
    "color: #10b981; font-weight: bold;",
    intervalDelta ? `int:${intervalDelta}` : "",
    stabilityDelta ? `S:${stabilityDelta}` : "",
    graduationNote,
  );

  if (
    process.env.NODE_ENV !== "production" &&
    process.env.NEXT_PUBLIC_ENABLE_FSRS_DEBUG === "1"
  ) {
    const debug = await fetchLastReviewDebug({ userId, wordId: word.id, mode });
    const meta = debug?.metadata ?? null;
    if (meta) {
      const retrievability =
        typeof meta.retrievability === "number" ? meta.retrievability : undefined;
      const elapsed =
        typeof meta.elapsed_days === "number" ? meta.elapsed_days : undefined;
      const sameDay = typeof meta.same_day === "boolean" ? meta.same_day : undefined;
      trainingDebug.log(
        "%c   ↳ FSRS debug:",
        "color: #6b7280;",
        elapsed != null ? `elapsed=${elapsed.toFixed(4)}d` : "",
        retrievability != null ? `R=${retrievability.toFixed(4)}` : "",
        sameDay != null ? `same_day=${sameDay}` : "",
        debug?.scheduled_at ? `scheduled_at=${debug.scheduled_at}` : "",
        debug?.reviewed_at ? `reviewed_at=${debug.reviewed_at}` : "",
      );
    }
  }

  trainingDebug.log(
    cardSource === "new"
      ? "%c   → review_type='new' logged → NIEUW counter should +1"
      : "%c   → review_type='review' logged → HERHALING done counter should +1",
    "color: #6b7280;",
  );
}
