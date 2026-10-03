"use client";
import React from "react";
import { useAccountPracticeAppearance } from "./AccountPracticeAppearanceProvider";
import { useAccountCardSpacing } from "./AccountCardSpacingProvider";
import { StartupLogoScreen } from "@/components/training/pilot/StartupLogoScreen";
import startup from "@/components/training/pilot/startupLogo.module.css";
import { getUiMessages } from "@/lib/uiMessages";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
/** Both providers mount together; one gate prevents serial loading screens. */
export function AccountPresentationReady({
  children,
  language = "en",
}: {
  children: React.ReactNode;
  language?: OnboardingLanguage;
}) {
  const preferences = [
    useAccountPracticeAppearance(),
    useAccountCardSpacing(),
  ].filter((p) => p !== null);
  const waiting = preferences.filter((p) => p.loadStatus !== "ready");
  if (waiting.length) {
    const copy = getUiMessages(language).appearancePreferences;
    const failed = waiting.some((p) => p.loadStatus === "error");
    return (
      <StartupLogoScreen>
        <div role={failed ? "alert" : "status"}>
          <p>{failed ? copy.loadError : copy.loading}</p>
          {failed && (
            <button
              onClick={() =>
                waiting
                  .filter((p) => p.loadStatus === "error")
                  .forEach((p) => p.reload())
              }
            >
              {copy.retry}
            </button>
          )}
        </div>
      </StartupLogoScreen>
    );
  }
  return <div className={startup.ready}>{children}</div>;
}
