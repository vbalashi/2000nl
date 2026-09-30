"use client";
import React from "react";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import type { ThemePreference } from "@/lib/training/useTrainingPreferences";
import { getUiMessages } from "@/lib/uiMessages";
import { practicePalettes } from "./appearance";
import { useAccountPracticeAppearance } from "./AccountPracticeAppearanceProvider";
import theme from "./practiceTheme.module.css";
import s from "@/components/reading/textPreferences.module.css";
export function ApprovedAppearanceSection({
  language,
  mode,
  onModeChange,
}: {
  language: OnboardingLanguage;
  mode: ThemePreference;
  onModeChange: (mode: ThemePreference) => void;
}) {
  const appearance = useAccountPracticeAppearance(),
    copy = getUiMessages(language),
    status = copy.appearancePreferences;
  const modes = [
    ["light", "Light"],
    ["dark", "Dark"],
    ["system", "System"],
  ] as const;
  return (
    <section className={`${theme.theme} ${s.section}`} data-colour-mode="app">
      <h2>{copy.settings.appearance}</h2>
      <div
        className={s.sizes}
        role="group"
        aria-label={copy.settings.colourMode}
      >
        {modes.map(([value, key]) => (
          <button
            key={value}
            type="button"
            aria-pressed={mode === value}
            onClick={() => onModeChange(value)}
          >
            {copy.builder.colourModes[key]}
          </button>
        ))}
      </div>
      {appearance && (
        <>
          <div
            className={s.sizes}
            role="group"
            aria-label={copy.settings.theme}
          >
            {practicePalettes.map(({ id }) => (
              <button
                key={id}
                type="button"
                aria-pressed={appearance.palette === id}
                disabled={
                  appearance.loadStatus !== "ready" ||
                  appearance.saveStatus === "saving"
                }
                onClick={() => void appearance.save(id)}
              >
                {copy.settings.themes[id]}
              </button>
            ))}
          </div>
          {appearance.loadStatus === "loading" && (
            <p role="status">{status.loading}</p>
          )}
          {appearance.loadStatus === "error" && (
            <div role="alert">
              <p>{status.loadError}</p>
              <button type="button" onClick={appearance.reload}>
                {status.retry}
              </button>
            </div>
          )}
          {appearance.saveStatus === "saving" && (
            <p role="status">{status.saving}</p>
          )}
          {appearance.saveStatus === "saved" && (
            <p role="status">{status.saved}</p>
          )}
          {appearance.saveStatus === "error" && (
            <div role="alert">
              <p>{status.saveError}</p>
              <button
                type="button"
                onClick={() => void appearance.save(appearance.palette)}
              >
                {status.retry}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
