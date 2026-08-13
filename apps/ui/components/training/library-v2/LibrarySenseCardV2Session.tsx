"use client";

import React from "react";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import { platformV2Message } from "@/lib/platform/platformV2ClientI18n";
import {
  fetchPlatformV2MultiSenseGroup,
  requestPlatformV2LibraryTranslation,
} from "@/lib/platform/platformV2LibraryClient";
import {
  performPlatformV2TrainingAction,
  resolvePlatformV2Audio,
} from "@/lib/platform/platformV2TrainingClient";
import {
  addWordsToUserList,
  createUserList,
  fetchEntryListMemberships,
  removeWordsFromUserList,
} from "@/lib/trainingService";
import type {
  EntryLearningListMembership,
  WordListSummary,
} from "@/lib/types";
import type { CardTypeId } from "../../../../../packages/shared/types/platform";
import type { PlatformHeadwordGroupV2 } from "../../../../../packages/shared/types/platformV2";
import { LibrarySenseCardGroup } from "./LibrarySenseCardGroup";
import { LibraryCollectionsPicker } from "./LibraryCollectionsPicker";
import {
  buildLibrarySenseCardGroupModel,
  librarySenseCardIdentity,
  type LibraryMutationCapability,
} from "./librarySenseCardModel";

type Props = {
  entryId: string;
  initialGroup?: PlatformHeadwordGroupV2;
  headword: string;
  cardTypeId?: CardTypeId;
  contentLanguageCode: string;
  translationTargetLanguageCode: string | null;
  interfaceLanguage: OnboardingLanguage;
  userId?: string;
  userLists?: WordListSummary[];
  onListsUpdated?: () => Promise<void> | void;
  onTrainWord?: (entryId: string) => void;
  fallback: React.ReactNode;
};

export function LibrarySenseCardV2Session({
  entryId,
  initialGroup,
  headword,
  cardTypeId = "word-to-definition",
  contentLanguageCode,
  translationTargetLanguageCode,
  interfaceLanguage,
  userId,
  userLists = [],
  onListsUpdated,
  onTrainWord,
  fallback,
}: Props) {
  const translationLanguage =
    translationTargetLanguageCode === "off"
      ? null
      : translationTargetLanguageCode;
  const compatibleInitialGroup = React.useMemo(
    () =>
      initialGroup?.senseCount &&
      initialGroup.senseCount > 1 &&
      initialGroup.entries.some(
        (entry) => entry.kind === "sense-card" && entry.entryId === entryId,
      )
        ? initialGroup
        : null,
    [entryId, initialGroup],
  );
  const [group, setGroup] = React.useState<PlatformHeadwordGroupV2 | null>(
    compatibleInitialGroup,
  );
  const [busyIdentity, setBusyIdentity] = React.useState<string | null>(null);
  const [audioBusy, setAudioBusy] = React.useState(false);
  const [translationStates, setTranslationStates] = React.useState<
    Record<string, "pending" | "failed">
  >({});
  const [error, setError] = React.useState<string | null>(null);
  const [membershipsByEntryId, setMembershipsByEntryId] = React.useState<
    Record<string, EntryLearningListMembership[]>
  >({});
  const [collectionsEntryId, setCollectionsEntryId] = React.useState<
    string | null
  >(null);
  const [collectionBusyListId, setCollectionBusyListId] = React.useState<
    string | null
  >(null);
  const [collectionStatus, setCollectionStatus] = React.useState<string | null>(
    null,
  );
  const translationPollTimers = React.useRef<Record<string, number>>({});
  const translationSession = React.useRef(0);

  React.useEffect(() => {
    translationSession.current += 1;
    for (const timer of Object.values(translationPollTimers.current)) {
      window.clearTimeout(timer);
    }
    translationPollTimers.current = {};
    setTranslationStates({});
  }, [cardTypeId, entryId, translationLanguage]);

  const load = React.useCallback(
    async (signal?: AbortSignal, expectedTranslationSession?: number) => {
      const next = await fetchPlatformV2MultiSenseGroup({
        query: headword,
        entryId,
        cardTypeId,
        contentLanguageCode,
        translationTargetLanguageCode: translationLanguage,
        signal,
      });
      if (
        signal?.aborted ||
        (expectedTranslationSession != null &&
          expectedTranslationSession !== translationSession.current)
      ) {
        return next;
      }
      setGroup(next);
      return next;
    },
    [cardTypeId, contentLanguageCode, entryId, headword, translationLanguage],
  );

  React.useEffect(() => {
    const controller = new AbortController();
    setGroup(compatibleInitialGroup);
    setError(null);
    if (compatibleInitialGroup) return () => controller.abort();
    void load(controller.signal).catch(() => {
      if (!controller.signal.aborted) setGroup(null);
    });
    return () => controller.abort();
  }, [compatibleInitialGroup, load]);

  const model = React.useMemo(
    () =>
      group
        ? buildLibrarySenseCardGroupModel(group, interfaceLanguage, cardTypeId)
        : null,
    [cardTypeId, group, interfaceLanguage],
  );

  const loadMemberships = React.useCallback(
    async (entryIds: string[]) => {
      if (!userId || !entryIds.length) {
        setMembershipsByEntryId({});
        return;
      }
      try {
        const memberships = await fetchEntryListMemberships(entryIds);
        setMembershipsByEntryId(
          Object.fromEntries(
            entryIds.map((meaningEntryId) => [
              meaningEntryId,
              memberships.get(meaningEntryId) ?? [],
            ]),
          ),
        );
      } catch {
        setMembershipsByEntryId({});
      }
    },
    [userId],
  );

  React.useEffect(() => {
    if (!model) return;
    void loadMemberships(model.meanings.map((meaning) => meaning.entryId));
  }, [loadMemberships, model]);

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
        cacheOwnerId: userId ?? "library-anonymous",
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

  const collectionsMeaning = model?.meanings.find(
    (meaning) => meaning.entryId === collectionsEntryId,
  );

  const refreshMemberships = React.useCallback(async () => {
    if (!model) return;
    await loadMemberships(model.meanings.map((meaning) => meaning.entryId));
  }, [loadMemberships, model]);

  const handleToggleList = async (
    list: WordListSummary,
    included: boolean,
  ) => {
    if (!collectionsEntryId) return;
    setCollectionBusyListId(list.id);
    setCollectionStatus(null);
    try {
      const result = included
        ? await removeWordsFromUserList(list.id, [collectionsEntryId])
        : await addWordsToUserList(list.id, [collectionsEntryId]);
      if (result.error) throw result.error;
      await refreshMemberships();
      await onListsUpdated?.();
      setCollectionStatus(
        platformV2Message(interfaceLanguage, "senseCard.collections.saved"),
      );
    } catch {
      setCollectionStatus(
        platformV2Message(interfaceLanguage, "senseCard.collections.failed"),
      );
    } finally {
      setCollectionBusyListId(null);
    }
  };

  const handleCreateList = async (name: string) => {
    if (!userId || !collectionsEntryId) return;
    setCollectionBusyListId("__new__");
    setCollectionStatus(null);
    try {
      const created = await createUserList({
        userId,
        name,
        language_code: contentLanguageCode,
      });
      if (!created?.id) throw new Error("create_list_failed");
      const result = await addWordsToUserList(created.id, [collectionsEntryId]);
      if (result.error) throw result.error;
      await refreshMemberships();
      await onListsUpdated?.();
      setCollectionStatus(
        platformV2Message(interfaceLanguage, "senseCard.collections.saved"),
      );
    } catch {
      setCollectionStatus(
        platformV2Message(interfaceLanguage, "senseCard.collections.failed"),
      );
    } finally {
      setCollectionBusyListId(null);
    }
  };

  const handleRequestTranslation = React.useCallback(
    async (
      meaningEntryId: string,
      meaningCardTypeId: CardTypeId,
      force = false,
      expectedTranslationSession = translationSession.current,
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
        if (expectedTranslationSession !== translationSession.current) return;
        if (status === "ready") {
          await load(undefined, expectedTranslationSession);
          if (expectedTranslationSession !== translationSession.current) return;
          setTranslationStates((current) => {
            const next = { ...current };
            delete next[identity];
            return next;
          });
        } else if (status === "pending") {
          translationPollTimers.current[identity] = window.setTimeout(
            () =>
              void handleRequestTranslation(
                meaningEntryId,
                meaningCardTypeId,
                false,
                expectedTranslationSession,
              ),
            3000,
          );
        } else {
          setTranslationStates((current) => ({
            ...current,
            [identity]: "failed",
          }));
        }
      } catch {
        if (expectedTranslationSession !== translationSession.current) return;
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
        collectionCounts={Object.fromEntries(
          Object.entries(membershipsByEntryId).map(([meaningEntryId, lists]) => [
            meaningEntryId,
            lists.length,
          ]),
        )}
        onRequestTranslation={(meaningEntryId, meaningCardTypeId) =>
          void handleRequestTranslation(
            meaningEntryId,
            meaningCardTypeId,
            translationStates[
              librarySenseCardIdentity(meaningEntryId, meaningCardTypeId)
            ] === "failed",
          )
        }
        onOpenCollections={
          userId
            ? (meaning) => {
                setCollectionStatus(null);
                setCollectionsEntryId(meaning.entryId);
              }
            : undefined
        }
        onTrainNext={
          onTrainWord ? (meaning) => onTrainWord(meaning.entryId) : undefined
        }
        onAction={(capability) => void handleAction(capability)}
      />
      <LibraryCollectionsPicker
        open={Boolean(collectionsMeaning)}
        headword={model.headword}
        definition={collectionsMeaning?.definition?.text ?? ""}
        interfaceLanguage={interfaceLanguage}
        userLists={userLists}
        memberships={
          collectionsMeaning
            ? (membershipsByEntryId[collectionsMeaning.entryId] ?? [])
            : []
        }
        busyListId={collectionBusyListId}
        status={collectionStatus}
        onClose={() => setCollectionsEntryId(null)}
        onToggleList={(list, included) =>
          void handleToggleList(list, included)
        }
        onCreateList={(name) => void handleCreateList(name)}
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
