"use client";

import React from "react";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import type { EntryLearningListMembership, WordListSummary } from "@/lib/types";
import type { PlatformHeadwordGroupV2 } from "../../../../../packages/shared/types/platformV2";
import { LibrarySenseCardV2Session } from "./LibrarySenseCardV2Session";

import type { OpenIndependentCopy } from "./IndependentEntryCopyDialog";

type Props = {
  revealActiveMeaning?: boolean;
  entryId: string;
  initialGroup?: PlatformHeadwordGroupV2;
  headword: string;
  contentLanguageCode: string;
  translationTargetLanguageCode: string | null;
  interfaceLanguage: OnboardingLanguage;
  userId?: string;
  userLists?: WordListSummary[];
  currentCollection?: WordListSummary;
  dictionaryIdInSummary?: string | null;
  onArchived?: (entryId: string) => void;
  onOpenCopied?: (copy: OpenIndependentCopy) => void;
  onListsUpdated?: () => Promise<void> | void;
  onTrainWord?: (entryId: string) => void;
  onOpenListMembership?: (membership: EntryLearningListMembership) => void;
  viewport?: "all" | "desktop" | "mobile";
};

export function LibraryWordDetail({
  revealActiveMeaning,
  entryId,
  initialGroup,
  headword,
  contentLanguageCode,
  translationTargetLanguageCode,
  interfaceLanguage,
  userId,
  userLists,
  currentCollection,
  dictionaryIdInSummary,
  onArchived,
  onOpenCopied,
  onListsUpdated,
  onTrainWord,
  onOpenListMembership,
  viewport = "all",
}: Props) {
  const [viewportMatches, setViewportMatches] = React.useState(
    viewport === "all",
  );

  React.useEffect(() => {
    if (viewport === "all") {
      setViewportMatches(true);
      return;
    }
    const media = window.matchMedia("(min-width: 701px)");
    const sync = () =>
      setViewportMatches(viewport === "desktop" ? media.matches : !media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, [viewport]);

  if (!viewportMatches) {
    return (
      <div data-testid="library-word-detail-loading" className="h-full animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />
    );
  }

  return (
    <LibrarySenseCardV2Session
      revealActiveMeaning={revealActiveMeaning}
      entryId={entryId}
      initialGroup={initialGroup}
      headword={headword}
      contentLanguageCode={contentLanguageCode}
      translationTargetLanguageCode={translationTargetLanguageCode}
      interfaceLanguage={interfaceLanguage}
      userId={userId}
      userLists={userLists}
      currentCollection={currentCollection}
      dictionaryIdInSummary={dictionaryIdInSummary}
      onArchived={onArchived}
      onOpenCopied={onOpenCopied}
      onListsUpdated={onListsUpdated}
      onTrainWord={onTrainWord}
      onOpenListMembership={onOpenListMembership}
    />
  );
}
