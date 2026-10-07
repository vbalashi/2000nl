"use client";

import React from "react";
import { StartupStatus } from "./StartupStatus";
import { StartupLogoScreen } from "./StartupLogoScreen";
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

  return <div data-testid="training-bootstrap-shell">
    {props.status === "error"
      ? <StartupLogoScreen><TrainingPilotStatePanel plain interfaceLanguage={interfaceLanguage} context="bootstrap" status="error" onRetry={props.onRetry} /></StartupLogoScreen>
      : <StartupStatus language={interfaceLanguage} copyVisible={interfaceLanguageReady} />}
  </div>;
}
