"use client";

import React, { useMemo, useState } from "react";
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

const copy: Record<
  OnboardingLanguage,
  { title: string; eyebrow: string }
> = {
  nl: {
    title: "Bibliotheek",
    eyebrow: "Woorden, bronnen en collecties",
  },
  en: {
    title: "Library",
    eyebrow: "Words, sources and collections",
  },
  ru: {
    title: "Библиотека",
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
      className={`${open ? "flex" : "hidden"} h-full min-h-0 flex-col overflow-hidden`}
    >
      <div
        data-testid="library-workspace"
        className="mx-auto flex min-h-0 w-full max-w-[1200px] flex-1 flex-col px-4 pb-4 pt-5 sm:px-6 md:px-8"
      >
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
