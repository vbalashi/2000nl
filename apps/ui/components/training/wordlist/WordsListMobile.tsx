import type { DictionaryEntry } from "@/lib/types";

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
        return (
          <div
            key={word.id}
            className={`rounded-xl border p-3 transition ${
              checked
                ? "border-primary/40 bg-primary/5"
                : "border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900/40 dark:hover:bg-slate-900/60"
            }`}
          >
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={checked}
                onChange={() => onToggleSelected(word.id)}
                className="mt-1 h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary dark:border-slate-600"
              />
              <button
                type="button"
                onClick={() => onOpenDetails(word)}
                className="flex-1 text-left"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-slate-900 dark:text-white">
                    {word.headword}
                  </div>
                  <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                    {word.is_nt2_2000 ? "NT2 2k" : ""}
                  </div>
                </div>
                <div className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                  {word.part_of_speech ?? "—"}
                </div>
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

