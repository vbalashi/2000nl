"use client";
import { useEffect, useRef } from "react";
import type { PlatformSenseCardEntryV2 } from "../../../../packages/shared/types/platformV2";
import {
  onDictionaryTranslationReady,
  onDictionaryTranslationRevalidate,
} from "../translation/dictionaryTranslationEvents";
import { requestPlatformV2Translation } from "./platformV2TrainingMediaClient";

/** The server's latest capability owns preparation, including after policy rollout
 * or an expired observation. Hints never force regeneration or replace authority. */
export function usePlatformV2TranslationPreparation(input: {
  entry: PlatformSenseCardEntryV2 | null;
  targetLanguageCode: string | null;
  enabled: boolean;
  refresh: (signal: AbortSignal) => Promise<PlatformSenseCardEntryV2 | null>;
  onStatus?: (status: "pending" | "failed") => void;
}) {
  const callbacks = useRef(input);
  callbacks.current = input;
  const preparing = useRef(false),
    settledAttempt = useRef<string | null>(null);
  const entryId = input.entry?.entryId,
    revision = input.entry?.contentRevision;
  const needsPreparation = Boolean(
    input.entry?.capabilities.some(
      (item) =>
        item.actionId === "request-translation" &&
        item.targetLanguageCode === input.targetLanguageCode,
    ),
  );
  useEffect(() => {
    if (
      !input.enabled ||
      !entryId ||
      !input.targetLanguageCode ||
      input.targetLanguageCode === "off"
    )
      return;
    const controller = new AbortController(),
      current = callbacks.current;
    const attemptKey = JSON.stringify([
      entryId,
      revision,
      current.targetLanguageCode,
    ]);
    if (!needsPreparation) settledAttempt.current = null;
    let refreshing = false;
    const isCurrent = () =>
      !controller.signal.aborted &&
      callbacks.current.enabled &&
      callbacks.current.entry?.entryId === entryId &&
      callbacks.current.targetLanguageCode === current.targetLanguageCode;
    const refresh = async () => {
      if (!isCurrent() || refreshing) return null;
      refreshing = true;
      try {
        return await callbacks.current.refresh(controller.signal);
      } finally {
        refreshing = false;
      }
    };
    const prepare = async (entry: PlatformSenseCardEntryV2) => {
      const request = entry.capabilities.find(
        (item) =>
          item.actionId === "request-translation" &&
          item.targetLanguageCode === current.targetLanguageCode,
      );
      if (
        !isCurrent() ||
        preparing.current ||
        request?.actionId !== "request-translation"
      )
        return;
      preparing.current = true;
      try {
        const status = await requestPlatformV2Translation(request, {
          signal: controller.signal,
        });
        if (!isCurrent()) return;
        if (status === "ready") await refresh();
        else callbacks.current.onStatus?.(status);
      } catch {
        if (isCurrent()) callbacks.current.onStatus?.("failed");
      } finally {
        if (!controller.signal.aborted) {
          preparing.current = false;
          settledAttempt.current = attemptKey;
        }
      }
    };
    const detachRevalidation = onDictionaryTranslationRevalidate(() => {
      if (preparing.current) return;
      void refresh()
        .then((entry) => {
          if (entry) void prepare(entry);
        })
        .catch(() => {
          if (isCurrent()) callbacks.current.onStatus?.("failed");
        });
    });
    const detach = onDictionaryTranslationReady((event) => {
      if (
        event.entryId !== entryId ||
        event.targetLanguageCode !== current.targetLanguageCode ||
        preparing.current
      )
        return;
      void refresh().catch(() => {
        if (isCurrent()) callbacks.current.onStatus?.("failed");
      });
    });
    if (current.entry && settledAttempt.current !== attemptKey)
      void prepare(current.entry);
    return () => {
      controller.abort();
      detach();
      detachRevalidation();
      preparing.current = false;
    };
  }, [
    entryId,
    input.enabled,
    input.targetLanguageCode,
    needsPreparation,
    revision,
  ]);
  return preparing;
}
