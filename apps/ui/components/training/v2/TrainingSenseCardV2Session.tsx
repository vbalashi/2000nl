"use client";
import { useCardLoadDiagnostics } from "@/lib/diagnostics/useCardLoadDiagnostics";
import {useEntryNoteMaterial} from "../useEntryNoteMaterial";
import {clearPlatformNoteMaterial} from "@/lib/platform/noteMaterialPresentation";
import { useCurrentTrainingCard, usePresentedTrainingCard, type PresentedTrainingCard } from "./useCurrentTrainingCard";
import { readCurrentTrainingCard, type CurrentTrainingCardContext } from "@/lib/platform/trainingCurrentCardClient";
import { useWordContextPrompt } from "./useWordContextPrompt";
import { TrainingSessionState } from "./TrainingSessionState";
import { getUiMessages } from "@/lib/uiMessages";
import { useTrainingExclusion } from "./useTrainingExclusion";
import { TrainingExcludeAction, trainingExclusionCopy } from "./TrainingExcludeAction";

import React from "react";
import { useTrainingAnswerTranslationPreparation } from "@/components/training/v2/TrainingAnswerTranslation";
import { useRecordedStudyTime } from "../useRecordedStudyTime";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import type { TrainingMode } from "@/lib/types";
import { platformV2Message } from "@/lib/platform/platformV2ClientI18n";
import {
  beginTrainingUserTransition,
  createTrainingTransitionId,
  finishTrainingUserTransition,
  measureTrainingTransitionStage,
  recordTrainingEntryRendered,
} from "@/lib/training/trainingTransitionTiming";
import {
  fetchPlatformV2TrainingEntry,
  consumePrefetchedPlatformV2TrainingEntry,
  peekPrefetchedPlatformV2TrainingEntry,
  preloadPlatformV2Audio,
  resolvePlatformV2Audio,
  type PlatformV2TrainingEntryResult,
  type PlatformV2TrainingLookupResult,
} from "@/lib/platform/platformV2TrainingClient";
import {
  isPlatformV2TrainingActionCapability,
  performPlatformV2TrainingAction,
  type PlatformV2TrainingActionCapability,
} from "@/lib/platform/platformV2TrainingActionClient";
import type { TrainingWord } from "@/lib/types";
import type {
  PlatformOrdinaryActionRequest,
  PlatformSenseCardCapabilityV2,
} from "../../../../../packages/shared/types/platformV2";
import { TrainingSenseCardStage } from "./TrainingSenseCardStage";
import { SenseCardReportAction } from "@/components/feedback/SenseCardReportSheet";
import {
  freezeSenseCardDiagnosticSnapshot,
  type SenseCardTrainingOperation,
} from "@/lib/feedback/diagnosticReportClient";
import { TransientNotice } from "@/components/system/TransientNotice";
import { buildTrainingSenseCardModel } from "./trainingSenseCardModel";
import { evaluateTrainingCardRenderability } from "@/lib/training/trainingCardRenderability";
import { selectTrainingReversePrompt } from "@/lib/training/trainingReversePrompt";
import { markWordContextHintOpened, prepareNextWordContextTranslation } from "@/lib/training/wordContextPrompt";
import {
  rememberPendingKnownUndo,
  type UndoKnownCapability,
} from "./pendingKnownUndoStore";
import { resolveTrainingSessionLayoutPhase } from "./TrainingSessionV2Layout";
import {
  TrainingSessionSurface,
  type TrainingSessionNoticeInput,
} from "./TrainingSessionSurface";
import type { FooterStatsProps } from "../FooterStats";
import type { TrainingSessionChromeProps } from "./TrainingSessionChrome";
import { useTrainingInteractions } from "@/components/practice/ui/TrainingInteractionPreferences";
import { useTrainingCardSwipeSurface } from "./useTrainingCardSwipeSurface";
import type { TrainingCardSwipeCommitOutcome } from "./useTrainingCardSwipeSurface";

export { TrainingKnownUndoNotice } from "./TrainingKnownUndoNotice";

type Props = {
  presentationActive?: boolean;
  studyTimeEnabled?: boolean;
  cacheOwnerId: string;
  nextTransitionId?: string;
  presentationIdentity: string | null;
  word: TrainingWord;
  mode: TrainingMode;
  contentLanguageCode: string;
  translationTargetLanguageCode: string | null;
  interfaceLanguage: OnboardingLanguage;
  trainingSessionId?: string | null;
  wordInContext?: boolean;
  sessionChrome?: TrainingSessionChromeProps | null;
  sessionFooter: FooterStatsProps;
  sessionNotice?: TrainingSessionNoticeInput | null;
  interactionDisabled?: boolean;
  authorityRefreshing?: boolean;
  focusOnPresentation?: boolean;
  onPlayResolvedAudio?: (url: string, label: string) => void;
  onCurrentCardContextChange?: (value: PresentedTrainingCard | null) => void;
  onOpenDetails?: (
    details: Pick<PlatformV2TrainingEntryResult, "group" | "entry"> & { currentCard?: CurrentTrainingCardContext },
  ) => void;
  onExit?: () => void;
  onLoadFailure?: (
    state: Exclude<TrainingV2SessionState, "loading" | "ready">,
  ) => void;
  onRetryAlternative?: (
    state: Exclude<TrainingV2SessionState, "loading" | "ready">,
  ) => void | Promise<void>;
  onProgressActionAccepted: (
    capability: PlatformV2TrainingActionCapability | { actionId: "exclude-pair" | "exclude-headword" },
    transitionId?: string,
  ) => Promise<
    Extract<
      TrainingCardSwipeCommitOutcome,
      | "accepted"
      | "accepted-next-presented"
      | "accepted-session-complete"
      | "accepted-next-unavailable"
      | "stalled"
    >
  >;
  onProgressActionStarting?: () => void;
  onProgressActionPendingChange?: (pending: boolean, token: object) => void;
  /** Ownership changed while this card was visible; its queue is no longer usable. */
  onTrainingSessionSuperseded?: () => void;
};

type TrainingV2SessionState =
  | "loading"
  | "ready"
  | "lookup-http-error"
  | "projection-missing"
  | "contract-mismatch"
  | "entry-not-found"
  | "model-invalid"
  | "direct-example-missing"
  | "reverse-definition-missing";

function clearLookupNoteMaterial(value:PlatformV2TrainingLookupResult|null):PlatformV2TrainingLookupResult|null{
 if(value?.state!=="ready")return value;
 const group=clearPlatformNoteMaterial(value.group);if(group===value.group)return value;
 const entry=group.entries.find(e=>e.kind==="sense-card"&&e.entryId===value.entry.entryId);
 return entry?.kind==="sense-card"?{...value,group,entry}:null;
}

export function TrainingSenseCardV2Session({
  cacheOwnerId,
  presentationActive = true,
  studyTimeEnabled = false,
  nextTransitionId,
  presentationIdentity,
  word,
  mode,
  contentLanguageCode,
  translationTargetLanguageCode,
  interfaceLanguage,
  trainingSessionId,
  wordInContext = false,
  sessionChrome,
  sessionFooter,
  sessionNotice,
  interactionDisabled = false,
  authorityRefreshing = false,
  focusOnPresentation = false,
  onPlayResolvedAudio,
  onOpenDetails,
  onCurrentCardContextChange,
  onExit,
  onLoadFailure,
  onRetryAlternative,
  onProgressActionAccepted,
  onProgressActionStarting,
  onProgressActionPendingChange,
  onTrainingSessionSuperseded,
}: Props) {
  const lookupInput = React.useMemo(
    () => ({
      entryId: word.id,
      cardTypeId: mode,
      contentLanguageCode,
      translationTargetLanguageCode,
      cacheOwnerId,
    }),
    [cacheOwnerId, contentLanguageCode, mode, translationTargetLanguageCode, word.id],
  );
  const [lookup, setLookup] = React.useState<PlatformV2TrainingLookupResult | null>(
    () =>
      clearLookupNoteMaterial(peekPrefetchedPlatformV2TrainingEntry(lookupInput)),
  );
  const currentReadRef = React.useRef<{ key: string; context: CurrentTrainingCardContext } | null>(null);
  const [contextRetry, setContextRetry] = React.useState(0);
  const contextResult = useWordContextPrompt({ cacheOwnerId, trainingSessionId, entryId: word.id, contentLanguageCode, translationTargetLanguageCode, wordInContext, retry: contextRetry, getCurrentCard: () => currentReadRef.current?.key === JSON.stringify(lookupInput) && currentReadRef.current.context.sessionId === trainingSessionId ? currentReadRef.current.context : undefined });
  const contextHintWriteRef = React.useRef<Promise<void> | null>(null);
  const preparedNextRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (!wordInContext || contextResult?.state !== "ready" || !trainingSessionId ||
        !translationTargetLanguageCode) return;
    const key = `${trainingSessionId}:${word.id}:${translationTargetLanguageCode}`;
    if (preparedNextRef.current === key) return;
    preparedNextRef.current = key;
    const controller = new AbortController();
    void prepareNextWordContextTranslation({
      userId: cacheOwnerId, sessionId: trainingSessionId, entryId: word.id,
      contentLanguageCode, translationTargetLanguageCode, signal: controller.signal,
    }).catch(() => { /* Speculative work cannot change this card or progress. */ });
    return () => controller.abort();
  }, [cacheOwnerId, contentLanguageCode, contextResult, trainingSessionId,
    translationTargetLanguageCode, word.id, wordInContext]);
  const [busy, setBusy] = React.useState(false);
  const [acceptedActionRecoveryPending, setAcceptedActionRecoveryPending] =
    React.useState(false);
  const cardIdentity = presentationIdentity ?? `${word.id}:${mode}`;
  const [cardPresentation, setCardPresentation] = React.useState<{
    identity: string;
    side: "face" | "answer";
  }>(() => ({ identity: cardIdentity, side: "face" }));
  const cardSide =
    cardPresentation.identity === cardIdentity ? cardPresentation.side : "face";
  const setCardSide = React.useCallback(
    (side: "face" | "answer") => {
      setCardPresentation({ identity: cardIdentity, side });
    },
    [cardIdentity],
  );
  const [error, setError] = React.useState<string | null>(null);
  const [noticeTone, setNoticeTone] = React.useState<"error" | "info">("error");
  const [reportOperation, setReportOperation] =
    React.useState<SenseCardTrainingOperation | null>(null);
  const [presentationAnnouncement, setPresentationAnnouncement] =
    React.useState<string>("");
  const interactionBusyRef = React.useRef(false);
  const audioRequestRef=React.useRef<AbortController|null>(null);
  const loadGenerationRef = React.useRef(0);
  const presentationHandledRef = React.useRef(false);
  const autoPlayedCardRef = React.useRef<string | null>(null);
  const actionScopeKey = `${cardIdentity}:${trainingSessionId ?? "unscoped"}`;
  const actionScopeRef = React.useRef({ key: actionScopeKey, generation: 0 });
  if (actionScopeRef.current.key !== actionScopeKey) {
    actionScopeRef.current = {
      key: actionScopeKey,
      generation: actionScopeRef.current.generation + 1,
    };
    interactionBusyRef.current = false;
  }
  const mountedRef = React.useRef(false);
  React.useEffect(()=>()=>audioRequestRef.current?.abort(),[actionScopeKey,presentationActive]);

  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      actionScopeRef.current.generation += 1;
    };
  }, []);

  React.useEffect(() => {
    interactionBusyRef.current = false;
    setBusy(false);
    setError(null);
    setReportOperation(null);
    setAcceptedActionRecoveryPending(false);
  }, [actionScopeKey]);

  const load = React.useCallback(
    async (
      signal?: AbortSignal,
      options: { preserveCard?: boolean; usePrefetch?: boolean } = {},
    ) => {
      const generation = (loadGenerationRef.current += 1);
      if (!options.preserveCard) setError(null);
      if (!options.preserveCard) {
        const prefetched = peekPrefetchedPlatformV2TrainingEntry(lookupInput);
        setLookup((current) =>
          clearLookupNoteMaterial(prefetched ??
          (current?.state === "ready" && current.entry.entryId === word.id
            ? current
            : null)),
        );
      }
      const prefetchedRequest =
        options.usePrefetch === false
          ? null
          : consumePrefetchedPlatformV2TrainingEntry(lookupInput);
      const readPermit = currentReadRef.current;
      const readCurrent = async (): Promise<PlatformV2TrainingLookupResult> => {
        if (!readPermit || readPermit.key !== JSON.stringify(lookupInput) || readPermit.context.sessionId !== trainingSessionId) return fetchPlatformV2TrainingEntry({ ...lookupInput, signal });
        const payload = await readCurrentTrainingCard(cacheOwnerId, { ...readPermit.context,
          entryId: word.id, cardTypeId: mode, contentLanguageCode, translationTargetLanguageCode }, signal);
        const group = payload.groups.find(item => item.entries.some(entry => entry.kind === "sense-card" && entry.entryId === word.id));
        const entry = group?.entries.find(item => item.kind === "sense-card" && item.entryId === word.id);
        return group && entry?.kind === "sense-card" ? { state: "ready", group, entry } : { state: "projection-missing" };
      };
      let next = await (readPermit?.key === JSON.stringify(lookupInput) && readPermit.context.sessionId === trainingSessionId ? readCurrent() : prefetchedRequest ?? readCurrent());
      if (prefetchedRequest && !signal?.aborted && generation === loadGenerationRef.current) {
        setLookup(clearLookupNoteMaterial(next));
        // Keep the instant prepared display, then validate current server source
        // and prompt identity before retaining it as this card's snapshot.
        next = await readCurrent();
      }
      if (signal?.aborted || generation !== loadGenerationRef.current) {
        return null;
      }
      if (options.preserveCard && next.state !== "ready") {
        return next;
      }
      setLookup(next);
      return next;
    },
    [lookupInput, word.id, cacheOwnerId, mode, contentLanguageCode, translationTargetLanguageCode, trainingSessionId],
  );

  // Background translation reads return new objects even when the latched
  // exercise is unchanged. Preserve its presentation while refreshing, but never
  // carry readiness across an owner, run, language, or source identity change.
  const contextScope = contextResult?.state === "ready" ? JSON.stringify([
    cacheOwnerId, trainingSessionId, presentationIdentity, word.id, mode, contentLanguageCode,
    translationTargetLanguageCode, contextResult.prompt.contentNodeId,
    contextResult.prompt.sourceTextFingerprint,
  ]) : null;
  const [synchronizedContextScope, setSynchronizedContextScope] = React.useState<string | null>(null);
  const contextSynchronized = contextScope !== null && synchronizedContextScope === contextScope;

  // Context preparation reads a Library projection and may finish a translation
  // after our initial lookup. Re-read this card's own direction/state rather
  // than copying the Library word-to-definition review capabilities.
  React.useEffect(() => {
    if (!wordInContext || contextResult?.state !== "ready") return;
    const controller = new AbortController();
    void load(controller.signal, { preserveCard: true, usePrefetch: false }).then(next => {
      if (controller.signal.aborted || !next) return;
      if (next.state !== "ready") setLookup(next);
      setSynchronizedContextScope(contextScope);
    }).catch(cause => {
      if (controller.signal.aborted) return;
      setLookup({ state: "lookup-http-error", status: 0 });
      setError(cause instanceof Error ? cause.message : "lookup_failed");
      setSynchronizedContextScope(contextScope);
    });
    return () => controller.abort();
  }, [contextResult, contextScope, load, wordInContext]);

  React.useEffect(() => {
    const controller = new AbortController();
    setError(null);
    void load(controller.signal).catch((cause) => {
      if (controller.signal.aborted) return;
      setLookup({ state: "lookup-http-error", status: 0 });
      setError(cause instanceof Error ? cause.message : "lookup_failed");
    });
    return () => {
      controller.abort();
      loadGenerationRef.current += 1;
    };
  }, [load]);

  React.useEffect(() => {
    if (lookup?.state !== "ready" || !lookup.group.header.audio) return;
    void preloadPlatformV2Audio({
      cacheOwnerId,
      capability: lookup.group.header.audio,
      entryId: lookup.entry.entryId,
        sourceVersion: lookup.entry.sourceVersion,
      text: lookup.group.header.text,
    }).catch(() => {
      // Preloading is best-effort; an explicit play still reports failures.
    });
  }, [cacheOwnerId, lookup]);

  React.useEffect(() => {
    if (!error) return;
    const timer = window.setTimeout(() => setError(null), 5000);
    return () => window.clearTimeout(timer);
  }, [error]);

  const result = lookup?.state === "ready" ? lookup : null;


  const noteMaterial=useEntryNoteMaterial({userId:cacheOwnerId,entryId:result?.entry.entryId,scope:actionScopeKey,active:presentationActive&&result?.entry.noteMaterial!==undefined,busy});
  const model = React.useMemo(
    () =>
      result
        ? safelyBuildTrainingSenseCardModel({...result,entry:{...result.entry,noteMaterial}}, interfaceLanguage)
        : null,
    [interfaceLanguage, result,noteMaterial],
  );
  const renderability = React.useMemo(
    () => (result ? evaluateTrainingCardRenderability(result.entry, mode) : null),
    [mode, result],
  );

  const contextPrompt = wordInContext && contextResult?.state === "ready" ? (() => {
    const prompt=contextResult.prompt;
    const node=result?.entry.contentNodes.find(item=>item.contentNodeId===prompt.contentNodeId&&item.sourceTextFingerprint===prompt.sourceTextFingerprint);
    const translated=node?.translations.find(item=>item.targetLanguageCode===translationTargetLanguageCode&&item.status==="ready"&&item.sourceTextFingerprint===prompt.sourceTextFingerprint)?.text;
    return {...prompt,...(translated?{text:translated}:{}),...(model?.entryTranslation?{recallTarget:model.entryTranslation}:{})};
  })() : undefined;

  const contentState: TrainingV2SessionState = wordInContext &&
    (!translationTargetLanguageCode || contextResult?.state !== "ready" || !contextSynchronized)
      ? "loading"
      : !lookup
      ? "loading"
      : lookup.state !== "ready"
        ? lookup.state
        : !model
          ? "model-invalid"
          : renderability && !renderability.renderable
            ? renderability.reason
          : mode === "definition-to-word" &&
              !selectTrainingReversePrompt([...model.definitions, ...model.examples])
            ? "reverse-definition-missing"
            : "ready";
  const currentCard = useCurrentTrainingCard({ userId: cacheOwnerId, active: presentationActive && contentState === "ready",
    target: trainingSessionId && result ? { sessionId: trainingSessionId, entryId: result.entry.entryId,
      cardTypeId: mode, sourceVersion: result.entry.sourceVersion ?? 0,
      stateRevision: result.entry.card?.stateRevision ?? "untracked" } : null });
  usePresentedTrainingCard(presentationActive && currentCard.ready && currentCard.context && result ? { userId: cacheOwnerId, group: result.group, entry: result.entry, currentCard: currentCard.context } : null, onCurrentCardContextChange);
  React.useLayoutEffect(() => {
    currentReadRef.current = currentCard.context ? { key: JSON.stringify(lookupInput), context: currentCard.context } : null;
  }, [currentCard.context, lookupInput]);
  const sessionState: TrainingV2SessionState = contentState === "ready" && !currentCard.ready
    ? currentCard.failed ? "lookup-http-error" : "loading" : contentState;
  useCardLoadDiagnostics(JSON.stringify([cacheOwnerId, word.id, mode, nextTransitionId]),
    !presentationActive ? "inactive" : sessionState === "loading" ? "loading" : sessionState === "ready" ? "ready" : "failed");
  const translationPreparing = useTrainingAnswerTranslationPreparation({
    entry: result?.entry ?? null,
    targetLanguageCode: translationTargetLanguageCode,
    currentCard: currentCard.context,
    paused: !currentCard.ready || busy || (wordInContext && (contextResult?.state !== "ready" || !contextSynchronized)),
    refresh: async signal => {
      const refreshed=await load(signal,{preserveCard:true,usePrefetch:false});
      if(refreshed?.state!=="ready")throw new Error("translation_refresh_unavailable");
      return refreshed.entry;
    },
  });

  const handlePresentation =
    sessionState === "ready" &&
    result?.entry.entryId === word.id &&
    focusOnPresentation &&
    !presentationHandledRef.current;

  React.useEffect(() => {
    if (sessionState === "ready" && result) {
      recordTrainingEntryRendered(result.entry.entryId);
    }
  }, [result, sessionState]);

  React.useEffect(() => {
    setReportOperation(null);
    setAcceptedActionRecoveryPending(false);
  }, [cacheOwnerId, nextTransitionId, word.id]);

  React.useEffect(() => {
    if (wordInContext && contextResult?.state === "source-unavailable") {
      onLoadFailure?.("projection-missing");
      return;
    }
    if (wordInContext && contextResult?.state !== "ready") return;
    if (currentCard.failed || sessionState === "loading" || sessionState === "ready") return;
    onLoadFailure?.(sessionState);
  }, [contextResult, onLoadFailure, sessionState, wordInContext, currentCard.failed]);

  React.useEffect(() => {
    if (!handlePresentation) return;
    presentationHandledRef.current = true;
    setPresentationAnnouncement(
      platformV2Message(interfaceLanguage, "senseCard.training.cardChanged"),
    );
  }, [handlePresentation, interfaceLanguage]);

  const handleAction = async (
    capability: PlatformSenseCardCapabilityV2,
  ): Promise<TrainingCardSwipeCommitOutcome> => {
    if (!currentCard.ready) return "rejected";
    if (capability.actionId === "request-translation") {
      if (translationPreparing.status === "failed") translationPreparing.retry();
      return "accepted";
    }
    if (
      interactionDisabled ||
      acceptedActionRecoveryPending ||
      interactionBusyRef.current
    ) {
      return "rejected";
    }
    interactionBusyRef.current = true;
    setBusy(true);
    setError(null);
    const actionGeneration = actionScopeRef.current.generation;
    const actionIsCurrent = () =>
      mountedRef.current &&
      actionScopeRef.current.generation === actionGeneration;
    const pendingToken = {};
    let frozenRequest: PlatformOrdinaryActionRequest | null = null;
    let progressActionPending = false;
    let progressTransitionId: string | null = null;
    let progressCompletion: string | null = "cancelled";
    try {
      if (capability.actionId === "report-content") {
        setNoticeTone("info");
        setError(
          platformV2Message(
            interfaceLanguage,
            "senseCard.reportUnavailable",
          ),
        );
        return "accepted";
      }
      if (!isPlatformV2TrainingActionCapability(capability)) return "rejected";
      if (capability.actionId === "start-learning" || capability.actionId === "review-card") {
        progressTransitionId = nextTransitionId ?? createTrainingTransitionId();
        beginTrainingUserTransition(
          progressTransitionId,
          capability.actionId === "start-learning" ? "learn" : "review",
        );
      }
      if (wordInContext && contextHintWriteRef.current &&
          (capability.actionId === "start-learning" || capability.actionId === "review-card" || capability.actionId === "mark-known")) {
        await contextHintWriteRef.current;
        if (!actionIsCurrent()) return "rejected";
      }
      if (
        capability.actionId === "start-learning" ||
        capability.actionId === "review-card"
      ) {
        progressActionPending = true;
        onProgressActionPendingChange?.(true, pendingToken);
        onProgressActionStarting?.();
      }
      setNoticeTone("error");
      const onRequestFrozen = (request: PlatformOrdinaryActionRequest) => {
        if (!actionIsCurrent()) return;
        frozenRequest = request;
        setReportOperation({ request, observedOutcome: "unknown" });
      };
      const mutationTransitionId = progressTransitionId ?? nextTransitionId;
      const response = mutationTransitionId
        ? await measureTrainingTransitionStage(
            mutationTransitionId,
            "review.mutation",
            () =>
              performPlatformV2TrainingAction(capability, {
                transitionId: mutationTransitionId,
                trainingSessionId: trainingSessionId ?? undefined,
                onRequestFrozen,
              }),
            () => "accepted",
          )
        : await performPlatformV2TrainingAction(capability, {
            trainingSessionId: trainingSessionId ?? undefined,
            onRequestFrozen,
          });
      if (!actionIsCurrent()) return "rejected";
      if (frozenRequest) {
        setReportOperation({
          request: frozenRequest,
          observedOutcome: "accepted",
        });
      }
      if (capability.actionId === "undo-known") {
        rememberPendingKnownUndo(null);
        if (result?.entry.entryId === capability.target.entryId) await load();
        if (!actionIsCurrent()) return "rejected";
      } else {
        if (capability.actionId === "mark-known") {
          const knownMark = response.card.knownMark;
          const undoKnown: UndoKnownCapability | null = knownMark
            ? {
                actionId: "undo-known",
                elementId: "sense-card.known.undo",
                messageKey: "senseCard.known.undo",
                target: {
                  kind: "sense-card",
                  entryId: capability.target.entryId,
                  cardTypeId: response.card.cardTypeId,
                  stateRevision: response.card.stateRevision,
                  activeKnownMarkId: knownMark.markId,
                  knownMarkRevision: knownMark.revision,
                },
              }
            : null;
          rememberPendingKnownUndo(
            undoKnown && presentationIdentity
              ? {
                  capability: undoKnown,
                  presentationIdentity,
                  trainingSessionId: trainingSessionId ?? undefined,
                }
              : null,
          );
        } else {
          rememberPendingKnownUndo(null);
        }
        try {
          const outcome = progressTransitionId
            ? await onProgressActionAccepted(capability, progressTransitionId)
            : await onProgressActionAccepted(capability);
          progressCompletion = !actionIsCurrent() ? "cancelled"
            : outcome === "accepted-next-presented" ? null
            : outcome === "accepted-session-complete" ? "session-complete"
            : "error-next-unavailable";
          return actionIsCurrent() ? outcome : "rejected";
        } catch (cause) {
          if (!actionIsCurrent()) return "rejected";
          setAcceptedActionRecoveryPending(true);
          setError(
            cause instanceof Error
              ? cause.message
              : temporaryFailureMessage(interfaceLanguage),
          );
          // The platform action has already returned an accepted receipt. A
          // failure while presenting the next card must never make the
          // mutation retryable: preserve the accepted grade and expose only
          // load/presentation recovery to the caller.
          progressCompletion = "error-next-unavailable";
          return "accepted-next-unavailable";
        }
      }
      return "accepted";
    } catch (cause) {
      if (!actionIsCurrent()) return "rejected";
      progressCompletion = "error-action";
      setNoticeTone("error");
      const code = cause instanceof Error ? cause.message : "action_failed";
      if (code === "training_session_superseded") {
        onTrainingSessionSuperseded?.();
        return "rejected";
      }
      if (frozenRequest) {
        setReportOperation({
          request: frozenRequest,
          observedOutcome: classifyTrainingActionOutcome(code),
        });
      }
      if (["state_conflict","card_is_known","platform_action_not_available"].includes(code)) {
        const refreshed = await load(undefined, {
          preserveCard: true,
          usePrefetch: false,
        }).catch(() => null);
        if (!actionIsCurrent()) return "rejected";
        setError(
          refreshed?.state === "ready"
            ? platformV2Message(
                interfaceLanguage,
                "senseCard.training.stateRefreshed",
              )
            : temporaryFailureMessage(interfaceLanguage),
        );
      } else {
        setError(
          code === "Failed to fetch" ||
          code === "platform_request_timeout" ||
          code === "action_receipt_not_found"
            ? temporaryFailureMessage(interfaceLanguage)
            : code,
        );
      }
      return "rejected";
    } finally {
      if (progressTransitionId && progressCompletion) {
        finishTrainingUserTransition(progressTransitionId, progressCompletion);
      }
      if (progressActionPending) {
        onProgressActionPendingChange?.(false, pendingToken);
      }
      if (actionIsCurrent()) {
        interactionBusyRef.current = false;
        setBusy(false);
      }
    }
  };

  const handlePlayAudio = React.useCallback(async () => {
    const capability = result?.group.header.audio;
    if (!capability || !onPlayResolvedAudio || interactionBusyRef.current) return;
    interactionBusyRef.current = true;
    const generation=actionScopeRef.current.generation;
    const controller=new AbortController();
    audioRequestRef.current?.abort();audioRequestRef.current=controller;
    const isCurrent=()=>!controller.signal.aborted&&mountedRef.current&&actionScopeRef.current.generation===generation;
    setBusy(true);
    setNoticeTone("error");
    setError(null);
    try {
      const url = await resolvePlatformV2Audio({
        cacheOwnerId,
        capability,
        entryId: result.entry.entryId,
        sourceVersion: result.entry.sourceVersion,
        currentCard: currentCard.context ?? undefined,
        signal: controller.signal,
        text: result.group.header.text,
      });
      if(isCurrent())onPlayResolvedAudio(url, result.group.header.text);
    } catch (cause) {
      if(isCurrent())setError(cause instanceof Error ? cause.message : "audio_failed");
    } finally {
      if(audioRequestRef.current===controller){
        audioRequestRef.current=null;
        if(mountedRef.current&&actionScopeRef.current.generation===generation){interactionBusyRef.current = false;setBusy(false);}
      }
    }
  }, [cacheOwnerId, onPlayResolvedAudio, result, currentCard.context]);

  React.useEffect(() => {
    if (
      mode !== "listen-recognize" ||
      sessionState !== "ready" ||
      !result?.group.header.audio ||
      !onPlayResolvedAudio ||
      autoPlayedCardRef.current === cardIdentity
    ) {
      return;
    }
    autoPlayedCardRef.current = cardIdentity;
    void handlePlayAudio();
  }, [cardIdentity, handlePlayAudio, mode, onPlayResolvedAudio, result, sessionState]);

  const swipeLeftCapability = model?.reviewCapabilities.find(
    (capability) => capability.reviewResult === "fail",
  );
  const swipeRightCapability = model?.reviewCapabilities.find(
    (capability) => capability.reviewResult === "success",
  );
  const exclusion = useTrainingExclusion({
    userId: cacheOwnerId,
    identity: cardIdentity,
    sessionId: trainingSessionId,
    onPendingChange: onProgressActionPendingChange,
    onStarting: onProgressActionStarting,
    onSessionSuperseded: onTrainingSessionSuperseded,
    target: mode === "word-to-definition" || mode === "definition-to-word"
      ? { kind: "headword", entryId: word.id, cardTypeId: mode }
      : { kind: "meaning", entryId: word.id, cardTypeId: mode },
    onAccepted: async () => {
      try {
        await onProgressActionAccepted({ actionId: mode === "word-to-definition" || mode === "definition-to-word" ? "exclude-headword" : "exclude-pair" });
      } catch (cause) {
        setAcceptedActionRecoveryPending(true);
        setError(
          cause instanceof Error
            ? cause.message
            : temporaryFailureMessage(interfaceLanguage),
        );
      }
    },
  });

  useRecordedStudyTime({ ownerId: cacheOwnerId, sessionId: trainingSessionId, family: "meaning", entryId: word.id, cardTypeId: mode,
    enabled: studyTimeEnabled && sessionState === "ready" && !busy && !interactionDisabled && !acceptedActionRecoveryPending && !exclusion.busy && !exclusion.failed });

  const {preferences: interactionPreferences} = useTrainingInteractions();
  const swipeSurface = useTrainingCardSwipeSurface({
    enabled: interactionPreferences.gradeSwipe && sessionState === "ready" && cardSide === "answer",
    busy: busy || exclusion.busy || exclusion.failed || interactionDisabled || acceptedActionRecoveryPending,
    identity: cardIdentity,
    left: swipeLeftCapability
      ? {
          value: swipeLeftCapability,
          label: platformV2Message(interfaceLanguage, swipeLeftCapability.messageKey),
          tintColor: "rgb(239 68 68)",
          indicatorClass:
            "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/80 dark:text-rose-200",
        }
      : undefined,
    right: swipeRightCapability
      ? {
          value: swipeRightCapability,
          label: platformV2Message(interfaceLanguage, swipeRightCapability.messageKey),
          tintColor: "rgb(16 185 129)",
          indicatorClass:
            "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/80 dark:text-emerald-200",
        }
      : undefined,
    onCommit: handleAction,
  });

  const cardAnnouncementRegion = (
    <span className="sr-only" aria-live="polite" aria-atomic="true">
      {presentationAnnouncement}
    </span>
  );
  const renderLayout = (content: React.ReactNode) => (
    <TrainingSessionSurface
      phase={resolveTrainingSessionLayoutPhase(sessionState)}
      chrome={sessionChrome}
      footer={sessionFooter}
      notice={sessionNotice}
      authorityRefreshing={authorityRefreshing && !busy && !exclusion.busy && !exclusion.failed && !acceptedActionRecoveryPending}
      readySurface={swipeSurface}
    >
      {cardAnnouncementRegion}
      {content}
    </TrainingSessionSurface>
  );

  if (wordInContext && (!translationTargetLanguageCode ||
    (contextResult && contextResult.state !== "ready"))) {
    const contextCopy = getUiMessages(interfaceLanguage).trainingSession.contextPreparation;
    const contextMessage = !translationTargetLanguageCode ? contextCopy.languageNeeded
      : contextResult?.state === "translation-pending" ? contextCopy.pending : contextCopy.unavailable;
    return renderLayout(
      <div className="h-full min-h-0" data-testid="training-word-context-preparation">
        <TrainingSessionState loading={contextResult?.state === "translation-pending"} heading={false} title={contextMessage} action={translationTargetLanguageCode
          ? { label: platformV2Message(interfaceLanguage, "senseCard.training.retry"), onClick: () => setContextRetry(value => value + 1) }
          : undefined} />
      </div>,
    );
  }

  if (sessionState === "loading") {
    return renderLayout(
      <div className="h-full min-h-0" data-testid="training-v2-loading" data-training-renderer="v2" data-training-v2-state="loading">
        <TrainingSessionState loading title={platformV2Message(interfaceLanguage, "senseCard.training.loading")} />
      </div>,
    );
  }

  if (sessionState !== "ready" || !result || !model) {
    const failureState = sessionState as Exclude<
      TrainingV2SessionState,
      "loading" | "ready"
    >;
    return renderLayout(
        <SessionV2Failure
          state={failureState}
          interfaceLanguage={interfaceLanguage}
          detail={error}
          onExit={onExit}
          onRetry={() => {
            if (currentCard.failed) { currentCard.retry(); return; }
            if (onRetryAlternative) {
              void onRetryAlternative(failureState);
              return;
            }
            void load(undefined, { usePrefetch: false }).catch((cause) => {
              setLookup({ state: "lookup-http-error", status: 0 });
              setError(cause instanceof Error ? cause.message : "lookup_failed");
            });
          }}
        />,
    );
  }

  return renderLayout(
      <div
        className="contents"
        data-testid="training-sense-card-v2"
        data-training-renderer="v2"
        data-training-v2-state="ready"
      >
        {exclusion.failed ? <p role="alert" className="text-sm text-rose-600">
          {trainingExclusionCopy[interfaceLanguage].failed}
        </p> : null}
        <TrainingSenseCardStage
          currentCard={currentCard.context}
          contentLanguage={contentLanguageCode}
          translationLanguage={translationTargetLanguageCode && translationTargetLanguageCode !== "off" ? translationTargetLanguageCode : undefined}
          model={model}
          translationState={translationPreparing.status}
          onRetryTranslation={translationPreparing.retry}
          contextPrompt={contextPrompt}
          onHintOpened={wordInContext && trainingSessionId ? () => {
            if (contextHintWriteRef.current) return;
            contextHintWriteRef.current = markWordContextHintOpened({
              userId: cacheOwnerId, sessionId: trainingSessionId, entryId: word.id,
            }).catch(() => { /* Display continues when optional evidence cannot be written. */ });
          } : undefined}
          mode={mode}
          interfaceLanguage={interfaceLanguage}
          busy={busy || exclusion.busy || exclusion.failed || interactionDisabled || acceptedActionRecoveryPending}
          focusOnMount={handlePresentation}
          onPlayAudio={
            result.group.header.audio && onPlayResolvedAudio
              ? () => void handlePlayAudio()
              : undefined
          }
          onOpenDetails={
            onOpenDetails
              ? () => onOpenDetails({ group: result.group, entry: result.entry, ...(currentCard.context ? { currentCard: currentCard.context } : {}) })
              : undefined
          }
          exclusionAction={exclusion.available ? (
            <TrainingExcludeAction language={interfaceLanguage}
              scope={mode === "word-to-definition" || mode === "definition-to-word" ? "headword" : "pair"}
              knownAction={model.markKnownCapability ? {
                label: platformV2Message(interfaceLanguage, model.markKnownCapability.messageKey),
                onClick: () => void handleAction(model.markKnownCapability!),
              } : undefined}
              disabled={busy || exclusion.busy || interactionDisabled || acceptedActionRecoveryPending}
              onClick={() => void exclusion.exclude()} />
          ) : undefined}
          reportAction={
            model.reportCapabilities.length && result.entry.reportContentRevision ? (
              <SenseCardReportAction
                appearance="training-text"
                snapshot={freezeSenseCardDiagnosticSnapshot({
                  route: "training",
                  group: result.group,
                  entry: result.entry,
                  ...(wordInContext && contextResult?.state === "ready" ? {
                    target: {
                      kind: "content-node" as const,
                      entryId: result.entry.entryId,
                      contentNodeId: contextResult.prompt.contentNodeId,
                      nodeKind: "example" as const,
                      sourceTextFingerprint: contextResult.prompt.sourceTextFingerprint,
                    },
                  } : {}),
                  operation: reportOperation,
                })}
                interfaceLanguage={interfaceLanguage}
                disabled={
                  busy || interactionDisabled || acceptedActionRecoveryPending
                }
              />
            ) : undefined
          }
          side={cardSide}
          onSideChange={setCardSide}
          onAction={(capability) => void handleAction(capability)}
        />
        <SessionError
          error={error}
          tone={noticeTone}
          dismissLabel={platformV2Message(interfaceLanguage, "senseCard.dismiss")}
          onDismiss={() => setError(null)}
        />
      </div>,
  );
}

function classifyTrainingActionOutcome(
  code: string,
): SenseCardTrainingOperation["observedOutcome"] {
  if (code === "state_conflict") return "state-conflict";
  if (code === "platform_request_timeout") return "timeout";
  if (code === "Failed to fetch" || code === "action_receipt_not_found") {
    return "network";
  }
  if (code === "platform_v2_action_failed" || code.startsWith("http_")) {
    return "server-error";
  }
  return "unknown";
}

function safelyBuildTrainingSenseCardModel(
  result: Extract<PlatformV2TrainingLookupResult, { state: "ready" }>,
  interfaceLanguage: OnboardingLanguage,
) {
  try {
    const model = buildTrainingSenseCardModel({
      group: result.group,
      entry: result.entry,
      interfaceLanguage,
    });
    return model.entryId && model.headword.trim() ? model : null;
  } catch {
    return null;
  }
}

function SessionV2Failure({
  state,
  interfaceLanguage,
  detail,
  onRetry,
  onExit,
}: {
  state: Exclude<TrainingV2SessionState, "loading" | "ready">;
  interfaceLanguage: OnboardingLanguage;
  detail: string | null;
  onRetry: () => void;
  onExit?: () => void;
}) {
  return (
    <div className="h-full min-h-0" data-testid="training-v2-failure" data-training-renderer="v2" data-training-v2-state={state}>
      <TrainingSessionState announcement="alert" title={platformV2Message(interfaceLanguage, "senseCard.training.loadFailed")}
        action={{ label: platformV2Message(interfaceLanguage, "senseCard.training.retry"), onClick: onRetry }}
        secondaryAction={onExit ? { label: getUiMessages(interfaceLanguage).trainingSession.back, onClick: onExit } : undefined} />
      {detail ? <span className="sr-only">{detail}</span> : null}
    </div>
  );
}

function SessionError({
  error,
  tone,
  dismissLabel,
  onDismiss,
}: {
  error: string | null;
  tone: "error" | "info";
  dismissLabel: string;
  onDismiss: () => void;
}) {
  return error ? (
    <TransientNotice
      tone={tone}
      dismissLabel={dismissLabel}
      onDismiss={onDismiss}
      className="fixed inset-x-4 bottom-52 z-50 mx-auto max-w-md sm:bottom-24"
    >
      {error}
    </TransientNotice>
  ) : null;
}

function temporaryFailureMessage(interfaceLanguage: OnboardingLanguage) {
  return platformV2Message(
    interfaceLanguage,
    "senseCard.training.temporaryFailure",
  );
}
