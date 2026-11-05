"use client";
import { localizedSection } from "@/lib/i18n/catalog";

import React from "react";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import { StartupLogoScreen } from "./StartupLogoScreen";

const copy = localizedSection("startupRecovery") satisfies Record<OnboardingLanguage, Record<string, string>>;

/** A settled failure keeps recovery accessible on the same startup surface. */
export function StartupRecovery({ language, context = "bootstrap", onRetry }: {
  language: OnboardingLanguage;
  context?: "bootstrap" | "training";
  onRetry: () => void;
}) {
  const t = copy[language];
  return <StartupLogoScreen>
    <section role="alert" data-context={context}>
      <h1>{t[context]}</h1>
      <p>{context === "bootstrap" ? t.bootstrapBody : t.body}</p>
      <button type="button" onClick={onRetry}>{t.retry}</button>
    </section>
  </StartupLogoScreen>;
}
