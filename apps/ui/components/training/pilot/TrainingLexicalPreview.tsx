"use client";

import React from "react";
import { ChevronDown } from "lucide-react";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import type { DutchNounArticle, DutchTrainingPartOfSpeech } from "@/lib/types";

const copy = {
  en: {
    title: "Part of speech",
    more: "Show 8 more parts of speech",
    article: "Noun article",
    all: "No selection includes all parts of speech.",
    selected: (count: number) => `${count} selected`,
    unavailableLanguage: "Lexical filters for this language are not connected yet.",
    articleHelp: "Articles narrow noun candidates; other selected parts of speech stay included.",
    parts: ["Noun", "Verb", "Adjective", "Adverb", "Preposition", "Pronoun", "Conjunction", "Numeral", "Article", "Interjection", "Abbreviation", "Fixed expression"],
    fixedExpressionHelp: "Fixed expressions use the idiom exercise path, which is still being built.",
  },
  nl: {
    title: "Woordsoort",
    more: "Toon 8 andere woordsoorten",
    article: "Lidwoord",
    all: "Zonder selectie worden alle woordsoorten meegenomen.",
    selected: (count: number) => `${count} geselecteerd`,
    unavailableLanguage: "Filters voor deze taal zijn nog niet aangesloten.",
    articleHelp: "Lidwoorden beperken zelfstandige naamwoorden; andere gekozen woordsoorten blijven inbegrepen.",
    parts: ["Zelfstandig naamwoord", "Werkwoord", "Bijvoeglijk naamwoord", "Bijwoord", "Voorzetsel", "Voornaamwoord", "Voegwoord", "Telwoord", "Lidwoord", "Tussenwerpsel", "Afkorting", "Vaste verbinding"],
    fixedExpressionHelp: "Vaste verbindingen gebruiken het idiomentrainingpad dat nog wordt gebouwd.",
  },
  ru: {
    title: "Часть речи",
    more: "Показать ещё 8 частей речи",
    article: "Артикль существительного",
    all: "Без выбора включены все части речи.",
    selected: (count: number) => `Выбрано: ${count}`,
    unavailableLanguage: "Фильтры для этого языка пока не подключены.",
    articleHelp: "Артикль сужает выбор существительных; другие выбранные части речи остаются.",
    parts: ["Существительное", "Глагол", "Прилагательное", "Наречие", "Предлог", "Местоимение", "Союз", "Числительное", "Артикль", "Междометие", "Сокращение", "Устойчивое выражение"],
    fixedExpressionHelp: "Для устойчивых выражений нужен отдельный режим тренировки идиом; он ещё разрабатывается.",
  },
};

const DUTCH_PARTS: DutchTrainingPartOfSpeech[] = [
  "zn", "ww", "bn", "bw", "vz", "vnw", "vw", "tw", "lidw", "tsw", "afk",
];

/** Interactive Dutch lexical filters; other training languages remain explicitly unavailable. */
export function TrainingLexicalPreview({
  languageCode,
  interfaceLanguage,
  selectedParts,
  selectedArticles,
  onPartToggle,
  onArticleToggle,
}: {
  languageCode: string;
  interfaceLanguage: OnboardingLanguage;
  selectedParts: DutchTrainingPartOfSpeech[];
  selectedArticles: DutchNounArticle[];
  onPartToggle: (part: DutchTrainingPartOfSpeech) => void;
  onArticleToggle: (article: DutchNounArticle) => void;
}) {
  const t = copy[interfaceLanguage];
  if (languageCode !== "nl") {
    return (
      <section className="order-4 min-w-0 md:col-span-2" aria-label={t.title}>
        <h2 className="text-sm font-semibold text-slate-950 dark:text-white">{t.title}</h2>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t.unavailableLanguage}</p>
      </section>
    );
  }

  const partButton = (code: DutchTrainingPartOfSpeech, index: number) => {
    const active = selectedParts.includes(code);
    return (
      <button
        key={code}
        type="button"
        aria-pressed={active}
        onClick={() => onPartToggle(code)}
        className={`min-h-10 rounded-lg border px-3 py-2 text-sm font-semibold ${active ? "border-indigo-500 bg-indigo-500/20 text-indigo-950 dark:text-indigo-100" : "border-slate-200 text-slate-700 dark:border-slate-700 dark:text-slate-300"}`}
      >
        {t.parts[index]}
      </button>
    );
  };
  const articleButton = (article: DutchNounArticle) => {
    const active = selectedArticles.includes(article);
    return (
      <button
        key={article}
        type="button"
        aria-pressed={active}
        disabled={selectedParts.length > 0 && !selectedParts.includes("zn")}
        onClick={() => onArticleToggle(article)}
        className={`min-h-10 rounded-lg border px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40 ${active ? "border-indigo-500 bg-indigo-500/20 text-indigo-950 dark:text-indigo-100" : "border-slate-200 text-slate-700 dark:border-slate-700 dark:text-slate-300"}`}
      >
        {article}
      </button>
    );
  };

  return (
    <section className="order-4 min-w-0 md:col-span-2" aria-label={t.title}>
      <h2 className="text-sm font-semibold text-slate-950 dark:text-white">{t.title}</h2>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{selectedParts.length ? t.selected(selectedParts.length) : t.all}</p>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">{DUTCH_PARTS.slice(0, 4).map(partButton)}</div>
      <details className="group mt-1">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-xs font-semibold text-slate-600 marker:content-none dark:text-slate-300 [&::-webkit-details-marker]:hidden">
          <ChevronDown size={14} aria-hidden="true" className="transition group-open:rotate-180" />{t.more}
        </summary>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {DUTCH_PARTS.slice(4).map((part, index) => partButton(part, index + 4))}
          <button type="button" disabled title={t.fixedExpressionHelp} className="min-h-10 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-500 opacity-60 dark:border-slate-700 dark:text-slate-400">
            {t.parts[11]}
          </button>
        </div>
      </details>
      <h3 className="mt-3 text-sm font-semibold text-slate-950 dark:text-white">{t.article}</h3>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t.articleHelp}</p>
      <div className="mt-2 grid grid-cols-2 gap-2">{articleButton("de")}{articleButton("het")}</div>
    </section>
  );
}
