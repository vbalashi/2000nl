"use client";

import React from "react";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import { fetchPlatformV2MultiSenseGroup } from "@/lib/platform/platformV2LibraryClient";
import { performPlatformV2TrainingAction } from "@/lib/platform/platformV2TrainingClient";
import type { CardTypeId } from "../../../../../packages/shared/types/platform";
import type { PlatformHeadwordGroupV2 } from "../../../../../packages/shared/types/platformV2";
import { LibrarySenseCardGroup } from "./LibrarySenseCardGroup";
import {
  buildLibrarySenseCardGroupModel,
  type LibraryMutationCapability,
} from "./librarySenseCardModel";

type Props = {
  entryId: string;
  headword: string;
  cardTypeId?: CardTypeId;
  contentLanguageCode: string;
  translationTargetLanguageCode: string | null;
  interfaceLanguage: OnboardingLanguage;
  fallback: React.ReactNode;
};

export function LibrarySenseCardV2Session({
  entryId,
  headword,
  cardTypeId = "word-to-definition",
  contentLanguageCode,
  translationTargetLanguageCode,
  interfaceLanguage,
  fallback,
}: Props) {
  const [group, setGroup] = React.useState<PlatformHeadwordGroupV2 | null>(null);
  const [busyEntryId, setBusyEntryId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(
    async (signal?: AbortSignal) => {
      const next = await fetchPlatformV2MultiSenseGroup({
        query: headword,
        entryId,
        cardTypeId,
        contentLanguageCode,
        translationTargetLanguageCode,
        signal,
      });
      setGroup(next);
      return next;
    },
    [
      cardTypeId,
      contentLanguageCode,
      entryId,
      headword,
      translationTargetLanguageCode,
    ],
  );

  React.useEffect(() => {
    const controller = new AbortController();
    setGroup(null);
    setError(null);
    void load(controller.signal).catch(() => {
      if (!controller.signal.aborted) setGroup(null);
    });
    return () => controller.abort();
  }, [load]);

  const model = React.useMemo(
    () =>
      group
        ? buildLibrarySenseCardGroupModel(group, interfaceLanguage)
        : null,
    [group, interfaceLanguage],
  );

  const handleAction = async (capability: LibraryMutationCapability) => {
    setBusyEntryId(capability.target.entryId);
    setError(null);
    try {
      await performPlatformV2TrainingAction(capability);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "action_failed");
    } finally {
      setBusyEntryId(null);
    }
  };

  if (!model) return <>{fallback}</>;

  return (
    <div className="relative h-full min-h-0">
      <LibrarySenseCardGroup
        model={model}
        interfaceLanguage={interfaceLanguage}
        busyEntryId={busyEntryId}
        onAction={(capability) => void handleAction(capability)}
      />
      {error ? (
        <p
          role="alert"
          className="absolute inset-x-4 bottom-4 rounded-xl border border-rose-400/50 bg-rose-950/90 px-3 py-2 text-sm text-rose-100"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
