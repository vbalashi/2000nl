"use client";

import React from "react";
import { Menu } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import { AppDestinationNav, appDestinationLabel } from "./AppDestinationNav";
import { AppUtilityNav, type AppUtilityNavProps } from "./AppUtilityNav";
import type {
  AppDestination,
  PrimaryNavigationDestination,
} from "./appDestination";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import type { ThemePreference } from "@/lib/training/useTrainingPreferences";
import styles from "./AppFrame.module.css";

export type AppHeaderProps = {
  activeDestination: PrimaryNavigationDestination | null;
  interfaceLanguage: OnboardingLanguage;
  themePreference: ThemePreference;
  settingsActive?: boolean;
  navigationDisabled?: boolean;
  utilitiesDisabled?: boolean;
  onNavigate: (destination: AppDestination) => void;
  onCycleTheme: AppUtilityNavProps["onCycleTheme"];
  onOpenSettings: AppUtilityNavProps["onOpenSettings"];
};

export type AppFrameProps = AppHeaderProps & {
  children: React.ReactNode;
  className?: string;
};

const mobileLabels = {
  nl: { destinations: "Navigatie" },
  en: { destinations: "Destinations" },
  ru: { destinations: "Разделы" },
} as const;

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

  const navigate = (destination: AppDestination) => {
    setOpen(false);
    onNavigate(destination);
  };

  return (
    <>
      <button
        type="button"
        className={styles.mobileMenuButton}
        disabled={navigationDisabled}
        aria-controls={menuId}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={mobileLabels[interfaceLanguage].destinations}
        onClick={() => setOpen((current) => !current)}
      >
        <Menu aria-hidden="true" className="h-4 w-4" />
        <span>
          {activeDestination
            ? appDestinationLabel(interfaceLanguage, activeDestination)
            : mobileLabels[interfaceLanguage].destinations}
        </span>
      </button>
      {open ? (
        <div
          id={menuId}
          className={styles.menu}
          role="group"
          aria-label={mobileLabels[interfaceLanguage].destinations}
        >
          <AppDestinationNav
            active={activeDestination}
            interfaceLanguage={interfaceLanguage}
            disabled={navigationDisabled}
            onNavigate={navigate}
          />
        </div>
      ) : null}
    </>
  );
}

export function AppHeader({
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
      className={`${styles.header} ${styles.headerWithMenu}`}
      data-testid="app-header"
      data-app-header="true"
    >
      <BrandLogo
        className={styles.brand}
        accentClassName={styles.brandAccent}
      />
      <div className={styles.desktopNav} data-app-primary-navigation="desktop">
        <AppDestinationNav
          active={activeDestination}
          interfaceLanguage={interfaceLanguage}
          disabled={navigationDisabled}
          onNavigate={onNavigate}
        />
      </div>
      <div
        className={styles.mobileMenu}
        data-app-mobile-navigation="menu"
      >
        <MobileMenu
          activeDestination={activeDestination}
          interfaceLanguage={interfaceLanguage}
          navigationDisabled={navigationDisabled}
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
          appearance="quiet"
        />
      </div>
    </header>
  );
}

export function AppFrame({
  className,
  children,
  ...headerProps
}: AppFrameProps) {
  const onNavigate = (destination: AppDestination) => {
    headerProps.onNavigate(destination);
  };

  return (
    <div
      className={`${styles.frame}${className ? ` ${className}` : ""}`}
      data-app-frame="true"
    >
      <AppHeader
        {...headerProps}
        onNavigate={onNavigate}
      />
      <main className={styles.content}>{children}</main>
    </div>
  );
}
