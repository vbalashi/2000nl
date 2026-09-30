"use client";
import React from "react";
import layout from "@/components/practice/settings/settings.module.css";
import { getUiMessages } from "@/lib/uiMessages";
import { accountTextSize, textSizes } from "@/lib/reading/textScale";
import { readingSizes, type ReadingDevice } from "@/lib/reading/readingSize";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import { useReadingSettings } from "./ReadingPreferencesProvider";
import { readingSettingsCopy } from "./readingSettingsCopy";
import theme from "@/components/practice/ui/practiceTheme.module.css";
import s from "./textPreferences.module.css";

export function ApprovedTextSizeSection({
  language,
  embedded = false,
}: {
  language: OnboardingLanguage;
  embedded?: boolean;
}) {
  const settings = useReadingSettings();
  if (!settings) return null;
  const copy = getUiMessages(language),
    text = copy.settings,
    prefs = copy.textPreferences,
    status = readingSettingsCopy[language];
  const active = settings.preferences[settings.device];
  const saveStatus = settings.saveStatus[settings.device];
  return (
    <section
      className={`${theme.theme} ${embedded ? `${s.embedded} ${layout.panel}` : s.section}`}
      data-colour-mode="app"
    >
      <h2>{text.textSize}</h2>
      <p>{prefs.description}</p>
      <label className={s.profile}>
        {prefs.profile}
        <select
          aria-label={prefs.profile}
          value={settings.device}
          onChange={(event) =>
            settings.setDevice(event.target.value as ReadingDevice)
          }
        >
          <option value="phone">{prefs.phone}</option>
          <option value="desktop">{prefs.desktop}</option>
        </select>
      </label>
      <div className={s.sizes} role="group" aria-label={text.textSize}>
        {readingSizes.map((size) => {
          const display = textSizes.find(
            (item) => item.id === accountTextSize[size],
          )!;
          return (
            <button
              key={size}
              type="button"
              aria-label={text.sizes[display.id]}
              aria-pressed={active === size}
              disabled={
                settings.loadStatus !== "ready" || saveStatus === "saving"
              }
              onClick={() => void settings.save(settings.device, size)}
            >
              {display.label}
            </button>
          );
        })}
      </div>
      <p className={s.hint}>{prefs.profileHint}</p>
      {!settings.deviceStored && <p role="status">{status.temporary}</p>}
      {settings.loadStatus === "loading" && (
        <p role="status">{status.loading}</p>
      )}
      {settings.loadStatus === "error" && (
        <div role="alert">
          <p>{status.loadError}</p>
          <button type="button" onClick={settings.reload}>
            {status.retry}
          </button>
        </div>
      )}
      {saveStatus === "saving" && <p role="status">{status.saving}</p>}
      {saveStatus === "saved" && <p role="status">{status.saved}</p>}
      {saveStatus === "error" && (
        <div role="alert">
          <p>{status.saveError}</p>
          <button
            type="button"
            onClick={() => void settings.save(settings.device, active)}
          >
            {status.retry}
          </button>
        </div>
      )}
      <div className={s.preview} aria-label={status.preview}>
        <span className={s.headword}>
          <small>de</small> fiets
        </span>
        <p className={s.definition}>een vervoermiddel met twee wielen</p>
        <p className={s.example}>Ik ga met de fiets naar mijn werk.</p>
        <p className={s.translation}>I cycle to work.</p>
      </div>
    </section>
  );
}
