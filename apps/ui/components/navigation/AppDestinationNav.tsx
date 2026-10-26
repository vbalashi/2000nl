"use client";

import React, { useLayoutEffect, useRef, useState } from "react";
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
  variant?: "bar" | "tabs";
  onNavigate: (destination: AppDestination) => void;
};

export function AppDestinationNav({
  active,
  interfaceLanguage,
  disabled = false,
  variant = "bar",
  onNavigate,
}: Props) {
  const destinations: PrimaryNavigationDestination[] = [
    "training",
    "library",
    "statistics",
  ];
  const navRef = useRef<HTMLElement>(null);
  const [indicator, setIndicator] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const measure = () => {
      const button = nav.querySelector<HTMLButtonElement>(
        'button[aria-current="page"]',
      );
      if (!button || !button.offsetWidth) {
        setIndicator(null);
        return;
      }
      setIndicator({
        x: button.offsetLeft,
        y: button.offsetTop,
        width: button.offsetWidth,
        height: button.offsetHeight,
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(nav);
    for (const button of nav.querySelectorAll("button"))
      observer.observe(button);
    return () => observer.disconnect();
  }, [active, interfaceLanguage, variant]);
  return (
    <nav
      ref={navRef}
      lang={interfaceLanguage}
      aria-label={getUiMessages(interfaceLanguage).navigation.primary}
      className={variant === "tabs" ? styles.tabBarNav : styles.primaryNav}
    >
      {indicator ? (
        <span
          aria-hidden="true"
          data-testid="navigation-selection"
          className={styles.selection}
          style={{
            transform: `translate(${indicator.x}px,${indicator.y}px)`,
            width: indicator.width,
            height: indicator.height,
          }}
        />
      ) : null}
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
