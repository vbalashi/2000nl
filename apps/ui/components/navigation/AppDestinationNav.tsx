"use client";

import React from "react";
import { ChartNoAxesColumn, Library, Play } from "lucide-react";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import { getUiMessages } from "@/lib/uiMessages";
import type {
  AppDestination,
  PrimaryNavigationDestination,
} from "./appDestination";
import styles from "./AppFrame.module.css";

export function appDestinationLabel(
  interfaceLanguage: OnboardingLanguage,
  destination: AppDestination,
) {
  return getUiMessages(interfaceLanguage).navigation[destination];
}

function DestinationIcon({
  destination,
}: {
  destination: PrimaryNavigationDestination;
}) {
  const iconProps = { "aria-hidden": true } as const;
  if (destination === "training") return <Play {...iconProps} />;
  if (destination === "library") return <Library {...iconProps} />;
  return <ChartNoAxesColumn {...iconProps} />;
}

type Props = {
  active: PrimaryNavigationDestination | null;
  interfaceLanguage: OnboardingLanguage;
  disabled?: boolean;
  onNavigate: (destination: AppDestination) => void;
};

export function AppDestinationNav({
  active,
  interfaceLanguage,
  disabled = false,
  onNavigate,
}: Props) {
  const destinations: PrimaryNavigationDestination[] = [
    "training",
    "library",
    "statistics",
  ];
  return (
    <nav
      lang={interfaceLanguage}
      aria-label={getUiMessages(interfaceLanguage).navigation.primary}
      className={styles.primaryNav}
    >
      {destinations.map((destination) => (
        <button
          key={destination}
          type="button"
          disabled={disabled}
          aria-current={active === destination ? "page" : undefined}
          onClick={() => onNavigate(destination)}
        >
          <DestinationIcon destination={destination} />
          {appDestinationLabel(interfaceLanguage, destination)}
        </button>
      ))}
    </nav>
  );
}
