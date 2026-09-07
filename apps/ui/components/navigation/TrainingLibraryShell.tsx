"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { TrainingScreen } from "@/components/training/TrainingScreen";
import type { TrainingStartupSnapshot } from "@/lib/training/trainingStartupSnapshot";
import {
  appDestinationUrl,
  parseAppDestination,
  TRAINING_HISTORY_DESTINATION,
  type AppDestination,
} from "./appDestination";

export type { AppDestination } from "./appDestination";

const destinationFromLocation = (): AppDestination => {
  if (typeof window === "undefined") return "training";
  return parseAppDestination(
    new URL(window.location.href).searchParams.get("destination"),
  );
};

const HISTORY_POSITION_KEY = "__2000nlAppPosition";

function historyPosition(state: unknown): number | null {
  if (!state || typeof state !== "object") return null;
  const value = (state as Record<string, unknown>)[HISTORY_POSITION_KEY];
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

function stateAtPosition(position: number) {
  const existing =
    window.history.state && typeof window.history.state === "object"
      ? window.history.state
      : {};
  return { ...existing, [HISTORY_POSITION_KEY]: position };
}

type Props = {
  user: User;
  startupSnapshot: TrainingStartupSnapshot;
};

export function TrainingLibraryShell({ user, startupSnapshot }: Props) {
  const [destination, setDestination] = useState<AppDestination>(
    destinationFromLocation,
  );
  const [navigationBlocked, setNavigationBlocked] = useState(false);
  const historyPositionRef = useRef(0);

  const requestDestination = useCallback(
    (nextDestination: AppDestination) => {
      if (navigationBlocked || nextDestination === destination) return;
      const nextPosition = historyPositionRef.current + 1;
      window.history.pushState(
        stateAtPosition(nextPosition),
        "",
        appDestinationUrl(window.location.href, nextDestination),
      );
      historyPositionRef.current = nextPosition;
      setDestination(nextDestination);
    },
    [destination, navigationBlocked],
  );

  const returnFromHistory = useCallback(() => {
    if (destination !== TRAINING_HISTORY_DESTINATION) return;
    window.history.replaceState(
      stateAtPosition(historyPositionRef.current),
      "",
      appDestinationUrl(window.location.href, "training"),
    );
    setDestination("training");
  }, [destination]);

  useEffect(() => {
    const existingPosition = historyPosition(window.history.state);
    if (existingPosition === null) {
      window.history.replaceState(
        stateAtPosition(0),
        "",
        window.location.href,
      );
      historyPositionRef.current = 0;
    } else {
      historyPositionRef.current = existingPosition;
    }

    const rawDestination = new URL(window.location.href).searchParams.get(
      "destination",
    );
    const normalized = parseAppDestination(rawDestination);
    if (rawDestination && normalized === "training") {
      window.history.replaceState(
        stateAtPosition(historyPositionRef.current),
        "",
        appDestinationUrl(window.location.href, "training"),
      );
    }
  }, []);

  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      const nextDestination = destinationFromLocation();
      const nextPosition = historyPosition(event.state);
      if (navigationBlocked && nextDestination !== destination) {
        if (
          nextPosition !== null &&
          nextPosition !== historyPositionRef.current
        ) {
          window.history.go(historyPositionRef.current - nextPosition);
        } else {
          // Unknown entries (for example a link created outside this shell) are
          // left intact. Add the current destination back on top instead of
          // overwriting the entry the user may want to return to later.
          window.history.pushState(
            stateAtPosition(historyPositionRef.current),
            "",
            appDestinationUrl(window.location.href, destination),
          );
        }
        return;
      }
      if (nextPosition !== null) historyPositionRef.current = nextPosition;
      setDestination(nextDestination);
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [destination, navigationBlocked]);

  return (
    <TrainingScreen
      user={user}
      startupSnapshot={startupSnapshot}
      destination={destination}
      onRequestDestination={requestDestination}
      onReturnFromHistory={returnFromHistory}
      onNavigationBlockedChange={setNavigationBlocked}
    />
  );
}
