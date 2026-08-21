"use client";

import React, { useMemo } from "react";
import { ChartNoAxesColumn, Library, Play } from "lucide-react";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import type {
  AppDestination,
  PrimaryNavigationDestination,
} from "./appDestination";

const labels: Record<
  OnboardingLanguage,
  Record<PrimaryNavigationDestination, string>
> = {
  nl: {
    training: "Training",
    library: "Bibliotheek",
    statistics: "Statistieken",
  },
  en: { training: "Training", library: "Library", statistics: "Statistics" },
  ru: {
    training: "Тренировка",
    library: "Библиотека",
    statistics: "Статистика",
  },
};

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
  extendedDestinationsEnabled?: boolean;
  variant?: "desktop" | "mobile-tabs";
  onNavigate: (destination: AppDestination) => void;
};

export function AppDestinationNav({
  active,
  interfaceLanguage,
  disabled = false,
  extendedDestinationsEnabled = true,
  variant = "desktop",
  onNavigate,
}: Props) {
  const destinations = useMemo<Array<PrimaryNavigationDestination>>(
    () =>
      extendedDestinationsEnabled
        ? ["training", "library", "statistics"]
        : ["training", "library"],
    [extendedDestinationsEnabled],
  );
  return (
    <nav
      aria-label="Primary"
      data-variant={variant}
      className={`${
        variant === "mobile-tabs"
          ? "flex w-full gap-0 min-[360px]:gap-1 md:hidden"
          : "hidden items-center gap-1 md:flex"
      } rounded-xl border border-slate-200 bg-slate-100/80 p-1 text-sm dark:border-slate-700 dark:bg-slate-800/80`}
    >
      {destinations.map((destination) => (
        <button
          key={destination}
          type="button"
          disabled={disabled}
          aria-current={active === destination ? "page" : undefined}
          onClick={() => onNavigate(destination)}
          className={`flex min-h-9 items-center gap-2 rounded-lg font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
            variant === "mobile-tabs"
              ? "min-w-0 flex-1 justify-center px-1 text-[11px] min-[360px]:px-3 min-[360px]:text-sm"
              : "px-3"
          } ${
            active === destination
              ? "bg-white text-slate-950 shadow-sm dark:bg-slate-700 dark:text-white"
              : "text-slate-500 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
          }`}
        >
          {variant === "desktop" ? (
            <DestinationIcon destination={destination} />
          ) : null}
          {labels[interfaceLanguage][destination]}
        </button>
      ))}
    </nav>
  );
}

export function MobileAppDestinationNav(
  props: Omit<Props, "variant">,
) {
  return (
    <div className="flex-none border-t border-slate-200 bg-white/90 px-3 py-2 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90 md:hidden">
      <AppDestinationNav {...props} variant="mobile-tabs" />
    </div>
  );
}
