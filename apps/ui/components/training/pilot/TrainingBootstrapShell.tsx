"use client";

import React from "react";
import { BrandLogo } from "@/components/BrandLogo";
import { AppDestinationNav } from "@/components/navigation/AppDestinationNav";
import { MobileAppDestinationNav } from "@/components/navigation/AppDestinationNav";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import { TrainingPilotStatePanel } from "./TrainingPilotStatePanel";

const navigationShellEnabled =
  process.env.NEXT_PUBLIC_NAVIGATION_SHELL_V1 === "true";
const extendedDestinationsEnabled =
  process.env.NEXT_PUBLIC_SETTINGS_STATISTICS_DESTINATIONS_V1 === "true";

type Props =
  | {
      interfaceLanguage: OnboardingLanguage;
      status?: "loading" | "long-running";
    }
  | {
      interfaceLanguage: OnboardingLanguage;
      status: "error";
      onRetry: () => void;
    };

export function TrainingBootstrapShell(props: Props) {
  const { interfaceLanguage } = props;
  const inertNavigate = () => undefined;

  return (
    <div
      data-testid="training-bootstrap-shell"
      className="flex h-screen h-[100dvh] flex-col overflow-hidden bg-background-light pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] text-slate-900 dark:bg-background-dark dark:text-slate-100"
    >
      <header className="relative z-40 grid flex-none grid-cols-[1fr_auto_1fr] items-center border-b border-slate-200 bg-white/80 px-3 py-2.5 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-900/70 md:px-6 md:py-3">
        <div className="flex min-w-0 items-center gap-2 justify-self-start">
          <div className="flex h-9 min-w-0 items-center gap-2 md:h-10">
            <BrandLogo />
          </div>
        </div>
        {navigationShellEnabled ? (
          <div className="justify-self-center">
            <AppDestinationNav
              active="training"
              interfaceLanguage={interfaceLanguage}
              disabled
              extendedDestinationsEnabled={extendedDestinationsEnabled}
              onNavigate={inertNavigate}
            />
          </div>
        ) : (
          <div />
        )}
        <div aria-hidden="true" className="h-9 justify-self-end md:h-10" />
      </header>

      {props.status === "error" ? (
        <TrainingPilotStatePanel
          interfaceLanguage={interfaceLanguage}
          status="error"
          context="bootstrap"
          onRetry={props.onRetry}
        />
      ) : (
        <TrainingPilotStatePanel
          interfaceLanguage={interfaceLanguage}
          status={props.status ?? "loading"}
          context="bootstrap"
        />
      )}

      {navigationShellEnabled ? (
        <MobileAppDestinationNav
          active="training"
          interfaceLanguage={interfaceLanguage}
          disabled
          extendedDestinationsEnabled={extendedDestinationsEnabled}
          onNavigate={inertNavigate}
        />
      ) : null}
    </div>
  );
}
