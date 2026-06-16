"use client";

import React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createUserDictionaryEntry,
  fetchAvailableDictionarySources,
  fetchAvailableLearningLanguages,
  fetchDictionaryEntryById,
  fetchWordsForList,
  searchWordEntries,
} from "@/lib/trainingService";
import type {
  AvailableDictionarySource,
  AvailableLearningLanguage,
  DictionaryEntry,
  EntryLearningListMembership,
  WordListSummary,
} from "@/lib/types";
import { hidePerfectParticiple } from "@/lib/definitionFormat";
import { getAllMeanings } from "@/lib/wordUtils";
import { WordDetailPanel } from "../WordDetailPanel";
import { WordDetailDrawer } from "./WordDetailDrawer";

type Props = {
  open: boolean;
  userId: string;
  language: string;
  translationLang: string | null;
  userLists: WordListSummary[];
  viewedListId: string | null;
  viewedList: WordListSummary | null;
  viewedListName: string;
  reloadLists: () => Promise<void>;
  notifyListsUpdated: () => void;
  onOpenListMembership?: (membership: EntryLearningListMembership) => void;
  onUserDictionaryEntryCreated?: (entry: DictionaryEntry) => void;
  onTrainWord?: (wordId: string) => void;
  autoFocusQuery?: boolean;
  searchState: DictionarySearchTabState;
  onSearchStateChange: React.Dispatch<
    React.SetStateAction<DictionarySearchTabState>
  >;
};

export type DictionarySearchTabState = {
  query: string;
  applyListFilter: boolean;
  wordResults: DictionaryEntry[];
  wordTotal: number;
  page: number;
  languageCode: string | null;
  dictionaryId: string | null;
  detailEntry: DictionaryEntry | null;
  mobileDetailOpen: boolean;
};

export const createDictionarySearchTabState = (): DictionarySearchTabState => ({
  query: "",
  applyListFilter: false,
  wordResults: [],
  wordTotal: 0,
  page: 1,
  languageCode: null,
  dictionaryId: null,
  detailEntry: null,
  mobileDetailOpen: false,
});

const languageLabel = (code: string) => {
  if (code === "nl") return "Nederlands";
  if (code === "en") return "English";
  if (code === "de") return "Deutsch";
  if (code === "fr") return "Français";
  return code;
};

const posLabel = (value: string | undefined | null) => {
  if (!value) return "—";
  if (value === "ww" || value === "verb") return "ww";
  if (value === "zn" || value === "noun") return "zn";
  if (value === "bn" || value === "adjective") return "bn";
  if (value === "bw" || value === "adverb") return "bw";
  return value;
};

const firstDefinition = (entry: DictionaryEntry) => {
  const meaning = getAllMeanings(entry.raw)[0] as
    | { definition?: string; context?: string; examples?: unknown }
    | undefined;
  const definition = (hidePerfectParticiple(meaning?.definition ?? "") ?? "").trim();
  if (definition) return definition;
  if (meaning?.context?.trim()) return meaning.context.trim();
  return "Geen definitie beschikbaar.";
};

const meaningLabel = (entry: DictionaryEntry) => {
  const raw = entry.raw as Record<string, unknown>;
  const metadata = raw?._metadata as Record<string, unknown> | undefined;
  const meaningId =
    typeof raw?.meaning_id === "number" || typeof raw?.meaning_id === "string"
      ? raw.meaning_id
      : typeof metadata?.meaning_id === "number" || typeof metadata?.meaning_id === "string"
        ? metadata.meaning_id
        : null;
  return meaningId ? `betekenis ${meaningId}` : "betekenis";
};

const dictionaryLabel = (entry: DictionaryEntry) => {
  if (entry.dictionary_name) return entry.dictionary_name;
  const raw = entry.raw as Record<string, unknown>;
  const metadata = raw?._metadata as Record<string, unknown> | undefined;
  if (typeof metadata?.dictionary_name === "string") {
    return metadata.dictionary_name;
  }
  return "VanDale";
};

const searchMatchLabel = (entry: DictionaryEntry) =>
  entry.search_match_label ?? "Woordenboekentry";

export function DictionarySearchTab({
  open,
  userId,
  language,
  translationLang,
  userLists,
  viewedListId,
  viewedList,
  viewedListName,
  reloadLists,
  notifyListsUpdated,
  onOpenListMembership,
  onUserDictionaryEntryCreated,
  onTrainWord,
  autoFocusQuery,
  searchState,
  onSearchStateChange,
}: Props) {
  const {
    query,
    applyListFilter,
    wordResults,
    wordTotal,
    page,
    languageCode,
    dictionaryId,
    detailEntry,
    mobileDetailOpen,
  } = searchState;
  const [searchLoading, setSearchLoading] = useState(false);
  const [availableLanguages, setAvailableLanguages] = useState<
    AvailableLearningLanguage[]
  >([]);
  const [dictionarySources, setDictionarySources] = useState<
    AvailableDictionarySource[]
  >([]);
  const [customEntryOpen, setCustomEntryOpen] = useState(false);
  const [customHeadword, setCustomHeadword] = useState("");
  const [customDefinition, setCustomDefinition] = useState("");
  const [customTranslation, setCustomTranslation] = useState("");
  const [customExample, setCustomExample] = useState("");
  const [customNotes, setCustomNotes] = useState("");
  const [customEntrySaving, setCustomEntrySaving] = useState(false);
  const [customEntryMessage, setCustomEntryMessage] = useState<string | null>(
    null,
  );
  const queryRef = useRef<HTMLInputElement | null>(null);
  const latestSearchRequestRef = useRef(0);
  const pageSize = 20;
  const updateSearchState = useCallback(
    (patch: Partial<DictionarySearchTabState>) => {
      onSearchStateChange((current) => ({ ...current, ...patch }));
    },
    [onSearchStateChange],
  );

  const searchLanguage = languageCode ?? language;
  const selectedDictionary = dictionarySources.find(
    (source) => source.id === dictionaryId,
  );
  const sourceLabel = selectedDictionary
    ? selectedDictionary.name
    : searchLanguage === "nl"
      ? "VanDale woordenboek"
      : `${languageLabel(searchLanguage)} woordenboekbronnen`;
  const useViewedListFilter = applyListFilter && Boolean(viewedListId);
  const detailEntryInCurrentResults = useMemo(
    () =>
      Boolean(
        detailEntry &&
          wordResults.some((resultEntry) => resultEntry.id === detailEntry.id),
      ),
    [detailEntry, wordResults],
  );

  const runSearch = useCallback(async () => {
    if (!open) return;
    const requestId = latestSearchRequestRef.current + 1;
    latestSearchRequestRef.current = requestId;
    const hasQuery = Boolean(query.trim());
    if (!hasQuery && !useViewedListFilter) {
      updateSearchState({
        wordResults: [],
        wordTotal: 0,
        detailEntry: null,
        mobileDetailOpen: false,
      });
      return;
    }
    setSearchLoading(true);
    try {
      const result = useViewedListFilter
        ? await fetchWordsForList(viewedListId!, viewedList?.type ?? "curated", {
            query: query.trim() || undefined,
            page,
            pageSize,
          })
        : await searchWordEntries({
            query: query.trim() || undefined,
            languageCode: searchLanguage,
            dictionaryIds: dictionaryId ? [dictionaryId] : undefined,
            page,
            pageSize,
          });

      if (latestSearchRequestRef.current !== requestId) return;
      onSearchStateChange((current) => ({
        ...current,
        wordResults: result.items,
        wordTotal: result.total,
        detailEntry: current.detailEntry ?? result.items[0] ?? null,
      }));
    } finally {
      if (latestSearchRequestRef.current === requestId) {
        setSearchLoading(false);
      }
    }
  }, [
    open,
    onSearchStateChange,
    page,
    query,
    updateSearchState,
    useViewedListFilter,
    searchLanguage,
    dictionaryId,
    viewedList?.type,
    viewedListId,
  ]);

  const handleUserDictionaryEntryCreated = useCallback(
    (entry: DictionaryEntry) => {
      onUserDictionaryEntryCreated?.(entry);
      onSearchStateChange((current) => ({
        ...current,
        detailEntry: entry,
        wordResults: [
          entry,
          ...current.wordResults.filter((item) => item.id !== entry.id),
        ],
        wordTotal: Math.max(current.wordTotal, current.wordResults.length + 1),
      }));
    },
    [onSearchStateChange, onUserDictionaryEntryCreated],
  );

  const createCustomEntry = useCallback(async () => {
    const headword = (customHeadword || query).trim();
    const definition = customDefinition.trim();
    const translation = customTranslation.trim();
    const example = customExample.trim();
    const notes = customNotes.trim();

    if (!headword) {
      setCustomEntryMessage("Vul een hoofdwoord in.");
      return;
    }
    if (!definition && !translation && !example && !notes) {
      setCustomEntryMessage("Vul minimaal definitie, vertaling, voorbeeld of notitie in.");
      return;
    }

    setCustomEntrySaving(true);
    setCustomEntryMessage(null);
    try {
      const entryId = await createUserDictionaryEntry({
        entry: {
          headword,
          languageCode: searchLanguage,
          ...(definition ? { definition } : {}),
          ...(translation
            ? { translation: { languageCode: "en", text: translation } }
            : {}),
          ...(example ? { example: { source: example } } : {}),
          ...(notes ? { notes } : {}),
        },
      });
      const createdEntry = await fetchDictionaryEntryById(entryId, userId);
      if (createdEntry) {
        handleUserDictionaryEntryCreated(createdEntry);
      }
      setCustomHeadword("");
      setCustomDefinition("");
      setCustomTranslation("");
      setCustomExample("");
      setCustomNotes("");
      setCustomEntryOpen(false);
      setCustomEntryMessage("Eigen entry toegevoegd aan mijn woordenboek.");
    } catch (error) {
      console.error("Error creating user dictionary entry", error);
      setCustomEntryMessage("Kon eigen entry niet opslaan.");
    } finally {
      setCustomEntrySaving(false);
    }
  }, [
    customDefinition,
    customExample,
    customHeadword,
    customNotes,
    customTranslation,
    handleUserDictionaryEntryCreated,
    query,
    searchLanguage,
    userId,
  ]);

  useEffect(() => {
    if (!open || searchState.languageCode) return;
    updateSearchState({ languageCode: language });
  }, [language, open, searchState.languageCode, updateSearchState]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const loadSearchScope = async () => {
      const languages = await fetchAvailableLearningLanguages(userId);
      if (!cancelled) {
        setAvailableLanguages(languages);
      }
    };
    void loadSearchScope();
    return () => {
      cancelled = true;
    };
  }, [open, userId]);

  useEffect(() => {
    if (!open || !searchLanguage) return;
    let cancelled = false;
    const loadSources = async () => {
      const sources = await fetchAvailableDictionarySources({
        userId,
        languageCode: searchLanguage,
      });
      if (!cancelled) {
        setDictionarySources(sources);
        if (
          dictionaryId &&
          !sources.some((source) => source.id === dictionaryId)
        ) {
          updateSearchState({ dictionaryId: null, page: 1 });
        }
      }
    };
    void loadSources();
    return () => {
      cancelled = true;
    };
  }, [dictionaryId, open, searchLanguage, updateSearchState, userId]);

  useEffect(() => {
    void runSearch();
  }, [runSearch]);

  useEffect(() => {
    if (!autoFocusQuery) return;
    const raf = window.requestAnimationFrame(() => {
      queryRef.current?.focus();
      queryRef.current?.select();
    });
    return () => window.cancelAnimationFrame(raf);
  }, [autoFocusQuery]);

  const resetLookup = () => {
    updateSearchState(createDictionarySearchTabState());
  };
  const hasResettableLookupState = Boolean(
    query.trim() ||
      applyListFilter ||
      page !== 1 ||
      detailEntry ||
      wordResults.length ||
      wordTotal,
  );
  const resultScopeLabel = useViewedListFilter
    ? `Alleen deze lijst: ${viewedListName}`
    : `Zoekt in ${sourceLabel}`;
  const resultCountLabel = useViewedListFilter
    ? `${wordTotal} woorden gevonden`
    : query.trim()
      ? `${wordTotal} resultaten in ${sourceLabel}`
      : "Typ een woord om te zoeken";
  const emptyHeading = useViewedListFilter
    ? "Geen woorden in deze lijst."
    : query.trim()
      ? "Geen woordenboekresultaten gevonden."
      : "Zoek een woord in VanDale.";
  const emptyDescription = useViewedListFilter
    ? `De filter binnen '${viewedListName}' vond niets. Wis de zoekopdracht of zoek opnieuw in het woordenboek.`
    : query.trim()
      ? `De zoekopdracht in ${sourceLabel} vond niets.`
      : "Typ een woord om definities, voorbeelden en leerlijsten te bekijken.";

  const results = (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 space-y-3 border-b border-slate-100 p-4 dark:border-slate-800">
        <div className="relative">
          <svg
            className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            ref={queryRef}
            value={query}
            onChange={(event) => {
              updateSearchState({
                query: event.target.value,
                page: 1,
              });
            }}
            placeholder="Zoek in het woordenboek..."
            className="h-12 w-full rounded-2xl border border-primary/50 bg-white pl-12 pr-12 text-base text-slate-900 shadow-sm outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10 dark:border-primary/60 dark:bg-slate-950 dark:text-white"
          />
          {query ? (
            <button
              type="button"
              onClick={() => {
                updateSearchState({
                  query: "",
                  page: 1,
                });
              }}
              className="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <span className="sr-only">Wis zoekopdracht</span>
              x
            </button>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            {languageLabel(language)} · {resultScopeLabel}
          </div>
          <label className="hidden items-center gap-2 text-xs font-semibold text-slate-500 md:flex dark:text-slate-300">
            Alleen deze lijst
            <input
              type="checkbox"
              checked={applyListFilter}
              disabled={!viewedListId}
              onChange={() => {
                onSearchStateChange((current) => ({
                  ...current,
                  applyListFilter: !current.applyListFilter,
                  page: 1,
                }));
              }}
              className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary dark:border-slate-600"
            />
          </label>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-950/40">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Zoekbereik
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="grid gap-1 text-xs font-semibold text-slate-600 dark:text-slate-300">
              <span>Leertaal</span>
              <select
                value={searchLanguage}
                onChange={(event) => {
                  updateSearchState({
                    languageCode: event.target.value,
                    dictionaryId: null,
                    page: 1,
                  });
                }}
                disabled={useViewedListFilter}
                className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              >
                {(availableLanguages.length
                  ? availableLanguages
                  : [{ code: searchLanguage, label: languageLabel(searchLanguage) }]
                ).map((option) => (
                  <option key={option.code} value={option.code}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-xs font-semibold text-slate-600 dark:text-slate-300">
              <span>Woordenboekbron</span>
              <select
                value={dictionaryId ?? "all"}
                onChange={(event) => {
                  updateSearchState({
                    dictionaryId:
                      event.target.value === "all" ? null : event.target.value,
                    page: 1,
                  });
                }}
                disabled={useViewedListFilter}
                className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              >
                <option value="all">Alle bronnen</option>
                {dictionarySources.map((source) => (
                  <option key={source.id} value={source.id}>
                    {source.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900/60">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Mijn woordenboek
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                Maak een private editable entry los van leerlijsten.
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setCustomEntryOpen((value) => !value);
                setCustomHeadword((value) => value || query.trim());
                setCustomEntryMessage(null);
              }}
              className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              {customEntryOpen ? "Sluit" : "Eigen entry toevoegen"}
            </button>
          </div>

          {customEntryOpen ? (
            <div className="mt-3 grid gap-2">
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="grid gap-1 text-xs font-semibold text-slate-600 dark:text-slate-300">
                  <span>Hoofdwoord</span>
                  <input
                    value={customHeadword}
                    onChange={(event) => setCustomHeadword(event.target.value)}
                    className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                  />
                </label>
                <label className="grid gap-1 text-xs font-semibold text-slate-600 dark:text-slate-300">
                  <span>Definitie</span>
                  <input
                    value={customDefinition}
                    onChange={(event) => setCustomDefinition(event.target.value)}
                    className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                  />
                </label>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="grid gap-1 text-xs font-semibold text-slate-600 dark:text-slate-300">
                  <span>Vertaling</span>
                  <input
                    value={customTranslation}
                    onChange={(event) => setCustomTranslation(event.target.value)}
                    className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                  />
                </label>
                <label className="grid gap-1 text-xs font-semibold text-slate-600 dark:text-slate-300">
                  <span>Voorbeeld</span>
                  <input
                    value={customExample}
                    onChange={(event) => setCustomExample(event.target.value)}
                    className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                  />
                </label>
              </div>
              <label className="grid gap-1 text-xs font-semibold text-slate-600 dark:text-slate-300">
                <span>Notitie</span>
                <input
                  value={customNotes}
                  onChange={(event) => setCustomNotes(event.target.value)}
                  className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                />
              </label>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  disabled={customEntrySaving}
                  onClick={() => void createCustomEntry()}
                  className="rounded-full bg-primary px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:brightness-105 disabled:opacity-60"
                >
                  Opslaan in mijn woordenboek
                </button>
                {customEntryMessage ? (
                  <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                    {customEntryMessage}
                  </span>
                ) : null}
              </div>
            </div>
          ) : customEntryMessage ? (
            <div className="mt-2 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
              {customEntryMessage}
            </div>
          ) : null}
        </div>

        <div className="space-y-0.5 text-xs text-slate-500 dark:text-slate-400">
          <div>{resultCountLabel}</div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {searchLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="h-20 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />
            ))}
          </div>
        ) : wordResults.length ? (
          <div className="space-y-2">
            {wordResults.map((entry) => {
              const selected = detailEntry?.id === entry.id;
              return (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => {
                    updateSearchState({
                      detailEntry: entry,
                      mobileDetailOpen: true,
                    });
                  }}
                  className={`w-full rounded-2xl border p-3 text-left transition ${
                    selected
                      ? "border-primary/50 bg-primary/5 shadow-sm"
                      : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900/70 dark:hover:bg-slate-800"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-slate-900 dark:text-white">
                          {entry.headword}
                        </span>
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          {posLabel(entry.part_of_speech)} · {dictionaryLabel(entry)} · {meaningLabel(entry)}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                          {searchMatchLabel(entry)}
                        </span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-sm text-slate-700 dark:text-slate-300">
                        {firstDefinition(entry)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {entry.is_nt2_2000 ? (
                        <span className="rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-200">
                          NT2 2000
                        </span>
                      ) : null}
                      <span className="hidden text-slate-400 sm:inline">...</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="flex min-h-[260px] flex-col items-center justify-center gap-3 text-center">
            <div className="text-base font-semibold text-slate-900 dark:text-white">
              {emptyHeading}
            </div>
            <div className="max-w-[440px] text-sm text-slate-600 dark:text-slate-300">
              {emptyDescription}
            </div>
            {hasResettableLookupState ? (
              <button
                type="button"
                onClick={resetLookup}
                className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Wis zoekopdracht
              </button>
            ) : null}
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center justify-between border-t border-slate-100 bg-slate-50 px-4 py-3 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
        <span>
          {wordResults.length ? (page - 1) * pageSize + 1 : 0}-
          {Math.min(wordTotal, page * pageSize)} van {wordTotal}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() =>
              onSearchStateChange((current) => ({
                ...current,
                page: Math.max(1, current.page - 1),
              }))
            }
            disabled={page === 1}
            className="rounded-full border border-slate-300 px-3 py-1 font-semibold disabled:opacity-50 dark:border-slate-700"
          >
            Vorige
          </button>
          <button
            type="button"
            onClick={() =>
              onSearchStateChange((current) => ({
                ...current,
                page: current.page + 1,
              }))
            }
            disabled={page * pageSize >= wordTotal}
            className="rounded-full border border-slate-300 px-3 py-1 font-semibold disabled:opacity-50 dark:border-slate-700"
          >
            Volgende
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
      <div className="flex min-h-0 flex-1">
        {results}
        <aside className="hidden w-[380px] shrink-0 border-l border-slate-100 lg:block dark:border-slate-800">
          {detailEntry ? (
            <div className="flex h-full min-h-0 flex-col">
              <div className="border-b border-slate-100 bg-slate-50 px-5 py-2 text-xs dark:border-slate-800 dark:bg-slate-900">
                <div className="font-semibold text-slate-700 dark:text-slate-200">
                  Details
                </div>
                {!detailEntryInCurrentResults ? (
                  <div className="mt-0.5 text-slate-500 dark:text-slate-400">
                    Deze entry is bewaard terwijl de zoekresultaten veranderden.
                  </div>
                ) : null}
              </div>
              <div className="min-h-0 flex-1">
                <WordDetailPanel
                  entry={detailEntry}
                  userId={userId}
                  translationLang={translationLang}
                  userLists={userLists}
                  onListsUpdated={async () => {
                    await reloadLists();
                    notifyListsUpdated();
                  }}
                  onOpenListMembership={onOpenListMembership}
                  onUserDictionaryEntryCreated={handleUserDictionaryEntryCreated}
                  onTrainWord={onTrainWord}
                  showHeader={true}
                  showActions={true}
                  autoFetchTranslation={false}
                />
              </div>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center px-6 text-center text-sm text-slate-500 dark:text-slate-400">
              Selecteer een woord om details te bekijken.
            </div>
          )}
        </aside>
      </div>

      <div className="lg:hidden">
        <WordDetailDrawer
          entry={detailEntry}
          open={mobileDetailOpen && Boolean(detailEntry)}
          onClose={() => updateSearchState({ mobileDetailOpen: false })}
          userId={userId}
          translationLang={translationLang}
          userLists={userLists}
          onListsUpdated={async () => {
            await reloadLists();
            notifyListsUpdated();
          }}
          onOpenListMembership={onOpenListMembership}
          onUserDictionaryEntryCreated={handleUserDictionaryEntryCreated}
          onTrainWord={onTrainWord}
          autoFetchTranslation={false}
        />
      </div>

    </div>
  );
}
