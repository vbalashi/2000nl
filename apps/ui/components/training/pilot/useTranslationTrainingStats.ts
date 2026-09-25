"use client";
import { useEffect, useState } from "react";
import type { PlatformTrainingExerciseStatsV1 } from "../../../../../packages/shared/types/platformV2";
import { readTranslationTrainingStats } from "@/lib/training/translationStatsClient";

export function useTranslationTrainingStats(sessionId: string, acceptedActions: number) {
  const [snapshot, setSnapshot] = useState<{ sessionId: string; stats: PlatformTrainingExerciseStatsV1 | null; status: "pending" | "ready" | "error"; initialReviewDue: number | null }>({ sessionId, stats: null, status: "pending", initialReviewDue: null });
  useEffect(() => {
    let current = true;
    void readTranslationTrainingStats(sessionId).then((stats) => {
      if (!current) return;
      setSnapshot((previous) => ({ sessionId, stats, status: "ready", initialReviewDue: previous.sessionId === sessionId && previous.initialReviewDue !== null ? previous.initialReviewDue : stats.reviewCardsDone + stats.reviewCardsDue }));
    }, () => {
      if (current) setSnapshot((previous) => ({ sessionId, stats: null, status: "error", initialReviewDue: previous.sessionId === sessionId ? previous.initialReviewDue : null }));
    });
    return () => { current = false; };
  }, [sessionId, acceptedActions]);
  return snapshot.sessionId === sessionId ? snapshot : { sessionId, stats: null, status: "pending" as const, initialReviewDue: null };
}
