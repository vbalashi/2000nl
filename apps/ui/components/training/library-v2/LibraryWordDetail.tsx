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
  onEditPersonal?: (entryIds: string[]) => void;
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
  onEditPersonal,
  onArchived,
  onOpenCopied,
  onListsUpdated,
  onTrainWord,
  onOpenListMembership,
  viewport = "all",
}: Props) {
  const media = React.useMemo(() => {
    return viewport === "all" || typeof window === "undefined" ? null
      : window.matchMedia("(min-width: 701px)");
  }, [viewport]);
  const subscribe = React.useCallback((change:()=>void) => {
    media?.addEventListener("change",change);
    return () => media?.removeEventListener("change",change);
  },[media]);
  const matches = React.useSyncExternalStore(subscribe, () => !media || (viewport === "desktop" ? media.matches : !media.matches), () => viewport === "all");
  if (!matches) return null;

  return (
    <LibrarySenseCardV2Session
      key={JSON.stringify([userId,entryId,contentLanguageCode,translationTargetLanguageCode])}
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
      onEditPersonal={onEditPersonal}
      onArchived={onArchived}
      onOpenCopied={onOpenCopied}
      onListsUpdated={onListsUpdated}
      onTrainWord={onTrainWord}
      onOpenListMembership={onOpenListMembership}
    />
  );
}
