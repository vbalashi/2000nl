"use client";

import React, { useMemo, useState } from "react";
import { BrandLogo } from "@/components/BrandLogo";
import {
  createDictionarySearchTabState,
  DictionarySearchTab,
  type DictionarySearchTabState,
} from "@/components/training/wordlist/DictionarySearchTab";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import type {
  DictionaryEntry,
  EntryLearningListMembership,
  WordListSummary,
} from "@/lib/types";
import { AppDestinationNav } from "./AppDestinationNav";
import { AppUtilityNav, type AppUtilityNavProps } from "./AppUtilityNav";
import type { AppDestination } from "./appDestination";

const copy: Record<
  OnboardingLanguage,
  { title: string; back: string; eyebrow: string }
> = {
  nl: {
    title: "Bibliotheek",
    back: "Terug naar Training",
    eyebrow: "Woorden, bronnen en collecties",
  },
  en: {
    title: "Library",
    back: "Back to Training",
    eyebrow: "Words, sources and collections",
  },
  ru: {
    title: "Библиотека",
    back: "Вернуться к тренировке",
    eyebrow: "Слова, источники и коллекции",
  },
};

type Props = {
  open: boolean;
  userId: string;
  language: string;
  translationLang: string | null;
  interfaceLanguage: OnboardingLanguage;
  lists: WordListSummary[];
  activeList: WordListSummary | null;
  onReloadLists: () => Promise<void>;
  extendedDestinationsEnabled?: boolean;
  onNavigate: (destination: AppDestination) => void;
  utilityNav: Omit<
    AppUtilityNavProps,
    "interfaceLanguage" | "settingsActive" | "historyActive"
  >;
  onOpenListMembership?: (membership: EntryLearningListMembership) => void;
  onUserDictionaryEntryCreated?: (entry: DictionaryEntry) => void;
  onTrainWord?: (wordId: string) => void;
};

export function LibraryDestination({
  open,
  userId,
  language,
  translationLang,
  interfaceLanguage,
  lists,
  activeList,
  onReloadLists,
  extendedDestinationsEnabled = false,
  onNavigate,
  utilityNav,
  onOpenListMembership,
  onUserDictionaryEntryCreated,
  onTrainWord,
}: Props) {
  const [searchState, setSearchState] = useState<DictionarySearchTabState>(() =>
    createDictionarySearchTabState(),
  );
  const viewedList = activeList ?? lists[0] ?? null;
  const userLists = useMemo(
    () => lists.filter((list) => list.type === "user"),
    [lists],
  );
  const text = copy[interfaceLanguage];

  return (
    <section
      aria-hidden={!open}
      className={`${open ? "flex" : "hidden"} h-screen h-[100dvh] flex-col overflow-hidden bg-background-light text-slate-900 dark:bg-background-dark dark:text-slate-100`}
    >
      <header className="relative z-20 grid flex-none grid-cols-[1fr_auto_1fr] items-center border-b border-slate-200 bg-white/90 px-3 py-2 shadow-sm backdrop-blur md:px-6 md:py-3 dark:border-slate-800 dark:bg-slate-900/80">
        <div className="min-w-0 justify-self-start">
          <BrandLogo />
        </div>
        <div className="hidden justify-self-center sm:block">
          <AppDestinationNav
            active="library"
            interfaceLanguage={interfaceLanguage}
            extendedDestinationsEnabled={extendedDestinationsEnabled}
            onNavigate={onNavigate}
          />
        </div>
        {open ? (
          <AppUtilityNav
            interfaceLanguage={interfaceLanguage}
            {...utilityNav}
          />
        ) : (
          <div />
        )}
      </header>

      <div className="flex min-h-0 flex-1 flex-col px-4 pb-4 pt-5 sm:px-6 md:px-8">
        <div className="mb-4 flex-none">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">
            {text.eyebrow}
          </p>
          <h1 className="mt-1 text-2xl font-bold text-slate-950 dark:text-white">
            {text.title}
          </h1>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">
          <DictionarySearchTab
            open={open}
            userId={userId}
            language={language}
            translationLang={translationLang}
            interfaceLanguage={interfaceLanguage}
            userLists={userLists}
            viewedListId={viewedList?.id ?? null}
            viewedList={viewedList}
            viewedListName={viewedList?.name ?? "VanDale 2k"}
            reloadLists={onReloadLists}
            notifyListsUpdated={() => {}}
            onOpenListMembership={onOpenListMembership}
            onUserDictionaryEntryCreated={onUserDictionaryEntryCreated}
            onTrainWord={onTrainWord}
            autoFocusQuery={open}
            searchState={searchState}
            onSearchStateChange={setSearchState}
          />
        </div>
      </div>
    </section>
  );
}
