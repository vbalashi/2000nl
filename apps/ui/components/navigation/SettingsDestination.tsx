"use client";

import React from "react";
import { BrandLogo } from "@/components/BrandLogo";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import type { ThemePreference } from "@/lib/training/useTrainingPreferences";
import { getTrainingHotkeys } from "@/components/training/trainingHotkeys";
import { AppDestinationNav } from "./AppDestinationNav";
import type { AppDestination } from "./appDestination";

const copy = {
  nl: {
    title: "Instellingen",
    eyebrow: "App-voorkeuren",
    subtitle: "Taal en weergave voor de hele applicatie.",
    back: "Terug naar Training",
    theme: "Thema",
    languageGroup: "Taal",
    interfaceLanguage: "Interfacetaal",
    translationLanguage: "Vertaaltaal",
    light: "Licht",
    dark: "Donker",
    system: "Systeem",
    off: "Uit",
    keyboardShortcuts: "Sneltoetsen",
    keyboardShortcutsHint: "De toetsen die nu in Training actief zijn.",
  },
  en: {
    title: "Settings",
    eyebrow: "Application preferences",
    subtitle: "Language and appearance across the application.",
    back: "Back to Training",
    theme: "Theme",
    languageGroup: "Language",
    interfaceLanguage: "Interface language",
    translationLanguage: "Translation language",
    light: "Light",
    dark: "Dark",
    system: "System",
    off: "Off",
    keyboardShortcuts: "Keyboard shortcuts",
    keyboardShortcutsHint: "The shortcuts currently active in Training.",
  },
  ru: {
    title: "Настройки",
    eyebrow: "Настройки приложения",
    subtitle: "Язык и оформление всего приложения.",
    back: "Вернуться к тренировке",
    theme: "Тема",
    languageGroup: "Язык",
    interfaceLanguage: "Язык интерфейса",
    translationLanguage: "Язык перевода",
    light: "Светлая",
    dark: "Тёмная",
    system: "Системная",
    off: "Выключен",
    keyboardShortcuts: "Горячие клавиши",
    keyboardShortcutsHint: "Сочетания, которые сейчас действуют в тренировке.",
  },
} satisfies Record<OnboardingLanguage, Record<string, string>>;

type Props = {
  open: boolean;
  interfaceLanguage: OnboardingLanguage;
  themePreference: ThemePreference;
  translationLanguage: string | null;
  onThemeChange: (theme: ThemePreference) => void;
  onInterfaceLanguageChange: (language: OnboardingLanguage) => void | Promise<void>;
  onTranslationLanguageChange: (language: string | null) => void;
  onNavigate: (destination: AppDestination) => void;
};

export function SettingsDestination({
  open,
  interfaceLanguage,
  themePreference,
  translationLanguage,
  onThemeChange,
  onInterfaceLanguageChange,
  onTranslationLanguageChange,
  onNavigate,
}: Props) {
  const text = copy[interfaceLanguage];
  const themeOptions: Array<{ value: ThemePreference; label: string }> = [
    { value: "light", label: text.light },
    { value: "dark", label: text.dark },
    { value: "system", label: text.system },
  ];
  const hotkeys = getTrainingHotkeys(interfaceLanguage);

  return (
    <section
      aria-hidden={!open}
      className={`${open ? "flex" : "hidden"} h-screen h-[100dvh] flex-col overflow-hidden bg-background-light text-slate-900 dark:bg-background-dark dark:text-slate-100`}
    >
      <header className="relative z-20 grid flex-none grid-cols-[1fr_auto_1fr] items-center border-b border-slate-200 bg-white/90 px-3 py-2 shadow-sm backdrop-blur md:px-6 md:py-3 dark:border-slate-800 dark:bg-slate-900/80">
        <div className="min-w-0 justify-self-start"><BrandLogo /></div>
        <div className="hidden justify-self-center sm:block">
          <AppDestinationNav
            active="settings"
            interfaceLanguage={interfaceLanguage}
            onNavigate={onNavigate}
          />
        </div>
        <button
          type="button"
          aria-label={text.back}
          onClick={() => onNavigate("training")}
          className="flex h-10 w-10 items-center justify-center justify-self-end rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:bg-slate-50 sm:invisible sm:pointer-events-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
        >
          <span aria-hidden="true">←</span>
        </button>
      </header>

      <main className="scrollbar-hide min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6 md:px-8">
        <div className="mx-auto w-full max-w-5xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">{text.eyebrow}</p>
          <h1 className="mt-1 text-3xl font-bold text-slate-950 dark:text-white">{text.title}</h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{text.subtitle}</p>

          <div className="mt-7 grid gap-5 lg:grid-cols-2">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <h2 className="text-base font-bold">{text.theme}</h2>
              <div className="mt-4 grid grid-cols-3 gap-2">
                {themeOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={themePreference === option.value}
                    onClick={() => onThemeChange(option.value)}
                    className={`min-h-11 rounded-xl border px-3 text-sm font-semibold transition ${
                      themePreference === option.value
                        ? "border-indigo-500 bg-indigo-50 text-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-200"
                        : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <h2 className="text-base font-bold">{text.languageGroup}</h2>
              <div className="mt-4 space-y-4">
                <label className="block text-sm font-semibold">
                  {text.interfaceLanguage}
                  <select
                    aria-label={text.interfaceLanguage}
                    value={interfaceLanguage}
                    onChange={(event) => void onInterfaceLanguageChange(event.target.value as OnboardingLanguage)}
                    className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950"
                  >
                    <option value="nl">Nederlands</option>
                    <option value="en">English</option>
                    <option value="ru">Русский</option>
                  </select>
                </label>
                <label className="block text-sm font-semibold">
                  {text.translationLanguage}
                  <select
                    aria-label={text.translationLanguage}
                    value={translationLanguage ?? "off"}
                    onChange={(event) => onTranslationLanguageChange(event.target.value === "off" ? null : event.target.value)}
                    className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950"
                  >
                    <option value="off">{text.off}</option>
                    <option value="nl">Nederlands</option>
                    <option value="en">English</option>
                    <option value="ru">Русский</option>
                  </select>
                </label>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2 dark:border-slate-800 dark:bg-slate-900">
              <h2 className="text-base font-bold">{text.keyboardShortcuts}</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                {text.keyboardShortcutsHint}
              </p>
              <div className="mt-4 grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
                {hotkeys.map((item) => (
                  <div
                    key={item.key}
                    className="flex min-h-10 items-center justify-between gap-4 border-b border-slate-100 py-2 text-sm dark:border-slate-800"
                  >
                    <span className="text-slate-600 dark:text-slate-300">
                      {item.description}
                    </span>
                    <kbd className="shrink-0 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-xs font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">
                      {item.key}
                    </kbd>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      </main>
    </section>
  );
}
