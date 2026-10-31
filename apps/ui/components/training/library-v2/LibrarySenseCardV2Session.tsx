"use client";
import { useCardLoadDiagnostics } from "@/lib/diagnostics/useCardLoadDiagnostics";
import {useSelectedMembership} from '@/components/library/sharing/useSelectedMembership';
import {clearPlatformNoteMaterial} from "@/lib/platform/noteMaterialPresentation";

import { useUserEventHints } from "@/lib/events/userEventHints";
import React from "react";
import { TrainingExclusionUndoNotice } from "../v2/TrainingExclusionUndoNotice";
import { getUiMessages } from "@/lib/uiMessages";
import { onDictionaryTranslationReady, onDictionaryTranslationRevalidate } from "@/lib/translation/dictionaryTranslationEvents";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import { platformV2Message } from "@/lib/platform/platformV2ClientI18n";
import {
  fetchPlatformV2CrossReferenceTarget,
  fetchPlatformV2LibraryGroup,
  requestPlatformV2LibraryTranslation,
} from "@/lib/platform/platformV2LibraryClient";
import { resolvePlatformV2Audio } from "@/lib/platform/platformV2TrainingClient";
import { performPlatformV2LibraryAction } from "@/lib/platform/platformV2TrainingActionClient";
import {
  addWordsToUserList,
  createUserList,
  fetchEntryListMemberships,
  removeWordsFromUserList,
} from "@/lib/trainingService";
import type { EntryLearningListMembership, WordListSummary } from "@/lib/types";
import type { CardTypeId } from "../../../../../packages/shared/types/platform";
import type { PlatformHeadwordGroupV2 } from "../../../../../packages/shared/types/platformV2";
import { LibrarySenseCardGroup } from "./LibrarySenseCardGroup";
import { LibraryCollectionsPicker } from "./LibraryCollectionsPicker";
import { SenseCardReportSheet } from "@/components/feedback/SenseCardReportSheet";
import { freezeSenseCardDiagnosticSnapshot } from "@/lib/feedback/diagnosticReportClient";
import {
  buildLibrarySenseCardGroupModel,
  librarySenseCardIdentity,
  type LibraryMutationCapability,
} from "./librarySenseCardModel";

import { readCurrentTrainingCard, type CurrentTrainingCardContext } from "@/lib/platform/trainingCurrentCardClient";
import { IndependentEntryCopyDialog, type OpenIndependentCopy } from "./IndependentEntryCopyDialog";
import { AuthorEntryArchiveDialog } from "./AuthorEntryArchiveDialog";
import { trainingArticleProtection, type TrainingArticleGuard } from "./trainingArticleGuard";

type Props = {
  trainingGuard?: TrainingArticleGuard;
  currentCard?: CurrentTrainingCardContext;
  revealActiveMeaning?: boolean;
  entryId: string;
  initialGroup?: PlatformHeadwordGroupV2;
  headword: string;
  cardTypeId?: CardTypeId;
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
};

type DetailsContext = "library" | "training-more";

export function LibrarySenseCardV2Session(props: Props) {
  return <SenseCardV2Session {...props} cardTypeId="word-to-definition" context="library" />;
}

export function TrainingMoreSenseCardV2Session(props: Props) {
  return <SenseCardV2Session {...props} trainingGuard={props.trainingGuard ?? {entryId:props.entryId,headwordGroupId:props.initialGroup?.headwordGroupId ?? null}} context="training-more" />;
}

function SenseCardV2Session({
  trainingGuard,
  currentCard,
  revealActiveMeaning = true,
  context,
  entryId,
  initialGroup,
  headword,
  cardTypeId = "word-to-definition",
  contentLanguageCode,
  translationTargetLanguageCode,
  interfaceLanguage,
  userId,
  userLists = [],
  currentCollection,
  dictionaryIdInSummary,
  onArchived,
  onOpenCopied,
  onListsUpdated,
  onTrainWord,
  onOpenListMembership,
}: Props & { context: DetailsContext }) {
  const permittedCurrentCard = context === "training-more" ? currentCard : undefined;
  const translationLanguage =
    translationTargetLanguageCode === "off"
      ? null
      : translationTargetLanguageCode;
  const compatibleInitialGroup = React.useMemo(() => {
    const selectedEntry = initialGroup?.entries.find((entry) =>
      entry.kind === "sense-card"
        ? entry.entryId === entryId
        : entry.crossReferenceId === entryId,
    );
    if (!initialGroup || !selectedEntry) return null;
    if (selectedEntry.kind === "sense-card" && selectedEntry.card && selectedEntry.card.cardTypeId !== cardTypeId) return null;
    return clearPlatformNoteMaterial(initialGroup);
  }, [entryId, initialGroup, cardTypeId]);
  const [group, setGroup] = React.useState<PlatformHeadwordGroupV2 | null>(
    compatibleInitialGroup,
  );
  const [activeReferenceTarget, setActiveReferenceTarget] = React.useState<{
    query: string;
    sourceDictionaryId: string;
    targetHeadwordGroupId: string | null;
    targetEntryId: string | null;
  } | null>(null);
  const [busyIdentity, setBusyIdentity] = React.useState<string | null>(null);
  const copyReviewGeneration = React.useRef(0);
  const [copyReviewRequired,setCopyReviewRequired] = React.useState(false);
  const [copyEntryId,setCopyEntryId] = React.useState<string|null>(null);
  const [archiveEntryId, setArchiveEntryId] = React.useState<string | null>(null);
  const [audioBusy, setAudioBusy] = React.useState(false);
  const audioController=React.useRef<AbortController|null>(null);
  const [translationStates, setTranslationStates] = React.useState<
    Record<string, "pending" | "failed">
  >({});
  const [error, setError] = React.useState<string | null>(null);
  const [savedReviewMessageKey, setSavedReviewMessageKey] = React.useState<string | null>(null);
  const [lookupError, setLookupError] = React.useState<
    "forbidden" | "timeout" | "contract" | "unavailable" | null
  >(null);
  const [acceptedRefreshFailed, setAcceptedRefreshFailed] = React.useState(false);
  const unverifiedActionIdentity = React.useRef<string | null>(null);
  const [lookupRetry, setLookupRetry] = React.useState(0);
  const [loading, setLoading] = React.useState(!compatibleInitialGroup);
  const [membershipsByEntryId, setMembershipsByEntryId] = React.useState<
    Record<string, EntryLearningListMembership[]>
  >({});
  const [membershipState, setMembershipState] = React.useState<"loading" | "ready" | "failed">("loading");
  const [collectionsEntryId, setCollectionsEntryId] = React.useState<
    string | null
  >(null);
  const [collectionBusyListId, setCollectionBusyListId] = React.useState<
    string | null
  >(null);
  const [reportSnapshot, setReportSnapshot] = React.useState<ReturnType<typeof freezeSenseCardDiagnosticSnapshot> | null>(null);
  const [collectionStatus, setCollectionStatus] = React.useState<string | null>(
    null,
  );
  const [activeMeaningId, setActiveMeaningId] = React.useState<string>(entryId);
  const visibleMeaningRef=React.useRef({activeMeaningId,revealActiveMeaning,translationLanguage});
  visibleMeaningRef.current={activeMeaningId,revealActiveMeaning,translationLanguage};
  const translationPollTimers = React.useRef<Record<string, number>>({});
  const translationRequests = React.useRef(new Map<string, AbortController>());
  const translationSession = React.useRef(0);
  const groupRequestSequence = React.useRef(0);
  const actionGeneration = React.useRef(0);
  const pendingActions = React.useRef(new Set<string>());
  const membershipGeneration = React.useRef(0);
  const pendingCollectionWrites = React.useRef(0);
  const detailIdentity = JSON.stringify([
    entryId,
    currentCollection?.id ?? null,
    userId ?? null,
    cardTypeId,
    contentLanguageCode,
    translationLanguage,
    permittedCurrentCard?.sessionId ?? null,
    permittedCurrentCard?.permitId ?? null,
    activeReferenceTarget?.query ?? null,
    activeReferenceTarget?.sourceDictionaryId ?? null,
    activeReferenceTarget?.targetHeadwordGroupId ?? null,
    activeReferenceTarget?.targetEntryId ?? null,
  ]);
  useCardLoadDiagnostics(detailIdentity, loading ? "loading" : lookupError || !group ? "failed" : "ready");
  const detailIdentityRef = React.useRef(detailIdentity);
  const [noteAuthority,setNoteAuthority]=React.useState<{scope:string;group:PlatformHeadwordGroupV2}|null>(null);
  React.useEffect(()=>()=>audioController.current?.abort(),[detailIdentity]);

  React.useEffect(() => {
    detailIdentityRef.current = detailIdentity;
    actionGeneration.current += 1;
    membershipGeneration.current += 1;
    setBusyIdentity(null);
    setAudioBusy(false);
    setAcceptedRefreshFailed(false);
    unverifiedActionIdentity.current = null;
    setError(null);
    setSavedReviewMessageKey(null);
    setMembershipsByEntryId({});
    setMembershipState("loading");
    setCollectionsEntryId(null);
    setCollectionBusyListId(null);
    setCollectionStatus(null);
    setReportSnapshot(null);
    setArchiveEntryId(null);
  }, [detailIdentity]);

  React.useEffect(() => {
    translationSession.current += 1;
    for (const controller of translationRequests.current.values()) controller.abort();
    translationRequests.current.clear();
    for (const timer of Object.values(translationPollTimers.current)) {
      window.clearTimeout(timer);
    }
    translationPollTimers.current = {};
    setTranslationStates({});
  }, [detailIdentity]);

  React.useEffect(() => {
    setActiveReferenceTarget(null);
  }, [entryId]);

  const load = React.useCallback(
    async (
      signal?: AbortSignal,
      expectedTranslationSession?: number,
      expectedDetailIdentity?: string,
    ) => {
      if (
        expectedDetailIdentity &&
        expectedDetailIdentity !== detailIdentityRef.current
      ) {
        return null;
      }
      const copyReviewAtStart = copyReviewGeneration.current;
      const requestSequence = ++groupRequestSequence.current;
      setLoading(true);
      try {
      const readArticle = async () => {
        // Normal Library authorization owns the whole article, including siblings.
        // The displayed-card exception is only a fallback for an unavailable entry;
        // its exact-entry response must never inherit siblings from the display seed.
        try {
          const article = await fetchPlatformV2LibraryGroup({
            entryId, cardTypeId, contentLanguageCode,
            translationTargetLanguageCode: translationLanguage, signal,
            ...(userId?{expectedUserId:userId}:{}),
          });
          if (article || !permittedCurrentCard || !userId) return article;
        } catch (cause) {
          if (!permittedCurrentCard || !userId || signal?.aborted) throw cause;
        }
        if (signal?.aborted || requestSequence !== groupRequestSequence.current) return null;
        // A failed ordinary read cannot keep authorizing the full seeded article.
        setGroup(null);
        return (await readCurrentTrainingCard(userId!, {
          ...permittedCurrentCard!, entryId, cardTypeId, contentLanguageCode,
          translationTargetLanguageCode: translationLanguage,
        }, signal)).groups[0] ?? null;
      };
      const next = activeReferenceTarget
        ? await fetchPlatformV2CrossReferenceTarget({
            query: activeReferenceTarget.query,
            sourceDictionaryId: activeReferenceTarget.sourceDictionaryId,
            targetHeadwordGroupId: activeReferenceTarget.targetHeadwordGroupId,
            targetEntryId: activeReferenceTarget.targetEntryId,
            cardTypeId,
            contentLanguageCode,
            translationTargetLanguageCode: translationLanguage,
            signal,
            ...(userId?{expectedUserId:userId}:{}),
          })
        : await readArticle();
      if (
        signal?.aborted ||
        requestSequence !== groupRequestSequence.current ||
        (expectedTranslationSession != null &&
          expectedTranslationSession !== translationSession.current) ||
        (expectedDetailIdentity &&
          expectedDetailIdentity !== detailIdentityRef.current)
      ) {
        return null;
      }
      setGroup(next);
      setNoteAuthority(next?{scope:detailIdentity,group:next}:null);
      if (next && copyReviewGeneration.current === copyReviewAtStart) setCopyReviewRequired(false);
      if (!next) setLookupError("unavailable");
      setLoading(false);
      return next;
      } catch (error) {
        if (!signal?.aborted && requestSequence === groupRequestSequence.current &&
            (expectedTranslationSession == null || expectedTranslationSession === translationSession.current) &&
            (!expectedDetailIdentity || expectedDetailIdentity === detailIdentityRef.current)) {
          setLoading(false);
          if (!(error && typeof error === "object" && "name" in error && error.name === "AbortError")) setLookupError("unavailable");
        }
        throw error;
      }
    },
    [
      activeReferenceTarget,
      detailIdentity,
      permittedCurrentCard,
      userId,
      cardTypeId,
      contentLanguageCode,
      entryId,
      translationLanguage,
    ],
  );

  React.useEffect(() => {
    const controller = new AbortController();
    setGroup(compatibleInitialGroup);
    setError(null);
    setLookupError(null);
    // initialGroup is a display seed, not evidence of the current server policy.
    void load(controller.signal)
      .catch((cause) => {
        const aborted =
          controller.signal.aborted ||
          Boolean(
            cause &&
              typeof cause === "object" &&
              "name" in cause &&
              cause.name === "AbortError",
          );
        if (!aborted) {
          const message = cause instanceof Error ? cause.message : "";
          setLookupError(
            message === "platform_request_timeout"
              ? "timeout"
              : message === "contract-mismatch"
                ? "contract"
                : message === "lookup_http_401" || message === "lookup_http_403"
                  ? "forbidden"
                  : "unavailable",
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [activeReferenceTarget, compatibleInitialGroup, load, lookupRetry]);

  const model = React.useMemo(() => {
    const matchesSelectedEntry = group?.entries.some((candidate) =>
      candidate.kind === "sense-card"
        ? candidate.entryId === entryId
        : candidate.crossReferenceId === entryId,
    );
    const compatibleGroup =
      group && (activeReferenceTarget || matchesSelectedEntry) ? group : null;
    return compatibleGroup
      ? buildLibrarySenseCardGroupModel(
          userId&&noteAuthority?.scope===detailIdentity&&noteAuthority.group===compatibleGroup?compatibleGroup:clearPlatformNoteMaterial(compatibleGroup),
          interfaceLanguage,
          cardTypeId,
        )
      : null;
  }, [activeReferenceTarget, cardTypeId, entryId, group, interfaceLanguage,userId,detailIdentity,noteAuthority]);

  React.useEffect(() => {
    setActiveMeaningId(entryId);
  }, [entryId]);

  React.useEffect(() => {
    if (!group) return;
    const matchingActiveEntry = group.entries.find((candidate) =>
      candidate.kind === "sense-card"
        ? candidate.entryId === activeMeaningId
        : candidate.crossReferenceId === activeMeaningId,
    );
    if (matchingActiveEntry) return;

    const targetEntryId = activeReferenceTarget?.targetEntryId;
    if (targetEntryId) {
      const matchingTargetEntry = group.entries.find(
        (candidate) =>
          candidate.kind === "sense-card" &&
          candidate.entryId === targetEntryId,
      );
      if (matchingTargetEntry) {
        setActiveMeaningId(targetEntryId);
      }
      return;
    }

    if (activeReferenceTarget) {
      const firstMeaning = group.entries.find(
        (candidate) => candidate.kind === "sense-card",
      );
      if (firstMeaning) setActiveMeaningId(firstMeaning.entryId);
      return;
    }

    const firstMeaning = group.entries.find(
      (candidate) => candidate.kind === "sense-card",
    );
    if (firstMeaning) {
      setActiveMeaningId(firstMeaning.entryId);
    }
  }, [activeMeaningId, activeReferenceTarget, group]);

  const loadMemberships = React.useCallback(
    async (
      entryIds: string[],
      expectedDetailIdentity: string,
      preserveReady = false,
    ) => {
      if (expectedDetailIdentity !== detailIdentityRef.current) return false;
      const expectedMembershipGeneration = ++membershipGeneration.current;
      const isCurrent = () =>
        expectedDetailIdentity === detailIdentityRef.current &&
        expectedMembershipGeneration === membershipGeneration.current;
      if (!userId || !entryIds.length) {
        if (isCurrent()) { setMembershipsByEntryId({}); setMembershipState("ready"); }
        return isCurrent();
      }
      setMembershipState(previous => preserveReady && previous === "ready" ? "ready" : "loading");
      try {
        const memberships = await fetchEntryListMemberships(entryIds);
        if (!isCurrent()) return false;
        setMembershipsByEntryId(
          Object.fromEntries(
            entryIds.map((meaningEntryId) => [
              meaningEntryId,
              memberships.get(meaningEntryId) ?? [],
            ]),
          ),
        );
        setMembershipState("ready");
        return true;
      } catch {
        // A failed read is unknown, not an empty membership set.
        if (isCurrent()) setMembershipState("failed");
        return false;
      }
    },
    [userId],
  );

  const selectedMembership=useSelectedMembership(userId??'',currentCollection?.type==='user'?currentCollection.id:null,model?.meanings.map(meaning=>meaning.entryId)??[],detailIdentity,context==='library'&&Boolean(userId)&&process.env.NEXT_PUBLIC_COLLECTION_SHARING_ENABLED==='true');
  const refreshSelectedMembership=selectedMembership.refresh;
  const membershipEntryIdsKey=JSON.stringify(model?.meanings.map(meaning=>meaning.entryId)??[]);
  React.useEffect(() => {
    const ids=JSON.parse(membershipEntryIdsKey) as string[];
    if (!ids.length) {
      membershipGeneration.current += 1;
      setMembershipsByEntryId({});
      return;
    }
    void loadMemberships(ids,detailIdentity);
  }, [detailIdentity, loadMemberships, membershipEntryIdsKey]);

  const materialReadController=React.useRef<AbortController|null>(null);
  React.useEffect(()=>()=>{materialReadController.current?.abort();},[detailIdentity]);
  const flushCollectionHints = useUserEventHints(userId, ["collections.changed","notes.changed"], async () => {
    materialReadController.current?.abort();
    const controller=new AbortController();materialReadController.current=controller;
    // Hints never carry trusted note text or grant continued display authority.
    setGroup(current=>current?clearPlatformNoteMaterial(current):null);
    await Promise.allSettled([
      model?loadMemberships(model.meanings.map(meaning=>meaning.entryId),detailIdentity,true):Promise.resolve(),
      load(controller.signal,undefined,detailIdentity),
    ]);
  }, () => pendingCollectionWrites.current > 0 || pendingActions.current.has(detailIdentityRef.current));

  const handleAction = async (capability: LibraryMutationCapability) => {
    const expectedDetailIdentity = detailIdentityRef.current;
    const pendingKey = expectedDetailIdentity;
    if (unverifiedActionIdentity.current === expectedDetailIdentity) return;
    if (trainingGuard?.entryId === capability.target.entryId) return;
    if (pendingActions.current.has(pendingKey)) return;
    pendingActions.current.add(pendingKey);
    const expectedActionGeneration = ++actionGeneration.current;
    const isCurrentAction = () =>
      expectedDetailIdentity === detailIdentityRef.current &&
      expectedActionGeneration === actionGeneration.current;
    setBusyIdentity(
      librarySenseCardIdentity(
        capability.target.entryId,
        capability.target.cardTypeId,
      ),
    );
    setError(null);
    setSavedReviewMessageKey(null);
    try {
      await performPlatformV2LibraryAction(capability);
      if (!isCurrentAction()) return;
      unverifiedActionIdentity.current = expectedDetailIdentity;
      const fresh = await load(undefined, undefined, expectedDetailIdentity);
      if (!fresh) throw new Error("accepted_action_refresh_failed");
      if (isCurrentAction()) {
        unverifiedActionIdentity.current = null;
        if (capability.actionId === "review-card") setSavedReviewMessageKey(capability.messageKey);
      }
    } catch (cause) {
      if (isCurrentAction()) {
        if (unverifiedActionIdentity.current === expectedDetailIdentity) {
          setAcceptedRefreshFailed(true);
          setLoading(false);
        } else if(cause instanceof Error && ["state_conflict","card_is_known","platform_action_not_available"].includes(cause.message)){
          await load(undefined,undefined,expectedDetailIdentity);
          if(isCurrentAction())setError(platformV2Message(interfaceLanguage,"senseCard.training.stateRefreshed"));
        }else setError(getUiMessages(interfaceLanguage).trainingSession.exclusion.failed);
      }
    } finally {
      pendingActions.current.delete(pendingKey);
      flushCollectionHints();
      if (isCurrentAction()) setBusyIdentity(null);
    }
  };

  const retryAcceptedRefresh = async () => {
    const expected = detailIdentityRef.current;
    try {
      const fresh = await load(undefined, undefined, expected);
      if (fresh && expected === detailIdentityRef.current) {
        unverifiedActionIdentity.current = null;
        setAcceptedRefreshFailed(false);
        setLookupError(null);
      }
    } catch {
      // The mutation was accepted. Retry only its read, never the action.
    } finally {
      if (expected === detailIdentityRef.current) setLoading(false);
    }
  };

  const handlePlayAudio = async () => {
    if (!group?.header.audio || !userId || audioController.current) return;
    const selected=group.entries.find(entry=>entry.kind==="sense-card"&&entry.entryId===entryId)
      ??group.entries.find(entry=>entry.kind==="sense-card");
    if(!selected||selected.kind!=="sense-card")return;
    const controller=new AbortController();audioController.current=controller;
    const expected=detailIdentityRef.current;
    const isCurrent=()=>!controller.signal.aborted&&expected===detailIdentityRef.current;
    setAudioBusy(true);setError(null);
    try {
      const url = await resolvePlatformV2Audio({
        cacheOwnerId: userId,entryId:selected.entryId,sourceVersion:selected.sourceVersion,
        currentCard:selected.entryId===entryId?permittedCurrentCard:undefined,
        signal:controller.signal,capability: group.header.audio,text: group.header.text,
      });
      if(!isCurrent())return;
      const audio = new Audio(url);await audio.play();
    } catch (cause) {
      if(isCurrent())setError(cause instanceof Error ? cause.message : "audio_failed");
    } finally {
      if(audioController.current===controller){audioController.current=null;if(expected===detailIdentityRef.current)setAudioBusy(false);}
    }
  };

  const collectionsMeaning = model?.meanings.find(
    (meaning) => meaning.entryId === collectionsEntryId,
  );

  const refreshMemberships = React.useCallback(async () => {
    if (!model) return;
    const results=await Promise.all([
      loadMemberships(model.meanings.map(meaning=>meaning.entryId),detailIdentity),
      refreshSelectedMembership(),
    ]);
    return results.every(Boolean);
  }, [detailIdentity, loadMemberships, model, refreshSelectedMembership]);

  const handleToggleList = async (list: WordListSummary, included: boolean, targetEntryId = collectionsEntryId) => {
    if (!targetEntryId || pendingCollectionWrites.current > 0) return;
    const isCurrent = () => detailIdentity === detailIdentityRef.current;
    pendingCollectionWrites.current++;
    setCollectionBusyListId(list.id);
    setCollectionStatus(null);
    try {
      const result = included
        ? await removeWordsFromUserList(list.id, [targetEntryId])
        : await addWordsToUserList(list.id, [targetEntryId]);
      if (result.error) throw result.error;
      const membershipsReady = await refreshMemberships();
      if (!isCurrent()) return;
      // List counts elsewhere may refresh after the saved membership is shown.
      void Promise.resolve(onListsUpdated?.()).catch(() => undefined);
      if (!membershipsReady) return;
      setCollectionStatus(
        platformV2Message(interfaceLanguage, "senseCard.collections.saved"),
      );
    } catch {
      // The server may have committed before a connection failed. Reconcile by
      // reading only; never replay a membership mutation automatically.
      if (isCurrent()) await refreshMemberships();
      if (isCurrent()) {
        setCollectionStatus(
          platformV2Message(interfaceLanguage, "senseCard.collections.failed"),
        );
      }
    } finally {
      pendingCollectionWrites.current--;
      if (isCurrent()) setCollectionBusyListId(null);
      flushCollectionHints();
    }
  };

  const handleCreateList = async (name: string) => {
    if (!userId || !collectionsEntryId) return;
    const isCurrent = () => detailIdentity === detailIdentityRef.current;
    pendingCollectionWrites.current++;
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
      const membershipsReady = await refreshMemberships();
      if (!isCurrent()) return;
      await onListsUpdated?.();
      if (!isCurrent() || !membershipsReady) return;
      setCollectionStatus(
        platformV2Message(interfaceLanguage, "senseCard.collections.saved"),
      );
    } catch {
      if (isCurrent()) {
        setCollectionStatus(
          platformV2Message(interfaceLanguage, "senseCard.collections.failed"),
        );
      }
    } finally {
      pendingCollectionWrites.current--;
      if (isCurrent()) setCollectionBusyListId(null);
      flushCollectionHints();
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
      if (translationRequests.current.has(meaningEntryId)) return;
      const controller = new AbortController();
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
      translationRequests.current.set(meaningEntryId, controller);
      try {
        const status = await requestPlatformV2LibraryTranslation({
          entryId: meaningEntryId,
          ...(meaningEntryId === entryId && permittedCurrentCard ? { currentCard: permittedCurrentCard } : {}),
          targetLanguageCode: translationLanguage,
          force,
          signal: controller.signal,
        });
        if (controller.signal.aborted || expectedTranslationSession !== translationSession.current) return;
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
        if (controller.signal.aborted || expectedTranslationSession !== translationSession.current) return;
        setTranslationStates((current) => ({
          ...current,
          [identity]: "failed",
        }));
      } finally {
        if (translationRequests.current.get(meaningEntryId) === controller) translationRequests.current.delete(meaningEntryId);
      }
    },
    [load, translationLanguage, entryId, permittedCurrentCard],
  );

  const automaticallyPrepared = React.useRef(new Set<string>());
  React.useEffect(() => {
    if (!revealActiveMeaning || loading || !group || !translationLanguage) return;
    const entry = group.entries.find(item => item.kind === "sense-card" && item.entryId === activeMeaningId);
    if (!entry || entry.kind !== "sense-card") return;
    const capability = entry.capabilities.find(item => item.actionId === "request-translation");
    if (!capability) return;
    const key = `${detailIdentity}:${entry.entryId}:${entry.contentRevision}`;
    if (automaticallyPrepared.current.has(key)) return;
    automaticallyPrepared.current.add(key);
    if (automaticallyPrepared.current.size > 64) automaticallyPrepared.current.delete(automaticallyPrepared.current.values().next().value!);
    void handleRequestTranslation(entry.entryId, entry.card?.cardTypeId ?? cardTypeId);
  }, [activeMeaningId, cardTypeId, detailIdentity, group, handleRequestTranslation, loading, revealActiveMeaning, translationLanguage]);

  React.useEffect(() => onDictionaryTranslationRevalidate(() => {
    if (!translationLanguage || translationRequests.current.size || loading) return;
    const expected=translationSession.current;
    void load(undefined,expected,detailIdentity).then(next=>{
      if(expected!==translationSession.current||detailIdentity!==detailIdentityRef.current)return;
      if(!visibleMeaningRef.current.revealActiveMeaning||visibleMeaningRef.current.activeMeaningId!==activeMeaningId||visibleMeaningRef.current.translationLanguage!==translationLanguage)return;
      const entry=next?.entries.find(item=>item.kind==="sense-card"&&item.entryId===activeMeaningId);
      if(entry?.kind==="sense-card"&&entry.capabilities.some(cap=>cap.actionId==="request-translation"&&cap.targetLanguageCode===translationLanguage))void handleRequestTranslation(entry.entryId,entry.card?.cardTypeId??cardTypeId,false,expected);
    }).catch(() => { /* load exposes retry. */ });
  }, activeMeaningId && translationLanguage && translationLanguage !== "off" ? { entryId: activeMeaningId, targetLanguageCode: translationLanguage } : undefined), [activeMeaningId,cardTypeId,detailIdentity,handleRequestTranslation,load,loading,translationLanguage]);

  const translationEntryIdsKey = JSON.stringify(group?.entries.filter(entry => entry.kind === "sense-card").map(entry => entry.entryId).sort() ?? []);
  React.useEffect(() => {
    if (!translationLanguage || translationLanguage === "off") return;
    const entryIds = JSON.parse(translationEntryIdsKey) as string[];
    const controller = new AbortController();
    let reading = false, dirty = false;
    const refresh = async () => {
      if (controller.signal.aborted) return;
      dirty = true;
      if (reading) return;
      reading = true;
      // First-join hints for several meanings share one group projection read.
      await Promise.resolve();
      try {
        if (controller.signal.aborted) return;
        do {
          dirty = false;
          try { await load(controller.signal, undefined, detailIdentity); }
          catch { /* A newer hint still gets its follow-up after a failed read. */ }
        } while (dirty && !controller.signal.aborted);
      } catch { /* load retains the visible card and exposes lookup retry. */ }
      finally { reading = false; }
    };
    const stops = entryIds.map(entryId => onDictionaryTranslationReady(translation => {
      if (translation.entryId !== entryId || translation.targetLanguageCode !== translationLanguage) return;
      void refresh();
    }, { entryId, targetLanguageCode: translationLanguage }));
    return () => { controller.abort(); stops.forEach(stop => stop()); };
  }, [detailIdentity, translationEntryIdsKey, load, translationLanguage]);

  React.useEffect(() => {
    if (!model) return;
    setTranslationStates((current) => {
      const next = { ...current };
      for (const meaning of model.meanings) {
        const identity = librarySenseCardIdentity(
          meaning.entryId,
          meaning.cardTypeId,
        );
        if (translationRequests.current.has(meaning.entryId)) continue;
        if (
          meaning.translationStatus === "pending" ||
          meaning.translationStatus === "failed"
        ) {
          next[identity] = meaning.translationStatus;
        } else if (meaning.translationStatus === "ready" && !meaning.translationNeedsPreparation && !translationRequests.current.has(meaning.entryId)) {
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
      translationSession.current += 1;
      for (const controller of translationRequests.current.values()) controller.abort();
      translationRequests.current.clear();
      for (const timer of Object.values(translationPollTimers.current)) {
        window.clearTimeout(timer);
      }
      translationPollTimers.current = {};
    },
    [],
  );

  const lookupErrorText = lookupError
    ? platformV2Message(interfaceLanguage, `senseCard.lookup.${lookupError}`)
    : null;
  const errorNotice =
    acceptedRefreshFailed || lookupErrorText || error ? (
      <p
        role="alert"
        className="absolute inset-x-4 bottom-4 rounded-xl border border-rose-400/50 bg-rose-950/90 px-3 py-2 text-sm text-rose-100"
      >
        {acceptedRefreshFailed ? platformV2Message(interfaceLanguage, "senseCard.learning.savedReloadFailed") : lookupErrorText ?? error}
        {lookupError || acceptedRefreshFailed ? (
          <button
            type="button"
            className="ml-3 rounded-full border border-current px-3 py-1 font-semibold"
            disabled={loading}
            onClick={() => acceptedRefreshFailed ? void retryAcceptedRefresh() : setLookupRetry((current) => current + 1)}
          >
            {platformV2Message(interfaceLanguage, "common.retry")}
          </button>
        ) : null}
      </p>
    ) : null;

  if (!model) {
    return (
      <div className="relative h-full min-h-0">
        {loading || !lookupError ? (
          <div
            data-testid="library-sense-card-loading"
            className="flex h-full items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 text-sm font-semibold text-slate-500 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-400"
          >
            {platformV2Message(interfaceLanguage, "senseCard.details.loading")}
          </div>
        ) : (
          <div
            data-testid="library-sense-card-unavailable"
            className="flex h-full items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 text-center text-sm font-semibold text-slate-500 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-400"
          >
            {platformV2Message(
              interfaceLanguage,
              "senseCard.details.unavailable",
            )}
          </div>
        )}
        {errorNotice}
      </div>
    );
  }

  const reportableEntryIds = new Set((group?.entries ?? []).flatMap(entry => entry.kind === "sense-card" && entry.reportContentRevision &&
    entry.capabilities.some(capability => capability.actionId === "report-content" && capability.target.kind === "entry") ? [entry.entryId] : []));

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      {userId && context === "library" ? <TrainingExclusionUndoNotice userId={userId} language={interfaceLanguage}/> : null}
      <div className="min-h-0 flex-1">
        <LibrarySenseCardGroup
          currentCard={permittedCurrentCard}
          currentCardEntryId={permittedCurrentCard ? entryId : undefined}
          contentLanguage={group?.dictionary.sourceLanguageCode ?? contentLanguageCode}
          translationLanguage={translationLanguage??undefined}
          userId={userId}
          model={model}
          dictionaryIdInSummary={dictionaryIdInSummary}
          interfaceLanguage={interfaceLanguage}
          busyIdentity={busyIdentity}
          actionsDisabled={acceptedRefreshFailed}
          activeTrainingEntryId={trainingGuard?.entryId}
          headwordTrainingBlocked={trainingArticleProtection(trainingGuard, "", group?.headwordGroupId ?? "").headword}
          audioBusy={audioBusy}
          onPlayAudio={
            model.audioCapability ? () => void handlePlayAudio() : undefined
          }
          translationEnabled={
            Boolean(translationLanguage) && model.meanings.length > 0
          }
          translationStates={translationStates}
          collectionCounts={Object.fromEntries(
            Object.entries(membershipsByEntryId).map(
              ([meaningEntryId, lists]) => [
                meaningEntryId,
                lists.filter((list) => list.listType === "user").length,
              ],
            ),
          )}
          currentCollection={context === "library" && currentCollection ? {
            name: currentCollection.name,
            membershipState: process.env.NEXT_PUBLIC_COLLECTION_SHARING_ENABLED==='true'&&currentCollection.type==='user'?(selectedMembership.status==='ready'?'ready':selectedMembership.status==='error'?'failed':'loading'):membershipState,
            includedEntryIds: process.env.NEXT_PUBLIC_COLLECTION_SHARING_ENABLED==='true'&&currentCollection.type==='user'?new Set(selectedMembership.source??[]): new Set(Object.entries(membershipsByEntryId).filter(([, lists]) =>
              lists.some(list => list.listId === currentCollection.id && list.listType === currentCollection.type),
            ).map(([id]) => id)),
            editable: currentCollection.type === "user" && userLists.some(list => list.id === currentCollection.id && list.type === "user"),
            busy: Boolean(collectionBusyListId),
          } : undefined}
          onToggleCurrentCollection={context === "library" && currentCollection ? (meaning, included) => {
            if ((process.env.NEXT_PUBLIC_COLLECTION_SHARING_ENABLED==='true'?selectedMembership.status!=='ready':membershipState!=="ready") || currentCollection.type !== "user" ||
              !userLists.some(list => list.id === currentCollection.id && list.type === "user")) return;
            void handleToggleList(currentCollection, included, meaning.entryId);
          } : undefined}
          activeMeaningId={activeMeaningId}
          revealActiveMeaning={revealActiveMeaning}
          onActiveMeaningChange={setActiveMeaningId}
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
          onFollowCrossReference={(target) => {
            if (target.targetEntryId) setActiveMeaningId(target.targetEntryId);
            setActiveReferenceTarget(target);
          }}
          onProgressChanged={async()=>{await load();}}
          onCopy={context === "library" && process.env.NEXT_PUBLIC_INDEPENDENT_ENTRY_COPY_ENABLED === "true" && onOpenCopied && userId && !loading && !lookupError && !copyReviewRequired ? meaning => setCopyEntryId(meaning.entryId) : undefined}
          onArchive={context === "library" && process.env.NEXT_PUBLIC_AUTHOR_ENTRY_ARCHIVE_ENABLED === "true" && onArchived && userId ? meaning => { if (meaning.canArchive) setArchiveEntryId(meaning.entryId); } : undefined}
          onAction={(capability) => void handleAction(capability)}
          onReport={meaning => {
            if (!group) return;
            const entry = group.entries.find(candidate => candidate.kind === "sense-card" && candidate.entryId === meaning.entryId);
            if (entry?.kind !== "sense-card" || !reportableEntryIds.has(entry.entryId)) return;
            setReportSnapshot(freezeSenseCardDiagnosticSnapshot({route:context === "library" ? "library" : "training",group,entry}));
          }}
          reportableEntryIds={reportableEntryIds}
        />
      </div>
      {copyEntryId && userId && onOpenCopied && context === "library" ? <IndependentEntryCopyDialog key={`${detailIdentity}:copy`} entryId={copyEntryId} headword={model.headword} dictionaryName={model.dictionaryName ?? ""} contentLanguageCode={contentLanguageCode} userId={userId} language={interfaceLanguage} onClose={()=>setCopyEntryId(null)} onReviewSource={()=>{copyReviewGeneration.current++;setCopyReviewRequired(true);setCopyEntryId(null);setLookupRetry(current=>current+1);}} onOpen={copy=>{setCopyEntryId(null);onOpenCopied(copy);}}/> : null}
      {archiveEntryId && userId && context === "library" ? <AuthorEntryArchiveDialog key={detailIdentity} entryId={archiveEntryId} headword={model.headword} userId={userId} language={interfaceLanguage} onCancel={() => setArchiveEntryId(null)} onArchived={() => { setArchiveEntryId(null); onArchived?.(archiveEntryId); }} /> : null}
      {reportSnapshot ? <SenseCardReportSheet snapshot={reportSnapshot} interfaceLanguage={interfaceLanguage} onClose={() => setReportSnapshot(null)} /> : null}
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
        membershipState={membershipState}
        onRetryMemberships={() => { setCollectionStatus(null); void refreshMemberships(); }}
        status={collectionStatus}
        onClose={() => setCollectionsEntryId(null)}
        onToggleList={(list, included) => void handleToggleList(list, included)}
        onCreateList={(name) => void handleCreateList(name)}
        onOpenListMembership={onOpenListMembership}
      />
      {context === "library" && currentCollection && !collectionsMeaning && collectionStatus ? <p
        role={collectionStatus === platformV2Message(interfaceLanguage, "senseCard.collections.failed") ? "alert" : "status"}
        className={collectionStatus === platformV2Message(interfaceLanguage, "senseCard.collections.failed") ? "px-4 py-2 text-sm text-[var(--practice-text-muted)]" : "sr-only"}>{collectionStatus}</p> : null}
      {savedReviewMessageKey && !errorNotice ? <p role="status" aria-live="polite" aria-atomic="true"
        className="shrink-0 px-4 py-2 text-sm font-medium text-emerald-700 dark:text-emerald-300">
        {platformV2Message(interfaceLanguage, "senseCard.learning.reviewSaved", {
          rating: platformV2Message(interfaceLanguage, savedReviewMessageKey),
        })}
      </p> : null}
      {errorNotice}
    </div>
  );
}
