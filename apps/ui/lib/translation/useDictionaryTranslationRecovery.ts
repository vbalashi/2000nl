"use client";
import { useEffect, useRef } from "react";
import {
  onDictionaryTranslationReady,
  onDictionaryTranslationRevalidate,
} from "./dictionaryTranslationEvents";
/** Recover a pending surface even if its original observation window expired. */
export function useDictionaryTranslationRecovery(input: {
  entryId: string | null;
  targetLanguageCode: string | null;
  enabled: boolean;
  refresh: () => void;
}) {
  const latest = useRef(input);
  latest.current = input;
  useEffect(() => {
    if (!input.enabled || !input.entryId || !input.targetLanguageCode) return;
    const refresh = () => {
      if (
        latest.current.enabled &&
        latest.current.entryId === input.entryId &&
        latest.current.targetLanguageCode === input.targetLanguageCode
      )
        latest.current.refresh();
    };
    const detach = onDictionaryTranslationReady((event) => {
      if (
        event.entryId === input.entryId &&
        event.targetLanguageCode === input.targetLanguageCode
      )
        refresh();
    }, { entryId: input.entryId, targetLanguageCode: input.targetLanguageCode });
    const detachRecovery = onDictionaryTranslationRevalidate(refresh, { entryId: input.entryId, targetLanguageCode: input.targetLanguageCode });
    return () => {
      detach();
      detachRecovery();
    };
  }, [input.enabled, input.entryId, input.targetLanguageCode]);
}
