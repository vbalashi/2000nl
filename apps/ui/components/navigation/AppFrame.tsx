"use client";

import React from "react";
import practiceTheme from "@/components/practice/ui/practiceTheme.module.css";
import { MaintenanceOrReleaseBanner } from "@/components/maintenance/MaintenanceNotice";
import { BrandLogo } from "@/components/BrandLogo";
import { AppDestinationNav, appDestinationLabel } from "./AppDestinationNav";
import { AppUtilityNav, type AppUtilityNavProps } from "./AppUtilityNav";
import type { AppDestination } from "./appDestination";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import { getUiMessages, formatUiMessage } from "@/lib/uiMessages";
import type { ThemePreference } from "@/lib/training/useTrainingPreferences";
import styles from "./AppFrame.module.css";

export type AppFrameProps = {
  activeDestination: AppDestination;
  interfaceLanguage: OnboardingLanguage;
  themePreference: ThemePreference;
  settingsActive?: boolean;
  navigationDisabled?: boolean;
  utilitiesDisabled?: boolean;
  blockedByOverlay?: boolean;
  /** Active practice session: on narrow screens the app chrome steps aside. */
  immersive?: boolean;
  onNavigate: (destination: AppDestination) => void;
  onCycleTheme: AppUtilityNavProps["onCycleTheme"];
  onOpenSettings: AppUtilityNavProps["onOpenSettings"];
  children: React.ReactNode;
  diagnostics?: React.ReactNode;
  className?: string;
};

type AppHeaderProps = Omit<AppFrameProps, "children" | "diagnostics" | "className" | "immersive" | "blockedByOverlay">;

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
        aria-label={formatUiMessage(getUiMessages(interfaceLanguage).navigation.appLabel,{destination:appDestinationLabel(interfaceLanguage,"training")})}
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
  diagnostics,
  immersive = false,
  blockedByOverlay = false,
  ...headerProps
}: AppFrameProps) {
  const [keyboardOpen, setKeyboardOpen] = React.useState(false);
  React.useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const update = () => {
      const editable = document.activeElement?.matches('input, textarea, [contenteditable="true"]');
      setKeyboardOpen(!!editable && viewport.scale === 1 && viewport.height < window.innerHeight - 100);
    };
    const focusout = () => queueMicrotask(update);
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    document.addEventListener("focusin", update);
    document.addEventListener("focusout", focusout);
    update();
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
      document.removeEventListener("focusin", update);
      document.removeEventListener("focusout", focusout);
    };
  }, []);
  const onNavigate = (destination: AppDestination) => {
    headerProps.onNavigate(destination);
  };
  return (
    <div
      className={`${styles.frame}${className ? ` ${className}` : ""}`}
      inert={blockedByOverlay}
      data-app-frame="true"
      data-keyboard-open={keyboardOpen ? "true" : undefined}
      data-immersive={immersive ? "true" : undefined}
    >
      {diagnostics}
      <AppHeader
        {...headerProps}
        onNavigate={onNavigate}
      />
      <div className={`${practiceTheme.theme} ${styles.releaseSurface}`} data-colour-mode="app">
        <MaintenanceOrReleaseBanner language={headerProps.interfaceLanguage} />
      </div>
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
