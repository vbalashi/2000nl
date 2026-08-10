"use client";

import React from "react";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import { platformV2Message } from "@/lib/platform/platformV2ClientI18n";
import {
  fetchPlatformV2TrainingEntry,
  isPlatformV2TrainingActionCapability,
  performPlatformV2TrainingAction,
  resolvePlatformV2Audio,
  type PlatformV2TrainingActionCapability,
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
  onAvailabilityChange: (available: boolean) => void;
  onProgressActionAccepted: (
    capability: PlatformV2TrainingActionCapability,
  ) => void | Promise<void>;
};

type UndoKnownCapability = Extract<
  PlatformSenseCardCapabilityV2,
  { actionId: "undo-known" }
>;

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
  const [result, setResult] =
    React.useState<Awaited<ReturnType<typeof fetchPlatformV2TrainingEntry>>>(
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
      const next = await fetchPlatformV2TrainingEntry({
        query: word.headword,
        entryId: word.id,
        cardTypeId: mode,
        contentLanguageCode,
        translationTargetLanguageCode,
        signal,
      });
      const nextEntryId = next?.entry.entryId ?? null;
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
      setResult(next);
      return next;
    },
    [
      contentLanguageCode,
      interfaceLanguage,
      mode,
      translationTargetLanguageCode,
      word.headword,
      word.id,
    ],
  );

  React.useEffect(() => {
    const controller = new AbortController();
    setResult(null);
    setError(null);
    void load(controller.signal).catch((cause) => {
      if (controller.signal.aborted) return;
      setError(cause instanceof Error ? cause.message : "lookup_failed");
    });
    return () => controller.abort();
  }, [load]);

  const model = React.useMemo(
    () =>
      result
        ? buildTrainingSenseCardModel({
            group: result.group,
            entry: result.entry,
            interfaceLanguage,
          })
        : null,
    [interfaceLanguage, result],
  );
  const presentationAvailable = Boolean(
    model &&
    (mode !== "definition-to-word" ||
      model.definitions.some((item) => item.kind === "definition")),
  );

  React.useEffect(() => {
    onAvailabilityChange(presentationAvailable);
  }, [onAvailabilityChange, presentationAvailable]);

  React.useEffect(
    () => () => onAvailabilityChange(false),
    [onAvailabilityChange],
  );

  const handleAction = async (capability: PlatformSenseCardCapabilityV2) => {
    setBusy(true);
    setError(null);
    try {
      if (!isPlatformV2TrainingActionCapability(capability)) return;
      const response = await performPlatformV2TrainingAction(capability);
      if (capability.actionId === "undo-known") {
        rememberPendingKnownUndo(null);
        if (result?.entry.entryId === capability.target.entryId) await load();
      } else {
        if (capability.actionId === "mark-known") {
          const refreshed = await load();
          const undoKnown = refreshed?.entry.capabilities.find(
            (candidate): candidate is UndoKnownCapability =>
              candidate.actionId === "undo-known",
          );
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

  if (!result || !model || !presentationAvailable) {
    return (
      <>
        {fallback}
        <SessionError error={error} />
      </>
    );
  }

  return (
    <>
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {cardAnnouncement}
      </span>
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
    </>
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

function SessionError({ error }: { error: string | null }) {
  return error ? (
    <div
      role="status"
      className="fixed inset-x-4 bottom-20 z-50 mx-auto max-w-md rounded-xl border border-rose-400/60 bg-[#261b22] px-4 py-3 text-sm text-rose-100 shadow-xl"
    >
      {error}
    </div>
  ) : null;
}
