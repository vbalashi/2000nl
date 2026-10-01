"use client";
import React from "react";
import {SettingsRow,SettingsOptions} from "@/components/practice/settings/SettingsLayout";
import layout from "@/components/practice/settings/settings.module.css";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import type { ThemePreference } from "@/lib/training/useTrainingPreferences";
import { getUiMessages } from "@/lib/uiMessages";
import { PaletteChoices } from "@/components/practice/settings/PaletteChoices";
import { useAccountPracticeAppearance } from "./AccountPracticeAppearanceProvider";
import theme from "./practiceTheme.module.css";
import s from "@/components/reading/textPreferences.module.css";
export function ApprovedAppearanceSection({
  language,
  embedded = false,
  mode,
  onModeChange,
}: {
  language: OnboardingLanguage;
  embedded?: boolean;
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
    <section
      className={`${theme.theme} ${embedded ? `${s.embedded} ${layout.panel}` : s.section}`}
      data-colour-mode="app"
    >
      <h2>{copy.settings.appearance}</h2>
      <SettingsRow className={s.preferenceRow} title={copy.settings.colourMode}><SettingsOptions label={copy.settings.colourMode} items={modes.map(([id,key])=>({id,label:copy.builder.colourModes[key]}))} value={mode} onChange={onModeChange}/></SettingsRow>
      {appearance && (
        <>
          <div className={`${s.preferenceRow} ${s.paletteRow}`}><h3>{copy.settings.theme}</h3>
          <PaletteChoices
            mode={mode}
            language={language}
            palette={appearance.palette}
            disabled={
              appearance.loadStatus !== "ready" ||
              appearance.saveStatus === "saving"
            }
            onChange={(value) => void appearance.save(value)}
          /></div>
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
