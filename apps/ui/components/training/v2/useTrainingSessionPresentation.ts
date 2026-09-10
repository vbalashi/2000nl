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
  sessionGeneration,
  scopeKey,
  planSnapshot,
  planOverride = null,
  resetKey,
}: {
  surface: TrainingSurface;
  presentedCardKey: string | null;
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
  const [actualCardOrdinal, setActualCardOrdinal] = React.useState(1);
  const [acceptedTotal, setAcceptedTotal] = React.useState<number | null>(null);
  const previousSurfaceRef = React.useRef(surface);
  const previousSessionGenerationRef = React.useRef(sessionGeneration);
  const previousResetKeyRef = React.useRef(resetKey);
  const previousCardKeyRef = React.useRef<string | null>(null);
  const isEnteringSession =
    previousSurfaceRef.current !== "session" && surface === "session";

  React.useEffect(() => {
    const enteringSession =
      previousSurfaceRef.current !== "session" && surface === "session";
    const sessionRestarted =
      previousSessionGenerationRef.current !== sessionGeneration;
    const explicitReset = previousResetKeyRef.current !== resetKey;
    previousSurfaceRef.current = surface;
    previousSessionGenerationRef.current = sessionGeneration;
    previousResetKeyRef.current = resetKey;

    if (surface !== "session") {
      previousCardKeyRef.current = null;
      return;
    }
    if (!enteringSession && !sessionRestarted && !explicitReset) return;

    setActualCardOrdinal(1);
    setAcceptedTotal(normalizePlannedTotal(plannedTotal));
    previousCardKeyRef.current = presentedCardKey;
  }, [plannedTotal, presentedCardKey, resetKey, sessionGeneration, surface]);

  React.useEffect(() => {
    if (surface !== "session" || acceptedTotal !== null) return;
    const nextTotal = normalizePlannedTotal(plannedTotal);
    if (nextTotal !== null) setAcceptedTotal(nextTotal);
  }, [acceptedTotal, plannedTotal, surface]);

  React.useEffect(() => {
    if (surface !== "session" || !presentedCardKey) return;
    const previousCardKey = previousCardKeyRef.current;
    if (previousCardKey && previousCardKey !== presentedCardKey) {
      setActualCardOrdinal((ordinal) => ordinal + 1);
    }
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
