"use client";

import React, { useCallback, useEffect, useState } from "react";
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

type Props = {
  user: User;
  startupSnapshot: TrainingStartupSnapshot;
};

export function TrainingLibraryShell({ user, startupSnapshot }: Props) {
  const [destination, setDestination] = useState<AppDestination>(
    destinationFromLocation,
  );
  const [navigationBlocked, setNavigationBlocked] = useState(false);

  const requestDestination = useCallback(
    (nextDestination: AppDestination) => {
      if (navigationBlocked || nextDestination === destination) return;
      window.history.pushState(
        {},
        "",
        appDestinationUrl(window.location.href, nextDestination),
      );
      setDestination(nextDestination);
    },
    [destination, navigationBlocked],
  );

  const returnFromHistory = useCallback(() => {
    if (destination !== TRAINING_HISTORY_DESTINATION) return;
    window.history.replaceState(
      {},
      "",
      appDestinationUrl(window.location.href, "training"),
    );
    setDestination("training");
  }, [destination]);

  useEffect(() => {
    const rawDestination = new URL(window.location.href).searchParams.get(
      "destination",
    );
    const normalized = parseAppDestination(rawDestination);
    if (rawDestination && normalized === "training") {
      window.history.replaceState(
        {},
        "",
        appDestinationUrl(window.location.href, "training"),
      );
    }
  }, []);

  useEffect(() => {
    const handlePopState = () => {
      const nextDestination = destinationFromLocation();
      if (navigationBlocked && nextDestination !== destination) {
        window.history.replaceState(
          {},
          "",
          appDestinationUrl(window.location.href, destination),
        );
        return;
      }
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
