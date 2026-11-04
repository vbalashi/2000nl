"use client";
import { localizedField } from "@/lib/i18n/catalog";

import React from "react";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import { StartupLogoScreen } from "./StartupLogoScreen";

const copy: Record<OnboardingLanguage, string> = localizedField("startup", "preparing");

/** One waiting surface across auth, account presentation and training hydration. */
export function StartupStatus({ language = "en", copyVisible = true }: {
  language?: OnboardingLanguage;
  copyVisible?: boolean;
}) {
  return <StartupLogoScreen>
    <section role="status" aria-busy="true" data-context="bootstrap"
      aria-label={copy[language]} aria-live="polite">
      {copyVisible ? <h1 className="sr-only">{copy[language]}</h1> : null}
      <span className="startup-dots" aria-hidden="true"><i /><i /><i /></span>
    </section>
  </StartupLogoScreen>;
}
