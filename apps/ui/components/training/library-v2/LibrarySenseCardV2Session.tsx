"use client";

import React from "react";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import {
  fetchPlatformV2MultiSenseGroup,
  requestPlatformV2LibraryTranslation,
} from "@/lib/platform/platformV2LibraryClient";
import {
  performPlatformV2TrainingAction,
  resolvePlatformV2Audio,
} from "@/lib/platform/platformV2TrainingClient";
import type { CardTypeId } from "../../../../../packages/shared/types/platform";
import type { PlatformHeadwordGroupV2 } from "../../../../../packages/shared/types/platformV2";
import { LibrarySenseCardGroup } from "./LibrarySenseCardGroup";
import {
  buildLibrarySenseCardGroupModel,
  librarySenseCardIdentity,
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
  const translationLanguage =
    translationTargetLanguageCode === "off"
      ? null
      : translationTargetLanguageCode;
  const [group, setGroup] = React.useState<PlatformHeadwordGroupV2 | null>(
    null,
  );
  const [busyIdentity, setBusyIdentity] = React.useState<string | null>(null);
  const [audioBusy, setAudioBusy] = React.useState(false);
  const [translationStates, setTranslationStates] = React.useState<
    Record<string, "pending" | "failed">
  >({});
  const [error, setError] = React.useState<string | null>(null);
  const translationPollTimers = React.useRef<Record<string, number>>({});

  React.useEffect(() => {
    for (const timer of Object.values(translationPollTimers.current)) {
      window.clearTimeout(timer);
    }
    translationPollTimers.current = {};
    setTranslationStates({});
  }, [cardTypeId, entryId, translationLanguage]);

  const load = React.useCallback(
    async (signal?: AbortSignal) => {
      const next = await fetchPlatformV2MultiSenseGroup({
        query: headword,
        entryId,
        cardTypeId,
        contentLanguageCode,
        translationTargetLanguageCode: translationLanguage,
        signal,
      });
      setGroup(next);
      return next;
    },
    [cardTypeId, contentLanguageCode, entryId, headword, translationLanguage],
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
        ? buildLibrarySenseCardGroupModel(group, interfaceLanguage, cardTypeId)
        : null,
    [cardTypeId, group, interfaceLanguage],
  );

  const handleAction = async (capability: LibraryMutationCapability) => {
    setBusyIdentity(
      librarySenseCardIdentity(
        capability.target.entryId,
        capability.target.cardTypeId,
      ),
    );
    setError(null);
    try {
      await performPlatformV2TrainingAction(capability);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "action_failed");
    } finally {
      setBusyIdentity(null);
    }
  };

  const handlePlayAudio = async () => {
    if (!group?.header.audio) return;
    setAudioBusy(true);
    setError(null);
    try {
      const url = await resolvePlatformV2Audio({
        capability: group.header.audio,
        text: group.header.text,
      });
      const audio = new Audio(url);
      await audio.play();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "audio_failed");
    } finally {
      setAudioBusy(false);
    }
  };

  const handleRequestTranslation = React.useCallback(
    async (
      meaningEntryId: string,
      meaningCardTypeId: CardTypeId,
      force = false,
    ) => {
      if (!translationLanguage) return;
      const identity = librarySenseCardIdentity(
        meaningEntryId,
        meaningCardTypeId,
      );
      if (translationPollTimers.current[identity]) {
        window.clearTimeout(translationPollTimers.current[identity]);
        delete translationPollTimers.current[identity];
      }
      setTranslationStates((current) => ({
        ...current,
        [identity]: "pending",
      }));
      try {
        const status = await requestPlatformV2LibraryTranslation({
          entryId: meaningEntryId,
          targetLanguageCode: translationLanguage,
          force,
        });
        if (status === "ready") {
          await load();
          setTranslationStates((current) => {
            const next = { ...current };
            delete next[identity];
            return next;
          });
        } else if (status === "pending") {
          translationPollTimers.current[identity] = window.setTimeout(
            () =>
              void handleRequestTranslation(meaningEntryId, meaningCardTypeId),
            3000,
          );
        } else {
          setTranslationStates((current) => ({
            ...current,
            [identity]: "failed",
          }));
        }
      } catch {
        setTranslationStates((current) => ({
          ...current,
          [identity]: "failed",
        }));
      }
    },
    [load, translationLanguage],
  );

  React.useEffect(() => {
    if (!model) return;
    setTranslationStates((current) => {
      const next = { ...current };
      for (const meaning of model.meanings) {
        const identity = librarySenseCardIdentity(
          meaning.entryId,
          meaning.cardTypeId,
        );
        if (
          meaning.translationStatus === "pending" ||
          meaning.translationStatus === "failed"
        ) {
          next[identity] = meaning.translationStatus;
        } else if (meaning.translationStatus === "ready") {
          delete next[identity];
        }
      }
      return next;
    });
    for (const meaning of model.meanings) {
      if (meaning.translationStatus !== "pending") continue;
      const identity = librarySenseCardIdentity(
        meaning.entryId,
        meaning.cardTypeId,
      );
      if (translationPollTimers.current[identity]) continue;
      translationPollTimers.current[identity] = window.setTimeout(
        () =>
          void handleRequestTranslation(meaning.entryId, meaning.cardTypeId),
        3000,
      );
    }
  }, [handleRequestTranslation, model]);

  React.useEffect(
    () => () => {
      for (const timer of Object.values(translationPollTimers.current)) {
        window.clearTimeout(timer);
      }
      translationPollTimers.current = {};
    },
    [],
  );

  if (!model) return <>{fallback}</>;

  return (
    <div className="relative h-full min-h-0">
      <LibrarySenseCardGroup
        model={model}
        interfaceLanguage={interfaceLanguage}
        busyIdentity={busyIdentity}
        audioBusy={audioBusy}
        onPlayAudio={
          model.audioCapability ? () => void handlePlayAudio() : undefined
        }
        translationEnabled={Boolean(translationLanguage)}
        translationStates={translationStates}
        onRequestTranslation={(meaningEntryId, meaningCardTypeId) =>
          void handleRequestTranslation(
            meaningEntryId,
            meaningCardTypeId,
            translationStates[
              librarySenseCardIdentity(meaningEntryId, meaningCardTypeId)
            ] === "failed",
          )
        }
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
