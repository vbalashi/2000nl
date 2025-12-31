"use client";

import React from "react";
import type {
  DictionaryEntry,
  TrainingMode,
  TranslationOverlay,
  WordEntryTranslationStatus,
  WordListSummary,
} from "@/lib/types";
import type { ReviewResult } from "@/lib/trainingService";
import {
  addWordsToUserList,
  createUserList,
  recordReview,
} from "@/lib/trainingService";

export type WordDetailPanelProps = {
  entry: DictionaryEntry;
  userId: string;
  translationLang: string | null;
  selectedListName?: string;
  userLists: WordListSummary[];
  onListsUpdated?: () => Promise<void> | void;
  onTrainWord?: (wordId: string) => void;
  /** Whether to show the header with headword, POS badge, etc. Defaults to true. */
  showHeader?: boolean;
  /** Whether to show the actions section (add to list, mark learned, train). Defaults to true. */
  showActions?: boolean;
  /** Current training card ID (to show training-only actions in Details). */
  currentTrainingEntryId?: string | null;
  /** Training-only action handler for the current card (freeze/hide). */
  onTrainingAction?: (result: ReviewResult) => void;
  /** Disable training-only actions (e.g. until revealed / while saving). */
  trainingActionDisabled?: boolean;
};

const POS_COLORS: Record<string, string> = {
  zn: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800",
  ww: "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800",
  bn: "bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800",
  bw: "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-800",
  vz: "bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800",
  lidw: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
  default:
    "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
};

const POS_NAMES: Record<string, string> = {
  zn: "ZN",
  ww: "WW",
  bn: "BN",
  bw: "BW",
  vz: "VZ",
  lidw: "LIDW",
  vnw: "VNW",
  tw: "TW",
};

const langLabel = (code: string) => {
  const map: Record<string, string> = {
    ru: "Русский",
    en: "English",
    de: "Deutsch",
    fr: "Français",
    uk: "Українська",
  };
  return map[code] ?? code;
};

export function WordDetailPanel({
  entry,
  userId,
  translationLang,
  selectedListName,
  userLists,
  onListsUpdated,
  onTrainWord,
  showHeader = true,
  showActions = true,
  currentTrainingEntryId = null,
  onTrainingAction,
  trainingActionDisabled = false,
}: WordDetailPanelProps) {
  const [translationStatus, setTranslationStatus] =
    React.useState<WordEntryTranslationStatus | null>(null);
  const [translationOverlay, setTranslationOverlay] =
    React.useState<TranslationOverlay | null>(null);
  const [translationError, setTranslationError] = React.useState<string | null>(
    null
  );
  const translationLoadingRef = React.useRef(false);
  const translationPollTimeoutRef = React.useRef<number | null>(null);

  const [actionMessage, setActionMessage] = React.useState<string | null>(null);
  const [actionBusy, setActionBusy] = React.useState(false);

  const [addMode, setAddMode] = React.useState<"existing" | "new">("existing");
  const [targetListId, setTargetListId] = React.useState<string>("");
  const [newListName, setNewListName] = React.useState("");

  // Reset action message when entry changes
  React.useEffect(() => {
    setActionMessage(null);
    setActionBusy(false);
  }, [entry?.id]);

  // Reset translation state when entry/lang changes
  React.useEffect(() => {
    translationLoadingRef.current = false;
    if (translationPollTimeoutRef.current != null) {
      window.clearTimeout(translationPollTimeoutRef.current);
      translationPollTimeoutRef.current = null;
    }
    setTranslationStatus(null);
    setTranslationOverlay(null);
    setTranslationError(null);
  }, [entry?.id, translationLang]);

  // Default list selection
  React.useEffect(() => {
    if (!userLists.length) return;
    setTargetListId((prev) => prev || userLists[0].id);
  }, [userLists]);

  const fetchTranslation = React.useCallback(
    async (opts?: { force?: boolean }) => {
      if (!entry?.id || !translationLang || translationLang === "off") return;
      if (translationLoadingRef.current) return;
      if (!opts?.force && translationStatus === "ready" && translationOverlay)
        return;

      translationLoadingRef.current = true;
      try {
        // Immediately mark as pending so slow mobile browsers show progress.
        setTranslationStatus("pending");
        setTranslationOverlay(null);
        setTranslationError(null);

        const res = await fetch(
          `/api/translation?word_id=${encodeURIComponent(
            entry.id
          )}&lang=${encodeURIComponent(translationLang)}${
            opts?.force ? "&force=1" : ""
          }`,
          {
            cache: "no-store",
            credentials: "same-origin",
            headers: { Accept: "application/json" },
          }
        );

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
      } catch (e: unknown) {
        setTranslationStatus("failed");
        setTranslationError(e instanceof Error ? e.message : String(e ?? "Unknown error"));
      } finally {
        translationLoadingRef.current = false;
      }
    },
    [entry?.id, translationLang, translationOverlay, translationStatus]
  );

  // Auto-fetch translation when component mounts or entry changes
  React.useEffect(() => {
    if (!translationLang || translationLang === "off") return;
    void fetchTranslation();
  }, [translationLang, fetchTranslation]);

  // Poll for pending translations
  React.useEffect(() => {
    if (!translationLang || translationLang === "off") return;
    if (!entry?.id) return;

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
  }, [translationLang, entry?.id, translationStatus, fetchTranslation]);

  const meanings = Array.isArray(entry.raw?.meanings) ? entry.raw.meanings : [];
  const primaryMeaning = meanings[0] ?? {};
  const examples: string[] = Array.isArray(primaryMeaning.examples)
    ? primaryMeaning.examples.filter((x: unknown) => typeof x === "string")
    : typeof (primaryMeaning as { example?: string }).example === "string"
      ? [(primaryMeaning as { example: string }).example]
      : [];

  const pos = entry.part_of_speech ?? "";
  const posBadge = POS_NAMES[pos] ?? (pos ? pos.toUpperCase() : "—");
  const posClass = POS_COLORS[pos] ?? POS_COLORS.default;

  const translatedDefinition = translationOverlay?.meanings?.[0]?.definition;
  const translatedContext = translationOverlay?.meanings?.[0]?.context;
  const translatedExamples = translationOverlay?.meanings?.[0]?.examples ?? [];

  const translationStatusText =
    translationStatus === null
      ? null
      : translationStatus === "pending"
        ? "Vertaling wordt voorbereid…"
        : translationStatus === "failed"
          ? translationError ?? "Vertaling mislukt"
          : null;

  const canAdd =
    userLists.length > 0 &&
    (addMode === "existing"
      ? Boolean(targetListId)
      : Boolean(newListName.trim()));

  const showTrainingActions =
    Boolean(onTrainingAction) &&
    Boolean(currentTrainingEntryId) &&
    entry?.id === currentTrainingEntryId;

  return (
    <div className="flex h-full flex-col">
      {showHeader && (
        <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-lg font-semibold text-slate-900 dark:text-white">
                {entry.headword}
              </h2>
              <span
                className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${posClass}`}
              >
                {posBadge}
              </span>
              {entry.is_nt2_2000 ? (
                <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200">
                  VanDale 2k
                </span>
              ) : null}
            </div>

            {selectedListName ? (
              <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                In lijsten:{" "}
                <span className="font-semibold text-slate-700 dark:text-slate-200">
                  {selectedListName}
                </span>
              </div>
            ) : null}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-5 py-4">
        <div className="space-y-5">
          <section className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Definitie
            </div>
            {meanings.length ? (
              <div className="space-y-3">
                {meanings.map((m: { definition?: string; context?: string }, idx: number) => (
                  <div
                    key={idx}
                    className="rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-200"
                  >
                    <div className="font-semibold text-slate-900 dark:text-white">
                      {m?.definition?.trim?.() ? m.definition : "—"}
                    </div>
                    {idx === 0 && translatedDefinition ? (
                      <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        {translatedDefinition}
                      </div>
                    ) : null}
                    {m?.context?.trim?.() ? (
                      <div className="mt-2 text-xs text-slate-600 dark:text-slate-300">
                        {m.context}
                        {idx === 0 && translatedContext ? (
                          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                            {translatedContext}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-slate-600 dark:text-slate-300">
                Geen definitie beschikbaar.
              </div>
            )}
          </section>

          <section className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Voorbeeldzinnen
            </div>
            {examples.length ? (
              <ul className="space-y-2 text-sm text-slate-700 dark:text-slate-200">
                {examples.slice(0, 6).map((ex, i) => (
                  <li
                    key={i}
                    className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900/40"
                  >
                    <div>{ex}</div>
                    {translatedExamples?.[i] ? (
                      <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        {translatedExamples[i]}
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="text-sm text-slate-600 dark:text-slate-300">
                Geen voorbeelden beschikbaar.
              </div>
            )}
          </section>

          {translationLang && translationLang !== "off" ? (
            <section className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Vertaling ({langLabel(translationLang)})
              </div>
              {translationStatusText ? (
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm text-slate-600 dark:text-slate-300">
                    {translationStatusText}
                  </div>
                  <button
                    type="button"
                    onClick={() => void fetchTranslation({ force: true })}
                    className="shrink-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-200 dark:hover:bg-slate-900/60"
                  >
                    Opnieuw
                  </button>
                </div>
              ) : translationOverlay ? (
                <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-200">
                  <div className="min-w-0 font-semibold text-slate-900 dark:text-white">
                    {translationOverlay.headword || "—"}
                  </div>
                  <button
                    type="button"
                    onClick={() => void fetchTranslation({ force: true })}
                    className="shrink-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-200 dark:hover:bg-slate-900/60"
                  >
                    Opnieuw
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => void fetchTranslation()}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-200 dark:hover:bg-slate-900/60"
                >
                  Laad vertaling
                </button>
              )}
            </section>
          ) : null}

          {showActions && (
            <section className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Acties
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900/40">
                <div className="grid gap-2">
                  {showTrainingActions ? (
                    <div className="flex flex-col gap-2">
                      <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                        Training
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          disabled={trainingActionDisabled}
                          onClick={() => onTrainingAction?.("freeze")}
                          className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-200 dark:hover:bg-slate-900/60"
                          title="Bevriezen (F)"
                        >
                          Bevriezen
                          <span className="ml-2 text-xs font-bold uppercase tracking-wide opacity-60">
                            (F)
                          </span>
                        </button>
                        <button
                          type="button"
                          disabled={trainingActionDisabled}
                          onClick={() => onTrainingAction?.("hide")}
                          className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-200 dark:hover:bg-slate-900/60"
                          title="Niet meer tonen (X)"
                        >
                          Niet meer tonen
                          <span className="ml-2 text-xs font-bold uppercase tracking-wide opacity-60">
                            (X)
                          </span>
                        </button>
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        Tip: je kunt ook hotkeys gebruiken (F / X).
                      </div>
                      <div className="border-t border-slate-200/70 pt-2 dark:border-slate-800/80" />
                    </div>
                  ) : null}

                  <div className="flex flex-wrap gap-2">
                    <select
                      value={addMode === "new" ? "__new__" : targetListId}
                      onChange={(e) => {
                        if (e.target.value === "__new__") {
                          setAddMode("new");
                          return;
                        }
                        setAddMode("existing");
                        setTargetListId(e.target.value);
                      }}
                      className="min-w-[220px] flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm focus:border-primary focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    >
                      <option value="" disabled>
                        Kies lijst…
                      </option>
                      <option value="__new__">Nieuwe lijst aanmaken</option>
                      {userLists.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name}
                        </option>
                      ))}
                    </select>

                    {addMode === "new" ? (
                      <input
                        value={newListName}
                        onChange={(e) => setNewListName(e.target.value)}
                        placeholder="Nieuwe lijstnaam"
                        className="min-w-[200px] flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm focus:border-primary focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                      />
                    ) : null}

                    <button
                      type="button"
                      disabled={actionBusy || !canAdd}
                      onClick={async () => {
                        if (!entry?.id) return;
                        setActionMessage(null);
                        setActionBusy(true);
                        try {
                          let listId = targetListId;
                          if (addMode === "new") {
                            const created = await createUserList({
                              userId,
                              name: newListName.trim(),
                            });
                            if (!created?.id) {
                              setActionMessage("Kon geen lijst aanmaken.");
                              return;
                            }
                            listId = created.id;
                            setAddMode("existing");
                            setTargetListId(created.id);
                            setNewListName("");
                            await onListsUpdated?.();
                          }

                          const { error } = await addWordsToUserList(listId, [
                            entry.id,
                          ]);
                          if (error) {
                            setActionMessage("Kon woord niet toevoegen.");
                          } else {
                            setActionMessage("Woord toegevoegd aan lijst.");
                            await onListsUpdated?.();
                          }
                        } finally {
                          setActionBusy(false);
                        }
                      }}
                      className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:brightness-105 disabled:opacity-60"
                    >
                      Toevoegen aan lijst
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={actionBusy}
                      onClick={async () => {
                        if (!entry?.id) return;
                        setActionMessage(null);
                        setActionBusy(true);
                        try {
                          const modes: TrainingMode[] = [
                            "word-to-definition",
                            "definition-to-word",
                          ];
                          await Promise.all(
                            modes.map((mode) =>
                              recordReview({
                                userId,
                                wordId: entry.id,
                                mode,
                                result: "hide",
                              })
                            )
                          );
                          setActionMessage(
                            "Gemarkeerd als geleerd (niet meer tonen)."
                          );
                        } finally {
                          setActionBusy(false);
                        }
                      }}
                      className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-200 dark:hover:bg-slate-900/60"
                    >
                      Markeer als geleerd
                    </button>

                    <button
                      type="button"
                      disabled={actionBusy || !onTrainWord}
                      onClick={() => {
                        if (!entry?.id) return;
                        onTrainWord?.(entry.id);
                      }}
                      className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-200 dark:hover:bg-slate-900/60"
                    >
                      Train dit woord
                    </button>
                  </div>
                </div>
              </div>

              {actionMessage ? (
                <div className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                  {actionMessage}
                </div>
              ) : null}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
