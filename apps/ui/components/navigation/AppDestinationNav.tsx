"use client";

import React from "react";
import { ChartNoAxesColumn, Library, Play } from "lucide-react";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import { getUiMessages } from "@/lib/uiMessages";
import type {
  AppDestination,
  PrimaryNavigationDestination,
} from "./appDestination";

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
  const iconProps = {
    "aria-hidden": true,
    className: "h-[15px] w-[15px] shrink-0",
  } as const;
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
      className="flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-100/80 p-1 text-sm dark:border-slate-700 dark:bg-slate-800/80"
    >
      {destinations.map((destination) => (
        <button
          key={destination}
          type="button"
          disabled={disabled}
          aria-current={active === destination ? "page" : undefined}
          onClick={() => onNavigate(destination)}
          className={`flex min-h-9 items-center gap-2 rounded-lg px-3 font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${
            active === destination
              ? "bg-white text-slate-950 shadow-sm dark:bg-slate-700 dark:text-white"
              : "text-slate-500 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
          }`}
        >
          <DestinationIcon destination={destination} />
          {appDestinationLabel(interfaceLanguage, destination)}
        </button>
      ))}
    </nav>
  );
}
