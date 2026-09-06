"use client";

import React from "react";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import { readingSizes, type ReadingDevice, type ReadingSize } from "@/lib/reading/readingSize";
import { SenseCardHeadwordLockup } from "@/components/training/SenseCardChrome";
import { useReadingSettings } from "./ReadingPreferencesProvider";
import { readingSettingsCopy } from "./readingSettingsCopy";

const selectClass = "mt-2 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950";
const retryClass = "mt-2 min-h-11 rounded-xl border border-indigo-400 px-4 text-sm font-semibold";

export function ReadingSettingsSection({ language }: { language: OnboardingLanguage }) {
  const settings = useReadingSettings();
  if (!settings) return null;
  const text = readingSettingsCopy[language];
  return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2 dark:border-slate-800 dark:bg-slate-900">
    <h2 className="text-base font-bold">{text.title}</h2>
    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{text.description}</p>
    {settings.loadStatus === "loading" && <p role="status" className="mt-3 text-sm">{text.loading}</p>}
    {settings.loadStatus === "error" && <div role="alert" className="mt-3 text-sm">
      <p>{text.loadError}</p><button type="button" className={retryClass} onClick={settings.reload}>{text.retry}</button>
    </div>}
    <div className="mt-4 grid gap-4 sm:grid-cols-2">
      {(["phone", "desktop"] as const).map((device) => <div key={device}>
        <label className="block text-sm font-semibold">{text[device]}
          <select className={selectClass} value={settings.preferences[device]}
            disabled={settings.loadStatus !== "ready" || settings.saveStatus[device] === "saving"}
            onChange={(event) => void settings.save(device, event.target.value as ReadingSize)}>
            {readingSizes.map((size) => <option key={size} value={size}>{text[size]}</option>)}
          </select>
        </label>
        <div role={settings.saveStatus[device] === "error" ? "alert" : "status"} className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          {settings.saveStatus[device] === "saving" && text.saving}
          {settings.saveStatus[device] === "saved" && text.saved}
          {settings.saveStatus[device] === "error" && <><p>{text.saveError}</p><button type="button" className={retryClass} onClick={() => void settings.save(device, settings.preferences[device])}>{text.retry}</button></>}
        </div>
      </div>)}
    </div>
    <label className="mt-4 block text-sm font-semibold">{text.device}
      <select className={selectClass} value={settings.device} onChange={(event) => settings.setDevice(event.target.value as ReadingDevice)}>
        <option value="phone">{text.phoneDevice}</option><option value="desktop">{text.desktopDevice}</option>
      </select>
    </label>
    <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{text.deviceHint}</p>
    {!settings.deviceStored && <p role="status" className="mt-2 text-xs">{text.temporary}</p>}
    <div className="mt-5 rounded-xl border border-slate-200 p-4 dark:border-slate-700" aria-label={text.preview}>
      <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">{text.preview}</p>
      <SenseCardHeadwordLockup headword="bank" article="de" variant="training-answer" tone="light" />
      <p className="mt-3 font-sense-serif italic text-[length:var(--reading-literary-size,16px)] leading-[var(--reading-literary-leading,1.4)]">Margriet en Ellie zaten op de bank televisie te kijken.</p>
    </div>
  </section>;
}
