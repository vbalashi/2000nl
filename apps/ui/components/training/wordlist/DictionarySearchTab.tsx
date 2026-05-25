"use client";

import React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchWordsForList, searchWordEntries } from "@/lib/trainingService";
import type { DictionaryEntry, WordListSummary } from "@/lib/types";
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
  selectedListId: string | null;
  selectedList: WordListSummary | null;
  selectedListName: string;
  reloadLists: () => Promise<void>;
  notifyListsUpdated: () => void;
  onTrainWord?: (wordId: string) => void;
  autoFocusQuery?: boolean;
};

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

export function DictionarySearchTab({
  open,
  userId,
  language,
  translationLang,
  userLists,
  selectedListId,
  selectedList,
  selectedListName,
  reloadLists,
  notifyListsUpdated,
  onTrainWord,
  autoFocusQuery,
}: Props) {
  const [query, setQuery] = useState("");
  const [applyListFilter, setApplyListFilter] = useState(false);
  const [wordResults, setWordResults] = useState<DictionaryEntry[]>([]);
  const [wordTotal, setWordTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [searchLoading, setSearchLoading] = useState(false);
  const [detailEntry, setDetailEntry] = useState<DictionaryEntry | null>(null);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const queryRef = useRef<HTMLInputElement | null>(null);
  const pageSize = 20;

  const sourceLabel = "VanDale";

  const runSearch = useCallback(async () => {
    if (!open) return;
    setSearchLoading(true);
    try {
      const useListFilter = applyListFilter && selectedListId;
      const result = useListFilter
        ? await fetchWordsForList(selectedListId!, selectedList?.type ?? "curated", {
            query: query || undefined,
            page,
            pageSize,
          })
        : await searchWordEntries({
            query: query || undefined,
            page,
            pageSize,
          });

      setWordResults(result.items);
      setWordTotal(result.total);
      setDetailEntry((current) => current ?? result.items[0] ?? null);
    } finally {
      setSearchLoading(false);
    }
  }, [
    applyListFilter,
    open,
    page,
    query,
    selectedList?.type,
    selectedListId,
  ]);

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
    setQuery("");
    setApplyListFilter(false);
    setPage(1);
  };

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
              setQuery(event.target.value);
              setPage(1);
            }}
            placeholder="Zoek een woord of zin..."
            className="h-12 w-full rounded-2xl border border-primary/50 bg-white pl-12 pr-12 text-base text-slate-900 shadow-sm outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10 dark:border-primary/60 dark:bg-slate-950 dark:text-white"
          />
          {query ? (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setPage(1);
              }}
              className="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <span className="sr-only">Wis zoekopdracht</span>
              x
            </button>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
              Taal: {languageLabel(language)}
            </span>
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
              Bron: {sourceLabel}
            </span>
            {applyListFilter ? (
              <span className="rounded-full border border-primary/30 bg-primary/5 px-3 py-1.5 text-xs font-semibold text-primary dark:border-primary/50 dark:bg-primary/10 dark:text-primary-light">
                Alleen actieve lijst
              </span>
            ) : null}
          </div>
          <label className="hidden items-center gap-2 text-xs font-semibold text-slate-500 md:flex dark:text-slate-300">
            Alleen actieve lijst
            <input
              type="checkbox"
              checked={applyListFilter}
              disabled={!selectedListId}
              onChange={() => {
                setApplyListFilter((prev) => !prev);
                setPage(1);
              }}
              className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary dark:border-slate-600"
            />
          </label>
        </div>

        <div className="text-xs text-slate-500 dark:text-slate-400">
          {wordTotal} resultaten gevonden
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
                    setDetailEntry(entry);
                    setMobileDetailOpen(true);
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
                          {posLabel(entry.part_of_speech)} · VanDale · {meaningLabel(entry)}
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
              Geen woorden gevonden.
            </div>
            <button
              type="button"
              onClick={resetLookup}
              className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Wis zoekopdracht
            </button>
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
            onClick={() => setPage((prev) => Math.max(1, prev - 1))}
            disabled={page === 1}
            className="rounded-full border border-slate-300 px-3 py-1 font-semibold disabled:opacity-50 dark:border-slate-700"
          >
            Vorige
          </button>
          <button
            type="button"
            onClick={() => setPage((prev) => prev + 1)}
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
            <WordDetailPanel
              entry={detailEntry}
              userId={userId}
              translationLang={translationLang}
              userLists={userLists}
              onListsUpdated={async () => {
                await reloadLists();
                notifyListsUpdated();
              }}
              onTrainWord={onTrainWord}
              showHeader={true}
              showActions={true}
              autoFetchTranslation={false}
            />
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
          onClose={() => setMobileDetailOpen(false)}
          userId={userId}
          translationLang={translationLang}
          userLists={userLists}
          onListsUpdated={async () => {
            await reloadLists();
            notifyListsUpdated();
          }}
          onTrainWord={onTrainWord}
          autoFetchTranslation={false}
        />
      </div>

    </div>
  );
}
