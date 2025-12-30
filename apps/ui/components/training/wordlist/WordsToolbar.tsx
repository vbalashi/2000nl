import type { WordListSummary } from "@/lib/types";

type Props = {
  viewMode: "list" | "search";
  selectedListName: string;
  wordTotal: number;
  selectedCount: number;
  query: string;
  partOfSpeech: string;
  nt2Only: boolean;
  selectedList: WordListSummary | null;
  onQueryChange: (value: string) => void;
  onPartOfSpeechChange: (value: string) => void;
  onNt2OnlyChange: (value: boolean) => void;
  onNewSearch: () => void;
  onBackToList?: () => void;
};

const posLabel = (value: string) => {
  if (!value) return "";
  if (value === "noun") return "Zelfstandig naamwoord";
  if (value === "verb") return "Werkwoord";
  if (value === "adjective") return "Bijvoeglijk naamwoord";
  if (value === "adverb") return "Bijwoord";
  return value;
};

export function WordsToolbar({
  viewMode,
  selectedListName,
  wordTotal,
  selectedCount,
  query,
  partOfSpeech,
  nt2Only,
  selectedList,
  onQueryChange,
  onPartOfSpeechChange,
  onNt2OnlyChange,
  onNewSearch,
  onBackToList,
}: Props) {
  const title =
    viewMode === "list"
      ? `Toon woorden in: ${selectedListName}`
      : "Zoek in volledige database";

  const chips: Array<{ label: string; show: boolean }> = [
    { label: `Zoek: "${query.trim()}"`, show: Boolean(query.trim()) },
    { label: `Woordsoort: ${posLabel(partOfSpeech)}`, show: Boolean(partOfSpeech) },
    { label: "Alleen NT2 2k", show: viewMode === "search" && nt2Only },
  ].filter((c) => c.show);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-[240px]">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            {title}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span>
              {wordTotal} woorden • {selectedCount} geselecteerd
            </span>
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

        <div className="flex flex-wrap gap-2">
          {viewMode === "search" && selectedList && onBackToList ? (
            <button
              type="button"
              onClick={onBackToList}
              className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Terug naar lijst
            </button>
          ) : null}
          <button
            type="button"
            onClick={onNewSearch}
            className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Nieuwe zoekopdracht
          </button>
        </div>
      </div>

      <div className="mt-3">
        <input
          type="text"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Zoek op hoofdwoord..."
          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm focus:border-primary focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <select
          value={partOfSpeech}
          onChange={(event) => onPartOfSpeechChange(event.target.value)}
          className="min-w-[220px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm focus:border-primary focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        >
          <option value="">Woordsoort: Alle</option>
          <option value="noun">Zelfstandig naamwoord</option>
          <option value="verb">Werkwoord</option>
          <option value="adjective">Bijvoeglijk naamwoord</option>
          <option value="adverb">Bijwoord</option>
        </select>

        <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
          <input
            type="checkbox"
            checked={nt2Only}
            disabled={viewMode !== "search"}
            onChange={(event) => onNt2OnlyChange(event.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary disabled:opacity-50 dark:border-slate-600"
          />
          Alleen NT2 2k
        </label>
      </div>
    </div>
  );
}

