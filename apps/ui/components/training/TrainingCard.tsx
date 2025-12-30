"use client";

import React from "react";

import type { TrainingMode } from "@/lib/types";
import type { TranslationOverlay, WordEntryTranslationStatus } from "@/lib/types";
import {
  buildSegments,
  getAllMeanings,
  getPrimaryMeaning,
} from "@/lib/wordUtils";
import { InteractiveText } from "./InteractiveText";
import type { TrainingWord } from "@/lib/types";

type Props = {
  word: TrainingWord | null;
  mode: TrainingMode;
  loading?: boolean;
  revealed?: boolean;
  hintRevealed?: boolean;
  highlightedWord?: string;
  onWordClick: (headword: string) => void;
  userId: string;
  translationLang: string | null;
  translationTooltipOpen?: boolean;
  onTranslationTooltipOpenChange?: (open: boolean) => void;
  /** Callback when user clicks the info icon to see word details */
  onShowDetails?: () => void;
};

const POS_COLORS: Record<string, string> = {
  zn: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800",
  ww: "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800",
  bn: "bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800",
  bw: "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-800",
  vz: "bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800",
  lidw: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
  // fallback
  default:
    "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
};

const POS_NAMES: Record<string, string> = {
  zn: "zelfstandig naamwoord",
  ww: "werkwoord",
  bn: "bijvoeglijk naamwoord",
  bw: "bijwoord",
  vz: "voorzetsel",
  lidw: "lidwoord",
  vnw: "voornaamwoord",
  tw: "telwoord",
};

export function TrainingCard({
  word,
  mode,
  loading,
  revealed = false,
  hintRevealed = false,
  highlightedWord,
  onWordClick,
  userId,
  translationLang,
  translationTooltipOpen = false,
  onTranslationTooltipOpenChange,
  onShowDetails,
}: Props) {
  // NOTE:
  // Hooks must run on every render. Do NOT early-return before hooks
  // (otherwise React can hit internal invariants when `loading` flips).
  const [translationStatus, setTranslationStatus] =
    React.useState<WordEntryTranslationStatus | null>(null);
  const [translationOverlay, setTranslationOverlay] =
    React.useState<TranslationOverlay | null>(null);
  const [translationError, setTranslationError] = React.useState<string | null>(
    null
  );
  const translationLoadingRef = React.useRef(false);
  const [translationHovering, setTranslationHovering] = React.useState(false);
  const translationPollTimeoutRef = React.useRef<number | null>(null);

  // New card (or language) => clear cached translation state so we don't show
  // the previous card's overlay and we refetch when user opens/hovers.
  React.useEffect(() => {
    translationLoadingRef.current = false;
    if (translationPollTimeoutRef.current != null) {
      window.clearTimeout(translationPollTimeoutRef.current);
      translationPollTimeoutRef.current = null;
    }
    setTranslationStatus(null);
    setTranslationOverlay(null);
    setTranslationError(null);
    setTranslationHovering(false);
  }, [word?.id, translationLang]);

  const fetchTranslation = React.useCallback(async (opts?: { force?: boolean }) => {
    if (!word?.id || !translationLang) return;
    if (translationLoadingRef.current) return;
    if (!opts?.force && translationStatus === "ready" && translationOverlay) return;

    translationLoadingRef.current = true;
    try {
      if (opts?.force) {
        setTranslationStatus("pending");
        setTranslationOverlay(null);
        setTranslationError(null);
      }
      const res = await fetch(
        `/api/translation?word_id=${encodeURIComponent(
          word.id
        )}&lang=${encodeURIComponent(translationLang)}${opts?.force ? "&force=1" : ""}`,
        { cache: "no-store" }
      );
      const data = (await res.json()) as {
        status?: WordEntryTranslationStatus;
        overlay?: TranslationOverlay;
        error?: string;
      };
      setTranslationStatus(data.status ?? null);
      setTranslationOverlay(data.overlay ?? null);
      setTranslationError(data.error ?? null);
    } catch (e: any) {
      setTranslationStatus("failed");
      setTranslationError(String(e?.message ?? e ?? "Unknown error"));
    } finally {
      translationLoadingRef.current = false;
    }
  }, [translationLang, translationOverlay, translationStatus, word?.id]);

  React.useEffect(() => {
    if (!translationTooltipOpen) return;
    void fetchTranslation();
  }, [fetchTranslation, translationTooltipOpen]);

  // Poll while tooltip is open and translation is pending.
  React.useEffect(() => {
    if (!translationTooltipOpen && !translationHovering) return;
    if (!translationLang) return;
    if (!word?.id) return;

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
    translationTooltipOpen,
    translationHovering,
    translationLang,
    word?.id,
    translationStatus,
    fetchTranslation,
  ]);

  const getTranslated = React.useCallback(
    (
      meaningIndex: number,
      kind:
        | "definition"
        | "context"
        | { exampleIndex: number }
        | { idiomIndex: number; idiomField: "expression" | "explanation" }
    ) => {
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
    [translationOverlay]
  );

  const getHeadwordTranslated = React.useCallback(() => {
    return translationOverlay?.headword;
  }, [translationOverlay?.headword]);

  const translationUiEnabled = Boolean(translationLang) && revealed;
  const isTranslationTooltipOpen = translationUiEnabled
    ? translationTooltipOpen || translationHovering
    : false;

  const translationStatusText =
    translationStatus === null
      ? "Hover/click om vertaling te laden"
      : translationStatus === "pending"
      ? "Vertaling wordt voorbereid…"
      : translationStatus === "failed"
      ? translationError ?? "Vertaling mislukt"
      : null;

  if (loading) {
    return (
      <div className="flex h-full w-full items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white/70 dark:border-slate-700 dark:bg-slate-900/50">
        <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">
          Woorden laden…
        </p>
      </div>
    );
  }

  if (!word) {
    return (
      <div className="flex h-full w-full items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white/70 px-6 text-center dark:border-slate-700 dark:bg-slate-900/50">
        <div className="space-y-2">
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            Geen woorden beschikbaar.
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Voeg woorden toe aan de lijst of kies een andere lijst in Instellingen.
          </p>
        </div>
      </div>
    );
  }

  const allMeanings = getAllMeanings(word.raw);
  const primaryMeaning = allMeanings[0];

  // For Definition -> Word mode, the "Question" is usually the primary meaning definition.
  // Edge case: some entries (e.g. pure idioms) have an empty definition but do have idioms/examples.
  const definitionSegments = buildSegments(
    primaryMeaning.definition,
    primaryMeaning.links
  );

  const primaryIdiom = primaryMeaning.idioms?.[0];
  const hasPrimaryDefinitionText = Boolean(primaryMeaning.definition?.trim());
  const isIdiomOnlyMeaning = !hasPrimaryDefinitionText && Boolean(primaryIdiom);
  const hasPrimaryIdiomExplanationText = Boolean(primaryIdiom?.explanation?.trim());
  const hasPrimaryIdiomExpressionText = Boolean(primaryIdiom?.expression?.trim());
  const idiomExpressionSegments = primaryIdiom
    ? buildSegments(primaryIdiom.expression, primaryMeaning.links)
    : null;
  const idiomExplanationSegments = primaryIdiom
    ? buildSegments(primaryIdiom.explanation, primaryMeaning.links)
    : null;
  const idiomPromptSegments = hasPrimaryIdiomExplanationText
    ? idiomExplanationSegments
    : hasPrimaryIdiomExpressionText
      ? idiomExpressionSegments
      : null;

  // If we used the idiom explanation as the "question" prompt, avoid repeating it under the idiom on reveal.
  const hidePrimaryIdiomExplanationOnReveal =
    isIdiomOnlyMeaning && hasPrimaryIdiomExplanationText;

  const isWordToDefinition = mode === "word-to-definition";

  // Compute whether to show number badge (used for alignment in both hint and definition sections)
  const globalCount = word.meanings_count ?? allMeanings.length ?? 1;
  const meaningIdFromRaw =
    typeof word.raw.meaning_id === "number" ? word.raw.meaning_id : undefined;
  const showNumber =
    allMeanings.length > 1 ||
    globalCount > 1 ||
    typeof meaningIdFromRaw === "number";

  const renderWordWithDecoration = (
    text: string,
    gender?: string,
    _pos?: string,
    sizeClass = "text-5xl"
  ) => {
    return (
      <div className="inline-flex items-baseline justify-center gap-3 flex-wrap">
        {gender && (
          <span
            className={`${sizeClass} font-medium text-slate-400 opacity-60`}
          >
            {gender}
          </span>
        )}
        <h1
          className={`${sizeClass} font-bold tracking-tight text-slate-900 dark:text-white`}
        >
          {text}
        </h1>
      </div>
    );
  };

  const safePos = word.part_of_speech?.toLowerCase() ?? "";
  const posColor = POS_COLORS[safePos] ?? POS_COLORS.default;
  const posFullName = POS_NAMES[safePos] ?? word.part_of_speech;

  const buildTranslationBlocks = () => {
    const blocks: Array<{
      key: string;
      label: string;
      text: string | null | undefined;
    }> = [];

    if (!translationLang) return blocks;

    // NOTE: the translation API currently extracts only meanings[0], but the overlay type
    // supports multiple meanings, so we read by meaningIndex where possible.
    const add = (key: string, label: string, text: string | null | undefined) =>
      blocks.push({ key, label, text });

    if (isWordToDefinition) {
      // Header order on the card: headword first.
      add("headword", "Woord", getHeadwordTranslated());

      // Hint section mirrors the visible order on the card.
      if (hintRevealed || revealed) {
        if (primaryMeaning.context) {
          add("context", "Context", getTranslated(0, "context"));
        }
        if (primaryMeaning.examples?.length) {
          primaryMeaning.examples.forEach((_, i) => {
            add(`ex-${i}`, `Voorbeeld ${i + 1}`, getTranslated(0, { exampleIndex: i }));
          });
        }
      }

      if (revealed) {
        allMeanings.forEach((meaning, meaningIndex) => {
          if (meaning.definition) {
            const badgeNumber =
              typeof meaningIdFromRaw === "number" && allMeanings.length === 1
                ? meaningIdFromRaw
                : meaningIndex + 1;
            add(
              `def-${meaningIndex}`,
              showNumber ? `Definitie ${badgeNumber}` : "Definitie",
              getTranslated(meaningIndex, "definition")
            );
          }

          if (meaning.idioms?.length) {
            meaning.idioms.forEach((_, idiomIndex) => {
              add(
                `idiom-${meaningIndex}-${idiomIndex}-expr`,
                `Idioom ${idiomIndex + 1}`,
                getTranslated(meaningIndex, {
                  idiomIndex,
                  idiomField: "expression",
                })
              );
              add(
                `idiom-${meaningIndex}-${idiomIndex}-expl`,
                "Uitleg",
                getTranslated(meaningIndex, {
                  idiomIndex,
                  idiomField: "explanation",
                })
              );
            });
          }
        });
      }
    } else {
      // Definition -> Word mode: definition question is always visible (even before reveal),
      // but we only show the translate UI after reveal.
      add("definition-q", "Definitie", getTranslated(0, "definition"));
      add("headword", "Woord", getHeadwordTranslated());

      if (primaryMeaning.context) {
        add("context", "Context", getTranslated(0, "context"));
      }
      if (primaryMeaning.examples?.length) {
        primaryMeaning.examples.forEach((_, i) => {
          add(`ex-${i}`, `Voorbeeld ${i + 1}`, getTranslated(0, { exampleIndex: i }));
        });
      }
    }

    // Only show fields that exist on the card (avoid noise).
    return blocks.filter((b) => b.text != null && String(b.text).trim().length > 0);
  };

  return (
    <div
      className="relative flex h-full flex-col rounded-3xl border border-slate-200 bg-card-light p-8 shadow-[0_20px_45px_rgba(15,23,42,0.15)] dark:border-slate-800 dark:bg-card-dark transition-all duration-300"
    >
      {/* Part of Speech Badge + Info Icon - Top Right Corner (Always Visible) */}
      <div className="absolute top-6 right-6 z-10 flex items-center gap-2">
        {word.part_of_speech && (
          <span
            className={`select-none rounded-lg border px-3 py-1.5 text-xs font-semibold tracking-wide ${posColor}`}
          >
            {posFullName}
          </span>
        )}
        {onShowDetails && (
          <button
            type="button"
            onClick={onShowDetails}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white/80 text-slate-500 shadow-sm backdrop-blur-sm transition hover:bg-white hover:text-slate-700 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            title="Bekijk details (i)"
            aria-label="Bekijk details"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <circle cx="12" cy="12" r="10" strokeWidth="2" />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M12 16v-4m0-4h.01"
              />
            </svg>
          </button>
        )}
      </div>

      {/* Translate (single button + overlay tooltip) */}
      {translationUiEnabled && (
        <div
          className="absolute top-6 left-6 z-20"
          onMouseEnter={() => {
            setTranslationHovering(true);
            void fetchTranslation();
          }}
          onMouseLeave={() => setTranslationHovering(false)}
        >
          <button
            type="button"
            onClick={() => {
              void fetchTranslation();
              onTranslationTooltipOpenChange?.(!translationTooltipOpen);
            }}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-100/70 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.2em] text-slate-600 shadow-sm backdrop-blur-sm opacity-70 transition hover:opacity-100 hover:bg-slate-100/90 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300 dark:hover:bg-slate-900/80 select-none"
            aria-pressed={translationTooltipOpen}
            aria-label="Translate"
          >
            translate
            <span className="text-[10px] font-semibold opacity-60">(t)</span>
          </button>

          {isTranslationTooltipOpen && (
            <div className="absolute left-0 top-full mt-3 w-[min(560px,calc(100vw-4rem))] max-w-[560px]">
              <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-[0_20px_45px_rgba(15,23,42,0.18)] backdrop-blur-md dark:border-slate-700 dark:bg-slate-950/65">
                {translationStatusText ? (
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-slate-600 dark:text-slate-200">
                      {translationStatusText}
                    </p>
              <button
                type="button"
                onClick={() => void fetchTranslation({ force: true })}
                className="shrink-0 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.15em] text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-200 dark:hover:bg-slate-900/80"
              >
                Opnieuw
              </button>
                  </div>
                ) : (
                  <div className="space-y-3">
              <div className="flex items-center justify-end">
                <button
                  type="button"
                  onClick={() => void fetchTranslation({ force: true })}
                  className="shrink-0 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.15em] text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-200 dark:hover:bg-slate-900/80"
                >
                  Opnieuw
                </button>
              </div>
                    {buildTranslationBlocks().length === 0 ? (
                      <p className="text-sm text-slate-600 dark:text-slate-200">
                        Geen vertalingen beschikbaar.
                      </p>
                    ) : (
                      buildTranslationBlocks().map((block) => (
                        <div key={block.key} className="space-y-1">
                          <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-400 dark:text-slate-500">
                            {block.label}
                          </p>
                          <p className="text-sm leading-relaxed font-medium text-slate-800 dark:text-slate-100">
                            {block.text}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Top Metadata (Absolute) */}
      <div className="absolute top-8 right-8 left-8 flex items-center justify-between opacity-0 hover:opacity-100 transition-opacity z-10">
        <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
          NT2 2000
        </p>
        <div className="text-right text-xs font-semibold uppercase tracking-[0.3em] text-slate-400 mr-32">
          #{word.vandaleId ?? "?"}
        </div>
      </div>
      {/* Main Content Area - Reduced Top Padding */}
      <div className="flex flex-col items-center w-full h-full pt-8 md:pt-12 px-4 overflow-y-auto scrollbar-hide">
        {/* Header: Headword + POS Badge (Always Visible) */}
        <div className="flex-none mb-8 text-center bg-transparent z-0">
          {isWordToDefinition ? (
            <div className="inline-flex items-baseline justify-center gap-3 flex-wrap">
              {word.gender && (
                <span className="text-4xl md:text-5xl font-medium text-slate-400 opacity-60">
                  {word.gender}
                </span>
              )}
              <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-slate-900 dark:text-white">
                {word.headword}
              </h1>
            </div>
          ) : (
            /* Definition -> Word mode: Question is Definition (context hidden until revealed) */
            <div className="mx-auto w-full max-w-3xl">
              <div className="flex justify-center">
                <div className="inline-flex items-start gap-4">
                  {showNumber && (
                    <div className="flex-shrink-0 pt-1">
                      <div
                        className={`w-7 h-7 flex items-center justify-center rounded-full bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-300 shadow-sm text-sm font-bold`}
                      >
                        {typeof meaningIdFromRaw === "number" &&
                        allMeanings.length === 1
                          ? meaningIdFromRaw
                          : 1}
                      </div>
                    </div>
                  )}

                  <div className="text-center">
                    {hasPrimaryDefinitionText ? (
                      <div className="text-2xl md:text-3xl leading-relaxed font-medium text-slate-700 dark:text-slate-200">
                        <InteractiveText
                          segments={definitionSegments}
                          highlightedWord={highlightedWord}
                          onWordClick={onWordClick}
                        />
                      </div>
                    ) : isIdiomOnlyMeaning && idiomPromptSegments ? (
                      <div className="flex items-center justify-center gap-3 flex-wrap">
                        <span className="text-2xl md:text-3xl leading-relaxed font-medium text-slate-700 dark:text-slate-200">
                          <InteractiveText
                            segments={idiomPromptSegments}
                            highlightedWord={highlightedWord}
                            onWordClick={onWordClick}
                          />
                        </span>
                        {hasPrimaryIdiomExplanationText ? (
                          <span className="text-xs font-bold uppercase tracking-wide px-2 py-1 rounded-md bg-purple-100/60 text-purple-600/70 dark:bg-purple-900/20 dark:text-purple-300/70">
                            idioom definitie
                          </span>
                        ) : (
                          <span className="text-xs font-bold uppercase tracking-wide px-2 py-1 rounded-md bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-300">
                            idioom
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className="text-2xl md:text-3xl leading-relaxed font-medium text-slate-400 dark:text-slate-500">
                        Definitie niet beschikbaar.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* W->D Hint Section: Context + Example (shown via 'i' hotkey or when revealed) */}
        {isWordToDefinition && (hintRevealed || revealed) && (
          <div className="flex-none w-full max-w-3xl text-left mb-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="flex items-start gap-6">
              {/* Spacer to align with number badge in definition section (only if badge will be shown) */}
              {showNumber && <div className="flex-shrink-0 w-7" />}
              {/* Content - aligned with definition text */}
              <div className="flex-1 flex flex-col gap-3">
                {/* Context */}
                {primaryMeaning.context && (
                  <div className="flex items-center text-base text-slate-500 dark:text-slate-400 font-medium">
                    <span>[{primaryMeaning.context}]</span>
                  </div>
                )}
                {/* Example */}
                {primaryMeaning.examples && primaryMeaning.examples.length > 0 && (
                  <div className="flex flex-col gap-1.5 pl-2 border-l-2 border-slate-200 dark:border-slate-700">
                    {primaryMeaning.examples.map((ex, i) => {
                      const exSegments = buildSegments(ex, primaryMeaning.links);
                      return (
                        <p
                          key={i}
                          className="flex items-start text-lg italic leading-relaxed text-slate-600 dark:text-slate-400"
                        >
                          <span className="flex-1">
                            <InteractiveText
                              segments={exSegments}
                              highlightedWord={highlightedWord}
                              onWordClick={onWordClick}
                              excludeWord={word.headword}
                            />
                          </span>
                        </p>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Revealed Content (Definition/Word) */}
        {revealed && (
          <div className="flex-none w-full max-w-3xl text-left animate-in fade-in slide-in-from-bottom-2 duration-300 pb-6">
            {/* If Word->Def mode: Show Definition (context/example already shown in hint section above) */}
            {isWordToDefinition && (
              <div className="flex flex-col gap-8">
                {allMeanings.map((meaning, index) => {
                  const defSegments = buildSegments(
                    meaning.definition,
                    meaning.links
                  );

                  // If we have a specific meaning_id, display it.
                  // Otherwise use index + 1
                  const badgeNumber =
                    typeof meaningIdFromRaw === "number" &&
                    allMeanings.length === 1
                      ? meaningIdFromRaw
                      : index + 1;

                  return (
                    <div key={index} className="flex items-start gap-6">
                      {/* Number Badge - Left Side */}
                      {showNumber && (
                        <div className="flex-shrink-0 pt-1">
                          <div className={`w-7 h-7 flex items-center justify-center ${badgeNumber === globalCount ? 'rounded-md' : 'rounded-full'} bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-300 shadow-sm text-sm font-bold`}>
                            {badgeNumber}
                          </div>
                        </div>
                      )}

                      {/* Content - Right Side: Definition only (context/example shown above) */}
                      <div className="flex-1 flex flex-col gap-3">
                        {/* Definition Line */}
                        {meaning.definition ? (
                          <div className="flex items-start text-xl md:text-2xl leading-relaxed font-medium text-slate-800 dark:text-slate-100">
                            <span className="flex-1">
                              <InteractiveText
                                segments={defSegments}
                                highlightedWord={highlightedWord}
                                onWordClick={onWordClick}
                                excludeWord={word.headword}
                              />
                            </span>
                          </div>
                        ) : null}

                        {/* Idioms - Horizontal Layout */}
                        {meaning.idioms && meaning.idioms.length > 0 && (
                          <div className="flex flex-col gap-3 mt-2">
                            {meaning.idioms.map((idiom, i) => {
                              // Build segments for idiom expression and explanation
                              const expressionSegments = buildSegments(
                                idiom.expression,
                                meaning.links
                              );
                              const explanationSegments = buildSegments(
                                idiom.explanation,
                                meaning.links
                              );

                              return (
                                <div key={i} className="flex flex-col gap-1">
                                  {/* Expression with inline idiom badge */}
                                  <div className="flex items-center gap-3 flex-wrap">
                                    <span className="text-xl md:text-2xl leading-relaxed font-medium text-slate-900 dark:text-slate-100 flex items-center">
                                      <InteractiveText
                                        segments={expressionSegments}
                                        highlightedWord={highlightedWord}
                                        onWordClick={onWordClick}
                                        excludeWord={word.headword}
                                      />
                                    </span>
                                    <span className="text-xs font-bold uppercase tracking-wide px-2 py-1 rounded-md bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-300">
                                      idioom
                                    </span>
                                  </div>
                                  {/* Explanation with separator */}
                                  <div className="text-lg leading-relaxed text-slate-500 dark:text-slate-400 flex items-start">
                                    <span className="text-slate-400 dark:text-slate-500 mr-2">
                                      |
                                    </span>
                                    <span className="flex-1">
                                      <InteractiveText
                                        segments={explanationSegments}
                                        highlightedWord={highlightedWord}
                                        onWordClick={onWordClick}
                                        excludeWord={word.headword}
                                      />
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* If Def->Word mode: Show Headword (Answer) */}
            {!isWordToDefinition && (
              <div className="mt-4 text-center">
                {renderWordWithDecoration(
                  word.headword,
                  word.gender,
                  word.part_of_speech,
                  "text-4xl md:text-5xl"
                )}
                {/* Context - shown with the answer */}
                {primaryMeaning.context && (
                  <p className="mt-4 text-lg text-slate-500 dark:text-slate-400 font-medium flex items-center justify-center">
                    <span>[{primaryMeaning.context}]</span>
                  </p>
                )}
                {/* Idioms (revealed): show idiom before examples */}
                {primaryMeaning.idioms && primaryMeaning.idioms.length > 0 && (
                  <div className="mt-6 mx-auto max-w-2xl flex flex-col gap-3">
                    {primaryMeaning.idioms.map((idiom, i) => {
                      const expressionSegments = buildSegments(
                        idiom.expression,
                        primaryMeaning.links
                      );
                      const explanationSegments = buildSegments(
                        idiom.explanation,
                        primaryMeaning.links
                      );

                      return (
                        <div key={i} className="flex flex-col gap-1">
                          <div className="flex items-center justify-center gap-3 flex-wrap">
                            <span className="text-xl md:text-2xl leading-relaxed font-medium text-slate-900 dark:text-slate-100 flex items-center">
                              <InteractiveText
                                segments={expressionSegments}
                                highlightedWord={highlightedWord}
                                onWordClick={onWordClick}
                                excludeWord={word.headword}
                              />
                            </span>
                            <span className="text-xs font-bold uppercase tracking-wide px-2 py-1 rounded-md bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-300">
                              idioom
                            </span>
                          </div>
                          {idiom.explanation?.trim() &&
                            !(hidePrimaryIdiomExplanationOnReveal && i === 0) && (
                            <div className="text-lg leading-relaxed text-slate-500 dark:text-slate-400 flex items-start justify-center">
                              <span className="text-slate-400 dark:text-slate-500 mr-2">
                                |
                              </span>
                              <span className="flex-1 text-center">
                                <InteractiveText
                                  segments={explanationSegments}
                                  highlightedWord={highlightedWord}
                                  onWordClick={onWordClick}
                                  excludeWord={word.headword}
                                />
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
                {/* Examples */}
                {primaryMeaning.examples && primaryMeaning.examples.length > 0 && (
                  <div className="flex flex-col gap-1.5 mt-6 mx-auto max-w-2xl">
                    {primaryMeaning.examples.map((ex, i) => {
                      const exSegments = buildSegments(ex, primaryMeaning.links);
                      return (
                        <p
                          key={i}
                          className="text-lg italic leading-relaxed text-slate-500 dark:text-slate-400 flex items-start justify-center"
                        >
                          <span className="flex-1">
                            <InteractiveText
                              segments={exSegments}
                              highlightedWord={highlightedWord}
                              onWordClick={onWordClick}
                              excludeWord={word.headword}
                            />
                          </span>
                        </p>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}


        {/* Debug Stats (Footer - Color Coded) */}
        {word.debugStats && (
          <div className="mt-auto flex flex-wrap items-center justify-center gap-6 text-sm font-medium pb-2 border-t border-slate-100 pt-4 dark:border-slate-800 w-full opacity-70 hover:opacity-100 transition-opacity">
            {word.debugStats.source && (
              <span className="text-slate-400 dark:text-slate-500">
                src:{word.debugStats.source}
              </span>
            )}
            {typeof word.debugStats.interval === "number" && (
              <span className="text-blue-500 dark:text-blue-400">
                int:
                {typeof word.debugStats.previousInterval === "number"
                  ? `${word.debugStats.previousInterval.toFixed(2)}→${word.debugStats.interval.toFixed(2)}d`
                  : `${word.debugStats.interval.toFixed(2)}d`}
              </span>
            )}
            {typeof word.debugStats.ef === "number" && (
              <span className="text-yellow-500 dark:text-yellow-400">
                S:
                {typeof word.debugStats.previousStability === "number"
                  ? `${word.debugStats.previousStability.toFixed(2)}→${word.debugStats.ef.toFixed(2)}`
                  : word.debugStats.ef.toFixed(2)}
              </span>
            )}
            {typeof word.debugStats.clicks === "number" && (
              <span className="text-pink-500 dark:text-pink-400">
                clicks:{word.debugStats.clicks}
              </span>
            )}
            {typeof word.debugStats.overdue_count === "number" && (
              <span className="text-purple-500 dark:text-purple-400">
                queue:{word.debugStats.overdue_count}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
