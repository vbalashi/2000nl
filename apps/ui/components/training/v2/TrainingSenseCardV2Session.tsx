"use client";

import React from "react";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import { platformV2Message } from "@/lib/platform/platformV2ClientI18n";
import {
  beginTrainingUserTransition,
  measureTrainingTransitionStage,
  recordTrainingEntryRendered,
} from "@/lib/training/trainingTransitionTiming";
import {
  fetchPlatformV2TrainingEntry,
  consumePrefetchedPlatformV2TrainingEntry,
  peekPrefetchedPlatformV2TrainingEntry,
  preloadPlatformV2Audio,
  requestPlatformV2Translation,
  resolvePlatformV2Audio,
  type PlatformV2TrainingLookupResult,
} from "@/lib/platform/platformV2TrainingClient";
import {
  isPlatformV2TrainingActionCapability,
  performPlatformV2TrainingAction,
  type PlatformV2TrainingActionCapability,
} from "@/lib/platform/platformV2TrainingActionClient";
import type { TrainingWord } from "@/lib/types";
import type {
  PlatformActionV2Request,
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
import {
  rememberPendingKnownUndo,
  type UndoKnownCapability,
} from "./pendingKnownUndoStore";
import {
  resolveTrainingSessionLayoutPhase,
  TrainingSessionV2Layout,
} from "./TrainingSessionV2Layout";
import { useTrainingCardSwipeSurface } from "./useTrainingCardSwipeSurface";
import type { TrainingCardSwipeCommitOutcome } from "./useTrainingCardSwipeSurface";

export { TrainingKnownUndoNotice } from "./TrainingKnownUndoNotice";

type Props = {
  cacheOwnerId: string;
  nextTransitionId?: string;
  presentationIdentity: string | null;
  word: TrainingWord;
  mode: "word-to-definition" | "definition-to-word";
  contentLanguageCode: string;
  translationTargetLanguageCode: string | null;
  interfaceLanguage: OnboardingLanguage;
  chrome: React.ReactNode;
  footer: React.ReactNode;
  notice?: React.ReactNode;
  focusOnPresentation?: boolean;
  onPlayResolvedAudio?: (url: string, label: string) => void;
  onOpenDetails?: () => void;
  onExit?: () => void;
  onLoadFailure?: (
    state: Exclude<TrainingV2SessionState, "loading" | "ready">,
  ) => void;
  onRetryAlternative?: (
    state: Exclude<TrainingV2SessionState, "loading" | "ready">,
  ) => void | Promise<void>;
  onProgressActionAccepted: (
    capability: PlatformV2TrainingActionCapability,
  ) => void | Promise<void>;
  onProgressActionStarting?: () => void;
};

type TrainingV2SessionState =
  | "loading"
  | "ready"
  | "lookup-http-error"
  | "contract-mismatch"
  | "entry-not-found"
  | "model-invalid"
  | "reverse-definition-missing";

export function TrainingSenseCardV2Session({
  cacheOwnerId,
  nextTransitionId,
  presentationIdentity,
  word,
  mode,
  contentLanguageCode,
  translationTargetLanguageCode,
  interfaceLanguage,
  chrome,
  footer,
  notice,
  focusOnPresentation = false,
  onPlayResolvedAudio,
  onOpenDetails,
  onExit,
  onLoadFailure,
  onRetryAlternative,
  onProgressActionAccepted,
  onProgressActionStarting,
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
      peekPrefetchedPlatformV2TrainingEntry(lookupInput),
  );
  const [busy, setBusy] = React.useState(false);
  const cardIdentity = `${word.id}:${mode}`;
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
  const loadGenerationRef = React.useRef(0);
  const presentationHandledRef = React.useRef(false);

  const load = React.useCallback(
    async (
      signal?: AbortSignal,
      options: { preserveCard?: boolean; usePrefetch?: boolean } = {},
    ) => {
      const generation = (loadGenerationRef.current += 1);
      setError(null);
      if (!options.preserveCard) {
        const prefetched = peekPrefetchedPlatformV2TrainingEntry(lookupInput);
        setLookup((current) =>
          prefetched ??
          (current?.state === "ready" && current.entry.entryId === word.id
            ? current
            : null),
        );
      }
      const prefetchedRequest =
        options.usePrefetch === false
          ? null
          : consumePrefetchedPlatformV2TrainingEntry(lookupInput);
      const next = await (
        prefetchedRequest ??
        fetchPlatformV2TrainingEntry({ ...lookupInput, signal })
      );
      if (signal?.aborted || generation !== loadGenerationRef.current) {
        return null;
      }
      if (options.preserveCard && next.state !== "ready") {
        return next;
      }
      setLookup(next);
      return next;
    },
    [lookupInput, word.id],
  );

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

  const model = React.useMemo(
    () =>
      result
        ? safelyBuildTrainingSenseCardModel(result, interfaceLanguage)
        : null,
    [interfaceLanguage, result],
  );

  const sessionState: TrainingV2SessionState = !lookup
      ? "loading"
      : lookup.state !== "ready"
        ? lookup.state
        : !model
          ? "model-invalid"
          : mode === "definition-to-word" &&
              !model.definitions.some((item) => item.kind === "definition")
            ? "reverse-definition-missing"
            : "ready";
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
  }, [cacheOwnerId, nextTransitionId, word.id]);

  React.useEffect(() => {
    if (sessionState === "loading" || sessionState === "ready") return;
    onLoadFailure?.(sessionState);
  }, [onLoadFailure, sessionState]);

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
    if (interactionBusyRef.current) return "rejected";
    interactionBusyRef.current = true;
    setBusy(true);
    setError(null);
    let frozenRequest: PlatformActionV2Request | null = null;
    try {
      if (capability.actionId === "request-translation") {
        await requestPlatformV2Translation(capability);
        const refreshed = await load(undefined, {
          preserveCard: true,
          usePrefetch: false,
        });
        if (refreshed?.state !== "ready") {
          setNoticeTone("error");
          setError(temporaryFailureMessage(interfaceLanguage));
        }
        return "accepted";
      }
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
      if (
        nextTransitionId &&
        (capability.actionId === "start-learning" ||
          capability.actionId === "review-card")
      ) {
        beginTrainingUserTransition(
          nextTransitionId,
          capability.actionId === "start-learning" ? "learn" : "review",
        );
      }
      if (
        capability.actionId === "start-learning" ||
        capability.actionId === "review-card"
      ) {
        onProgressActionStarting?.();
      }
      setNoticeTone("error");
      const onRequestFrozen = (request: PlatformActionV2Request) => {
        frozenRequest = request;
        setReportOperation({ request, observedOutcome: "unknown" });
      };
      const response = nextTransitionId
        ? await measureTrainingTransitionStage(
            nextTransitionId,
            "review.mutation",
            () =>
              performPlatformV2TrainingAction(capability, {
                transitionId: nextTransitionId,
                onRequestFrozen,
              }),
            () => "accepted",
          )
        : await performPlatformV2TrainingAction(capability, { onRequestFrozen });
      if (frozenRequest) {
        setReportOperation({
          request: frozenRequest,
          observedOutcome: "accepted",
        });
      }
      if (capability.actionId === "undo-known") {
        rememberPendingKnownUndo(null);
        if (result?.entry.entryId === capability.target.entryId) await load();
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
              ? { capability: undoKnown, presentationIdentity }
              : null,
          );
        } else {
          rememberPendingKnownUndo(null);
        }
        await onProgressActionAccepted(capability);
      }
      return "accepted";
    } catch (cause) {
      setNoticeTone("error");
      const code = cause instanceof Error ? cause.message : "action_failed";
      if (frozenRequest) {
        setReportOperation({
          request: frozenRequest,
          observedOutcome: classifyTrainingActionOutcome(code),
        });
      }
      if (code === "state_conflict") {
        const refreshed = await load(undefined, {
          preserveCard: true,
          usePrefetch: false,
        }).catch(() => null);
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
      interactionBusyRef.current = false;
      setBusy(false);
    }
  };

  const handlePlayAudio = async () => {
    const capability = result?.group.header.audio;
    if (!capability || !onPlayResolvedAudio || interactionBusyRef.current) return;
    interactionBusyRef.current = true;
    setBusy(true);
    setNoticeTone("error");
    setError(null);
    try {
      const url = await resolvePlatformV2Audio({
        cacheOwnerId,
        capability,
        text: result.group.header.text,
      });
      onPlayResolvedAudio(url, result.group.header.text);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "audio_failed");
    } finally {
      interactionBusyRef.current = false;
      setBusy(false);
    }
  };

  const swipeLeftCapability = model?.reviewCapabilities.find(
    (capability) => capability.reviewResult === "fail",
  );
  const swipeRightCapability = model?.reviewCapabilities.find(
    (capability) => capability.reviewResult === "success",
  );
  const swipeSurface = useTrainingCardSwipeSurface({
    enabled: sessionState === "ready" && cardSide === "answer",
    busy,
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
    <TrainingSessionV2Layout
      phase={resolveTrainingSessionLayoutPhase(sessionState)}
      chrome={chrome}
      footer={footer}
      notice={notice}
      readySurface={swipeSurface}
    >
      {cardAnnouncementRegion}
      {content}
    </TrainingSessionV2Layout>
  );

  if (sessionState === "loading") {
    return renderLayout(
        <div className="mx-auto flex h-full min-h-0 w-full max-w-[760px] flex-1 flex-col gap-3 [@media(hover:hover)_and_(pointer:fine)]:justify-center">
          <div
            role="status"
            data-testid="training-v2-loading"
            data-training-renderer="v2"
            data-training-v2-state="loading"
            className="grid min-h-0 max-h-none flex-1 place-items-center rounded-3xl border border-slate-300 bg-slate-50 px-6 text-sm font-medium text-slate-600 dark:border-slate-600 dark:bg-[#1d222b] dark:text-slate-300 [@media(hover:hover)_and_(pointer:fine)]:max-h-[500px]"
          >
            {platformV2Message(interfaceLanguage, "senseCard.training.loading")}
          </div>
          <div aria-hidden="true" className="h-11 min-h-11 shrink-0" />
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
        <TrainingSenseCardStage
          model={model}
          mode={mode}
          interfaceLanguage={interfaceLanguage}
          busy={busy}
          focusOnMount={handlePresentation}
          onPlayAudio={
            result.group.header.audio && onPlayResolvedAudio
              ? () => void handlePlayAudio()
              : undefined
          }
          onOpenDetails={onOpenDetails}
          reportAction={
            model.reportCapabilities.length && result.entry.reportContentRevision ? (
              <SenseCardReportAction
                snapshot={freezeSenseCardDiagnosticSnapshot({
                  route: "training",
                  group: result.group,
                  entry: result.entry,
                  operation: reportOperation,
                })}
                interfaceLanguage={interfaceLanguage}
                disabled={busy}
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
    <div
      role="alert"
      data-testid="training-v2-failure"
      data-training-renderer="v2"
      data-training-v2-state={state}
      data-visual-spec="training-v1.0"
      className="mx-auto grid h-full min-h-0 w-full max-w-[760px] flex-1 place-items-center self-center rounded-[14px] border border-slate-300 bg-slate-50 px-[18px] py-10 text-center font-sense-sans text-slate-900 shadow-sm dark:border-[#4B5360] dark:bg-[#20252D] dark:text-[#F4F6FA] dark:shadow-none"
    >
      <div className="flex max-w-sm -translate-y-[6px] flex-col items-center gap-[18px]">
        <p className="text-[18px] font-bold leading-tight">
          {platformV2Message(interfaceLanguage, "senseCard.training.loadFailed")}
        </p>
        {detail ? <span className="sr-only">{detail}</span> : null}
        <div className="flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={onRetry}
            className="h-[42px] rounded-[18px] border border-slate-400 bg-white px-4 text-[14px] font-bold text-slate-800 outline-none hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-[#8B89F6] dark:border-[#7B8491] dark:bg-[#20252D] dark:text-[#F4F6FA] dark:hover:bg-[#262B34]"
          >
            {platformV2Message(interfaceLanguage, "senseCard.training.retry")}
          </button>
          {onExit ? (
            <button
              type="button"
              onClick={onExit}
              className="h-[42px] rounded-xl px-3 text-[14px] font-bold text-slate-600 outline-none hover:bg-slate-200/60 focus-visible:ring-2 focus-visible:ring-[#8B89F6] dark:text-[#F4F6FA] dark:hover:bg-[#262B34]"
            >
              {platformV2Message(interfaceLanguage, "senseCard.training.exit")}
            </button>
          ) : null}
        </div>
      </div>
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
