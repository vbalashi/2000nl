"use client";

import React from "react";
import { StartupStatus } from "./StartupStatus";
import { StartupRecovery } from "./StartupRecovery";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";

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

  return <div data-testid="training-bootstrap-shell">
    {props.status === "error"
      ? <StartupRecovery language={interfaceLanguage} onRetry={props.onRetry} />
      : <StartupStatus language={interfaceLanguage} copyVisible={interfaceLanguageReady} />}
  </div>;
}
