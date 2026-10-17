"use client";
import { useEffect, useState } from "react";
import {
  loadWordContextPrompt,
  type WordContextLoadResult,
} from "@/lib/training/wordContextPrompt";
import {
  onDictionaryTranslationReady,
  onDictionaryTranslationRevalidate,
} from "@/lib/translation/dictionaryTranslationEvents";
import { DICTIONARY_TRANSLATION_PENDING_MS } from "@/lib/translation/dictionaryTranslationBudgets";

/** A concurrent translation request can finish after the initial pending response.
 * Recheck only the latched member, with a bounded wait and cancellation on exit. */
export function useWordContextPrompt({
  cacheOwnerId,
  trainingSessionId,
  entryId,
  contentLanguageCode,
  translationTargetLanguageCode,
  wordInContext,
  retry,
}: {
  cacheOwnerId: string;
  trainingSessionId?: string | null;
  entryId: string;
  contentLanguageCode: string;
  translationTargetLanguageCode: string | null;
  wordInContext: boolean;
  retry: number;
}) {
  const [result, setResult] = useState<WordContextLoadResult | null>(null);
  useEffect(() => {
    setResult(null);
    if (!wordInContext || !trainingSessionId || !translationTargetLanguageCode)
      return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let rechecks = 0;
    let force = retry > 0;
    let failureRetries = 0;
    const retryFailure = () => {
      if (failureRetries++ < 2)
        timer = setTimeout(() => {
          void load();
        }, 2000 * failureRetries);
    };
    let inFlight = false, dirty = false;
    const load = async (invalidate = false) => {
      if (controller.signal.aborted) return;
      if (inFlight) { if (invalidate) dirty = true; return; }
      inFlight = true;
      if (timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
      }
      try {
        const loaded = await loadWordContextPrompt({
          userId: cacheOwnerId,
          sessionId: trainingSessionId,
          entryId,
          contentLanguageCode,
          translationTargetLanguageCode,
          signal: controller.signal,
          force,
        });
        force = false;
        if (controller.signal.aborted) return;
        setResult(loaded);
        if (
          loaded.state === "translation-pending" &&
          rechecks++ < DICTIONARY_TRANSLATION_PENDING_MS / 2000
        )
          timer = setTimeout(() => {
            void load();
          }, 2000);
        if (loaded.state === "translation-unavailable") retryFailure();
      } catch {
        if (!controller.signal.aborted) {
          setResult({ state: "translation-unavailable" });
          retryFailure();
        }
      } finally {
        inFlight = false;
        if (dirty && !controller.signal.aborted) { dirty = false; void load(); }
      }
    };
    const detach = onDictionaryTranslationReady((event) => {
      if (
        event.entryId === entryId &&
        event.targetLanguageCode === translationTargetLanguageCode
      )
        void load(true);
    }, { entryId, targetLanguageCode: translationTargetLanguageCode });
    const detachRecovery = onDictionaryTranslationRevalidate(() => void load(true), { entryId, targetLanguageCode: translationTargetLanguageCode });
    void load();
    return () => {
      detach();
      detachRecovery();
      controller.abort();
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [
    cacheOwnerId,
    contentLanguageCode,
    entryId,
    retry,
    trainingSessionId,
    translationTargetLanguageCode,
    wordInContext,
  ]);
  return result;
}
