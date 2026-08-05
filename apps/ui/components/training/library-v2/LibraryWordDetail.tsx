"use client";

import React from "react";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import { platformV2LibraryUiEnabled } from "@/lib/platform/platformV2Rollout";
import { LibrarySenseCardV2Session } from "./LibrarySenseCardV2Session";

type Props = {
  entryId: string;
  headword: string;
  contentLanguageCode: string;
  translationTargetLanguageCode: string | null;
  interfaceLanguage: OnboardingLanguage;
  fallback: React.ReactNode;
  viewport?: "all" | "desktop" | "mobile";
};

export function LibraryWordDetail({
  entryId,
  headword,
  contentLanguageCode,
  translationTargetLanguageCode,
  interfaceLanguage,
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
      headword={headword}
      contentLanguageCode={contentLanguageCode}
      translationTargetLanguageCode={translationTargetLanguageCode}
      interfaceLanguage={interfaceLanguage}
      fallback={fallback}
    />
  );
}
