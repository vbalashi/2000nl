"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchWordsForList, searchWordEntries } from "@/lib/trainingService";
import type { DictionaryEntry, WordListSummary } from "@/lib/types";
import { hidePerfectParticiple } from "@/lib/definitionFormat";
import { getAllMeanings } from "@/lib/wordUtils";
import { WordDetailPanel } from "../WordDetailPanel";
import { WordDetailDrawer } from "./WordDetailDrawer";

type AttributeFilter = "nt2-2k" | "frozen" | "dont-show" | "has-audio" | "irregular";
type ProgressFilter = "new" | "learning" | "review" | "mastered" | "hidden";

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

const POS_OPTIONS = [
  { value: "verb", label: "Werkwoord" },
  { value: "noun", label: "Zelfstandig naamwoord" },
  { value: "adjective", label: "Bijvoeglijk naamwoord" },
  { value: "adverb", label: "Bijwoord" },
] as const;

const ATTRIBUTE_OPTIONS: Array<{ value: AttributeFilter; label: string; enabled: boolean }> = [
  { value: "nt2-2k", label: "NT2 2000", enabled: true },
  { value: "has-audio", label: "Heeft audio", enabled: false },
  { value: "irregular", label: "Onregelmatig werkwoord", enabled: false },
];

const PROGRESS_OPTIONS: Array<{ value: ProgressFilter; label: string; color: string; enabled: boolean }> = [
  { value: "new", label: "Nieuw", color: "bg-blue-500", enabled: false },
  { value: "learning", label: "Leren", color: "bg-amber-500", enabled: false },
  { value: "review", label: "Reviewen", color: "bg-sky-500", enabled: false },
  { value: "mastered", label: "Beheerst", color: "bg-emerald-500", enabled: false },
  { value: "hidden", label: "Verborgen", color: "bg-slate-400", enabled: true },
];

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

function CheckboxRow({
  checked,
  disabled,
  label,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onChange: () => void;
}) {
  return (
    <label className={`flex items-center gap-2 text-sm ${disabled ? "opacity-45" : ""}`}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary disabled:cursor-not-allowed dark:border-slate-600"
      />
      <span className="text-slate-700 dark:text-slate-200">{label}</span>
    </label>
  );
}

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
  const [partOfSpeech, setPartOfSpeech] = useState("");
  const [genderFilters, setGenderFilters] = useState<string[]>([]);
  const [attributeFilters, setAttributeFilters] = useState<AttributeFilter[]>([]);
  const [progressFilters, setProgressFilters] = useState<ProgressFilter[]>([]);
  const [applyListFilter, setApplyListFilter] = useState(false);
  const [wordResults, setWordResults] = useState<DictionaryEntry[]>([]);
  const [wordTotal, setWordTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [searchLoading, setSearchLoading] = useState(false);
  const [detailEntry, setDetailEntry] = useState<DictionaryEntry | null>(null);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const queryRef = useRef<HTMLInputElement | null>(null);
  const pageSize = 20;

  const nt2Only = attributeFilters.includes("nt2-2k");
  const filterHidden = progressFilters.includes("hidden");
  const sourceLabel = "VanDale";
  const filterCount =
    Number(Boolean(partOfSpeech)) +
    attributeFilters.filter((filter) => filter !== "nt2-2k").length +
    genderFilters.length +
    progressFilters.length +
    Number(nt2Only) +
    Number(applyListFilter);

  const runSearch = useCallback(async () => {
    if (!open) return;
    setSearchLoading(true);
    try {
      const useListFilter = applyListFilter && selectedListId;
      const result = useListFilter
        ? await fetchWordsForList(selectedListId!, selectedList?.type ?? "curated", {
            query: query || undefined,
            partOfSpeech: partOfSpeech || undefined,
            isNt2: nt2Only ? true : undefined,
            filterHidden: filterHidden ? true : undefined,
            page,
            pageSize,
          })
        : await searchWordEntries({
            query: query || undefined,
            partOfSpeech: partOfSpeech || undefined,
            isNt2: nt2Only ? true : undefined,
            filterHidden: filterHidden ? true : undefined,
            page,
            pageSize,
          });

      const items = genderFilters.length
        ? result.items.filter((entry) => entry.gender && genderFilters.includes(entry.gender))
        : result.items;
      setWordResults(items);
      setWordTotal(result.total);
      setDetailEntry((current) => current ?? items[0] ?? null);
    } finally {
      setSearchLoading(false);
    }
  }, [
    applyListFilter,
    filterHidden,
    genderFilters,
    nt2Only,
    open,
    page,
    partOfSpeech,
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

  const toggleAttribute = (value: AttributeFilter) => {
    setAttributeFilters((prev) =>
      prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value],
    );
    setPage(1);
  };

  const toggleProgress = (value: ProgressFilter) => {
    setProgressFilters((prev) =>
      prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value],
    );
    setPage(1);
  };

  const toggleGender = (value: string) => {
    setGenderFilters((prev) =>
      prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value],
    );
    setPage(1);
  };

  const clearFilters = () => {
    setPartOfSpeech("");
    setGenderFilters([]);
    setAttributeFilters([]);
    setProgressFilters([]);
    setApplyListFilter(false);
    setPage(1);
  };

  const filters = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Filters</h2>
        <button
          type="button"
          onClick={clearFilters}
          className="text-xs font-semibold text-primary hover:underline dark:text-primary-light"
        >
          Wissen
        </button>
      </div>

      <div className="mt-5 min-h-0 flex-1 space-y-5 overflow-y-auto pr-1">
        <section className="space-y-2">
          <h3 className="text-xs font-bold text-slate-700 dark:text-slate-200">Lijsten</h3>
          <CheckboxRow
            checked={nt2Only}
            label="NT2 2000"
            onChange={() => toggleAttribute("nt2-2k")}
          />
          <CheckboxRow
            checked={applyListFilter}
            disabled={!selectedListId}
            label={selectedListName || "Actieve lijst"}
            onChange={() => {
              setApplyListFilter((prev) => !prev);
              setPage(1);
            }}
          />
        </section>

        <section className="space-y-2">
          <h3 className="text-xs font-bold text-slate-700 dark:text-slate-200">Woordsoort</h3>
          {POS_OPTIONS.map((option) => (
            <CheckboxRow
              key={option.value}
              checked={partOfSpeech === option.value}
              label={option.label}
              onChange={() => {
                setPartOfSpeech((prev) => (prev === option.value ? "" : option.value));
                setPage(1);
              }}
            />
          ))}
        </section>

        <section className="space-y-2">
          <h3 className="text-xs font-bold text-slate-700 dark:text-slate-200">Kenmerken</h3>
          {ATTRIBUTE_OPTIONS.filter((option) => option.value !== "nt2-2k").map((option) => (
            <CheckboxRow
              key={option.value}
              checked={attributeFilters.includes(option.value)}
              disabled={!option.enabled}
              label={option.label}
              onChange={() => toggleAttribute(option.value)}
            />
          ))}
        </section>

        <section className="space-y-2">
          <h3 className="text-xs font-bold text-slate-700 dark:text-slate-200">
            Grammatica - Geslacht
          </h3>
          <CheckboxRow checked={genderFilters.includes("de")} label="de" onChange={() => toggleGender("de")} />
          <CheckboxRow checked={genderFilters.includes("het")} label="het" onChange={() => toggleGender("het")} />
        </section>

        <section className="space-y-2">
          <h3 className="text-xs font-bold text-slate-700 dark:text-slate-200">Voortgang</h3>
          {PROGRESS_OPTIONS.map((option) => (
            <label
              key={option.value}
              className={`flex items-center gap-2 text-sm ${option.enabled ? "" : "opacity-45"}`}
            >
              <input
                type="checkbox"
                checked={progressFilters.includes(option.value)}
                disabled={!option.enabled}
                onChange={() => toggleProgress(option.value)}
                className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary disabled:cursor-not-allowed dark:border-slate-600"
              />
              <span className={`h-2 w-2 rounded-full ${option.color}`} />
              <span className="text-slate-700 dark:text-slate-200">{option.label}</span>
            </label>
          ))}
        </section>
      </div>
    </div>
  );

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
            <button
              type="button"
              onClick={() => setMobileFiltersOpen(true)}
              className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm md:hidden dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            >
              Filter ({filterCount})
            </button>
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
              onClick={clearFilters}
              className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Wis filters
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
        <aside className="hidden w-[220px] shrink-0 border-r border-slate-100 p-4 md:block dark:border-slate-800">
          {filters}
        </aside>
        {results}
        <aside className="hidden w-[380px] shrink-0 border-l border-slate-100 lg:block dark:border-slate-800">
          {detailEntry ? (
            <WordDetailPanel
              entry={detailEntry}
              userId={userId}
              translationLang={translationLang}
              selectedListName={selectedListName}
              userLists={userLists}
              onListsUpdated={async () => {
                await reloadLists();
                notifyListsUpdated();
              }}
              onTrainWord={onTrainWord}
              showHeader={true}
              showActions={true}
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
          selectedListName={selectedListName}
          userLists={userLists}
          onListsUpdated={async () => {
            await reloadLists();
            notifyListsUpdated();
          }}
          onTrainWord={onTrainWord}
        />
      </div>

      {mobileFiltersOpen ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setMobileFiltersOpen(false)}
          />
          <div className="absolute inset-x-0 bottom-0 max-h-[88vh] rounded-t-3xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            {filters}
            <button
              type="button"
              onClick={() => setMobileFiltersOpen(false)}
              className="mt-5 w-full rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-white shadow-sm"
            >
              Toepassen
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
