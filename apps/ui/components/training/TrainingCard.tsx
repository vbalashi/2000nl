"use client";

import React from "react";

import type { TrainingMode } from "@/lib/types";
import type {
  TranslationOverlay,
  WordEntryTranslationStatus,
} from "@/lib/types";
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
  }, [word?.id, translationLang]);

  const fetchTranslation = React.useCallback(
    async (opts?: { force?: boolean }) => {
      if (!word?.id || !translationLang || translationLang === "off") return;
      if (translationLoadingRef.current) return;
      if (!opts?.force && translationStatus === "ready" && translationOverlay)
        return;

      translationLoadingRef.current = true;
      try {
        // Immediately mark as pending so the UI reflects that we're working,
        // especially on mobile where the request can take noticeable time.
        setTranslationStatus("pending");
        setTranslationOverlay(null);
        setTranslationError(null);

        const res = await fetch(
          `/api/translation?word_id=${encodeURIComponent(
            word.id
          )}&lang=${encodeURIComponent(translationLang)}${
            opts?.force ? "&force=1" : ""
          }`,
          {
            cache: "no-store",
            credentials: "same-origin",
            headers: { Accept: "application/json" },
          }
        );

        // Some deployments / proxies can return HTML or empty bodies on errors.
        // Handle non-2xx explicitly so we can show a useful message.
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(
            `Translation API ${res.status}: ${text || res.statusText}`
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
    [translationLang, translationOverlay, translationStatus, word?.id]
  );

  React.useEffect(() => {
    if (!translationTooltipOpen) return;
    void fetchTranslation();
  }, [fetchTranslation, translationTooltipOpen]);

  // Poll while translation is open and pending.
  React.useEffect(() => {
    if (!translationTooltipOpen) return;
    if (!translationLang || translationLang === "off") return;
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

  const translationUiEnabled =
    Boolean(translationLang) && translationLang !== "off" && revealed;
  const isTranslationOpen = translationUiEnabled ? translationTooltipOpen : false;

  const translationStatusText =
    translationStatus === null
      ? "Klik om vertaling te laden"
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
            Voeg woorden toe aan de lijst of kies een andere lijst in
            Instellingen.
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
  const hasPrimaryIdiomExplanationText = Boolean(
    primaryIdiom?.explanation?.trim()
  );
  const hasPrimaryIdiomExpressionText = Boolean(
    primaryIdiom?.expression?.trim()
  );
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

  const InlineTranslation = ({
    text,
    align = "center",
  }: {
    text: string | null | undefined;
    align?: "left" | "center";
  }) => {
    if (!isTranslationOpen) return null;
    if (text == null || String(text).trim().length === 0) return null;
    return (
      <span
        className={[
          // Absolute overlay: does NOT affect layout / flow.
          // Stretch full width so wrapping isn't constrained (esp. on mobile).
          "pointer-events-none select-none absolute left-0 right-0",
          // Anchor ABOVE the line so multi-line translations expand upward
          // (avoids overlapping the original line).
          "bottom-full translate-y-[2px] md:translate-y-[3px]",
          // Style
          "text-[11px] md:text-xs leading-none font-semibold tracking-wide text-slate-400 dark:text-slate-500",
          // Desktop: keep overlays to a single line to reduce collisions with nearby lines.
          "md:truncate",
          // No background highlight (can obscure underlying text in dense layouts).
          "bg-transparent drop-shadow-sm px-1",
          align === "left" ? "text-left" : "text-center",
        ].join(" ")}
      >
        {text}
      </span>
    );
  };

  return (
    <div className="relative flex h-full flex-col rounded-3xl border border-slate-200 bg-card-light p-5 md:p-8 shadow-[0_20px_45px_rgba(15,23,42,0.15)] dark:border-slate-800 dark:bg-card-dark transition-all duration-300">
      {/* Part of Speech Badge + Info Icon - Top Right Corner (Always Visible) */}
      <div className="absolute top-4 right-4 md:top-6 md:right-6 z-10 flex items-center gap-2">
        {word.part_of_speech && (
          <span
            className={`select-none rounded-lg border px-2 py-1 md:px-3 md:py-1.5 text-[10px] md:text-xs font-semibold tracking-wide ${posColor}`}
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

      {/* Translate (button + inline translations on card) */}
      {translationUiEnabled && (
        <div className="absolute top-4 left-4 md:top-6 md:left-6 z-20">
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

          {isTranslationOpen && (
            translationStatusText ? (
              <div className="mt-2">
                <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-300">
                  {translationStatusText}
                </p>
              </div>
            ) : null
          )}
        </div>
      )}

      {/* Main Content Area - Reduced Top Padding */}
      <div className="flex flex-col items-center w-full h-full pt-10 md:pt-12 px-1 md:px-4 overflow-y-auto scrollbar-hide">
        {/* Header: Headword + POS Badge (Always Visible) */}
        <div className="flex-none mb-8 text-center bg-transparent z-0">
          {isWordToDefinition ? (
            // IMPORTANT: make the translation overlay use the full card width.
            // If we keep the relative container as `inline-flex`, the absolute overlay
            // becomes constrained to the (often short) word width and truncates early.
            <div className="relative w-full">
              <InlineTranslation text={getHeadwordTranslated()} />
              <div className="inline-flex items-baseline justify-center gap-3 flex-wrap">
                {word.gender && (
                  <span className="text-4xl md:text-5xl font-medium text-slate-400 opacity-60">
                    {word.gender}
                  </span>
                )}
                <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold tracking-tight text-slate-900 dark:text-white">
                  {word.headword}
                </h1>
              </div>
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

                  <div className="relative text-center">
                    {hasPrimaryDefinitionText ? (
                      <div className="text-xl md:text-3xl leading-relaxed font-medium text-slate-700 dark:text-slate-200">
                        <InlineTranslation text={getTranslated(0, "definition")} />
                        <InteractiveText
                          segments={definitionSegments}
                          highlightedWord={highlightedWord}
                          onWordClick={onWordClick}
                        />
                      </div>
                    ) : isIdiomOnlyMeaning && idiomPromptSegments ? (
                      <div className="relative flex items-center justify-center gap-3 flex-wrap">
                        <span className="text-xl md:text-3xl leading-relaxed font-medium text-slate-700 dark:text-slate-200">
                          <InlineTranslation
                            text={
                              hasPrimaryIdiomExplanationText
                                ? getTranslated(0, {
                                    idiomIndex: 0,
                                    idiomField: "explanation",
                                  })
                                : getTranslated(0, {
                                    idiomIndex: 0,
                                    idiomField: "expression",
                                  })
                            }
                          />
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
                      <div className="text-xl md:text-3xl leading-relaxed font-medium text-slate-400 dark:text-slate-500">
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
                  <div className="relative flex items-center text-base text-slate-500 dark:text-slate-400 font-medium">
                    <InlineTranslation align="left" text={getTranslated(0, "context")} />
                    <span>[{primaryMeaning.context}]</span>
                  </div>
                )}
                {/* Example */}
                {primaryMeaning.examples &&
                  primaryMeaning.examples.length > 0 && (
                    <div className="flex flex-col gap-1.5 pl-2 border-l-2 border-slate-200 dark:border-slate-700">
                      {primaryMeaning.examples.map((ex, i) => {
                        const exSegments = buildSegments(
                          ex,
                          primaryMeaning.links
                        );
                        return (
                          <p
                            key={i}
                            className="relative flex items-start text-lg italic leading-relaxed text-slate-600 dark:text-slate-400"
                          >
                            <InlineTranslation
                              align="left"
                              text={getTranslated(0, { exampleIndex: i })}
                            />
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
                          <div
                            className={`w-7 h-7 flex items-center justify-center ${
                              badgeNumber === globalCount
                                ? "rounded-md"
                                : "rounded-full"
                            } bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-300 shadow-sm text-sm font-bold`}
                          >
                            {badgeNumber}
                          </div>
                        </div>
                      )}

                      {/* Content - Right Side: Definition only (context/example shown above) */}
                      <div className="flex-1 flex flex-col gap-3">
                        {/* Definition Line */}
                        {meaning.definition ? (
                          <div className="flex items-start text-xl md:text-2xl leading-relaxed font-medium text-slate-800 dark:text-slate-100">
                            <span className="relative flex-1">
                              <InlineTranslation
                                align="left"
                                text={getTranslated(index, "definition")}
                              />
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
                                    <span className="relative text-xl md:text-2xl leading-relaxed font-medium text-slate-900 dark:text-slate-100 flex items-center">
                                      <InlineTranslation
                                        align="left"
                                        text={getTranslated(index, {
                                          idiomIndex: i,
                                          idiomField: "expression",
                                        })}
                                      />
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
                                      <span className="relative block">
                                        <InlineTranslation
                                          align="left"
                                          text={getTranslated(index, {
                                            idiomIndex: i,
                                            idiomField: "explanation",
                                          })}
                                        />
                                      </span>
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
              <div className="relative mt-4 text-center">
                <InlineTranslation text={getHeadwordTranslated()} />
                {renderWordWithDecoration(
                  word.headword,
                  word.gender,
                  word.part_of_speech,
                  "text-3xl md:text-4xl lg:text-5xl"
                )}
                {/* Context - shown with the answer */}
                {primaryMeaning.context && (
                  <p className="mt-4 text-lg text-slate-500 dark:text-slate-400 font-medium flex items-center justify-center">
                    <span className="relative inline-block">
                      <InlineTranslation text={getTranslated(0, "context")} />
                      <span>[{primaryMeaning.context}]</span>
                    </span>
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
                            <span className="relative text-xl md:text-2xl leading-relaxed font-medium text-slate-900 dark:text-slate-100 flex items-center">
                              <InlineTranslation
                                text={getTranslated(0, {
                                  idiomIndex: i,
                                  idiomField: "expression",
                                })}
                              />
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
                            !(
                              hidePrimaryIdiomExplanationOnReveal && i === 0
                            ) && (
                              <div className="text-lg leading-relaxed text-slate-500 dark:text-slate-400 flex items-start justify-center">
                                <span className="text-slate-400 dark:text-slate-500 mr-2">
                                  |
                                </span>
                                <span className="flex-1 text-center">
                                  <span className="relative block">
                                    <InlineTranslation
                                      text={getTranslated(0, {
                                        idiomIndex: i,
                                        idiomField: "explanation",
                                      })}
                                    />
                                  </span>
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
                {primaryMeaning.examples &&
                  primaryMeaning.examples.length > 0 && (
                    <div className="flex flex-col gap-1.5 mt-6 mx-auto max-w-2xl">
                      {primaryMeaning.examples.map((ex, i) => {
                        const exSegments = buildSegments(
                          ex,
                          primaryMeaning.links
                        );
                        return (
                          <p
                            key={i}
                            className="relative text-lg italic leading-relaxed text-slate-500 dark:text-slate-400 flex items-start justify-center"
                          >
                            <InlineTranslation
                              text={getTranslated(0, { exampleIndex: i })}
                            />
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
                  ? `${word.debugStats.previousInterval.toFixed(
                      2
                    )}→${word.debugStats.interval.toFixed(2)}d`
                  : `${word.debugStats.interval.toFixed(2)}d`}
              </span>
            )}
            {typeof word.debugStats.ef === "number" && (
              <span className="text-yellow-500 dark:text-yellow-400">
                S:
                {typeof word.debugStats.previousStability === "number"
                  ? `${word.debugStats.previousStability.toFixed(
                      2
                    )}→${word.debugStats.ef.toFixed(2)}`
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
