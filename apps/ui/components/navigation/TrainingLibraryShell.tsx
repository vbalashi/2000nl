"use client";

import React, { useCallback, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { TrainingScreen } from "@/components/training/TrainingScreen";
import {
  appDestinationUrl,
  parseAppDestination,
  type AppDestination,
} from "./appDestination";

export type { AppDestination } from "./appDestination";

const navigationShellEnabled =
  process.env.NEXT_PUBLIC_NAVIGATION_SHELL_V1 === "true";
const settingsStatisticsDestinationsEnabled =
  process.env.NEXT_PUBLIC_SETTINGS_STATISTICS_DESTINATIONS_V1 === "true";

const destinationFromLocation = (
  extendedDestinationsEnabled: boolean,
): AppDestination => {
  if (typeof window === "undefined") return "training";
  return parseAppDestination(
    new URL(window.location.href).searchParams.get("destination"),
    extendedDestinationsEnabled,
  );
};

type Props = {
  user: User;
  enabled?: boolean;
  extendedDestinationsEnabled?: boolean;
};

export function TrainingLibraryShell({
  user,
  enabled = navigationShellEnabled,
  extendedDestinationsEnabled = settingsStatisticsDestinationsEnabled,
}: Props) {
  const [destination, setDestination] = useState<AppDestination>(() =>
    enabled ? destinationFromLocation(extendedDestinationsEnabled) : "training",
  );
  const [navigationBlocked, setNavigationBlocked] = useState(false);

  const requestDestination = useCallback(
    (nextDestination: AppDestination) => {
      if (navigationBlocked || nextDestination === destination) return;
      if (
        !extendedDestinationsEnabled &&
        (nextDestination === "statistics" || nextDestination === "settings")
      ) {
        return;
      }
      window.history.pushState(
        {},
        "",
        appDestinationUrl(window.location.href, nextDestination),
      );
      setDestination(nextDestination);
    },
    [destination, extendedDestinationsEnabled, navigationBlocked],
  );

  useEffect(() => {
    if (!enabled) return;
    const rawDestination = new URL(window.location.href).searchParams.get(
      "destination",
    );
    const normalized = parseAppDestination(
      rawDestination,
      extendedDestinationsEnabled,
    );
    if (rawDestination && normalized === "training") {
      window.history.replaceState(
        {},
        "",
        appDestinationUrl(window.location.href, "training"),
      );
    }
  }, [enabled, extendedDestinationsEnabled]);

  useEffect(() => {
    if (!enabled) return;

    const handlePopState = () => {
      const nextDestination = destinationFromLocation(
        extendedDestinationsEnabled,
      );
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
  }, [destination, enabled, extendedDestinationsEnabled, navigationBlocked]);

  if (!enabled) {
    return <TrainingScreen user={user} />;
  }

  return (
    <TrainingScreen
      user={user}
      destination={destination}
      extendedDestinationsEnabled={extendedDestinationsEnabled}
      onRequestDestination={requestDestination}
      onNavigationBlockedChange={setNavigationBlocked}
    />
  );
}
