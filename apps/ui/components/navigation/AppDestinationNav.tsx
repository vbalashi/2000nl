"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ChartNoAxesColumn,
  Check,
  ChevronDown,
  Library,
  Play,
} from "lucide-react";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import type { AppDestination } from "./appDestination";

const labels: Record<
  OnboardingLanguage,
  Record<Exclude<AppDestination, "settings">, string>
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

const selectorLabels: Record<OnboardingLanguage, string> = {
  nl: "Kies bestemming",
  en: "Choose destination",
  ru: "Выбрать раздел",
};

function DestinationIcon({
  destination,
}: {
  destination: Exclude<AppDestination, "settings">;
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
  active: Exclude<AppDestination, "settings"> | null;
  interfaceLanguage: OnboardingLanguage;
  disabled?: boolean;
  extendedDestinationsEnabled?: boolean;
  mobileVariant?: "selector" | "tabs";
  onNavigate: (destination: AppDestination) => void;
};

export function AppDestinationNav({
  active,
  interfaceLanguage,
  disabled = false,
  extendedDestinationsEnabled = true,
  mobileVariant = "selector",
  onNavigate,
}: Props) {
  const [selectorOpen, setSelectorOpen] = useState(false);
  const selectorRef = useRef<HTMLDivElement | null>(null);
  const selectorTriggerRef = useRef<HTMLButtonElement | null>(null);
  const menuItemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const destinations = useMemo<
    Array<Exclude<AppDestination, "settings">>
  >(
    () =>
      extendedDestinationsEnabled
        ? ["training", "library", "statistics"]
        : ["training", "library"],
    [extendedDestinationsEnabled],
  );
  const selectorLabel = selectorLabels[interfaceLanguage];
  const activeLabel = active ? labels[interfaceLanguage][active] : null;

  useEffect(() => {
    if (!selectorOpen) return;
    const closeOutside = (event: MouseEvent | TouchEvent) => {
      if (!selectorRef.current?.contains(event.target as Node)) {
        setSelectorOpen(false);
      }
    };
    window.addEventListener("mousedown", closeOutside);
    window.addEventListener("touchstart", closeOutside);
    return () => {
      window.removeEventListener("mousedown", closeOutside);
      window.removeEventListener("touchstart", closeOutside);
    };
  }, [selectorOpen]);

  useEffect(() => {
    if (!selectorOpen) return;
    const activeIndex = Math.max(0, destinations.indexOf(active ?? "training"));
    window.requestAnimationFrame(() => menuItemRefs.current[activeIndex]?.focus());
  }, [active, destinations, selectorOpen]);

  const closeSelector = (restoreFocus = false) => {
    setSelectorOpen(false);
    if (restoreFocus) {
      window.requestAnimationFrame(() => selectorTriggerRef.current?.focus());
    }
  };

  const handleMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const currentIndex = menuItemRefs.current.findIndex(
      (item) => item === document.activeElement,
    );
    let nextIndex: number | null = null;
    if (event.key === "ArrowDown") {
      nextIndex = (currentIndex + 1) % destinations.length;
    } else if (event.key === "ArrowUp") {
      nextIndex =
        (currentIndex - 1 + destinations.length) % destinations.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = destinations.length - 1;
    } else if (event.key === "Escape") {
      event.preventDefault();
      closeSelector(true);
      return;
    } else if (event.key === "Tab") {
      event.preventDefault();
      const trigger = selectorTriggerRef.current;
      const headerButtons = trigger
        ? Array.from(
            trigger.closest("header")?.querySelectorAll<HTMLButtonElement>(
              'button:not([role="menuitem"]):not(:disabled)',
            ) ?? [],
          )
        : [];
      const triggerIndex = trigger ? headerButtons.indexOf(trigger) : -1;
      const target = event.shiftKey
        ? trigger
        : headerButtons[triggerIndex + 1] ?? trigger;
      closeSelector();
      window.requestAnimationFrame(() => target?.focus());
      return;
    }
    if (nextIndex === null) return;
    event.preventDefault();
    menuItemRefs.current[nextIndex]?.focus();
  };

  return (
    <>
      <nav
        aria-label="Primary"
        className={`${mobileVariant === "tabs" ? "flex w-full gap-0 min-[360px]:gap-1" : "hidden items-center gap-1 md:flex"} rounded-xl border border-slate-200 bg-slate-100/80 p-1 text-sm dark:border-slate-700 dark:bg-slate-800/80`}
      >
        {destinations.map((destination) => (
          <button
            key={destination}
            type="button"
            disabled={disabled}
            aria-current={active === destination ? "page" : undefined}
            onClick={() => onNavigate(destination)}
            className={`flex min-h-9 items-center gap-2 rounded-lg font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
              mobileVariant === "tabs"
                ? "min-w-0 flex-1 justify-center px-1 text-[11px] min-[360px]:px-3 min-[360px]:text-sm"
                : "px-3"
            } ${
              active === destination
                ? "bg-white text-slate-950 shadow-sm dark:bg-slate-700 dark:text-white"
                : "text-slate-500 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
            }`}
          >
            {mobileVariant === "tabs" ? null : (
              <DestinationIcon destination={destination} />
            )}
            {labels[interfaceLanguage][destination]}
          </button>
        ))}
      </nav>

      {mobileVariant === "selector" ? (
        <div ref={selectorRef} className="relative md:hidden">
          <button
            ref={selectorTriggerRef}
            type="button"
            disabled={disabled}
            aria-label={`${selectorLabel}${activeLabel ? `: ${activeLabel}` : ""}`}
            aria-haspopup="menu"
            aria-expanded={selectorOpen}
            onClick={() => setSelectorOpen((open) => !open)}
            className="flex h-9 w-[132px] items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800 shadow-sm transition hover:border-slate-400 focus-visible:border-indigo-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-200 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus-visible:ring-indigo-900"
          >
            {active ? <DestinationIcon destination={active} /> : null}
            <span className="min-w-0 flex-1 truncate text-left">
              {activeLabel ?? selectorLabel}
            </span>
            <ChevronDown
              aria-hidden="true"
              className={`h-4 w-4 shrink-0 transition-transform ${selectorOpen ? "rotate-180" : ""}`}
            />
          </button>
          {selectorOpen ? (
            <div
              role="menu"
              aria-label={selectorLabel}
              onKeyDown={handleMenuKeyDown}
              className="absolute left-1/2 z-50 mt-2 w-[180px] -translate-x-1/2 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl dark:border-slate-700 dark:bg-slate-900"
            >
              {destinations.map((destination, index) => (
                <button
                  ref={(node) => {
                    menuItemRefs.current[index] = node;
                  }}
                  key={destination}
                  type="button"
                  role="menuitem"
                  tabIndex={-1}
                  aria-current={active === destination ? "page" : undefined}
                  onClick={() => {
                    closeSelector();
                    onNavigate(destination);
                  }}
                  className={`flex min-h-10 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-semibold transition ${
                    active === destination
                      ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-200"
                      : "text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
                  }`}
                >
                  <DestinationIcon destination={destination} />
                  <span className="flex-1">
                    {labels[interfaceLanguage][destination]}
                  </span>
                  {active === destination ? (
                    <Check
                      aria-hidden="true"
                      className="h-4 w-4"
                    />
                  ) : null}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
