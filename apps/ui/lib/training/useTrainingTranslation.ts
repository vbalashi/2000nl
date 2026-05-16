import React from "react";
import type {
  TranslationOverlay,
  WordEntryTranslationStatus,
} from "@/lib/types";

type TranslationKind =
  | "definition"
  | "context"
  | { exampleIndex: number }
  | { idiomIndex: number; idiomField: "expression" | "explanation" };

export function useTrainingTranslation(params: {
  wordId?: string | null;
  translationLang: string | null;
  revealed: boolean;
  translationTooltipOpen: boolean;
  onTranslationTooltipOpenChange?: (open: boolean) => void;
}) {
  const {
    wordId,
    translationLang,
    revealed,
    translationTooltipOpen,
    onTranslationTooltipOpenChange,
  } = params;
  const [translationStatus, setTranslationStatus] =
    React.useState<WordEntryTranslationStatus | null>(null);
  const [translationOverlay, setTranslationOverlay] =
    React.useState<TranslationOverlay | null>(null);
  const [translationError, setTranslationError] = React.useState<string | null>(
    null,
  );
  const translationLoadingRef = React.useRef(false);
  const translationPollTimeoutRef = React.useRef<number | null>(null);
  const translationLongPressTimeoutRef = React.useRef<number | null>(null);
  const translationLongPressFiredRef = React.useRef(false);

  React.useEffect(() => {
    translationLoadingRef.current = false;
    if (translationPollTimeoutRef.current != null) {
      window.clearTimeout(translationPollTimeoutRef.current);
      translationPollTimeoutRef.current = null;
    }
    if (translationLongPressTimeoutRef.current != null) {
      window.clearTimeout(translationLongPressTimeoutRef.current);
      translationLongPressTimeoutRef.current = null;
    }
    translationLongPressFiredRef.current = false;
    setTranslationStatus(null);
    setTranslationOverlay(null);
    setTranslationError(null);
  }, [wordId, translationLang]);

  const fetchTranslation = React.useCallback(
    async (opts?: { force?: boolean }) => {
      if (!wordId || !translationLang || translationLang === "off") return;
      if (translationLoadingRef.current) return;
      if (!opts?.force && translationStatus === "ready" && translationOverlay)
        return;

      translationLoadingRef.current = true;
      try {
        setTranslationStatus("pending");
        setTranslationOverlay(null);
        setTranslationError(null);

        const res = await fetch(
          `/api/translation?word_id=${encodeURIComponent(
            wordId,
          )}&lang=${encodeURIComponent(translationLang)}${
            opts?.force ? "&force=1" : ""
          }`,
          {
            cache: "no-store",
            credentials: "same-origin",
            headers: { Accept: "application/json" },
          },
        );

        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(
            `Translation API ${res.status}: ${text || res.statusText}`,
          );
        }

        const data = (await res.json().catch(() => null)) as
          | {
              status?: WordEntryTranslationStatus;
              overlay?: TranslationOverlay;
              error?: string;
            }
          | null;

        setTranslationStatus(data?.status ?? null);
        setTranslationOverlay(data?.overlay ?? null);
        setTranslationError(data?.error ?? null);
      } catch (e: any) {
        setTranslationStatus("failed");
        setTranslationError(String(e?.message ?? e ?? "Unknown error"));
      } finally {
        translationLoadingRef.current = false;
      }
    },
    [translationLang, translationOverlay, translationStatus, wordId],
  );

  React.useEffect(() => {
    if (!translationTooltipOpen) return;
    void fetchTranslation();
  }, [fetchTranslation, translationTooltipOpen]);

  React.useEffect(() => {
    if (!revealed) return;
    if (!wordId) return;
    if (!translationLang || translationLang === "off") return;
    if (translationStatus !== null) return;
    void fetchTranslation();
  }, [fetchTranslation, revealed, translationLang, translationStatus, wordId]);

  React.useEffect(() => {
    if (!translationTooltipOpen) return;
    if (!translationLang || translationLang === "off") return;
    if (!wordId) return;

    if (translationPollTimeoutRef.current != null) {
      window.clearTimeout(translationPollTimeoutRef.current);
      translationPollTimeoutRef.current = null;
    }

    if (translationStatus !== "pending") return;

    translationPollTimeoutRef.current = window.setTimeout(() => {
      void fetchTranslation();
    }, 3000);

    return () => {
      if (translationPollTimeoutRef.current != null) {
        window.clearTimeout(translationPollTimeoutRef.current);
        translationPollTimeoutRef.current = null;
      }
    };
  }, [
    fetchTranslation,
    translationLang,
    translationStatus,
    translationTooltipOpen,
    wordId,
  ]);

  const getTranslated = React.useCallback(
    (meaningIndex: number, kind: TranslationKind) => {
      const meaning = translationOverlay?.meanings?.[meaningIndex];
      if (!meaning) return undefined;

      if (kind === "definition") return meaning.definition;
      if (kind === "context") return meaning.context;

      if (typeof kind === "object" && "exampleIndex" in kind) {
        return meaning.examples?.[kind.exampleIndex];
      }

      if (typeof kind === "object" && "idiomIndex" in kind) {
        const item = meaning.idioms?.[kind.idiomIndex];
        if (typeof item === "string") return item;
        if (item && typeof item === "object") {
          return kind.idiomField === "expression"
            ? item.expression
            : item.explanation;
        }
      }

      return undefined;
    },
    [translationOverlay],
  );

  const getHeadwordTranslated = React.useCallback(() => {
    return translationOverlay?.headword;
  }, [translationOverlay?.headword]);

  const translationUiEnabled =
    Boolean(translationLang) && translationLang !== "off" && revealed;
  const isTranslationOpen = translationUiEnabled ? translationTooltipOpen : false;
  const translationProviderUsed = translationOverlay?.__meta?.providerUsed ?? null;
  const translationStatusText =
    translationStatus === null
      ? "Klik om vertaling te laden"
      : translationStatus === "pending"
        ? "Vertaling wordt voorbereid…"
        : translationStatus === "failed"
          ? translationError ?? "Vertaling mislukt"
          : null;

  const clearLongPressTimer = React.useCallback(() => {
    if (translationLongPressTimeoutRef.current != null) {
      window.clearTimeout(translationLongPressTimeoutRef.current);
      translationLongPressTimeoutRef.current = null;
    }
  }, []);

  const translationButtonHandlers = {
    onPointerEnter: () => {
      if (translationStatus == null) {
        void fetchTranslation();
      }
    },
    onFocus: () => {
      if (translationStatus == null) {
        void fetchTranslation();
      }
    },
    onTouchStart: () => {
      if (translationStatus == null) {
        void fetchTranslation();
      }
    },
    onPointerDown: () => {
      clearLongPressTimer();
      translationLongPressFiredRef.current = false;

      translationLongPressTimeoutRef.current = window.setTimeout(() => {
        translationLongPressFiredRef.current = true;
        void fetchTranslation({ force: true });
        onTranslationTooltipOpenChange?.(true);
      }, 650);
    },
    onPointerUp: clearLongPressTimer,
    onPointerLeave: clearLongPressTimer,
    onPointerCancel: clearLongPressTimer,
    onClick: () => {
      if (translationLongPressFiredRef.current) {
        translationLongPressFiredRef.current = false;
        return;
      }
      void fetchTranslation();
      onTranslationTooltipOpenChange?.(!translationTooltipOpen);
    },
  };

  return {
    fetchTranslation,
    getHeadwordTranslated,
    getTranslated,
    isTranslationOpen,
    translationButtonHandlers,
    translationProviderUsed,
    translationStatusText,
    translationUiEnabled,
  };
}
