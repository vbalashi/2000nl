"use client";

import React, { useCallback, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { TrainingScreen } from "@/components/training/TrainingScreen";
import type { AppDestination } from "./appDestination";

export type { AppDestination } from "./appDestination";

const navigationShellEnabled =
  process.env.NEXT_PUBLIC_NAVIGATION_SHELL_V1 === "true";

const destinationFromLocation = (): AppDestination => {
  if (typeof window === "undefined") return "training";
  return new URL(window.location.href).searchParams.get("destination") ===
    "library"
    ? "library"
    : "training";
};

const destinationUrl = (destination: AppDestination) => {
  const url = new URL(window.location.href);
  if (destination === "library") {
    url.searchParams.set("destination", "library");
  } else {
    url.searchParams.delete("destination");
  }
  return `${url.pathname}${url.search}${url.hash}`;
};

type Props = {
  user: User;
  enabled?: boolean;
};

export function TrainingLibraryShell({
  user,
  enabled = navigationShellEnabled,
}: Props) {
  const [destination, setDestination] = useState<AppDestination>(() =>
    enabled ? destinationFromLocation() : "training",
  );
  const [navigationBlocked, setNavigationBlocked] = useState(false);

  const requestDestination = useCallback(
    (nextDestination: AppDestination) => {
      if (navigationBlocked || nextDestination === destination) return;
      window.history.pushState({}, "", destinationUrl(nextDestination));
      setDestination(nextDestination);
    },
    [destination, navigationBlocked],
  );

  useEffect(() => {
    if (!enabled) return;

    const handlePopState = () => {
      const nextDestination = destinationFromLocation();
      if (navigationBlocked && nextDestination !== destination) {
        window.history.replaceState({}, "", destinationUrl(destination));
        return;
      }
      setDestination(nextDestination);
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [destination, enabled, navigationBlocked]);

  if (!enabled) {
    return <TrainingScreen user={user} />;
  }

  return (
    <TrainingScreen
      user={user}
      destination={destination}
      onRequestDestination={requestDestination}
      onNavigationBlockedChange={setNavigationBlocked}
    />
  );
}
