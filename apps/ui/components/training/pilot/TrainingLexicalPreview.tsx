"use client";

import React from "react";
import { ChevronDown } from "lucide-react";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";

const copy = {
  en: {
    title: "Part of speech",
    more: "Show 8 more parts of speech",
    article: "Noun article",
    unavailable: "These filters are not available yet.",
    unavailableLanguage: "Lexical filters for this language are not connected yet.",
    parts: ["Noun", "Verb", "Adjective", "Adverb", "Preposition", "Pronoun", "Conjunction", "Numeral", "Article", "Interjection", "Abbreviation", "Fixed expression"],
  },
  nl: {
    title: "Woordsoort",
    more: "Toon 8 andere woordsoorten",
    article: "Lidwoord",
    unavailable: "Deze filters zijn nog niet beschikbaar.",
    unavailableLanguage: "Filters voor deze taal zijn nog niet aangesloten.",
    parts: ["Zelfstandig naamwoord", "Werkwoord", "Bijvoeglijk naamwoord", "Bijwoord", "Voorzetsel", "Voornaamwoord", "Voegwoord", "Telwoord", "Lidwoord", "Tussenwerpsel", "Afkorting", "Vaste verbinding"],
  },
  ru: {
    title: "Часть речи",
    more: "Ещё 8 частей речи",
    article: "Артикль существительного",
    unavailable: "Эти фильтры пока недоступны.",
    unavailableLanguage: "Фильтры для этого языка пока не подключены.",
    parts: ["Существительное", "Глагол", "Прилагательное", "Наречие", "Предлог", "Местоимение", "Союз", "Числительное", "Артикль", "Междометие", "Сокращение", "Устойчивое выражение"],
  },
};

/** Read-only preview of the Dutch profile until candidate filtering is enabled. */
export function TrainingLexicalPreview({ languageCode, interfaceLanguage }: { languageCode: string; interfaceLanguage: OnboardingLanguage }) {
  const t = copy[interfaceLanguage];
  if (languageCode !== "nl") {
    return (
      <section className="order-4 min-w-0 md:col-span-2" aria-label={t.title}>
        <h2 className="text-sm font-semibold text-slate-950 dark:text-white">{t.title}</h2>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t.unavailableLanguage}</p>
      </section>
    );
  }
  const chips = (parts: string[]) => parts.map((label) => (
    <button key={label} type="button" disabled className="min-h-10 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-500 opacity-60 dark:border-slate-700 dark:text-slate-400">{label}</button>
  ));
  return (
    <section className="order-4 min-w-0 md:col-span-2" aria-label={t.title}>
      <h2 className="text-sm font-semibold text-slate-950 dark:text-white">{t.title}</h2>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t.unavailable}</p>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">{chips(t.parts.slice(0, 4))}</div>
      <details className="group mt-1">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-xs font-semibold text-slate-600 marker:content-none dark:text-slate-300 [&::-webkit-details-marker]:hidden">
          <ChevronDown size={14} aria-hidden="true" className="transition group-open:rotate-180" />{t.more}
        </summary>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{chips(t.parts.slice(4))}</div>
      </details>
      <h3 className="mt-3 text-sm font-semibold text-slate-950 dark:text-white">{t.article}</h3>
      <div className="mt-2 grid grid-cols-2 gap-2">{chips(["de", "het"])}</div>
    </section>
  );
}
