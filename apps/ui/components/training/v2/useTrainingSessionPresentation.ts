"use client";

import React from "react";
import type { TrainingSessionPlanSnapshot } from "./useTrainingSessionPlan";
import type { TrainingSessionPlan } from "@/lib/types";

type TrainingSurface = "today" | "setup" | "session";

export type TrainingSessionPresentationSnapshot =
  | { kind: "ordinal"; position: number }
  | { kind: "planned"; position: number; total: number; fraction: number };

export type TrainingSessionPresentation = {
  presentation: TrainingSessionPresentationSnapshot;
  isSubsequentCard: boolean;
};

const normalizePlannedTotal = (value: number | null | undefined) =>
  typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : null;

export function useTrainingSessionPresentation({
  surface,
  presentedCardKey,
  consumedCardCount = 0,
  sessionGeneration,
  scopeKey,
  planSnapshot,
  planOverride = null,
  resetKey,
}: {
  surface: TrainingSurface;
  presentedCardKey: string | null;
  /** Number of session members already consumed before this render (resume). */
  consumedCardCount?: number;
  sessionGeneration: number;
  scopeKey: string;
  planSnapshot: TrainingSessionPlanSnapshot | null;
  /** A server-latched plan takes precedence over any later dynamic estimate. */
  planOverride?: TrainingSessionPlan | null;
  /**
   * Explicit reset token owned by TrainingScreen; scope hydration alone is not
   * a reset.
   */
  resetKey: number;
}): TrainingSessionPresentation {
  const currentPlan = planOverride ?? (
    planSnapshot?.sessionGeneration === sessionGeneration &&
    planSnapshot.scopeKey === scopeKey
      ? planSnapshot.plan
      : null
  );
  const plannedTotal = currentPlan?.plannedTotal ?? null;
  const [actualCardOrdinal, setActualCardOrdinal] = React.useState(() =>
    Math.max(1, consumedCardCount + 1),
  );
  const [acceptedTotal, setAcceptedTotal] = React.useState<number | null>(null);
  const previousSurfaceRef = React.useRef(surface);
  const previousSessionGenerationRef = React.useRef(sessionGeneration);
  const previousResetKeyRef = React.useRef(resetKey);
  const previousConsumedCardCountRef = React.useRef(consumedCardCount);
  const previousCardKeyRef = React.useRef<string | null>(null);
  const isEnteringSession =
    previousSurfaceRef.current !== "session" && surface === "session";

  React.useEffect(() => {
    const enteringSession =
      previousSurfaceRef.current !== "session" && surface === "session";
    const sessionRestarted =
      previousSessionGenerationRef.current !== sessionGeneration;
    const explicitReset = previousResetKeyRef.current !== resetKey;
    const acceptedCardCountChanged =
      previousConsumedCardCountRef.current !== consumedCardCount;
    const lateResumeHydration =
      surface === "session" &&
      previousConsumedCardCountRef.current === 0 &&
      consumedCardCount > 0 &&
      previousCardKeyRef.current === null;
    previousSurfaceRef.current = surface;
    previousSessionGenerationRef.current = sessionGeneration;
    previousResetKeyRef.current = resetKey;
    previousConsumedCardCountRef.current = consumedCardCount;

    if (surface !== "session") {
      previousCardKeyRef.current = null;
      return;
    }
    const sessionStateReset =
      enteringSession || sessionRestarted || explicitReset || lateResumeHydration;
    if (sessionStateReset) {
      setActualCardOrdinal(Math.max(1, consumedCardCount + 1));
      setAcceptedTotal(normalizePlannedTotal(plannedTotal));
      previousCardKeyRef.current = presentedCardKey;
      return;
    }
    if (surface !== "session" || !acceptedCardCountChanged) return;

    setActualCardOrdinal(Math.max(1, consumedCardCount + 1));
    previousCardKeyRef.current = presentedCardKey;
  }, [
    consumedCardCount,
    plannedTotal,
    presentedCardKey,
    resetKey,
    sessionGeneration,
    surface,
  ]);

  React.useEffect(() => {
    if (surface !== "session" || acceptedTotal !== null) return;
    const nextTotal = normalizePlannedTotal(plannedTotal);
    if (nextTotal !== null) setAcceptedTotal(nextTotal);
  }, [acceptedTotal, plannedTotal, surface]);

  React.useEffect(() => {
    if (surface !== "session" || !presentedCardKey) return;
    previousCardKeyRef.current = presentedCardKey;
  }, [presentedCardKey, surface]);

  return {
    presentation:
      surface === "session" && acceptedTotal !== null && acceptedTotal > 0
        ? {
            kind: "planned",
            position: actualCardOrdinal,
            total: acceptedTotal,
            fraction: Math.min(actualCardOrdinal / acceptedTotal, 1),
          }
        : { kind: "ordinal", position: actualCardOrdinal },
    isSubsequentCard:
      surface === "session" && !isEnteringSession && actualCardOrdinal > 1,
  };
}
