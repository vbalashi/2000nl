"use client";
import { useEffect, useState } from "react";
import { readIdiomTrainingStats } from "@/lib/training/idiomStatsClient";
import type { PlatformTrainingExerciseStatsV1 } from "../../../../../packages/shared/types/platformV2";

type Snapshot = {
  sessionId: string;
  stats: PlatformTrainingExerciseStatsV1 | null;
  status: "pending" | "ready" | "error";
  initialReviewDue: number | null;
};

/** Independent of content readiness; late replies cannot replace another run. */
export function useIdiomTrainingStats(sessionId: string, acceptedActions: number) {
  const [snapshot, setSnapshot] = useState<Snapshot>({
    sessionId, stats: null, status: "pending", initialReviewDue: null,
  });
  useEffect(() => {
    let current = true;
    void readIdiomTrainingStats(sessionId).then(
      (stats) => {
        if (!current) return;
        setSnapshot((previous) => ({
          sessionId, stats, status: "ready",
          initialReviewDue: previous.sessionId === sessionId && previous.initialReviewDue !== null
            ? previous.initialReviewDue : stats.reviewCardsDone + stats.reviewCardsDue,
        }));
      },
      () => {
        if (!current) return;
        setSnapshot((previous) => ({
          sessionId, stats: null, status: "error",
          initialReviewDue: previous.sessionId === sessionId ? previous.initialReviewDue : null,
        }));
      },
    );
    return () => { current = false; };
  }, [sessionId, acceptedActions]);
  return snapshot.sessionId === sessionId ? snapshot : {
    sessionId, stats: null, status: "pending" as const, initialReviewDue: null,
  };
}
