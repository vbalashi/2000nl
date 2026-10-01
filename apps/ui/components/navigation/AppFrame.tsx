"use client";

import React from "react";
import { Menu } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import { AppDestinationNav, appDestinationLabel } from "./AppDestinationNav";
import { AppUtilityNav, type AppUtilityNavProps } from "./AppUtilityNav";
import type { AppDestination } from "./appDestination";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import { getUiMessages } from "@/lib/uiMessages";
import { trainingPresentationV1Enabled } from "@/lib/platform/platformV2Rollout";
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

function MobileMenu({
  activeDestination,
  interfaceLanguage,
  navigationDisabled,
  onNavigate,
}: Pick<
  AppHeaderProps,
  | "activeDestination"
  | "interfaceLanguage"
  | "navigationDisabled"
  | "onNavigate"
>) {
  const [open, setOpen] = React.useState(false);
  const menuId = React.useId();
  const controlRef = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const currentLabel = appDestinationLabel(
    interfaceLanguage,
    activeDestination,
  );

  React.useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    };
    const handlePointerDown = (event: PointerEvent) => {
      if (controlRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [open]);

  const navigate = (destination: AppDestination) => {
    setOpen(false);
    triggerRef.current?.focus();
    onNavigate(destination);
  };

  return (
    <div ref={controlRef} className={styles.mobileMenuControl}>
      <button
        ref={triggerRef}
        type="button"
        className={styles.mobileMenuButton}
        disabled={navigationDisabled}
        aria-controls={menuId}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={`${getUiMessages(interfaceLanguage).navigation.destinations}: ${currentLabel}`}
        onClick={() => setOpen((current) => !current)}
      >
        <Menu aria-hidden="true" className="h-4 w-4" />
        <span>
          {currentLabel}
        </span>
      </button>
      {open ? (
        <div
          id={menuId}
          className={styles.menu}
          role="group"
          aria-label={getUiMessages(interfaceLanguage).navigation.destinations}
        >
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
            onNavigate={navigate}
          />
        </div>
      ) : null}
    </div>
  );
}

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
  const tabs = trainingPresentationV1Enabled();
  return (
    <header
      className={`${styles.header} ${tabs ? "" : styles.headerWithMenu}`}
      data-testid="app-header"
      data-app-header="true"
    >
      <BrandLogo
        className={styles.brand}
        accentClassName={styles.brandAccent}
      />
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
      {tabs ? null : <div
        className={styles.mobileMenu}
        data-app-mobile-navigation="menu"
      >
        <MobileMenu
          activeDestination={activeDestination}
          interfaceLanguage={interfaceLanguage}
          navigationDisabled={navigationDisabled}
          onNavigate={onNavigate}
        />
      </div>}
      <div className={styles.utilities}>
        <AppUtilityNav
          interfaceLanguage={interfaceLanguage}
          themePreference={themePreference}
          disabled={utilitiesDisabled}
          settingsActive={settingsActive}
          onCycleTheme={onCycleTheme}
          onOpenSettings={onOpenSettings}
          appearance="quiet"
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
  const tabs = trainingPresentationV1Enabled();

  return (
    <div
      className={`${styles.frame}${className ? ` ${className}` : ""}`}
      data-app-frame="true"
      data-immersive={tabs && immersive ? "true" : undefined}
    >
      <AppHeader
        {...headerProps}
        onNavigate={onNavigate}
      />
      <main className={styles.content}>{children}</main>
      {tabs ? (
        <div className={styles.tabBar} data-app-mobile-navigation="tabs">
          <AppDestinationNav
            variant="tabs"
            active={primaryDestination(headerProps.activeDestination)}
            interfaceLanguage={headerProps.interfaceLanguage}
            disabled={headerProps.navigationDisabled}
            onNavigate={onNavigate}
          />
        </div>
      ) : null}
    </div>
  );
}
