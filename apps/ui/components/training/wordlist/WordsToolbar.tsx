import type { WordListSummary } from "@/lib/types";
import { useEffect, useRef, useState } from "react";

export type AttributeFilter = "nt2-2k" | "frozen" | "dont-show" | "has-idioms" | "irregular";

type Props = {
  applyListFilter: boolean;
  selectedListName: string;
  selectedListId: string | null;
  wordTotal: number;
  selectedCount: number;
  query: string;
  partOfSpeech: string;
  nt2Only: boolean;
  selectedList: WordListSummary | null;
  autoFocusQuery?: boolean;
  isLocked?: boolean;
  maxAllowed?: number | null;
  attributeFilters?: AttributeFilter[];
  onQueryChange: (value: string) => void;
  onPartOfSpeechChange: (value: string) => void;
  onNt2OnlyChange: (value: boolean) => void;
  onToggleListFilter: () => void;
  onAttributeFiltersChange?: (filters: AttributeFilter[]) => void;
};

const posLabel = (value: string) => {
  if (!value) return "";
  if (value === "noun") return "Zelfstandig naamwoord";
  if (value === "verb") return "Werkwoord";
  if (value === "adjective") return "Bijvoeglijk naamwoord";
  if (value === "adverb") return "Bijwoord";
  return value;
};

const ATTRIBUTE_FILTER_OPTIONS: { id: AttributeFilter; label: string; available: boolean }[] = [
  { id: "nt2-2k", label: "NT2 2K", available: true },
  { id: "frozen", label: "Frozen", available: true },
  { id: "dont-show", label: "Don't show", available: true },
  { id: "has-idioms", label: "Has idioms", available: false }, // Phase 2
  { id: "irregular", label: "Irregular", available: false }, // Phase 2
];

export function WordsToolbar({
  applyListFilter,
  selectedListName,
  selectedListId,
  wordTotal,
  selectedCount,
  query,
  partOfSpeech,
  nt2Only,
  selectedList,
  autoFocusQuery,
  isLocked,
  maxAllowed,
  attributeFilters = [],
  onQueryChange,
  onPartOfSpeechChange,
  onNt2OnlyChange,
  onToggleListFilter,
  onAttributeFiltersChange,
}: Props) {
  const queryInputRef = useRef<HTMLInputElement | null>(null);
  const [filterPopoverOpen, setFilterPopoverOpen] = useState(false);
  const filterPopoverRef = useRef<HTMLDivElement | null>(null);

  // Close popover when clicking outside
  useEffect(() => {
    if (!filterPopoverOpen) return;
    const handleClick = (event: MouseEvent) => {
      if (
        filterPopoverRef.current &&
        !filterPopoverRef.current.contains(event.target as Node)
      ) {
        setFilterPopoverOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [filterPopoverOpen]);

  const toggleAttributeFilter = (filterId: AttributeFilter) => {
    if (!onAttributeFiltersChange) return;
    const newFilters = attributeFilters.includes(filterId)
      ? attributeFilters.filter((f) => f !== filterId)
      : [...attributeFilters, filterId];
    onAttributeFiltersChange(newFilters);
  };

  const clearAttributeFilters = () => {
    if (!onAttributeFiltersChange) return;
    onAttributeFiltersChange([]);
  };

  useEffect(() => {
    if (!autoFocusQuery) return;
    const el = queryInputRef.current;
    if (!el) return;
    // Defer to ensure the modal/tab layout has painted (avoids scroll jumps).
    const raf = window.requestAnimationFrame(() => {
      el.focus();
      el.select();
    });
    return () => window.cancelAnimationFrame(raf);
  }, [autoFocusQuery]);

  // Title shows what we're displaying
  const title = `TOON WOORDEN IN: ${selectedListName.toUpperCase()}`;

  // Info line
  const listWordCount = selectedList?.item_count ?? 0;
  const infoText = applyListFilter
    ? `${wordTotal} woorden in lijst • ${selectedCount} geselecteerd`
    : `${listWordCount} woorden in lijst • ${wordTotal} totaal • ${selectedCount} geselecteerd`;

  // Build chips from active filters
  const filterLabels: Record<AttributeFilter, string> = {
    "nt2-2k": "NT2 2K",
    "frozen": "Frozen",
    "dont-show": "Don't show",
    "has-idioms": "Has idioms",
    "irregular": "Irregular",
  };

  const chips: Array<{ label: string; show: boolean }> = [
    { label: `Zoek: "${query.trim()}"`, show: Boolean(query.trim()) },
    { label: `Woordsoort: ${posLabel(partOfSpeech)}`, show: Boolean(partOfSpeech) },
    // Add chips for each active attribute filter
    ...attributeFilters.map((f) => ({ label: filterLabels[f], show: true })),
  ].filter((c) => c.show);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-[240px] flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-800 dark:text-white">
              {title}
            </h2>
            {/* Filter toggle button */}
            {selectedListId && (
              <button
                type="button"
                onClick={onToggleListFilter}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition ${
                  applyListFilter
                    ? "border-primary bg-primary text-white"
                    : "border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                }`}
              >
                <svg
                  className="h-3.5 w-3.5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                </svg>
                {applyListFilter ? "Filter actief" : "Filter door lijst"}
              </button>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span>{infoText}</span>
            {/* Free tier indicator */}
            {maxAllowed !== null && maxAllowed !== undefined && (
              <>
                <span className="text-slate-300 dark:text-slate-600">•</span>
                <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 font-semibold text-amber-700 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
                  Free: {maxAllowed} woorden
                </span>
              </>
            )}
            {chips.length ? (
              <span className="text-slate-300 dark:text-slate-600">•</span>
            ) : null}
            {chips.map((chip) => (
              <span
                key={chip.label}
                className="rounded-full border border-slate-200 bg-white px-2 py-0.5 font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              >
                {chip.label}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-3">
        <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
          Nieuwe zoekopdracht
        </label>
        <input
          ref={queryInputRef}
          type="text"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Zoek op hoofdwoord..."
          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm focus:border-primary focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <div className="flex-1">
          <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
            Woordsoort
          </label>
          <select
            value={partOfSpeech}
            onChange={(event) => onPartOfSpeechChange(event.target.value)}
            className="w-full min-w-[180px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm focus:border-primary focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          >
            <option value="">Alle</option>
            <option value="noun">Zelfstandig naamwoord</option>
            <option value="verb">Werkwoord</option>
            <option value="adjective">Bijvoeglijk naamwoord</option>
            <option value="adverb">Bijwoord</option>
          </select>
        </div>

        {/* Multi-select attribute filter popover */}
        <div className="relative flex-1" ref={filterPopoverRef}>
          <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
            Filters
          </label>
          <button
            type="button"
            onClick={() => setFilterPopoverOpen((prev) => !prev)}
            className="flex w-full min-w-[180px] items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm focus:border-primary focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          >
            <span className="flex items-center gap-2">
              <svg
                className="h-4 w-4 text-slate-400"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
              </svg>
              {attributeFilters.length > 0
                ? `${attributeFilters.length} geselecteerd`
                : "Selecteer filters..."}
            </span>
            <svg
              className={`h-4 w-4 text-slate-400 transition-transform ${
                filterPopoverOpen ? "rotate-180" : ""
              }`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>

          {filterPopoverOpen && (
            <div className="absolute left-0 top-full z-20 mt-1 min-w-[240px] rounded-xl border border-slate-200 bg-white p-3 shadow-lg dark:border-slate-700 dark:bg-slate-900">
              <div className="space-y-2">
                {ATTRIBUTE_FILTER_OPTIONS.map((option) => (
                  <label
                    key={option.id}
                    className={`flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition hover:bg-slate-50 dark:hover:bg-slate-800 ${
                      !option.available ? "cursor-not-allowed opacity-50" : ""
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={attributeFilters.includes(option.id)}
                      disabled={!option.available}
                      onChange={() => toggleAttributeFilter(option.id)}
                      className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary disabled:opacity-50 dark:border-slate-600"
                    />
                    <span className="flex-1 text-slate-700 dark:text-slate-200">
                      {option.label}
                    </span>
                    {!option.available && (
                      <span className="text-[10px] uppercase text-slate-400">
                        Binnenkort
                      </span>
                    )}
                  </label>
                ))}
              </div>
              {attributeFilters.length > 0 && (
                <>
                  <div className="my-2 border-t border-slate-100 dark:border-slate-800" />
                  <button
                    type="button"
                    onClick={clearAttributeFilters}
                    className="w-full rounded-lg px-2 py-1.5 text-center text-sm font-medium text-slate-600 transition hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    Wis filters
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
