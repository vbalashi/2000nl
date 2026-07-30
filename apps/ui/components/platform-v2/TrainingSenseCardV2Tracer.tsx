"use client";

import React from "react";
import type {
  PlatformSenseCardCapabilityV2,
} from "../../../../packages/shared/types/platformV2";
import type { TrainingMode, TrainingWord } from "@/lib/types";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import type { ReviewResult } from "@/lib/trainingService";
import {
  fetchPlatformV2SingleSense,
  performPlatformV2CardAction,
  type PlatformV2SingleSenseResult,
} from "@/lib/platform/platformV2SenseCardClient";
import { SenseCardV2 } from "./SenseCardV2";

type Props = {
  word: TrainingWord;
  mode: TrainingMode;
  contentLanguageCode: string;
  translationTargetLanguageCode: string | null;
  interfaceLanguage: OnboardingLanguage;
  onPlayAudio: () => void;
  onLegacyReview: (result: ReviewResult) => void;
  onLegacyStartLearning: () => void;
  onAvailabilityChange: (available: boolean) => void;
  fallback: React.ReactNode;
};

export function platformV2SenseCardUiEnabled() {
  return process.env.NEXT_PUBLIC_PLATFORM_V2_SENSE_CARD_UI === "true";
}

export function TrainingSenseCardV2Tracer(props: Props) {
  const { onAvailabilityChange } = props;
  const [result, setResult] =
    React.useState<PlatformV2SingleSenseResult | null>(null);
  const [translationVisible, setTranslationVisible] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(
    async (signal?: AbortSignal) => {
      const next = await fetchPlatformV2SingleSense({
        query: props.word.headword,
        entryId: props.word.id,
        cardTypeId: props.mode,
        contentLanguageCode: props.contentLanguageCode,
        translationTargetLanguageCode:
          props.translationTargetLanguageCode === "off"
            ? null
            : props.translationTargetLanguageCode,
        signal,
      });
      setResult(next);
      return next;
    },
    [
      props.contentLanguageCode,
      props.mode,
      props.translationTargetLanguageCode,
      props.word.headword,
      props.word.id,
    ],
  );

  React.useEffect(() => {
    const controller = new AbortController();
    setResult(null);
    setError(null);
    setTranslationVisible(false);
    void load(controller.signal).catch((cause) => {
      if (controller.signal.aborted) return;
      setError(cause instanceof Error ? cause.message : "lookup_failed");
    });
    return () => controller.abort();
  }, [load]);

  React.useEffect(() => {
    onAvailabilityChange(Boolean(result));
    return () => onAvailabilityChange(false);
  }, [onAvailabilityChange, result]);

  if (!result) {
    return (
      <>
        {props.fallback}
        {error ? (
          <div role="status" className="sr-only">
            {error}
          </div>
        ) : null}
      </>
    );
  }

  const handleAction = async (capability: PlatformSenseCardCapabilityV2) => {
    if (capability.actionId === "review-card") {
      props.onLegacyReview(capability.reviewResult);
      return;
    }
    if (capability.actionId === "start-learning") {
      props.onLegacyStartLearning();
      return;
    }
    if (
      capability.actionId !== "mark-known" &&
      capability.actionId !== "undo-known"
    ) {
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await performPlatformV2CardAction(capability);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "action_failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SenseCardV2
      group={result.group}
      entry={result.entry}
      interfaceLanguage={props.interfaceLanguage}
      translationVisible={translationVisible}
      busy={busy}
      onToggleTranslation={() => setTranslationVisible((visible) => !visible)}
      onPlayAudio={props.onPlayAudio}
      onAction={(capability) => void handleAction(capability)}
    />
  );
}
