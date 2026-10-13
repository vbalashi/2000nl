"use client";
import { useEffect, useRef } from "react";
import type { PlatformSenseCardEntryV2 } from "../../../../packages/shared/types/platformV2";
import { onDictionaryTranslationReady, onDictionaryTranslationRevalidate } from "../translation/dictionaryTranslationEvents";
import { requestPlatformV2Translation } from "./platformV2TrainingMediaClient";

/** A visible card prepares through the existing queue and refreshes only its own
 * projection. Completion from another surface also invalidates the visible copy. */
export function usePlatformV2TranslationPreparation(input: {
  entry: PlatformSenseCardEntryV2 | null;
  targetLanguageCode: string | null;
  enabled: boolean;
  refresh: (signal: AbortSignal) => Promise<unknown>;
  onStatus?: (status: "pending" | "failed") => void;
}) {
  const callbacks = useRef(input);
  callbacks.current = input;
  const preparing = useRef(false);
  const settledAttempt = useRef<string | null>(null);
  const capability = input.entry?.capabilities.find(item =>
    item.actionId === "request-translation" && item.targetLanguageCode === input.targetLanguageCode,
  );
  const entryId = input.entry?.entryId;
  const revision = input.entry?.contentRevision;
  const needsPreparation = Boolean(capability);
  useEffect(() => {
    if (!input.enabled || !entryId || !input.targetLanguageCode || input.targetLanguageCode === "off") return;
    const controller = new AbortController();
    const current = callbacks.current;
    const attemptKey = JSON.stringify([entryId, revision, current.targetLanguageCode]);
    if (!needsPreparation) settledAttempt.current = null;
    let refreshing = false;
    const refresh = async () => {
      if (controller.signal.aborted || refreshing || !callbacks.current.enabled ||
          callbacks.current.entry?.entryId !== entryId || callbacks.current.targetLanguageCode !== current.targetLanguageCode) return;
      refreshing = true;
      try { await callbacks.current.refresh(controller.signal); }
      finally { refreshing = false; }
    };
    const detachRevalidation = onDictionaryTranslationRevalidate(() => {
      if (!preparing.current) void refresh().catch(() => { /* Existing card remains usable; next focus/poll retries. */ });
    });
    const detach = onDictionaryTranslationReady(translation => {
      if (translation.entryId !== entryId || translation.targetLanguageCode !== current.targetLanguageCode || preparing.current) return;
      void refresh().catch(() => { if (!controller.signal.aborted) callbacks.current.onStatus?.("failed"); });
    });
    const request = current.entry?.capabilities.find(item => item.actionId === "request-translation" && item.targetLanguageCode === current.targetLanguageCode);
    if (request?.actionId === "request-translation" && settledAttempt.current !== attemptKey) {
      preparing.current = true;
      void requestPlatformV2Translation(request, { signal: controller.signal }).then(async status => {
        if (controller.signal.aborted) return;
        if (status === "ready") await refresh();
        else callbacks.current.onStatus?.(status);
      }).catch(() => {
        if (!controller.signal.aborted) callbacks.current.onStatus?.("failed");
      }).finally(() => {
        if (!controller.signal.aborted) { preparing.current = false; settledAttempt.current = attemptKey; }
      });
    }
    return () => { controller.abort(); detach(); detachRevalidation(); preparing.current = false; };
  }, [entryId, input.enabled, input.targetLanguageCode, needsPreparation, revision]);
  return preparing;
}
