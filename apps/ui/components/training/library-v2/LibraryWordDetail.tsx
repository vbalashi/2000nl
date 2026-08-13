"use client";

import React from "react";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import type { WordListSummary } from "@/lib/types";
import type { PlatformHeadwordGroupV2 } from "../../../../../packages/shared/types/platformV2";
import { platformV2LibraryUiEnabled } from "@/lib/platform/platformV2Rollout";
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
  fallback: React.ReactNode;
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
  fallback,
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

  if (!platformV2LibraryUiEnabled()) return <>{fallback}</>;
  if (!viewportMatches) return <>{fallback}</>;

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
      fallback={fallback}
    />
  );
}
