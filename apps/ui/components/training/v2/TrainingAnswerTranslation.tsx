"use client";
import type { CurrentTrainingCardContext } from "@/lib/platform/trainingCurrentCardClient";

import React from "react";
import { AdditionalCardTranslationProvider } from "@/components/practice/article/AdditionalCardTranslation";
import { usePlatformV2TranslationPreparation } from "@/lib/platform/usePlatformV2TranslationPreparation";

/** Training answer policy: prepare as soon as content exists, independently of
 * reveal/Translate. Sessions retain their authoritative content refresh; question
 * preparation and future-card buffering have separate readiness requirements. */
export function useTrainingAnswerTranslationPreparation({
  paused = false,
  ...input
}: Omit<Parameters<typeof usePlatformV2TranslationPreparation>[0], "enabled"> & {
  paused?: boolean;
}) {
  return usePlatformV2TranslationPreparation({ ...input, enabled: !paused });
}

/** Keep this boundary mounted around both faces so ready secondary content
 * survives reveal. Visibility belongs to the answer renderers, not preparation. */
export function TrainingAnswerTranslationProvider({
  entryId,
  contentLanguage,
  children,
  currentCard,
}: {
  currentCard?: CurrentTrainingCardContext;
  entryId?: string;
  contentLanguage?: string;
  children: React.ReactNode;
}) {
  return <AdditionalCardTranslationProvider entryId={entryId ?? ""}
    contentLanguage={contentLanguage} currentCard={currentCard} visible={false} preload={Boolean(entryId)}>
    {children}
  </AdditionalCardTranslationProvider>;
}
