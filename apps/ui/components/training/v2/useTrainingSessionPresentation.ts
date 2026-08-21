"use client";

import React from "react";
import type { TrainingSessionPlanSnapshot } from "./useTrainingSessionPlan";

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
  onEnterSession,
}: {
  surface: TrainingSurface;
  presentedCardKey: string | null;
  sessionGeneration: number;
  scopeKey: string;
  planSnapshot: TrainingSessionPlanSnapshot | null;
  onEnterSession: () => void;
}): TrainingSessionPresentation {
  const currentPlan =
    planSnapshot?.sessionGeneration === sessionGeneration &&
    planSnapshot.scopeKey === scopeKey
      ? planSnapshot.plan
      : null;
  const plannedTotal = currentPlan?.plannedTotal ?? null;
  const sessionKey = `${sessionGeneration}:${scopeKey}`;
  const [actualCardOrdinal, setActualCardOrdinal] = React.useState(1);
  const [acceptedTotal, setAcceptedTotal] = React.useState<number | null>(null);
  const previousSurfaceRef = React.useRef(surface);
  const previousSessionKeyRef = React.useRef(sessionKey);
  const previousCardKeyRef = React.useRef<string | null>(null);
  const isEnteringSession =
    previousSurfaceRef.current !== "session" && surface === "session";

  React.useEffect(() => {
    const enteringSession =
      previousSurfaceRef.current !== "session" && surface === "session";
    const scopeChanged = previousSessionKeyRef.current !== sessionKey;
    previousSurfaceRef.current = surface;
    previousSessionKeyRef.current = sessionKey;

    if (surface !== "session") {
      previousCardKeyRef.current = null;
      return;
    }
    if (!enteringSession && !scopeChanged) return;

    onEnterSession();
    setActualCardOrdinal(1);
    setAcceptedTotal(normalizePlannedTotal(plannedTotal));
    previousCardKeyRef.current = presentedCardKey;
  }, [onEnterSession, plannedTotal, presentedCardKey, sessionKey, surface]);

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
