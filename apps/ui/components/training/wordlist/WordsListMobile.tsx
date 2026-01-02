import type { DictionaryEntry } from "@/lib/types";

const posBadge = (value?: string) => {
  if (!value) return null;
  const v = value.trim();
  if (!v) return null;
  // Normalize common English tags to Dutch abbreviations, otherwise show raw.
  if (v === "noun") return "zn";
  if (v === "verb") return "ww";
  if (v === "adjective") return "bn";
  if (v === "adverb") return "bw";
  return v;
};

type Props = {
  items: DictionaryEntry[];
  selectedIds: Set<string>;
  onToggleSelected: (id: string) => void;
  onOpenDetails: (entry: DictionaryEntry) => void;
};

export function WordsListMobile({
  items,
  selectedIds,
  onToggleSelected,
  onOpenDetails,
}: Props) {
  return (
    <div className="space-y-2 p-3">
      {items.map((word) => {
        const checked = selectedIds.has(word.id);
        const pos = posBadge(word.part_of_speech);
        return (
          <div
            key={word.id}
            className={`rounded-xl border p-3 transition ${
              checked
                ? "border-primary/40 bg-primary/5"
                : "border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900/40 dark:hover:bg-slate-900/60"
            }`}
          >
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={checked}
                onChange={() => onToggleSelected(word.id)}
                className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary dark:border-slate-600"
              />
              <button
                type="button"
                onClick={() => onOpenDetails(word)}
                className="flex-1 min-w-0 text-left"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                    {word.headword}
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {pos ? (
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                        {pos}
                      </span>
                    ) : null}
                    {word.is_nt2_2000 ? (
                      <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                        2k
                      </span>
                    ) : null}
                  </div>
                </div>
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

