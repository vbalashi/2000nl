"use client";

import React, { useEffect, useMemo, useState } from "react";
import { getUiMessages } from "@/lib/uiMessages";
import theme from "@/components/practice/ui/practiceTheme.module.css";
import workspace from "@/components/practice/library/libraryWorkspace.module.css";
import {
  createDictionarySearchTabState,
  DictionarySearchTab,
  type DictionarySearchTabState,
} from "@/components/training/wordlist/DictionarySearchTab";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import type {
  EntryLearningListMembership,
  WordListSummary,
} from "@/lib/types";

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
  onTrainWord,
}: Props) {
  const [searchState, setSearchState] = useState<DictionarySearchTabState>(() =>
    createDictionarySearchTabState(),
  );
  const [preload, setPreload] = useState(false);
  useEffect(() => {
    // Warm one list after the initial screen has painted, never in the foreground path.
    const timer = window.setTimeout(() => setPreload(true), 750);
    return () => window.clearTimeout(timer);
  }, [userId]);
  const viewedList = activeList ?? lists[0] ?? null;
  const userLists = useMemo(
    () => lists.filter((list) => list.type === "user"),
    [lists],
  );
  return (
    <section
      aria-hidden={!open}
      className={`${open ? "flex" : "hidden"} h-full min-h-0 flex-col overflow-hidden`}
    >
      <div
        data-testid="library-workspace"
        className={`${theme.theme} ${workspace.workspace}`}
        data-colour-mode="app"
      >
        <h1 className="sr-only">
          {getUiMessages(interfaceLanguage).library.title}
        </h1>
        <div className="min-h-0 flex-1 overflow-hidden">
          <DictionarySearchTab
            open={open}
            preload={preload}
            userId={userId}
            language={language}
            translationLang={translationLang}
            interfaceLanguage={interfaceLanguage}
            userLists={userLists}
            collections={lists}
            viewedListId={viewedList?.id ?? null}
            viewedList={viewedList}
            viewedListName={viewedList?.name ?? "VanDale 2k"}
            reloadLists={onReloadLists}
            notifyListsUpdated={() => {}}
            onOpenListMembership={onOpenListMembership}
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
