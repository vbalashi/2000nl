"use client";

import React from "react";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import { platformV2Message } from "@/lib/platform/platformV2ClientI18n";
import {
  fetchPlatformV2TrainingEntry,
  isPlatformV2TrainingActionCapability,
  performPlatformV2TrainingAction,
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
  word: TrainingWord;
  mode: TrainingMode;
  contentLanguageCode: string;
  translationTargetLanguageCode: string | null;
  interfaceLanguage: OnboardingLanguage;
  fallback: React.ReactNode;
  onPlayResolvedAudio?: (url: string, label: string) => void;
  onOpenDetails?: () => void;
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
  word,
  mode,
  contentLanguageCode,
  translationTargetLanguageCode,
  interfaceLanguage,
  fallback,
  onPlayResolvedAudio,
  onOpenDetails,
  onAvailabilityChange,
  onProgressActionAccepted,
}: Props) {
  const supportedMode =
    mode === "word-to-definition" || mode === "definition-to-word";
  const [lookup, setLookup] = React.useState<PlatformV2TrainingLookupResult | null>(
    null,
  );
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [focusStageOnPresentation, setFocusStageOnPresentation] =
    React.useState(false);
  const [cardAnnouncement, setCardAnnouncement] = React.useState("");
  const presentedEntryIdRef = React.useRef<string | null>(null);

  const load = React.useCallback(
    async (signal?: AbortSignal) => {
      if (!supportedMode) return null;
      setLookup(null);
      setError(null);
      const next = await fetchPlatformV2TrainingEntry({
        entryId: word.id,
        cardTypeId: mode,
        contentLanguageCode,
        translationTargetLanguageCode,
        signal,
      });
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
      contentLanguageCode,
      interfaceLanguage,
      mode,
      translationTargetLanguageCode,
      word.id,
      supportedMode,
    ],
  );

  React.useEffect(() => {
    const controller = new AbortController();
    setLookup(null);
    setError(null);
    if (!supportedMode) return () => controller.abort();
    void load(controller.signal).catch((cause) => {
      if (controller.signal.aborted) return;
      setLookup({ state: "lookup-http-error", status: 0 });
      setError(cause instanceof Error ? cause.message : "lookup_failed");
    });
    return () => controller.abort();
  }, [load, supportedMode]);

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
    setBusy(true);
    setError(null);
    try {
      if (capability.actionId === "request-translation") {
        await requestPlatformV2Translation(capability);
        await load();
        return;
      }
      if (capability.actionId === "report-content") {
        setError(
          platformV2Message(
            interfaceLanguage,
            "senseCard.reportUnavailable",
          ),
        );
        return;
      }
      if (!isPlatformV2TrainingActionCapability(capability)) return;
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
      setError(cause instanceof Error ? cause.message : "action_failed");
    } finally {
      setBusy(false);
    }
  };

  const handlePlayAudio = async () => {
    const capability = result?.group.header.audio;
    if (!capability || !onPlayResolvedAudio) return;
    setBusy(true);
    setError(null);
    try {
      const url = await resolvePlatformV2Audio({
        capability,
        text: result.group.header.text,
      });
      onPlayResolvedAudio(url, result.group.header.text);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "audio_failed");
    } finally {
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
      <div
        role="status"
        data-testid="training-v2-loading"
        data-training-renderer="v2"
        data-training-v2-state="loading"
        className="grid h-full place-items-center rounded-3xl border border-slate-300 bg-slate-50 px-6 text-sm font-medium text-slate-600 dark:border-slate-600 dark:bg-[#1d222b] dark:text-slate-300"
      >
        {platformV2Message(interfaceLanguage, "senseCard.training.loading")}
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
        onRetry={() => void load()}
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
      <SessionError error={error} />
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
}: {
  state: Exclude<TrainingV2SessionState, "loading" | "ready" | "listening-mode">;
  interfaceLanguage: OnboardingLanguage;
  detail: string | null;
  onRetry: () => void;
}) {
  return (
    <div
      role="alert"
      data-training-renderer="v2"
      data-training-v2-state={state}
      className="grid h-full place-items-center rounded-3xl border border-rose-300 bg-rose-50 px-6 text-center text-slate-900 dark:border-rose-900/60 dark:bg-[#261b22] dark:text-rose-50"
    >
      <div className="flex max-w-sm flex-col items-center gap-4">
        <p className="text-sm font-medium">
          {platformV2Message(interfaceLanguage, "senseCard.training.loadFailed")}
        </p>
        {detail ? <span className="sr-only">{detail}</span> : null}
        <button
          type="button"
          onClick={onRetry}
          className="rounded-xl border border-rose-300 bg-white px-4 py-2 text-sm font-semibold text-rose-800 dark:border-rose-700 dark:bg-[#171b22] dark:text-rose-100"
        >
          {platformV2Message(interfaceLanguage, "senseCard.training.retry")}
        </button>
      </div>
    </div>
  );
}

function SessionError({
  error,
}: {
  error: string | null;
}) {
  return error ? (
    <div
      role="status"
      className="fixed inset-x-4 bottom-20 z-50 mx-auto max-w-md rounded-xl border border-rose-400/60 bg-[#261b22] px-4 py-3 text-sm text-rose-100 shadow-xl"
    >
      {error}
    </div>
  ) : null;
}
