"use client";

import React from "react";

type TrainingSurface = "today" | "setup" | "session";

const normalizePlannedTotal = (value: number | null | undefined) =>
  typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : null;

export function useTrainingSessionPresentation({
  surface,
  presentedCardKey,
  plannedTotal,
  sessionKey = "default",
  onEnterSession,
}: {
  surface: TrainingSurface;
  presentedCardKey: string | null;
  plannedTotal?: number | null;
  /** Exact modes/list/filter fingerprint. A change starts a new plan. */
  sessionKey?: string;
  onEnterSession: () => void;
}) {
  const [cardOrdinal, setCardOrdinal] = React.useState(1);
  const [acceptedTotal, setAcceptedTotal] = React.useState<number | null>(() =>
    normalizePlannedTotal(plannedTotal),
  );
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
    setCardOrdinal(1);
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
      setCardOrdinal((ordinal) => ordinal + 1);
    }
    previousCardKeyRef.current = presentedCardKey;
  }, [presentedCardKey, surface]);

  return {
    cardOrdinal,
    progress:
      surface === "session" && acceptedTotal !== null && acceptedTotal > 0
        ? {
            position: Math.min(cardOrdinal, acceptedTotal),
            total: acceptedTotal,
            fraction: Math.min(cardOrdinal / acceptedTotal, 1),
          }
        : null,
    isSubsequentCard:
      surface === "session" && !isEnteringSession && cardOrdinal > 1,
  };
}
