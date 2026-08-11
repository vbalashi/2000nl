"use client";

import React from "react";

type TrainingSurface = "today" | "setup" | "session";

export function useTrainingSessionPresentation({
  surface,
  presentedCardKey,
  onEnterSession,
}: {
  surface: TrainingSurface;
  presentedCardKey: string | null;
  onEnterSession: () => void;
}) {
  const [cardOrdinal, setCardOrdinal] = React.useState(1);
  const previousSurfaceRef = React.useRef(surface);
  const previousCardKeyRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    const enteringSession =
      previousSurfaceRef.current !== "session" && surface === "session";
    previousSurfaceRef.current = surface;

    if (surface !== "session") {
      previousCardKeyRef.current = null;
      return;
    }
    if (!enteringSession) return;

    onEnterSession();
    setCardOrdinal(1);
    previousCardKeyRef.current = presentedCardKey;
  }, [onEnterSession, presentedCardKey, surface]);

  React.useEffect(() => {
    if (surface !== "session" || !presentedCardKey) return;
    const previousCardKey = previousCardKeyRef.current;
    if (previousCardKey && previousCardKey !== presentedCardKey) {
      setCardOrdinal((ordinal) => ordinal + 1);
    }
    previousCardKeyRef.current = presentedCardKey;
  }, [presentedCardKey, surface]);

  return { cardOrdinal };
}
