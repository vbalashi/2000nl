"use client";

import React from "react";
import { AppFrame } from "@/components/navigation/AppFrame";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import { TrainingPilotStatePanel } from "./TrainingPilotStatePanel";

type Props =
  | {
      interfaceLanguage: OnboardingLanguage;
      interfaceLanguageReady?: boolean;
      status?: "loading" | "long-running";
    }
  | {
      interfaceLanguage: OnboardingLanguage;
      interfaceLanguageReady?: boolean;
      status: "error";
      onRetry: () => void;
    };

export function TrainingBootstrapShell(props: Props) {
  const { interfaceLanguage } = props;
  const interfaceLanguageReady = props.interfaceLanguageReady ?? true;
  const inertNavigate = () => undefined;

  return (
    <div
      data-testid="training-bootstrap-shell"
      className="flex h-screen h-[100dvh] flex-col overflow-hidden"
    >
      <AppFrame
        activeDestination="training"
        interfaceLanguage={interfaceLanguage}
        themePreference="system"
        navigationDisabled
        utilitiesDisabled
        onNavigate={inertNavigate}
        onCycleTheme={inertNavigate}
        onOpenSettings={inertNavigate}
      >
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
            copyVisible={interfaceLanguageReady}
          />
        )}
      </AppFrame>
    </div>
  );
}
