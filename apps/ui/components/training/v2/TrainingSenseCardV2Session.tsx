"use client";

import React from "react";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import { platformV2Message } from "@/lib/platform/platformV2ClientI18n";
import {
  fetchPlatformV2TrainingEntry,
  consumePrefetchedPlatformV2TrainingEntry,
  isPlatformV2TrainingActionCapability,
  peekPrefetchedPlatformV2TrainingEntry,
  performPlatformV2TrainingAction,
  preloadPlatformV2Audio,
  requestPlatformV2Translation,
  resolvePlatformV2Audio,
  type PlatformV2TrainingActionCapability,
  type PlatformV2TrainingLookupResult,
} from "@/lib/platform/platformV2TrainingClient";
import type { TrainingMode, TrainingWord } from "@/lib/types";
import type { PlatformSenseCardCapabilityV2 } from "../../../../../packages/shared/types/platformV2";
import { TrainingSenseCardStage } from "./TrainingSenseCardStage";
import { buildTrainingSenseCardModel } from "./trainingSenseCardModel";

type Props = {
  cacheOwnerId: string;
  word: TrainingWord;
  mode: TrainingMode;
  contentLanguageCode: string;
  translationTargetLanguageCode: string | null;
  interfaceLanguage: OnboardingLanguage;
  fallback: React.ReactNode;
  onPlayResolvedAudio?: (url: string, label: string) => void;
  onOpenDetails?: () => void;
  onExit?: () => void;
  onAvailabilityChange: (state: TrainingV2SessionState) => void;
  onProgressActionAccepted: (
    capability: PlatformV2TrainingActionCapability,
  ) => void | Promise<void>;
};

type UndoKnownCapability = Extract<
  PlatformSenseCardCapabilityV2,
  { actionId: "undo-known" }
>;

export type TrainingV2SessionState =
  | "loading"
  | "ready"
  | "lookup-http-error"
  | "contract-mismatch"
  | "entry-not-found"
  | "model-invalid"
  | "reverse-definition-missing"
  | "listening-mode";

const PENDING_KNOWN_UNDO_STORAGE_KEY = "2000nl.training.pendingKnownUndo.v2";
const PENDING_KNOWN_UNDO_EVENT = "2000nl:training-pending-known-undo";

export function TrainingSenseCardV2Session({
  cacheOwnerId,
  word,
  mode,
  contentLanguageCode,
  translationTargetLanguageCode,
  interfaceLanguage,
  fallback,
  onPlayResolvedAudio,
  onOpenDetails,
  onExit,
  onAvailabilityChange,
  onProgressActionAccepted,
}: Props) {
  const supportedMode =
    mode === "word-to-definition" || mode === "definition-to-word";
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
      supportedMode
        ? peekPrefetchedPlatformV2TrainingEntry(lookupInput)
        : null,
  );
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [noticeTone, setNoticeTone] = React.useState<"error" | "info">("error");
  const [focusStageOnPresentation, setFocusStageOnPresentation] =
    React.useState(false);
  const [cardAnnouncement, setCardAnnouncement] = React.useState("");
  const presentedEntryIdRef = React.useRef<string | null>(null);
  const interactionBusyRef = React.useRef(false);
  const loadGenerationRef = React.useRef(0);

  const load = React.useCallback(
    async (
      signal?: AbortSignal,
      options: { preserveCard?: boolean; usePrefetch?: boolean } = {},
    ) => {
      if (!supportedMode) return null;
      const generation = (loadGenerationRef.current += 1);
      setError(null);
      if (!options.preserveCard) {
        const prefetched = peekPrefetchedPlatformV2TrainingEntry(lookupInput);
        setLookup(prefetched);
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
      const nextEntryId = next.state === "ready" ? next.entry.entryId : null;
      const cardChanged = Boolean(
        nextEntryId &&
        presentedEntryIdRef.current &&
        presentedEntryIdRef.current !== nextEntryId,
      );
      setFocusStageOnPresentation(cardChanged);
      if (cardChanged) {
        setCardAnnouncement(
          platformV2Message(
            interfaceLanguage,
            "senseCard.training.cardChanged",
          ),
        );
      }
      if (nextEntryId) presentedEntryIdRef.current = nextEntryId;
      setLookup(next);
      return next;
    },
    [
      interfaceLanguage,
      lookupInput,
      supportedMode,
    ],
  );

  React.useEffect(() => {
    const controller = new AbortController();
    setError(null);
    if (!supportedMode) return () => controller.abort();
    void load(controller.signal).catch((cause) => {
      if (controller.signal.aborted) return;
      setLookup({ state: "lookup-http-error", status: 0 });
      setError(cause instanceof Error ? cause.message : "lookup_failed");
    });
    return () => {
      controller.abort();
      loadGenerationRef.current += 1;
    };
  }, [load, supportedMode]);

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

  const sessionState: TrainingV2SessionState = !supportedMode
    ? "listening-mode"
    : !lookup
      ? "loading"
      : lookup.state !== "ready"
        ? lookup.state
        : !model
          ? "model-invalid"
          : mode === "definition-to-word" &&
              !model.definitions.some((item) => item.kind === "definition")
            ? "reverse-definition-missing"
            : "ready";

  React.useEffect(() => {
    onAvailabilityChange(sessionState);
  }, [onAvailabilityChange, sessionState]);

  React.useEffect(
    () => () => onAvailabilityChange("loading"),
    [onAvailabilityChange],
  );

  const handleAction = async (capability: PlatformSenseCardCapabilityV2) => {
    if (interactionBusyRef.current) return;
    interactionBusyRef.current = true;
    setBusy(true);
    setError(null);
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
        return;
      }
      if (capability.actionId === "report-content") {
        setNoticeTone("info");
        setError(
          platformV2Message(
            interfaceLanguage,
            "senseCard.reportUnavailable",
          ),
        );
        return;
      }
      if (!isPlatformV2TrainingActionCapability(capability)) return;
      setNoticeTone("error");
      const response = await performPlatformV2TrainingAction(capability);
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
          rememberPendingKnownUndo(undoKnown ?? null);
        } else {
          rememberPendingKnownUndo(null);
        }
        await onProgressActionAccepted(capability);
      }
    } catch (cause) {
      setNoticeTone("error");
      const code = cause instanceof Error ? cause.message : "action_failed";
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
          code === "Failed to fetch" || code === "platform_request_timeout"
            ? temporaryFailureMessage(interfaceLanguage)
            : code,
        );
      }
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

  const cardAnnouncementRegion = (
    <span className="sr-only" aria-live="polite" aria-atomic="true">
      {cardAnnouncement}
    </span>
  );

  if (!supportedMode) {
    return (
      <div data-training-renderer="legacy" data-training-v2-state="listening-mode">
        {fallback}
      </div>
    );
  }

  if (sessionState === "loading") {
    return (
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
      </div>
    );
  }

  if (sessionState !== "ready" || !result || !model) {
    const failureState = sessionState as Exclude<
      TrainingV2SessionState,
      "loading" | "ready" | "listening-mode"
    >;
    return (
      <SessionV2Failure
        state={failureState}
        interfaceLanguage={interfaceLanguage}
        detail={error}
        onExit={onExit}
        onRetry={() => {
          void load(undefined, { usePrefetch: false }).catch((cause) => {
            setLookup({ state: "lookup-http-error", status: 0 });
            setError(cause instanceof Error ? cause.message : "lookup_failed");
          });
        }}
      />
    );
  }

  return (
    <div
      className="contents"
      data-testid="training-sense-card-v2"
      data-training-renderer="v2"
      data-training-v2-state="ready"
    >
      {cardAnnouncementRegion}
      <TrainingSenseCardStage
        model={model}
        mode={mode}
        interfaceLanguage={interfaceLanguage}
        busy={busy}
        focusOnMount={focusStageOnPresentation}
        onPlayAudio={
          result.group.header.audio && onPlayResolvedAudio
            ? () => void handlePlayAudio()
            : undefined
        }
        onOpenDetails={onOpenDetails}
        onAction={(capability) => void handleAction(capability)}
      />
      <SessionError
        error={error}
        tone={noticeTone}
        dismissLabel={platformV2Message(interfaceLanguage, "senseCard.dismiss")}
        onDismiss={() => setError(null)}
      />
    </div>
  );
}

export function TrainingKnownUndoNotice({
  interfaceLanguage,
}: {
  interfaceLanguage: OnboardingLanguage;
}) {
  const [undoKnown, setUndoKnown] = React.useState<UndoKnownCapability | null>(
    null,
  );
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const t = (key: string) => platformV2Message(interfaceLanguage, key);

  React.useEffect(() => {
    const sync = () => setUndoKnown(readPendingKnownUndo());
    sync();
    window.addEventListener(PENDING_KNOWN_UNDO_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(PENDING_KNOWN_UNDO_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  React.useEffect(() => {
    if (!error) return;
    const timer = window.setTimeout(() => setError(null), 5000);
    return () => window.clearTimeout(timer);
  }, [error]);

  if (!undoKnown && !error) return null;

  const handleUndo = async () => {
    if (!undoKnown) return;
    setBusy(true);
    setError(null);
    try {
      await performPlatformV2TrainingAction(undoKnown);
      rememberPendingKnownUndo(null);
      setUndoKnown(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "action_failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-x-4 bottom-20 z-50 mx-auto flex max-w-md flex-col gap-2">
      {error ? (
        <div
          role="status"
          className="rounded-xl border border-rose-400/60 bg-[#261b22] px-4 py-3 text-sm text-rose-100 shadow-xl"
        >
          {error}
        </div>
      ) : null}
      {undoKnown ? (
        <div className="flex items-center justify-between gap-4 rounded-xl border border-emerald-400/60 bg-[#17251f] px-4 py-3 text-sm text-emerald-100 shadow-xl">
          <span>{t("senseCard.known.marked")}</span>
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleUndo()}
            className="shrink-0 font-semibold text-indigo-200 hover:text-white disabled:opacity-50"
          >
            {t(undoKnown.messageKey)}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function readPendingKnownUndo(): UndoKnownCapability | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(PENDING_KNOWN_UNDO_STORAGE_KEY);
    if (!raw) return null;
    const capability = JSON.parse(raw) as UndoKnownCapability;
    return capability.actionId === "undo-known" ? capability : null;
  } catch {
    return null;
  }
}

function rememberPendingKnownUndo(capability: UndoKnownCapability | null) {
  if (typeof window === "undefined") return;
  try {
    if (capability) {
      window.sessionStorage.setItem(
        PENDING_KNOWN_UNDO_STORAGE_KEY,
        JSON.stringify(capability),
      );
    } else {
      window.sessionStorage.removeItem(PENDING_KNOWN_UNDO_STORAGE_KEY);
    }
    window.dispatchEvent(new Event(PENDING_KNOWN_UNDO_EVENT));
  } catch {
    // Undo still works within the mounted session when storage is unavailable.
  }
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
  state: Exclude<TrainingV2SessionState, "loading" | "ready" | "listening-mode">;
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
      className="mx-auto grid min-h-48 w-full max-w-[760px] place-items-center self-center rounded-3xl border border-slate-300 bg-slate-50 px-6 py-10 text-center text-slate-900 shadow-sm dark:border-slate-600 dark:bg-[#1d222b] dark:text-slate-50"
    >
      <div className="flex max-w-sm flex-col items-center gap-4">
        <p className="text-sm font-medium">
          {platformV2Message(interfaceLanguage, "senseCard.training.loadFailed")}
        </p>
        {detail ? <span className="sr-only">{detail}</span> : null}
        <div className="flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={onRetry}
            className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 dark:border-slate-600 dark:bg-[#171b22] dark:text-slate-100"
          >
            {platformV2Message(interfaceLanguage, "senseCard.training.retry")}
          </button>
          {onExit ? (
            <button
              type="button"
              onClick={onExit}
              className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-200/60 dark:text-slate-300 dark:hover:bg-slate-700/50"
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
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`fixed inset-x-4 bottom-52 z-50 mx-auto max-w-md rounded-xl border px-4 py-2 text-sm shadow-xl sm:bottom-24 ${
        tone === "info"
          ? "border-slate-400/60 bg-slate-900 text-slate-50"
          : "border-rose-400/60 bg-[#261b22] text-rose-100"
      }`}
    >
      <div className="flex items-center justify-between gap-4">
        <span>{error}</span>
        <button
          type="button"
          aria-label={dismissLabel}
          onClick={onDismiss}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-xl leading-none text-current opacity-80 hover:bg-white/10 hover:opacity-100"
        >
          ×
        </button>
      </div>
    </div>
  ) : null;
}

function temporaryFailureMessage(interfaceLanguage: OnboardingLanguage) {
  return platformV2Message(
    interfaceLanguage,
    "senseCard.training.temporaryFailure",
  );
}
