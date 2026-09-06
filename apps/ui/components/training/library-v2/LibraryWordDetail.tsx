"use client";

import React from "react";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import type { EntryLearningListMembership, WordListSummary } from "@/lib/types";
import type { PlatformHeadwordGroupV2 } from "../../../../../packages/shared/types/platformV2";
import { LibrarySenseCardV2Session } from "./LibrarySenseCardV2Session";

type Props = {
  entryId: string;
  initialGroup?: PlatformHeadwordGroupV2;
  headword: string;
  contentLanguageCode: string;
  translationTargetLanguageCode: string | null;
  interfaceLanguage: OnboardingLanguage;
  userId?: string;
  userLists?: WordListSummary[];
  onListsUpdated?: () => Promise<void> | void;
  onTrainWord?: (entryId: string) => void;
  onCopyToUserDictionary?: (entryId: string) => Promise<void> | void;
  onOpenListMembership?: (membership: EntryLearningListMembership) => void;
  viewport?: "all" | "desktop" | "mobile";
};

export function LibraryWordDetail({
  entryId,
  initialGroup,
  headword,
  contentLanguageCode,
  translationTargetLanguageCode,
  interfaceLanguage,
  userId,
  userLists,
  onListsUpdated,
  onTrainWord,
  onCopyToUserDictionary,
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
    const media = window.matchMedia("(min-width: 1024px)");
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
      entryId={entryId}
      initialGroup={initialGroup}
      headword={headword}
      contentLanguageCode={contentLanguageCode}
      translationTargetLanguageCode={translationTargetLanguageCode}
      interfaceLanguage={interfaceLanguage}
      userId={userId}
      userLists={userLists}
      onListsUpdated={onListsUpdated}
      onTrainWord={onTrainWord}
      onCopyToUserDictionary={onCopyToUserDictionary}
      onOpenListMembership={onOpenListMembership}
    />
  );
}
