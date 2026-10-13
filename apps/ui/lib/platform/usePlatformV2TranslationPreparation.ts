"use client";
import { useEffect, useRef, useState } from "react";
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
  const scope = JSON.stringify([input.entry?.entryId, input.entry?.contentRevision, input.targetLanguageCode]);
  const [feedback, setFeedback] = useState<{ scope: string; status: "pending" | "failed" | null }>({ scope: "", status: null });
  const status = feedback.scope === scope ? feedback.status : null;
  const [retry, setRetry] = useState(0);
  const forceNext = useRef<string | null>(null);
  const statusRef = useRef<"pending" | "failed" | null>(null);
  const retryTranslation = () => {
    if (preparing.current) return;
    settledAttempt.current = null;
    forceNext.current = JSON.stringify([input.entry?.entryId, input.entry?.contentRevision, input.targetLanguageCode]);
    setRetry(value => value + 1);
  };
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
    let poll: ReturnType<typeof setTimeout> | undefined;
    const reportStatus = (value: "pending" | "failed" | null) => {
      if (controller.signal.aborted) return;
      statusRef.current = value;
      setFeedback({ scope: attemptKey, status: value });
      if (value) callbacks.current.onStatus?.(value);
    };
    if (!needsPreparation) reportStatus(null);
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
    const prepare = async (entry: PlatformSenseCardEntryV2, force = false) => {
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
      reportStatus("pending");
      let pending = false;
      let ready = false;
      try {
        const status = await requestPlatformV2Translation(request, {
          signal: controller.signal,
          ...(force ? { force: true } : {}),
        });
        if (!isCurrent()) return;
        if (status === "ready") {
          ready = true;
          await refresh();
          if (isCurrent()) reportStatus(null);
        } else {
          pending = status === "pending";
          reportStatus(status);
        }
      } catch {
        if (isCurrent()) {
          // A ready job whose projection could not be refreshed is still ready
          // on the server. Re-observe instead of attributing failure to translation.
          pending = ready;
          reportStatus(ready ? "pending" : "failed");
        }
      } finally {
        if (!controller.signal.aborted) {
          preparing.current = false;
          settledAttempt.current = attemptKey;
          if (pending) poll = setTimeout(() => {
            poll = undefined;
            if (isCurrent()) void prepare(callbacks.current.entry ?? entry);
          }, 3000);
        }
      }
    };
    const detachRevalidation = onDictionaryTranslationRevalidate(() => {
      if (preparing.current || poll) return;
      void refresh()
        .then((entry) => {
          if (entry) void prepare(entry);
        })
        .catch(() => { /* Lookup recovery owns refresh failures; no job failure was observed. */ });
    });
    const detach = onDictionaryTranslationReady((event) => {
      if (
        event.entryId !== entryId ||
        event.targetLanguageCode !== current.targetLanguageCode ||
        preparing.current
      )
        return;
      void refresh().catch(() => { /* The ready hint is not evidence of a failed translation. */ });
    });
    if (current.entry && (settledAttempt.current !== attemptKey || statusRef.current === "pending")) {
      const force = forceNext.current === attemptKey;
      forceNext.current = null;
      void prepare(current.entry, force);
    }
    return () => {
      clearTimeout(poll);
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
    retry,
  ]);
  return Object.assign(preparing, { status, retry: retryTranslation });
}
