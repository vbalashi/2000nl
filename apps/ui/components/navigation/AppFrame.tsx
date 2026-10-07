"use client";

import React from "react";
import { BrandLogo } from "@/components/BrandLogo";
import { AppDestinationNav, appDestinationLabel } from "./AppDestinationNav";
import { AppUtilityNav, type AppUtilityNavProps } from "./AppUtilityNav";
import type { AppDestination } from "./appDestination";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import { getUiMessages } from "@/lib/uiMessages";
import type { ThemePreference } from "@/lib/training/useTrainingPreferences";
import styles from "./AppFrame.module.css";

export type AppFrameProps = {
  activeDestination: AppDestination;
  interfaceLanguage: OnboardingLanguage;
  themePreference: ThemePreference;
  settingsActive?: boolean;
  navigationDisabled?: boolean;
  utilitiesDisabled?: boolean;
  /** Active practice session: on narrow screens the app chrome steps aside. */
  immersive?: boolean;
  onNavigate: (destination: AppDestination) => void;
  onCycleTheme: AppUtilityNavProps["onCycleTheme"];
  onOpenSettings: AppUtilityNavProps["onOpenSettings"];
  children: React.ReactNode;
  className?: string;
};

type AppHeaderProps = Omit<AppFrameProps, "children" | "className" | "immersive">;

const primaryDestination = (destination: AppDestination) =>
  destination === "training" || destination === "library" || destination === "statistics"
    ? destination
    : null;

function AppHeader({
  activeDestination,
  interfaceLanguage,
  themePreference,
  settingsActive = false,
  navigationDisabled = false,
  utilitiesDisabled = false,
  onNavigate,
  onCycleTheme,
  onOpenSettings,
}: AppHeaderProps) {
  return (
    <header
      className={styles.header}
      data-testid="app-header"
      data-app-header="true"
    >
      <button type="button" className={styles.brandLink}
        aria-label={`2000nl: ${appDestinationLabel(interfaceLanguage, "training")}`}
        disabled={navigationDisabled} onClick={() => onNavigate("training")}>
        <BrandLogo as="span" className={styles.brand} accentClassName={styles.brandAccent} />
      </button>
      <div className={styles.desktopNav} data-app-primary-navigation="desktop">
        <AppDestinationNav
          active={
            activeDestination === "training" ||
            activeDestination === "library" ||
            activeDestination === "statistics"
              ? activeDestination
              : null
          }
          interfaceLanguage={interfaceLanguage}
          disabled={navigationDisabled}
          onNavigate={onNavigate}
        />
      </div>
      <div className={styles.utilities}>
        <AppUtilityNav
          interfaceLanguage={interfaceLanguage}
          themePreference={themePreference}
          disabled={utilitiesDisabled}
          settingsActive={settingsActive}
          onCycleTheme={onCycleTheme}
          onOpenSettings={onOpenSettings}
        />
      </div>
    </header>
  );
}

export function AppFrame({
  className,
  children,
  immersive = false,
  ...headerProps
}: AppFrameProps) {
  const onNavigate = (destination: AppDestination) => {
    headerProps.onNavigate(destination);
  };
  return (
    <div
      className={`${styles.frame}${className ? ` ${className}` : ""}`}
      data-app-frame="true"
      data-immersive={immersive ? "true" : undefined}
    >
      <AppHeader
        {...headerProps}
        onNavigate={onNavigate}
      />
      <main className={styles.content}>{children}</main>
      <div className={styles.tabBar} data-app-mobile-navigation="tabs">
        <AppDestinationNav
          variant="tabs"
          active={primaryDestination(headerProps.activeDestination)}
          interfaceLanguage={headerProps.interfaceLanguage}
          disabled={headerProps.navigationDisabled}
          onNavigate={onNavigate}
        />
      </div>
    </div>
  );
}
