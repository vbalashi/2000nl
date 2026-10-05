"use client";
import { useEffect, useState } from "react";
import { loadWordContextPrompt, type WordContextLoadResult } from "@/lib/training/wordContextPrompt";

/** A concurrent translation request can finish after the initial pending response.
 * Recheck only the latched member, with a bounded wait and cancellation on exit. */
export function useWordContextPrompt({ cacheOwnerId, trainingSessionId, entryId, contentLanguageCode, translationTargetLanguageCode, wordInContext, retry }: {
  cacheOwnerId: string; trainingSessionId?: string | null; entryId: string;
  contentLanguageCode: string; translationTargetLanguageCode: string | null;
  wordInContext: boolean; retry: number;
}) {
  const [result, setResult] = useState<WordContextLoadResult | null>(null);
  useEffect(() => {
    setResult(null);
    if (!wordInContext || !trainingSessionId || !translationTargetLanguageCode) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let rechecks = 0;
    const load = async () => {
      try {
        const loaded = await loadWordContextPrompt({userId: cacheOwnerId, sessionId: trainingSessionId, entryId, contentLanguageCode, translationTargetLanguageCode, signal: controller.signal});
        if (controller.signal.aborted) return;
        setResult(loaded);
        if (loaded.state === "translation-pending" && rechecks++ < 10) timer = setTimeout(() => { void load(); }, 2000);
      } catch {
        if (!controller.signal.aborted) setResult({state: "translation-unavailable"});
      }
    };
    void load();
    return () => {controller.abort(); if (timer !== undefined) clearTimeout(timer);};
  }, [cacheOwnerId, contentLanguageCode, entryId, retry, trainingSessionId, translationTargetLanguageCode, wordInContext]);
  return result;
}
